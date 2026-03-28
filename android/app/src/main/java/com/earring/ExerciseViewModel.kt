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


data class DetectedNote(val midi: Int, val cents: Int, val correct: Boolean)

enum class ExerciseStatus { PLAYING, LISTENING, RETRY_DELAY, STOPPED }

data class ExerciseState(
    val rootNote: Int = 0,
    val rangeStart: Int = 60,   // MIDI of range low bound (default C4)
    val rangeEnd: Int = 71,     // MIDI of range high bound (default B4)
    val scaleId: Int = 0,
    val sequenceLength: Int = 4,
    val tempoBpm: Int = 100,
    val showTestNotes: Boolean = false,
    val keySignatureMode: Int = 0,  // 0=inline accidentals, 1=key signature
    val maxRetries: Int = DEFAULT_MAX_ATTEMPTS,
    val silenceThreshold: Float = DEFAULT_SILENCE_THRESHOLD,
    val framesToConfirm: Int = DEFAULT_FRAMES_TO_CONFIRM,
    val postChordGapMs: Long = DEFAULT_POST_CHORD_GAP_MS,
    val wrongNotePauseMs: Long = DEFAULT_WRONG_NOTE_PAUSE_MS,
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
    /** MIDI of the root note at or just below rangeStart (used for intro chord). */
    val rootMidi: Int get() = rangeStart - ((rangeStart - rootNote + 12) % 12)
    val averageScorePercent: Int get() =
        if (testsCompleted == 0) 0 else cumulativeScorePercent / testsCompleted
    val score: Float get() = averageScorePercent / 100f
    val rangeLabel: String get() =
        "${MusicTheory.midiToLabel(rangeStart)}–${MusicTheory.midiToLabel(rangeEnd)}"

    companion object {
        /** One octave from the instance of rootNote closest to middle C (MIDI 60). */
        fun defaultRange(rootNote: Int): Pair<Int, Int> {
            val best = (2..6).map { oct -> (oct + 1) * 12 + rootNote }
                .minByOrNull { kotlin.math.abs(it - 60) }!!
            return Pair(best, best + 11)
        }
    }
}

private const val DEFAULT_MAX_ATTEMPTS = 5
private const val DEFAULT_SILENCE_THRESHOLD = 0.003f
private const val DEFAULT_FRAMES_TO_CONFIRM = 3
private const val DEFAULT_POST_CHORD_GAP_MS = 800L
private const val DEFAULT_WRONG_NOTE_PAUSE_MS = 3000L
// Gap between the last note of the sequence ending and mic start.
// Piano sustain continues after `onDone` fires; this silence lets it fade so
// the mic doesn't immediately pick up speaker resonance as a "played" note.
private const val POST_SEQUENCE_GAP_MS = 700L

private const val PREFS_NAME = "ear_ring_settings"
private const val PREF_ROOT_NOTE = "rootNote"
private const val PREF_RANGE_START = "rangeStart"
private const val PREF_RANGE_END = "rangeEnd"
private const val PREF_SCALE_ID = "scaleId"
private const val PREF_SEQUENCE_LENGTH = "sequenceLength"
private const val PREF_TEMPO_BPM = "tempoBpm"
private const val PREF_SHOW_TEST_NOTES = "showTestNotes"
private const val PREF_KEY_SIG_MODE = "keySignatureMode"
private const val PREF_MAX_RETRIES = "maxRetries"
private const val PREF_SILENCE_THRESHOLD = "silenceThreshold"
private const val PREF_FRAMES_TO_CONFIRM = "framesToConfirm"
private const val PREF_POST_CHORD_GAP_MS = "postChordGapMs"
private const val PREF_WRONG_NOTE_PAUSE_MS = "wrongNotePauseMs"

class ExerciseViewModel(application: Application) : AndroidViewModel(application) {

    private val prefs = application.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    private fun loadInitialState(): ExerciseState {
        val rootNote = prefs.getInt(PREF_ROOT_NOTE, 0)
        val defaultRange = ExerciseState.defaultRange(rootNote)
        return ExerciseState(
            rootNote = rootNote,
            rangeStart = prefs.getInt(PREF_RANGE_START, defaultRange.first),
            rangeEnd = prefs.getInt(PREF_RANGE_END, defaultRange.second),
            scaleId = prefs.getInt(PREF_SCALE_ID, 0),
            sequenceLength = prefs.getInt(PREF_SEQUENCE_LENGTH, 4),
            tempoBpm = prefs.getInt(PREF_TEMPO_BPM, 100),
            showTestNotes = prefs.getBoolean(PREF_SHOW_TEST_NOTES, false),
            keySignatureMode = prefs.getInt(PREF_KEY_SIG_MODE, 0),
            maxRetries = prefs.getInt(PREF_MAX_RETRIES, DEFAULT_MAX_ATTEMPTS),
            silenceThreshold = prefs.getFloat(PREF_SILENCE_THRESHOLD, DEFAULT_SILENCE_THRESHOLD),
            framesToConfirm = prefs.getInt(PREF_FRAMES_TO_CONFIRM, DEFAULT_FRAMES_TO_CONFIRM),
            postChordGapMs = prefs.getLong(PREF_POST_CHORD_GAP_MS, DEFAULT_POST_CHORD_GAP_MS),
            wrongNotePauseMs = prefs.getLong(PREF_WRONG_NOTE_PAUSE_MS, DEFAULT_WRONG_NOTE_PAUSE_MS),
        )
    }

    private fun saveSettings(state: ExerciseState) {
        prefs.edit()
            .putInt(PREF_ROOT_NOTE, state.rootNote)
            .putInt(PREF_RANGE_START, state.rangeStart)
            .putInt(PREF_RANGE_END, state.rangeEnd)
            .putInt(PREF_SCALE_ID, state.scaleId)
            .putInt(PREF_SEQUENCE_LENGTH, state.sequenceLength)
            .putInt(PREF_TEMPO_BPM, state.tempoBpm)
            .putBoolean(PREF_SHOW_TEST_NOTES, state.showTestNotes)
            .putInt(PREF_KEY_SIG_MODE, state.keySignatureMode)
            .putInt(PREF_MAX_RETRIES, state.maxRetries)
            .putFloat(PREF_SILENCE_THRESHOLD, state.silenceThreshold)
            .putInt(PREF_FRAMES_TO_CONFIRM, state.framesToConfirm)
            .putLong(PREF_POST_CHORD_GAP_MS, state.postChordGapMs)
            .putLong(PREF_WRONG_NOTE_PAUSE_MS, state.wrongNotePauseMs)
            .apply()
    }

    private val _state = MutableStateFlow(loadInitialState())
    val state: StateFlow<ExerciseState> = _state.asStateFlow()

    val audioPlayback = AudioPlayback(application)
    private var sessionPersisted = false

    private val vibrator: Vibrator by lazy {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            (application.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager).defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            application.getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
        }
    }

    fun setRootNote(note: Int) {
        val (start, end) = ExerciseState.defaultRange(note)
        _state.value = _state.value.copy(rootNote = note, rangeStart = start, rangeEnd = end)
        saveSettings(_state.value)
    }
    fun setRange(start: Int, end: Int) { _state.value = _state.value.copy(rangeStart = start, rangeEnd = end); saveSettings(_state.value) }
    fun setScaleId(id: Int) { _state.value = _state.value.copy(scaleId = id); saveSettings(_state.value) }
    fun setSequenceLength(len: Int) { _state.value = _state.value.copy(sequenceLength = len); saveSettings(_state.value) }
    fun setTempoBpm(bpm: Int) { _state.value = _state.value.copy(tempoBpm = bpm); saveSettings(_state.value) }
    fun setShowTestNotes(show: Boolean) { _state.value = _state.value.copy(showTestNotes = show); saveSettings(_state.value) }
    fun setKeySignatureMode(mode: Int) { _state.value = _state.value.copy(keySignatureMode = mode); saveSettings(_state.value) }
    fun setMaxRetries(n: Int) { _state.value = _state.value.copy(maxRetries = n); saveSettings(_state.value) }
    fun setSilenceThreshold(v: Float) { _state.value = _state.value.copy(silenceThreshold = v); saveSettings(_state.value) }
    fun setFramesToConfirm(n: Int) { _state.value = _state.value.copy(framesToConfirm = n); saveSettings(_state.value) }
    fun setPostChordGapMs(ms: Long) { _state.value = _state.value.copy(postChordGapMs = ms); saveSettings(_state.value) }
    fun setWrongNotePauseMs(ms: Long) { _state.value = _state.value.copy(wrongNotePauseMs = ms); saveSettings(_state.value) }

    fun startExercise() {
        audioPlayback.cancelPlayback()
        sessionPersisted = false
        _state.value = _state.value.copy(
            sequence = emptyList(),
            detected = emptyList(),
            status = ExerciseStatus.PLAYING,
            currentNoteIndex = 0,
            seed = System.currentTimeMillis(),
            highlightIndex = -1,
            currentAttempt = 1,
            maxAttempts = _state.value.maxRetries,
            testsCompleted = 0,
            cumulativeScorePercent = 0,
            sessionRunning = true
        )
        startFreshTest()
    }

    fun stopExercise() {
        val shouldSave = _state.value.testsCompleted > 0
        audioPlayback.cancelPlayback()
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
            state.rootNote,
            state.scaleId,
            state.sequenceLength,
            state.rangeStart,
            state.rangeEnd,
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
        val triad = EarRingCore.introChord(state.rootMidi, state.scaleId).toList()
        audioPlayback.playChord(
            midiNotes = triad,
            onDone = {
                if (_state.value.sessionRunning) {
                    viewModelScope.launch {
                        delay(_state.value.postChordGapMs)
                        if (_state.value.sessionRunning) {
                            audioPlayback.playSequence(
                                midiNotes = state.sequence,
                                bpm = state.tempoBpm,
                                onEach = {},
                                onDone = {
                                    if (_state.value.sessionRunning) {
                                        viewModelScope.launch {
                                            delay(POST_SEQUENCE_GAP_MS)
                                            if (_state.value.sessionRunning) {
                                                startListening()
                                            }
                                        }
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
        _state.value = _state.value.copy(status = ExerciseStatus.LISTENING, currentNoteIndex = 0)
    }

    fun confirmNote(midi: Int, cents: Int) {
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
            }
        } else {
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
            delay(_state.value.wrongNotePauseMs)
            if (_state.value.sessionRunning) {
                startFreshTest()
            }
        }
    }

    private fun scheduleRetry(nextAttempt: Int) {
        viewModelScope.launch {
            delay(_state.value.wrongNotePauseMs)
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
            rootLabel = "${MusicTheory.NOTE_NAMES[state.rootNote]} ${state.rangeLabel}",
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
                rootLabel = "${MusicTheory.NOTE_NAMES[state.rootNote]} ${state.rangeLabel}",
                score = state.averageScorePercent / 100f,
                sequenceLength = state.sequenceLength,
                testsCompleted = state.testsCompleted
            )
        )
        sessionPersisted = true
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
        audioPlayback.cancelPlayback()
    }
}
