package com.earring

import android.app.Application
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.content.Context
import android.os.Build
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class DetectedNote(val midi: Int, val cents: Int, val correct: Boolean)

enum class ExerciseStatus { IDLE, PLAYING, LISTENING, DONE }

data class ExerciseState(
    val rootNote: Int = 0,        // 0=C, 1=C#, ..., 11=B
    val octave: Int = 4,
    val scaleId: Int = 0,
    val sequenceLength: Int = 4,
    val sequence: List<Int> = emptyList(),
    val detected: List<DetectedNote> = emptyList(),
    val status: ExerciseStatus = ExerciseStatus.IDLE,
    val currentNoteIndex: Int = 0,
    val seed: Long = System.currentTimeMillis(),
    val highlightIndex: Int = -1
) {
    val rootMidi: Int get() = (octave + 1) * 12 + rootNote
    val score: Float get() {
        if (detected.isEmpty()) return 0f
        return detected.count { it.correct }.toFloat() / detected.size
    }
}

class ExerciseViewModel(application: Application) : AndroidViewModel(application) {

    private val _state = MutableStateFlow(ExerciseState())
    val state: StateFlow<ExerciseState> = _state.asStateFlow()

    val audioCapture = AudioCapture()
    val audioPlayback = AudioPlayback(application)

    // Live pitch for the meter display (updated on every audio frame while listening)
    private val _liveHz = MutableStateFlow(-1f)
    val liveHz: StateFlow<Float> = _liveHz.asStateFlow()

    // Pitch stability tracking
    private var stableCount = 0
    private var stablePitchClass = -1
    private var lastConfirmedMs = 0L
    private val STABLE_FRAMES_REQUIRED = 2
    private val CONFIRM_HOLD_MS = 450L
    private val SILENCE_RMS_THRESHOLD = 0.003f

    private val vibrator: Vibrator by lazy {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            (application.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager).defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            application.getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
        }
    }

    fun setRootNote(note: Int) { _state.value = _state.value.copy(rootNote = note) }
    fun setOctave(octave: Int) { _state.value = _state.value.copy(octave = octave) }
    fun setScaleId(id: Int) { _state.value = _state.value.copy(scaleId = id) }
    fun setSequenceLength(len: Int) { _state.value = _state.value.copy(sequenceLength = len) }

    fun startExercise() {
        val s = _state.value
        val seed = System.currentTimeMillis()
        val seq = EarRingCore.generateSequence(s.rootMidi, s.scaleId, s.sequenceLength, seed)
        _state.value = s.copy(
            sequence = seq.toList(),
            detected = emptyList(),
            status = ExerciseStatus.IDLE,
            currentNoteIndex = 0,
            seed = seed,
            highlightIndex = -1
        )
        resetStability()
    }

    fun playSequence(onDone: () -> Unit = {}) {
        val seq = _state.value.sequence
        if (seq.isEmpty()) return
        _state.value = _state.value.copy(status = ExerciseStatus.PLAYING, highlightIndex = -1)
        audioPlayback.playSequence(
            midiNotes = seq,
            onEach = { idx -> _state.value = _state.value.copy(highlightIndex = idx) },
            onDone = {
                _state.value = _state.value.copy(status = ExerciseStatus.IDLE, highlightIndex = -1)
                onDone()
            }
        )
    }

    fun startListening() {
        resetStability()
        _state.value = _state.value.copy(status = ExerciseStatus.LISTENING)
        _liveHz.value = -1f
        audioCapture.start(onAudio = { samples -> processSamples(samples) })
    }

    fun stopListening() {
        audioCapture.stop()
        _state.value = _state.value.copy(status = ExerciseStatus.IDLE)
        _liveHz.value = -1f
        resetStability()
    }

    private fun processSamples(samples: FloatArray) {
        val rms = kotlin.math.sqrt(samples.map { it * it }.average().toFloat())
        if (rms < SILENCE_RMS_THRESHOLD) {
            resetStability()
            return
        }

        val hz = EarRingCore.detectPitch(samples, 44100)
        if (hz <= 0f) {
            _liveHz.value = -1f
            resetStability()
            return
        }
        _liveHz.value = hz

        val midi = EarRingCore.freqToMidi(hz)
        if (midi < 0) { resetStability(); return }
        val pitchClass = midi % 12
        val cents = EarRingCore.freqToCents(hz)

        if (pitchClass == stablePitchClass) {
            stableCount++
        } else {
            stablePitchClass = pitchClass
            stableCount = 1
            lastConfirmedMs = 0L
        }

        if (stableCount >= STABLE_FRAMES_REQUIRED) {
            val now = System.currentTimeMillis()
            if (lastConfirmedMs == 0L) {
                lastConfirmedMs = now
            } else if (now - lastConfirmedMs >= CONFIRM_HOLD_MS) {
                confirmNote(midi, cents)
                lastConfirmedMs = now + CONFIRM_HOLD_MS * 2  // debounce
            }
        }
    }

    private fun confirmNote(midi: Int, cents: Int) {
        val state = _state.value
        if (state.status != ExerciseStatus.LISTENING) return
        val idx = state.currentNoteIndex
        if (idx >= state.sequence.size) return

        val expected = state.sequence[idx]
        val correct = MusicTheory.isCorrect(midi, cents, expected)

        vibrate(correct)

        val detected = DetectedNote(midi, cents, correct)
        val newDetected = state.detected + detected

        if (correct) {
            val nextIdx = idx + 1
            if (nextIdx >= state.sequence.size) {
                audioCapture.stop()
                _state.value = state.copy(
                    detected = newDetected,
                    currentNoteIndex = nextIdx,
                    status = ExerciseStatus.DONE
                )
            } else {
                _state.value = state.copy(
                    detected = newDetected,
                    currentNoteIndex = nextIdx
                )
                resetStability()
            }
        } else {
            audioCapture.stop()
            _state.value = state.copy(
                detected = newDetected,
                currentNoteIndex = state.sequence.size,
                status = ExerciseStatus.DONE
            )
        }
    }

    fun newRound() {
        startExercise()
    }

    private fun resetStability() {
        stableCount = 0
        stablePitchClass = -1
        lastConfirmedMs = 0L
    }

    private fun vibrate(success: Boolean) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val effect = if (success)
                    VibrationEffect.createOneShot(80, VibrationEffect.DEFAULT_AMPLITUDE)
                else
                    VibrationEffect.createWaveform(longArrayOf(0, 100, 80, 100), -1)
                vibrator.vibrate(effect)
            } else {
                @Suppress("DEPRECATION")
                vibrator.vibrate(if (success) 80 else 200)
            }
        } catch (e: Exception) {
            android.util.Log.e("ExerciseViewModel", "Vibrate error: ${e.message}")
        }
    }

    override fun onCleared() {
        super.onCleared()
        audioCapture.stop()
        audioPlayback.cancelPlayback()
    }
}
