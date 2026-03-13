package com.earring

import android.app.Application
import android.content.Context
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlin.math.sqrt

data class DetectedNote(val midi: Int, val cents: Int, val correct: Boolean)

enum class ExerciseStatus { PLAYING, LISTENING, RETRY_DELAY, STOPPED }

data class ExerciseState(
    val rootNote: Int = 0,
    val octave: Int = 4,
    val scaleId: Int = 0,
    val sequenceLength: Int = 4,
    val tempoBpm: Int = 100,
    val showTestNotes: Boolean = false,
    val sequence: List<Int> = emptyList(),
    val detected: List<DetectedNote> = emptyList(),
    val status: ExerciseStatus = ExerciseStatus.STOPPED,
    val currentNoteIndex: Int = 0,
    val seed: Long = System.currentTimeMillis(),
    val highlightIndex: Int = -1,
    val currentAttempt: Int = 1,
    val maxAttempts: Int = DEFAULT_MAX_ATTEMPTS,
    val testsCompleted: Int = 0,
    val cumulativeScorePercent: Int = 0,
    val sessionRunning: Boolean = false
) {
    val rootMidi: Int get() = (octave + 1) * 12 + rootNote
    val averageScorePercent: Int get() =
        if (testsCompleted == 0) 0 else cumulativeScorePercent / testsCompleted
    val score: Float get() = averageScorePercent / 100f
}

private const val DEFAULT_MAX_ATTEMPTS = 5
private const val RETRY_DELAY_MS = 3000L
private const val INTRO_GAP_MS = 800L

class ExerciseViewModel(application: Application) : AndroidViewModel(application) {

    private val _state = MutableStateFlow(ExerciseState())
    val state: StateFlow<ExerciseState> = _state.asStateFlow()

    val audioCapture = AudioCapture()
    val audioPlayback = AudioPlayback(application)

    private val _liveHz = MutableStateFlow(-1f)
    val liveHz: StateFlow<Float> = _liveHz.asStateFlow()

    private var stableCount = 0
    private var stablePitchClass = -1
    private var pitchConsumed = false
    private var sessionPersisted = false

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
    fun setTempoBpm(bpm: Int) { _state.value = _state.value.copy(tempoBpm = bpm) }
    fun setShowTestNotes(show: Boolean) { _state.value = _state.value.copy(showTestNotes = show) }

    fun startExercise() {
        stopAllAudio()
        sessionPersisted = false
        resetStability()
        _liveHz.value = -1f
        _state.value = _state.value.copy(
            sequence = emptyList(),
            detected = emptyList(),
            status = ExerciseStatus.PLAYING,
            currentNoteIndex = 0,
            seed = System.currentTimeMillis(),
            highlightIndex = -1,
            currentAttempt = 1,
            maxAttempts = DEFAULT_MAX_ATTEMPTS,
            testsCompleted = 0,
            cumulativeScorePercent = 0,
            sessionRunning = true
        )
        startFreshTest()
    }

    fun stopExercise() {
        val shouldSave = _state.value.testsCompleted > 0
        stopAllAudio()
        resetStability()
        _liveHz.value = -1f
        if (shouldSave) {
            saveSessionSummary()
        }
        _state.value = _state.value.copy(
            detected = emptyList(),
            currentNoteIndex = 0,
            status = ExerciseStatus.STOPPED,
            highlightIndex = -1,
            sessionRunning = false
        )
    }

    fun newRound() {
        startExercise()
    }

    private fun startFreshTest() {
        val state = _state.value
        if (!state.sessionRunning) return
        val seed = System.currentTimeMillis()
        val sequence = EarRingCore.generateSequence(
            state.rootMidi,
            state.scaleId,
            state.sequenceLength,
            seed
        ).toList()
        _state.value = state.copy(
            sequence = sequence,
            detected = emptyList(),
            currentNoteIndex = 0,
            currentAttempt = 1,
            seed = seed,
            status = ExerciseStatus.PLAYING,
            highlightIndex = -1
        )
        playPrompt()
    }

    private fun retryCurrentTest(nextAttempt: Int) {
        val state = _state.value
        if (!state.sessionRunning) return
        _state.value = state.copy(
            detected = emptyList(),
            currentNoteIndex = 0,
            currentAttempt = nextAttempt,
            status = ExerciseStatus.PLAYING,
            highlightIndex = -1
        )
        playPrompt()
    }

    private fun playPrompt() {
        val state = _state.value
        if (!state.sessionRunning || state.sequence.isEmpty()) return
        resetStability()
        _liveHz.value = -1f
        val triad = EarRingCore.introChord(state.rootMidi, state.scaleId).toList()
        audioPlayback.playChord(
            midiNotes = triad,
            onDone = {
                if (_state.value.sessionRunning) {
                    viewModelScope.launch {
                        delay(INTRO_GAP_MS)
                        if (_state.value.sessionRunning) {
                            audioPlayback.playSequence(
                                midiNotes = state.sequence,
                                bpm = state.tempoBpm,
                                onEach = {},
                                onDone = {
                                    if (_state.value.sessionRunning) {
                                        startListening()
                                    }
                                }
                            )
                        }
                    }
                }
            }
        )
    }

    private fun startListening() {
        resetStability()
        _liveHz.value = -1f
        _state.value = _state.value.copy(status = ExerciseStatus.LISTENING, currentNoteIndex = 0)
        audioCapture.start(onAudio = { samples -> processSamples(samples) })
    }

    private fun processSamples(samples: FloatArray) {
        val rms = sqrt(samples.map { it * it }.average().toFloat())
        if (rms < 0.003f) {
            resetStability()
            _liveHz.value = -1f
            return
        }

        val hz = EarRingCore.detectPitch(samples, 44100)
        if (hz <= 0f) {
            resetStability()
            _liveHz.value = -1f
            return
        }
        _liveHz.value = hz

        val midi = EarRingCore.freqToMidi(hz)
        if (midi < 0) {
            resetStability()
            return
        }
        val cents = EarRingCore.freqToCents(hz)
        val pitchClass = midi % 12

        if (pitchClass == stablePitchClass) {
            stableCount++
        } else {
            stablePitchClass = pitchClass
            stableCount = 1
            pitchConsumed = false
        }

        if (!pitchConsumed && stableCount >= 3) {
            pitchConsumed = true
            confirmNote(midi, cents)
        }
    }

    private fun confirmNote(midi: Int, cents: Int) {
        val state = _state.value
        if (state.status != ExerciseStatus.LISTENING) return
        val index = state.currentNoteIndex
        if (index >= state.sequence.size) return

        val correct = EarRingCore.isCorrectNote(midi, cents, state.sequence[index])
        val detected = state.detected + DetectedNote(midi, cents, correct)
        vibrate(correct)

        if (correct) {
            val nextIndex = index + 1
            if (nextIndex >= state.sequence.size) {
                audioCapture.stop()
                _liveHz.value = -1f
                completeTest(
                    passed = true,
                    attemptNotes = detected,
                    attemptsUsed = state.currentAttempt
                )
            } else {
                _state.value = state.copy(
                    detected = detected,
                    currentNoteIndex = nextIndex
                )
                resetStability()
            }
        } else {
            audioCapture.stop()
            _liveHz.value = -1f
            _state.value = state.copy(
                detected = detected,
                currentNoteIndex = detected.size,
                status = ExerciseStatus.RETRY_DELAY
            )
            if (state.currentAttempt >= state.maxAttempts) {
                completeTest(
                    passed = false,
                    attemptNotes = detected,
                    attemptsUsed = state.currentAttempt
                )
            } else {
                scheduleRetry(state.currentAttempt + 1)
            }
        }
    }

    private fun completeTest(passed: Boolean, attemptNotes: List<DetectedNote>, attemptsUsed: Int) {
        val state = _state.value
        val scorePercent = EarRingCore.testScore(state.maxAttempts, attemptsUsed, passed)
        persistTestRecord(state, attemptNotes, attemptsUsed, passed, scorePercent)
        _state.value = state.copy(
            detected = attemptNotes,
            currentNoteIndex = attemptNotes.size.coerceAtMost(state.sequence.size),
            status = ExerciseStatus.RETRY_DELAY,
            testsCompleted = state.testsCompleted + 1,
            cumulativeScorePercent = state.cumulativeScorePercent + scorePercent
        )
        viewModelScope.launch {
            delay(RETRY_DELAY_MS)
            if (_state.value.sessionRunning) {
                startFreshTest()
            }
        }
    }

    private fun scheduleRetry(nextAttempt: Int) {
        viewModelScope.launch {
            delay(RETRY_DELAY_MS)
            if (_state.value.sessionRunning) {
                retryCurrentTest(nextAttempt)
            }
        }
    }

    private fun persistTestRecord(
        state: ExerciseState,
        attemptNotes: List<DetectedNote>,
        attemptsUsed: Int,
        passed: Boolean,
        scorePercent: Int
    ) {
        val context = getApplication<Application>()
        val record = TestRecord(
            scaleName = MusicTheory.SCALE_NAMES[state.scaleId],
            rootLabel = "${MusicTheory.NOTE_NAMES[state.rootNote]}${state.octave}",
            scorePercent = scorePercent,
            attemptsUsed = attemptsUsed,
            maxAttempts = state.maxAttempts,
            passed = passed,
            sequenceLength = state.sequenceLength,
            expectedNotes = state.sequence.map(MusicTheory::midiToLabel),
            detectedNotes = attemptNotes.map { MusicTheory.midiToLabel(it.midi) }
        )
        ProgressStorage.appendTest(context, record)
    }

    private fun saveSessionSummary() {
        if (sessionPersisted) return
        val state = _state.value
        if (state.testsCompleted <= 0) return
        val context = getApplication<Application>()
        ProgressStorage.appendSession(
            context,
            SessionRecord(
                scaleName = MusicTheory.SCALE_NAMES[state.scaleId],
                rootLabel = "${MusicTheory.NOTE_NAMES[state.rootNote]}${state.octave}",
                score = state.averageScorePercent / 100f,
                sequenceLength = state.sequenceLength,
                testsCompleted = state.testsCompleted
            )
        )
        sessionPersisted = true
    }

    private fun stopAllAudio() {
        audioCapture.stop()
        audioPlayback.cancelPlayback()
    }

    private fun resetStability() {
        stableCount = 0
        stablePitchClass = -1
        pitchConsumed = false
    }

    private fun vibrate(success: Boolean) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val effect = if (success) {
                    VibrationEffect.createOneShot(80, VibrationEffect.DEFAULT_AMPLITUDE)
                } else {
                    VibrationEffect.createWaveform(longArrayOf(0, 100, 80, 100), -1)
                }
                vibrator.vibrate(effect)
            } else {
                @Suppress("DEPRECATION")
                vibrator.vibrate(if (success) 80 else 200)
            }
        } catch (_: Exception) {
        }
    }

    override fun onCleared() {
        super.onCleared()
        stopAllAudio()
    }
}
