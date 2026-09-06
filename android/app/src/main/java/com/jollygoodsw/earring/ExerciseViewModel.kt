package com.jollygoodsw.earring

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
    val rangeEnd: Int = 72,     // MIDI of range high bound (default C5)
    val scaleId: Int = 0,
    val sequenceLength: Int = 1,
    val tempoBpm: Int = 100,
    val showTestNotes: Boolean = false,
    val keySignatureMode: Int = 0,  // 0=inline accidentals, 1=key signature
    val introSoundMode: Int = 1,  // 0=root note, 1=chord (default), 2=arpeggiated chord, 3=scale, 4=none
    val maxRetries: Int = DEFAULT_MAX_ATTEMPTS,
    /** Issue #9 "note correction": consecutive wrong tries allowed at the same note
     *  position before the whole test restarts. 0 = always restart (old behavior). */
    val noteRetries: Int = DEFAULT_NOTE_RETRIES,
    val silenceThreshold: Float = DEFAULT_SILENCE_THRESHOLD,
    val framesToConfirm: Int = DEFAULT_FRAMES_TO_CONFIRM,
    val warmupFrames: Int = DEFAULT_WARMUP_FRAMES,
    val postChordGapMs: Long = DEFAULT_POST_CHORD_GAP_MS,
    val wrongNotePauseMs: Long = DEFAULT_WRONG_NOTE_PAUSE_MS,
    val instrumentIndex: Int = 0,
    val testType: Int = 0,               // 0=Random, 1=Melody, 2=DiatonicTriads(stub)
    val playPassFailSounds: Boolean = true,  // chime on test pass/fail
    val sequence: List<Int> = emptyList(),
    val detected: List<DetectedNote> = emptyList(),
    val status: ExerciseStatus = ExerciseStatus.STOPPED,
    val currentNoteIndex: Int = 0,
    val seed: Long = System.currentTimeMillis(),
    val highlightIndex: Int = -1,
    val currentAttempt: Int = 1,
    val maxAttempts: Int = DEFAULT_MAX_ATTEMPTS,
    /** Consecutive wrong tries at the current note position — not persisted; reset on a
     *  correct note or whenever the sequence restarts (see [EarRingCore.wrongNoteOutcome]). */
    val noteRetryCount: Int = 0,
    val testsCompleted: Int = 0,
    val cumulativeScorePercent: Int = 0,
    val sessionRunning: Boolean = false,
    /** Set once per startExercise() call — correlates persisted TestRecords to their SessionRecord. */
    val sessionId: Long = 0,
    val melodyDurations: List<Float> = emptyList(),
    val melodyDeck: List<Int> = emptyList(),
    val melodyDeckCursor: Int = 0,
    val chordLabel: String = "",  // Set for diatonic mode; shown below title
    val isPremium: Boolean = false,  // Ad-free / paid entitlement; not a user "setting" — survives resetSettings()
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
            return Pair(best, best + 12)
        }
    }
}

private const val DEFAULT_MAX_ATTEMPTS = 5
private const val DEFAULT_NOTE_RETRIES = 2
private const val DEFAULT_SILENCE_THRESHOLD = 0.003f
private const val DEFAULT_FRAMES_TO_CONFIRM = 3
private const val DEFAULT_WARMUP_FRAMES = 4
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
private const val PREF_PLAY_PASS_FAIL_SOUNDS = "playPassFailSounds"
private const val PREF_KEY_SIG_MODE = "keySignatureMode"
private const val PREF_INTRO_SOUND_MODE = "introSoundMode"
private const val PREF_MAX_RETRIES = "maxRetries"
private const val PREF_NOTE_RETRIES = "noteRetries"
private const val PREF_SILENCE_THRESHOLD = "silenceThreshold"
private const val PREF_FRAMES_TO_CONFIRM = "framesToConfirm"
private const val PREF_WARMUP_FRAMES = "warmupFrames"
private const val PREF_POST_CHORD_GAP_MS = "postChordGapMs"
private const val PREF_WRONG_NOTE_PAUSE_MS = "wrongNotePauseMs"
private const val PREF_INSTRUMENT_INDEX = "instrumentIndex"
private const val PREF_TEST_TYPE = "testType"
private const val PREF_HAS_LAUNCHED = "hasLaunched"
private const val PREF_IS_PREMIUM = "isPremium"

class ExerciseViewModel(application: Application) : AndroidViewModel(application) {

    private val prefs = application.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    /** True if this is the very first launch (flag not yet set). Marks as launched. */
    fun consumeFirstLaunch(): Boolean {
        if (prefs.getBoolean(PREF_HAS_LAUNCHED, false)) return false
        prefs.edit().putBoolean(PREF_HAS_LAUNCHED, true).apply()
        return true
    }

    private fun loadInitialState(): ExerciseState {
        val rootNote = prefs.getInt(PREF_ROOT_NOTE, 0)
        val defaultRange = ExerciseState.defaultRange(rootNote)
        return ExerciseState(
            rootNote = rootNote,
            rangeStart = prefs.getInt(PREF_RANGE_START, defaultRange.first),
            rangeEnd = prefs.getInt(PREF_RANGE_END, defaultRange.second),
            scaleId = prefs.getInt(PREF_SCALE_ID, 0),
            sequenceLength = prefs.getInt(PREF_SEQUENCE_LENGTH, 1),
            tempoBpm = prefs.getInt(PREF_TEMPO_BPM, 100),
            showTestNotes = prefs.getBoolean(PREF_SHOW_TEST_NOTES, false),
            playPassFailSounds = prefs.getBoolean(PREF_PLAY_PASS_FAIL_SOUNDS, true),
            keySignatureMode = prefs.getInt(PREF_KEY_SIG_MODE, 0),
            introSoundMode = prefs.getInt(PREF_INTRO_SOUND_MODE, 1),
            maxRetries = prefs.getInt(PREF_MAX_RETRIES, DEFAULT_MAX_ATTEMPTS),
            noteRetries = prefs.getInt(PREF_NOTE_RETRIES, DEFAULT_NOTE_RETRIES),
            silenceThreshold = prefs.getFloat(PREF_SILENCE_THRESHOLD, DEFAULT_SILENCE_THRESHOLD),
            framesToConfirm = prefs.getInt(PREF_FRAMES_TO_CONFIRM, DEFAULT_FRAMES_TO_CONFIRM),
            warmupFrames = prefs.getInt(PREF_WARMUP_FRAMES, DEFAULT_WARMUP_FRAMES),
            postChordGapMs = prefs.getLong(PREF_POST_CHORD_GAP_MS, DEFAULT_POST_CHORD_GAP_MS),
            wrongNotePauseMs = prefs.getLong(PREF_WRONG_NOTE_PAUSE_MS, DEFAULT_WRONG_NOTE_PAUSE_MS),
            instrumentIndex = prefs.getInt(PREF_INSTRUMENT_INDEX, 0),
            testType = prefs.getInt(PREF_TEST_TYPE, 0).let {
                when (it) {
                    1 -> 0  // Melody mode reset (no longer in UI)
                    3 -> 2  // Merged descending-arpeggio mode into 2 (issue #5)
                    else -> it
                }
            },
            isPremium = prefs.getBoolean(PREF_IS_PREMIUM, false),
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
            .putBoolean(PREF_PLAY_PASS_FAIL_SOUNDS, state.playPassFailSounds)
            .putInt(PREF_KEY_SIG_MODE, state.keySignatureMode)
            .putInt(PREF_INTRO_SOUND_MODE, state.introSoundMode)
            .putInt(PREF_MAX_RETRIES, state.maxRetries)
            .putInt(PREF_NOTE_RETRIES, state.noteRetries)
            .putFloat(PREF_SILENCE_THRESHOLD, state.silenceThreshold)
            .putInt(PREF_FRAMES_TO_CONFIRM, state.framesToConfirm)
            .putInt(PREF_WARMUP_FRAMES, state.warmupFrames)
            .putLong(PREF_POST_CHORD_GAP_MS, state.postChordGapMs)
            .putLong(PREF_WRONG_NOTE_PAUSE_MS, state.wrongNotePauseMs)
            .putInt(PREF_INSTRUMENT_INDEX, state.instrumentIndex)
            .putInt(PREF_TEST_TYPE, state.testType)
            .putBoolean(PREF_IS_PREMIUM, state.isPremium)
            .apply()
    }

    /** Resets all settings to their defaults. Does NOT affect progress data or the
     *  isPremium entitlement (that's a purchase, not a preference — left untouched).
     *  Also clears the first-launch flag so Help screen shows on next launch. */
    fun resetSettings() {
        val defaults = ExerciseState()
        prefs.edit()
            .putInt(PREF_ROOT_NOTE, defaults.rootNote)
            .putInt(PREF_RANGE_START, defaults.rangeStart)
            .putInt(PREF_RANGE_END, defaults.rangeEnd)
            .putInt(PREF_SCALE_ID, defaults.scaleId)
            .putInt(PREF_SEQUENCE_LENGTH, defaults.sequenceLength)
            .putInt(PREF_TEMPO_BPM, defaults.tempoBpm)
            .putBoolean(PREF_SHOW_TEST_NOTES, defaults.showTestNotes)
            .putBoolean(PREF_PLAY_PASS_FAIL_SOUNDS, defaults.playPassFailSounds)
            .putInt(PREF_KEY_SIG_MODE, defaults.keySignatureMode)
            .putInt(PREF_INTRO_SOUND_MODE, defaults.introSoundMode)
            .putInt(PREF_MAX_RETRIES, defaults.maxRetries)
            .putInt(PREF_NOTE_RETRIES, defaults.noteRetries)
            .putFloat(PREF_SILENCE_THRESHOLD, defaults.silenceThreshold)
            .putInt(PREF_FRAMES_TO_CONFIRM, defaults.framesToConfirm)
            .putInt(PREF_WARMUP_FRAMES, defaults.warmupFrames)
            .putLong(PREF_POST_CHORD_GAP_MS, defaults.postChordGapMs)
            .putLong(PREF_WRONG_NOTE_PAUSE_MS, defaults.wrongNotePauseMs)
            .putInt(PREF_INSTRUMENT_INDEX, defaults.instrumentIndex)
            .putInt(PREF_TEST_TYPE, defaults.testType)
            .remove(PREF_HAS_LAUNCHED)
            .apply()
        _state.value = defaults.copy(isPremium = _state.value.isPremium)
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
    fun setPlayPassFailSounds(play: Boolean) { _state.value = _state.value.copy(playPassFailSounds = play); saveSettings(_state.value) }
    fun setKeySignatureMode(mode: Int) { _state.value = _state.value.copy(keySignatureMode = mode); saveSettings(_state.value) }
    fun setIntroSoundMode(mode: Int) { _state.value = _state.value.copy(introSoundMode = mode); saveSettings(_state.value) }
    fun setMaxRetries(n: Int) { _state.value = _state.value.copy(maxRetries = n); saveSettings(_state.value) }
    fun setNoteRetries(n: Int) { _state.value = _state.value.copy(noteRetries = n); saveSettings(_state.value) }
    fun setSilenceThreshold(v: Float) { _state.value = _state.value.copy(silenceThreshold = v); saveSettings(_state.value) }
    fun setFramesToConfirm(n: Int) { _state.value = _state.value.copy(framesToConfirm = n); saveSettings(_state.value) }
    fun setWarmupFrames(n: Int) { _state.value = _state.value.copy(warmupFrames = n); saveSettings(_state.value) }
    fun setPostChordGapMs(ms: Long) { _state.value = _state.value.copy(postChordGapMs = ms); saveSettings(_state.value) }
    fun setWrongNotePauseMs(ms: Long) { _state.value = _state.value.copy(wrongNotePauseMs = ms); saveSettings(_state.value) }
    fun setInstrumentIndex(idx: Int) {
        val (start, end) = ExerciseState.defaultRange(_state.value.rootNote)
        _state.value = _state.value.copy(instrumentIndex = idx, rangeStart = start, rangeEnd = end)
        saveSettings(_state.value)
    }
    /** Ad-free / paid entitlement. Called once purchase state is confirmed (e.g. from
     *  Play Billing); until real billing lands, nothing sets this to true. */
    fun setPremium(premium: Boolean) { _state.value = _state.value.copy(isPremium = premium); saveSettings(_state.value) }
    fun setTestType(type: Int) {
        val current = _state.value
        val newSeqLen = if (type == 2 && current.sequenceLength !in setOf(3, 4)) 3 else current.sequenceLength
        _state.value = current.copy(testType = type, sequenceLength = newSeqLen)
        saveSettings(_state.value)
    }

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
            sessionRunning = true,
            sessionId = System.currentTimeMillis()
        )
        // If melody mode, initialise shuffle deck
        if (_state.value.testType == 1) {
            val deck = EarRingCore.shuffleMelodyIndices(System.currentTimeMillis()).toList()
            _state.value = _state.value.copy(melodyDeck = deck, melodyDeckCursor = 0)
        }
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

        if (state.testType == 1) {
            // Melody mode — use shuffle deck
            var deck = state.melodyDeck
            var cursor = state.melodyDeckCursor
            if (cursor >= deck.size) {
                // Exhausted deck — reshuffle
                deck = EarRingCore.shuffleMelodyIndices(System.currentTimeMillis()).toList()
                cursor = 0
            }
            val melodyIndex = deck[cursor]
            val (midiNotes, durations) = EarRingCore.pickMelodyByIndex(melodyIndex, state.rootNote)
            if (midiNotes.isEmpty()) {
                // Fallback: advance cursor and try again
                _state.value = state.copy(melodyDeckCursor = cursor + 1)
                startFreshTest()
                return
            }
            // Auto-set range from melody MIDI span ±6 semitones
            val minMidi = (midiNotes.minOrNull() ?: 60) - 6
            val maxMidi = (midiNotes.maxOrNull() ?: 72) + 6
            val rangeStart = minMidi.coerceIn(21, 108)
            val rangeEnd = maxMidi.coerceIn(21, 108)
            _state.value = state.copy(
                sequence = midiNotes,
                melodyDurations = durations,
                melodyDeck = deck,
                melodyDeckCursor = cursor + 1,
                rangeStart = rangeStart,
                rangeEnd = rangeEnd,
                detected = emptyList(),
                currentNoteIndex = 0,
                currentAttempt = 1,
                noteRetryCount = 0,
                status = ExerciseStatus.PLAYING,
                highlightIndex = -1
            )
        } else if (state.testType == 2) {
            // Diatonic arpeggio mode — direction (ascending/descending) is randomized
            // per test rather than a user choice (issue #5), and consecutive tests
            // must not open on the same note, mirroring the guard in random mode
            // below. Each retry draws a fresh seed so the chord label (recomputed
            // separately from the same seed) stays in sync with what's actually played.
            // Also retry if the voicing came up short: root position is used throughout
            // (no inversions yet — see roadmap.md), and Rust rejects (returns empty)
            // rather than clamp a note to the range boundary, which could substitute a
            // wrong pitch that isn't a real chord tone. A different scale degree usually
            // fits the range cleanly.
            val centerMidi = (state.rangeStart + state.rangeEnd) / 2
            val avoidFirstMidi = state.sequence.firstOrNull()
            var midiNotes: List<Int> = emptyList()
            var seed = System.currentTimeMillis()
            for (attempt in 0 until 8) {
                seed = System.currentTimeMillis() + attempt
                val generated = EarRingCore.generateDiatonicChord(
                    state.rootNote, 0, state.sequenceLength,
                    state.rangeStart, state.rangeEnd, seed
                ).toList()
                midiNotes = if (kotlin.random.Random.nextBoolean()) generated.reversed() else generated
                if (midiNotes.size == state.sequenceLength && midiNotes.firstOrNull() != avoidFirstMidi) break
            }
            val label = EarRingCore.writtenDiatonicChordLabel(state.rootNote, 0, state.sequenceLength, centerMidi, seed, state.instrumentIndex)
            _state.value = state.copy(
                sequence = midiNotes,
                melodyDurations = emptyList(),
                detected = emptyList(),
                currentNoteIndex = 0,
                currentAttempt = 1,
                noteRetryCount = 0,
                seed = seed,
                status = ExerciseStatus.PLAYING,
                highlightIndex = -1,
                chordLabel = label
            )
        } else {
            // Random mode (existing logic)
            val seed = System.currentTimeMillis()
            // Avoid repeating the previous test's opening note, whatever mode it came from.
            val avoidFirstMidi = state.sequence.firstOrNull() ?: -1
            val sequence = EarRingCore.generateSequence(
                state.rootNote, state.scaleId, state.sequenceLength,
                state.rangeStart, state.rangeEnd, seed, avoidFirstMidi
            ).toList()
            _state.value = state.copy(
                sequence = sequence,
                melodyDurations = emptyList(),
                detected = emptyList(),
                currentNoteIndex = 0,
                currentAttempt = 1,
                noteRetryCount = 0,
                seed = seed,
                status = ExerciseStatus.PLAYING,
                highlightIndex = -1,
                chordLabel = ""
            )
        }
        playPrompt()
    }

    private fun retryCurrentTest(nextAttempt: Int) {
        val state = _state.value
        if (!state.sessionRunning) return
        _state.value = state.copy(
            detected = emptyList(),
            currentNoteIndex = 0,
            currentAttempt = nextAttempt,
            noteRetryCount = 0,
            status = ExerciseStatus.PLAYING,
            highlightIndex = -1
        )
        playPrompt()
    }

    /**
     * Manually replay the current test's prompt on demand (issue #7) — reuses
     * retryCurrentTest's reset-and-replay behavior but keeps the SAME attempt number
     * instead of advancing it, so it doesn't consume one of maxRetries. Only meaningful
     * while LISTENING: rememberPitchDetector (see ExerciseScreen.kt) automatically stops
     * mic capture as soon as status leaves LISTENING, and that's also the only state where
     * no other playPrompt() call is already in flight for this session — so there's no risk
     * of two overlapping prompts firing.
     */
    fun repeatCurrentTest() {
        val state = _state.value
        if (state.status != ExerciseStatus.LISTENING) return
        retryCurrentTest(state.currentAttempt)
    }

    private fun playPrompt() {
        val state = _state.value
        if (!state.sessionRunning || state.sequence.isEmpty()) return
        // A previous session's delayed continuation (from completeTest/scheduleRetry) can still be
        // mid-flight when a new session starts — sessionRunning alone can't tell them apart, since
        // it's true again as soon as the new session begins. Re-check sessionId (not just
        // sessionRunning) at every resume point below so a stale callback from an old session can
        // never play audio or advance state for the new one.
        val mySession = state.sessionId
        fun isCurrent() = _state.value.sessionRunning && _state.value.sessionId == mySession

        // Issue #8: what plays before the test sequence is configurable — a single root
        // note, a block chord (default, unchanged), the chord arpeggiated, the full scale
        // ascending, or nothing at all. All but "chord" reuse playSequence (one note after
        // another) instead of playChord (simultaneous); either way onIntroDone continues
        // into the test sequence once the intro sound finishes.
        val introRootMidi = EarRingCore.effectiveIntroRootMidi(state.rootNote, state.scaleId, state.rangeStart)
        val onIntroDone = {
                if (isCurrent()) {
                    // Fade intro sustain so it doesn't bleed into the sequence.
                    // Cap at 75% of the gap so the fade always finishes before the sequence starts.
                    val chordFadeMs = (_state.value.postChordGapMs * 3 / 4).coerceIn(100L, 400L)
                    audioPlayback.fadeOutActive(chordFadeMs)
                    viewModelScope.launch {
                        delay(_state.value.postChordGapMs)
                        if (isCurrent()) {
                            audioPlayback.playSequence(
                                midiNotes = state.sequence,
                                bpm = state.tempoBpm,
                                durations = if (state.melodyDurations.isNotEmpty()) state.melodyDurations else null,
                                onEach = {},
                                onDone = {
                                    if (isCurrent()) {
                                        // Fade sequence sustain before the mic opens
                                        audioPlayback.fadeOutActive(400L)
                                        viewModelScope.launch {
                                            delay(POST_SEQUENCE_GAP_MS)
                                            if (isCurrent()) {
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

        when (state.introSoundMode) {
            0 -> audioPlayback.playSequence(midiNotes = listOf(introRootMidi), bpm = state.tempoBpm, onEach = {}, onDone = onIntroDone)
            2 -> {
                val chord = EarRingCore.introChord(introRootMidi, state.scaleId).toList()
                audioPlayback.playSequence(midiNotes = chord, bpm = state.tempoBpm, onEach = {}, onDone = onIntroDone)
            }
            3 -> {
                // scaleNotes returns the 7 scale degrees; append the octave root so the
                // scale intro plays a full 8-note run ending on the octave, not the 7th.
                val scale = EarRingCore.scaleNotes(introRootMidi, state.scaleId).toList() + (introRootMidi + 12)
                audioPlayback.playSequence(midiNotes = scale, bpm = state.tempoBpm, onEach = {}, onDone = onIntroDone)
            }
            4 -> onIntroDone()  // No intro sound — skip straight to the post-intro gap/sequence.
            else -> {
                val triad = EarRingCore.introChord(introRootMidi, state.scaleId).toList()
                audioPlayback.playChord(midiNotes = triad, onDone = onIntroDone)
            }
        }
    }

    private fun startListening() {
        _state.value = _state.value.copy(status = ExerciseStatus.LISTENING, currentNoteIndex = 0)
    }

    fun confirmNote(midi: Int, cents: Int) {
        val state = _state.value
        if (state.status != ExerciseStatus.LISTENING) return
        if (midi < state.rangeStart || midi > state.rangeEnd) return
        val index = state.currentNoteIndex
        if (index >= state.sequence.size) return

        val correct = EarRingCore.isCorrectNote(midi, cents, state.sequence[index])
        vibrate(correct)

        if (correct) {
            val detected = state.detected + DetectedNote(midi, cents, true)
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
                    currentNoteIndex = nextIndex,
                    noteRetryCount = 0
                )
            }
        } else {
            // Issue #9 "note correction": a wrong note always consumes an attempt (still
            // hits the score via testScore). Within the configured noteRetries budget it
            // just keeps listening for another try at the SAME note — no capture stop/
            // restart, no staff mark for the wrong note, no prompt replay — rather than
            // always restarting the whole test like before this feature. statusText()
            // shows "Wrong note. Try again…" while status stays LISTENING and
            // noteRetryCount > 0.
            val noteRetryCount = state.noteRetryCount + 1
            when (EarRingCore.wrongNoteOutcome(state.currentAttempt, state.maxAttempts, noteRetryCount, state.noteRetries)) {
                EarRingCore.WRONG_NOTE_RETRY_SAME_NOTE -> {
                    _state.value = state.copy(
                        currentAttempt = state.currentAttempt + 1,
                        noteRetryCount = noteRetryCount
                    )
                }
                EarRingCore.WRONG_NOTE_FAIL -> {
                    val detected = state.detected + DetectedNote(midi, cents, false)
                    _state.value = state.copy(
                        detected = detected,
                        currentNoteIndex = detected.size,
                        status = ExerciseStatus.RETRY_DELAY
                    )
                    completeTest(
                        passed = false,
                        attemptNotes = detected,
                        attemptsUsed = state.currentAttempt
                    )
                }
                else -> {
                    val detected = state.detected + DetectedNote(midi, cents, false)
                    _state.value = state.copy(
                        detected = detected,
                        currentNoteIndex = detected.size,
                        noteRetryCount = 0,
                        status = ExerciseStatus.RETRY_DELAY
                    )
                    scheduleRetry(state.currentAttempt + 1)
                }
            }
        }
    }

    private fun completeTest(passed: Boolean, attemptNotes: List<DetectedNote>, attemptsUsed: Int) {
        val state = _state.value
        if (state.playPassFailSounds) {
            if (passed) audioPlayback.playPassSound() else audioPlayback.playFailSound()
        }
        val scorePercent = EarRingCore.testScore(state.maxAttempts, attemptsUsed, passed)
        persistTestRecord(state, attemptNotes, attemptsUsed, passed, scorePercent)
        _state.value = state.copy(
            detected = attemptNotes,
            currentNoteIndex = attemptNotes.size.coerceAtMost(state.sequence.size),
            status = ExerciseStatus.RETRY_DELAY,
            testsCompleted = state.testsCompleted + 1,
            cumulativeScorePercent = state.cumulativeScorePercent + scorePercent
        )
        val mySession = state.sessionId
        viewModelScope.launch {
            delay(_state.value.wrongNotePauseMs)
            if (_state.value.sessionRunning && _state.value.sessionId == mySession) {
                startFreshTest()
            }
        }
    }

    private fun scheduleRetry(nextAttempt: Int) {
        val mySession = _state.value.sessionId
        viewModelScope.launch {
            delay(_state.value.wrongNotePauseMs)
            if (_state.value.sessionRunning && _state.value.sessionId == mySession) {
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
            detectedNotes = attemptNotes.map { MusicTheory.midiToLabel(it.midi) },
            sessionId = state.sessionId
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
                testsCompleted = state.testsCompleted,
                sessionId = state.sessionId
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
