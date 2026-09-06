package com.jollygoodsw.earring

import com.jollygoodsw.earring.PitchFrame

object EarRingCore {

    // wrongNoteOutcome() results (issue #9 "note correction").
    const val WRONG_NOTE_RETRY_SAME_NOTE = 0
    const val WRONG_NOTE_RESTART_SEQUENCE = 1
    const val WRONG_NOTE_FAIL = 2

    private var loaded = false

    init {
        try {
            System.loadLibrary("ear_ring_core")
            loaded = true
        } catch (e: UnsatisfiedLinkError) {
            android.util.Log.e("EarRingCore", "Failed to load native library: ${e.message}")
        }
    }

    @JvmStatic external fun nativeDetectPitch(samples: FloatArray, sampleRate: Int): Float
    @JvmStatic external fun nativeFreqToMidi(hz: Float): Int
    @JvmStatic external fun nativeFreqToCents(hz: Float): Int
    @JvmStatic external fun nativeStaffPosition(midi: Int): Int
    @JvmStatic external fun nativeGenerateSequence(rootChroma: Int, scaleId: Int, length: Int, rangeStart: Int, rangeEnd: Int, seed: Long, avoidFirstMidi: Int): IntArray
    @JvmStatic external fun nativeIntroChord(rootMidi: Int, scaleId: Int): IntArray
    @JvmStatic external fun nativeScaleNotes(rootMidi: Int, scaleId: Int): IntArray
    @JvmStatic external fun nativeIsCorrectNote(detectedMidi: Int, cents: Int, expectedMidi: Int): Int
    @JvmStatic external fun nativeTestScore(maxAttempts: Int, attemptsUsed: Int, passed: Int): Int
    @JvmStatic external fun nativeWrongNoteOutcome(currentAttempt: Int, maxAttempts: Int, noteRetryCount: Int, noteRetriesAllowed: Int): Int
    @JvmStatic external fun nativeNoteRetryPenalty(noteRetriesUsed: Int, noteRetriesAllowed: Int, maxAttempts: Int): Int
    @JvmStatic external fun nativeMidiToLabel(midi: Int): String
    @JvmStatic external fun nativeLabelToMidi(label: String): Int
    @JvmStatic external fun nativeNoteName(chroma: Int): String
    @JvmStatic external fun nativeScaleName(scaleId: Int): String
    @JvmStatic external fun nativeScaleLabel(rootChroma: Int, scaleId: Int): String
    @JvmStatic external fun nativeEffectiveKeyChroma(rootChroma: Int, scaleId: Int): Int
    @JvmStatic external fun nativeIsSharpKey(rootChroma: Int): Int
    @JvmStatic external fun nativeKeyAccidentalCount(rootChroma: Int): Int
    @JvmStatic external fun nativePreferredMidiLabel(midi: Int, rootChroma: Int): String
    @JvmStatic external fun nativePreferredNoteLabel(midi: Int, rootChroma: Int): String
    @JvmStatic external fun nativeAccidentalInKey(midi: Int, rootChroma: Int): Int
    @JvmStatic external fun nativeKeySigPositions(rootChroma: Int): IntArray
    @JvmStatic external fun nativeStaffPositionInKey(midi: Int, rootChroma: Int): Int
    @JvmStatic external fun nativeHelpContent(): String
    @JvmStatic external fun nativeInstrumentList(): String
    @JvmStatic external fun nativeGitHash(): String
    @JvmStatic external fun nativeTransposeDisplayMidi(concertMidi: Int, instrumentIndex: Int): Int
    @JvmStatic external fun nativeWrittenNoteName(concertChroma: Int, instrumentIndex: Int): String
    @JvmStatic external fun nativeWrittenMidiLabel(concertMidi: Int, instrumentIndex: Int): String
    @JvmStatic external fun nativeMelodyCount(): Int
    @JvmStatic external fun nativeShuffleMelodyIndices(seed: Long): IntArray
    @JvmStatic external fun nativePickMelodyByIndex(index: Int, rootChroma: Int): FloatArray
    @JvmStatic external fun nativeMelodyRangeMidi(index: Int, rootChroma: Int): IntArray
    @JvmStatic external fun nativeGenerateDiatonicChord(rootChroma: Int, scaleId: Int, noteCount: Int, rangeStart: Int, rangeEnd: Int, seed: Long): IntArray
    @JvmStatic external fun nativeDiatonicChordLabel(rootChroma: Int, scaleId: Int, noteCount: Int, centerMidi: Int, seed: Long): String
    @JvmStatic external fun nativeWrittenDiatonicChordLabel(concertRootChroma: Int, scaleId: Int, noteCount: Int, centerMidi: Int, seed: Long, instrumentIndex: Int): String
    @JvmStatic external fun nativeWrittenScaleLabel(concertRootChroma: Int, scaleId: Int, instrumentIndex: Int): String
    @JvmStatic external fun nativeEffectiveIntroRootMidi(rootChroma: Int, scaleId: Int, rangeStart: Int): Int

    // ── PitchTracker JNI ─────────────────────────────────────────────────────────
    @JvmStatic external fun nativeTrackerNew(silenceThreshold: Float, requiredFrames: Int): Long
    @JvmStatic external fun nativeTrackerFree(handle: Long)
    @JvmStatic external fun nativeTrackerReset(handle: Long)
    @JvmStatic external fun nativeTrackerResetWithWarmup(handle: Long, warmupFrames: Int)
    @JvmStatic external fun nativeTrackerSetParams(handle: Long, silenceThreshold: Float, requiredFrames: Int)
    @JvmStatic external fun nativeTrackerApplyInstrument(handle: Long, instrumentIndex: Int)
    /** Returns FloatArray[3]: [live_hz, live_midi_f32, confirmed_midi_f32]. -1 means absent. */
    @JvmStatic external fun nativeTrackerProcess(handle: Long, samples: FloatArray, sampleRate: Int): FloatArray

    fun trackerNew(silenceThreshold: Float, requiredFrames: Int): Long =
        if (loaded) nativeTrackerNew(silenceThreshold, requiredFrames) else 0L

    fun trackerFree(handle: Long) { if (loaded && handle != 0L) nativeTrackerFree(handle) }

    fun trackerReset(handle: Long) { if (loaded && handle != 0L) nativeTrackerReset(handle) }

    fun trackerResetWithWarmup(handle: Long, warmupFrames: Int) {
        if (loaded && handle != 0L) nativeTrackerResetWithWarmup(handle, warmupFrames)
    }

    fun trackerSetParams(handle: Long, silenceThreshold: Float, requiredFrames: Int) {
        if (loaded && handle != 0L) nativeTrackerSetParams(handle, silenceThreshold, requiredFrames)
    }

    fun trackerApplyInstrument(handle: Long, instrumentIndex: Int) {
        if (loaded && handle != 0L) nativeTrackerApplyInstrument(handle, instrumentIndex)
    }

    /** Process one audio buffer via the Rust tracker. Returns a [PitchFrame]. */
    fun trackerProcess(handle: Long, samples: FloatArray, sampleRate: Int = 44100): PitchFrame {
        if (!loaded || handle == 0L) return PitchFrame.Silence
        val out = nativeTrackerProcess(handle, samples, sampleRate)
        val liveHz = out.getOrElse(0) { -1f }
        val liveMidi = out.getOrElse(1) { -1f }.toInt()
        val confirmedMidi = out.getOrElse(2) { -1f }.toInt()
        return if (liveHz <= 0f || liveMidi < 0) {
            PitchFrame.Silence
        } else {
            PitchFrame.Active(hz = liveHz, midi = liveMidi, confirmedMidi = if (confirmedMidi >= 0) confirmedMidi else null)
        }
    }

    fun detectPitch(samples: FloatArray, sampleRate: Int): Float =
        if (loaded) nativeDetectPitch(samples, sampleRate) else -1f

    fun freqToMidi(hz: Float): Int =
        if (loaded) nativeFreqToMidi(hz) else -1

    fun freqToCents(hz: Float): Int =
        if (loaded) nativeFreqToCents(hz) else 0

    fun staffPosition(midi: Int): Int =
        if (loaded) nativeStaffPosition(midi) else 0

    /** @param avoidFirstMidi MIDI note the first generated note must not equal — typically
     *  the previous test's first note, so back-to-back tests don't open on the same note.
     *  Pass -1 for no constraint (e.g. the first test of a session). */
    fun generateSequence(rootChroma: Int, scaleId: Int, length: Int, rangeStart: Int, rangeEnd: Int, seed: Long, avoidFirstMidi: Int = -1): IntArray =
        if (loaded) nativeGenerateSequence(rootChroma, scaleId, length, rangeStart, rangeEnd, seed, avoidFirstMidi)
        else IntArray(length) { rangeStart }

    fun introChord(rootMidi: Int, scaleId: Int): IntArray =
        if (loaded) nativeIntroChord(rootMidi, scaleId) else {
            // Triad quality mirrors the Rust core: major (Major/Mixolydian), minor
            // (Natural Minor/Dorian), or diminished (Locrian) third + fifth.
            val (third, fifth) = when (scaleId) {
                1, 2 -> 3 to 7  // Natural Minor, Dorian → minor triad
                4 -> 3 to 6     // Locrian → diminished triad
                else -> 4 to 7  // Major, Mixolydian → major triad
            }
            intArrayOf(rootMidi, rootMidi + third, rootMidi + fifth)
        }

    /** The 7 notes of a scale ascending from rootMidi. Used for the "Scale" intro-sound
     *  option (issue #8). */
    fun scaleNotes(rootMidi: Int, scaleId: Int): IntArray =
        if (loaded) nativeScaleNotes(rootMidi, scaleId) else {
            val intervals = when (scaleId) {
                1 -> intArrayOf(0, 2, 3, 5, 7, 8, 10)  // Natural Minor
                2 -> intArrayOf(0, 2, 3, 5, 7, 9, 10)  // Dorian
                3 -> intArrayOf(0, 2, 4, 5, 7, 9, 10)  // Mixolydian
                4 -> intArrayOf(0, 1, 3, 5, 6, 8, 10)  // Locrian
                else -> intArrayOf(0, 2, 4, 5, 7, 9, 11) // Major
            }
            IntArray(intervals.size) { rootMidi + intervals[it] }
        }

    fun isCorrectNote(detectedMidi: Int, cents: Int, expectedMidi: Int): Boolean =
        if (loaded) nativeIsCorrectNote(detectedMidi, cents, expectedMidi) != 0
        else detectedMidi % 12 == expectedMidi % 12 && kotlin.math.abs(cents) <= 50

    fun testScore(maxAttempts: Int, attemptsUsed: Int, passed: Boolean): Int =
        if (loaded) nativeTestScore(maxAttempts, attemptsUsed, if (passed) 1 else 0) else if (!passed || maxAttempts <= 0) 0
        else (((maxAttempts - attemptsUsed + 1).coerceAtLeast(0)) * 100f / maxAttempts).toInt()

    /** Issue #9 "note correction": what to do after a wrong note. Returns
     *  WRONG_NOTE_RETRY_SAME_NOTE, WRONG_NOTE_RESTART_SEQUENCE, or WRONG_NOTE_FAIL. */
    fun wrongNoteOutcome(currentAttempt: Int, maxAttempts: Int, noteRetryCount: Int, noteRetriesAllowed: Int): Int =
        if (loaded) nativeWrongNoteOutcome(currentAttempt, maxAttempts, noteRetryCount, noteRetriesAllowed)
        // noteRetryCount budget is independent of currentAttempt and checked first — see
        // wrong_note_outcome in rust/src/music_theory.rs for why the order matters.
        else if (noteRetryCount <= noteRetriesAllowed) WRONG_NOTE_RETRY_SAME_NOTE
        else if (currentAttempt >= maxAttempts) WRONG_NOTE_FAIL
        else WRONG_NOTE_RESTART_SEQUENCE

    /** Issue #9 "note correction": points to deduct from testScore()'s result for
     *  note-level retries used along the way. */
    fun noteRetryPenalty(noteRetriesUsed: Int, noteRetriesAllowed: Int, maxAttempts: Int): Int =
        if (loaded) nativeNoteRetryPenalty(noteRetriesUsed, noteRetriesAllowed, maxAttempts)
        else if (noteRetriesUsed == 0 || noteRetriesAllowed == 0 || maxAttempts == 0) 0
        else ((100f / maxAttempts) / noteRetriesAllowed * noteRetriesUsed).toInt()

    fun midiToLabel(midi: Int): String =
        if (loaded) nativeMidiToLabel(midi) else {
            val pitchClass = midi % 12
            val octave = midi / 12 - 1
            val names = listOf("C","C#","D","D#","E","F","F#","G","G#","A","A#","B")
            "${names[pitchClass]}$octave"
        }

    /** Parse a typed note label (e.g. "C4", "C#4", "Db4") into a MIDI number, or null if invalid. */
    fun labelToMidi(label: String): Int? {
        if (loaded) {
            val midi = nativeLabelToMidi(label)
            return if (midi in 0..127) midi else null
        }
        val s = label.trim()
        if (s.isEmpty()) return null
        val baseChroma = when (s[0].uppercaseChar()) {
            'C' -> 0; 'D' -> 2; 'E' -> 4; 'F' -> 5; 'G' -> 7; 'A' -> 9; 'B' -> 11
            else -> return null
        }
        var rest = s.substring(1)
        var chroma = baseChroma
        if (rest.startsWith("#")) { chroma += 1; rest = rest.substring(1) }
        else if (rest.startsWith("b", ignoreCase = true)) { chroma -= 1; rest = rest.substring(1) }
        val octave = rest.trim().toIntOrNull() ?: return null
        chroma = ((chroma % 12) + 12) % 12
        val midi = (octave + 1) * 12 + chroma
        return if (midi in 0..127) midi else null
    }

    fun noteName(chroma: Int): String =
        if (loaded) nativeNoteName(chroma) else
            listOf("C","C#","D","D#","E","F","F#","G","G#","A","A#","B")[chroma % 12]

    fun scaleName(scaleId: Int): String =
        if (loaded) nativeScaleName(scaleId) else
            listOf("Major","Natural Minor","Dorian","Mixolydian","Locrian").getOrElse(scaleId) { "?" }

    fun scaleLabel(rootChroma: Int, scaleId: Int): String =
        if (loaded) nativeScaleLabel(rootChroma, scaleId) else {
            val base = scaleName(scaleId)
            val offsets = listOf(null, 3, 10, 5, 1)
            val offset = offsets.getOrElse(scaleId) { null }
            if (offset == null) base
            else {
                val flat = listOf("C","Db","D","Eb","E","F","Gb","G","Ab","A","Bb","B")
                val key = flat[(rootChroma + offset) % 12]
                "$base (of $key)"
            }
        }

    fun effectiveKeyChroma(rootChroma: Int, scaleId: Int): Int =
        if (loaded) nativeEffectiveKeyChroma(rootChroma, scaleId)
        else {
            val offsets = listOf(null, 3, 10, 5, 1)
            val offset = offsets.getOrElse(scaleId) { null }
            if (offset == null) rootChroma else (rootChroma + offset) % 12
        }

    fun isSharpKey(rootChroma: Int): Boolean =
        if (loaded) nativeIsSharpKey(rootChroma) != 0
        else rootChroma !in listOf(5, 10, 3, 8)

    fun keyAccidentalCount(rootChroma: Int): Int =
        if (loaded) nativeKeyAccidentalCount(rootChroma) else 0

    fun preferredMidiLabel(midi: Int, rootChroma: Int): String =
        if (loaded) nativePreferredMidiLabel(midi, rootChroma)
        else midiToLabel(midi)

    fun preferredNoteLabel(midi: Int, rootChroma: Int): String =
        if (loaded) nativePreferredNoteLabel(midi, rootChroma)
        else noteName(midi % 12)

    /** Returns: 0=none, 1=sharp, 2=flat, 3=natural */
    fun accidentalInKey(midi: Int, rootChroma: Int): Int =
        if (loaded) nativeAccidentalInKey(midi, rootChroma) else 0

    fun keySigPositions(rootChroma: Int): IntArray =
        if (loaded) nativeKeySigPositions(rootChroma) else IntArray(0)

    fun staffPositionInKey(midi: Int, rootChroma: Int): Int =
        if (loaded) nativeStaffPositionInKey(midi, rootChroma) else staffPosition(midi)

    fun helpContent(): String =
        if (loaded) nativeHelpContent() else "[]"

    fun instrumentList(): String =
        if (loaded) nativeInstrumentList() else "[]"

    fun gitHash(): String =
        if (loaded) nativeGitHash() else "unknown"

    fun transposeDisplayMidi(concertMidi: Int, instrumentIndex: Int): Int =
        if (loaded) nativeTransposeDisplayMidi(concertMidi, instrumentIndex) else concertMidi

    fun writtenNoteName(concertChroma: Int, instrumentIndex: Int): String =
        if (loaded) nativeWrittenNoteName(concertChroma, instrumentIndex) else noteName(concertChroma)

    fun writtenMidiLabel(concertMidi: Int, instrumentIndex: Int): String =
        if (loaded) nativeWrittenMidiLabel(concertMidi, instrumentIndex) else midiToLabel(concertMidi)

    fun melodyCount(): Int =
        if (loaded) nativeMelodyCount() else 0

    fun shuffleMelodyIndices(seed: Long): IntArray =
        if (loaded) nativeShuffleMelodyIndices(seed) else IntArray(0)

    /** Returns Pair(midiNotes, durations). Decodes the packed FloatArray from JNI. */
    fun pickMelodyByIndex(index: Int, rootChroma: Int): Pair<List<Int>, List<Float>> {
        if (!loaded) return Pair(emptyList(), emptyList())
        val raw = nativePickMelodyByIndex(index, rootChroma)
        if (raw.isEmpty()) return Pair(emptyList(), emptyList())
        val n = raw[0].toInt()
        if (n == 0 || raw.size < 1 + n * 2) return Pair(emptyList(), emptyList())
        val midi = (1..n).map { raw[it].toInt() }
        val dur = (1..n).map { raw[it + n] }
        return Pair(midi, dur)
    }

    fun melodyRangeMidi(index: Int, rootChroma: Int): Pair<Int, Int>? {
        if (!loaded) return null
        val arr = nativeMelodyRangeMidi(index, rootChroma)
        if (arr.size < 2) return null
        return Pair(arr[0], arr[1])
    }

    fun generateDiatonicChord(rootChroma: Int, scaleId: Int, noteCount: Int, rangeStart: Int, rangeEnd: Int, seed: Long): IntArray =
        if (loaded) nativeGenerateDiatonicChord(rootChroma, scaleId, noteCount, rangeStart, rangeEnd, seed)
        else IntArray(noteCount) { rangeStart }

    fun diatonicChordLabel(rootChroma: Int, scaleId: Int, noteCount: Int, centerMidi: Int, seed: Long): String =
        if (loaded) nativeDiatonicChordLabel(rootChroma, scaleId, noteCount, centerMidi, seed)
        else ""

    fun writtenDiatonicChordLabel(concertRootChroma: Int, scaleId: Int, noteCount: Int, centerMidi: Int, seed: Long, instrumentIndex: Int): String =
        if (loaded) nativeWrittenDiatonicChordLabel(concertRootChroma, scaleId, noteCount, centerMidi, seed, instrumentIndex)
        else ""

    fun writtenScaleLabel(concertRootChroma: Int, scaleId: Int, instrumentIndex: Int): String =
        if (loaded) nativeWrittenScaleLabel(concertRootChroma, scaleId, instrumentIndex)
        else ""

    fun effectiveIntroRootMidi(rootChroma: Int, scaleId: Int, rangeStart: Int): Int =
        if (loaded) nativeEffectiveIntroRootMidi(rootChroma, scaleId, rangeStart)
        else rangeStart - ((rangeStart + 12 - rootChroma) % 12)
}
