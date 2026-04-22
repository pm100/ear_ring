package com.earring

import com.earring.PitchFrame

object EarRingCore {

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
    @JvmStatic external fun nativeGenerateSequence(rootChroma: Int, scaleId: Int, length: Int, rangeStart: Int, rangeEnd: Int, seed: Long): IntArray
    @JvmStatic external fun nativeIntroChord(rootMidi: Int, scaleId: Int): IntArray
    @JvmStatic external fun nativeIsCorrectNote(detectedMidi: Int, cents: Int, expectedMidi: Int): Int
    @JvmStatic external fun nativeTestScore(maxAttempts: Int, attemptsUsed: Int, passed: Int): Int
    @JvmStatic external fun nativeMidiToLabel(midi: Int): String
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
    @JvmStatic external fun nativeTransposeDisplayMidi(concertMidi: Int, instrumentIndex: Int): Int
    @JvmStatic external fun nativeMelodyCount(): Int
    @JvmStatic external fun nativeShuffleMelodyIndices(seed: Long): IntArray
    @JvmStatic external fun nativePickMelodyByIndex(index: Int, rootChroma: Int): FloatArray
    @JvmStatic external fun nativeMelodyRangeMidi(index: Int, rootChroma: Int): IntArray
    @JvmStatic external fun nativeGenerateDiatonicChord(rootChroma: Int, scaleId: Int, noteCount: Int, centerMidi: Int, seed: Long): IntArray
    @JvmStatic external fun nativeDiatonicChordLabel(rootChroma: Int, scaleId: Int, noteCount: Int, centerMidi: Int, seed: Long): String

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

    fun generateSequence(rootChroma: Int, scaleId: Int, length: Int, rangeStart: Int, rangeEnd: Int, seed: Long): IntArray =
        if (loaded) nativeGenerateSequence(rootChroma, scaleId, length, rangeStart, rangeEnd, seed)
        else IntArray(length) { rangeStart }

    fun introChord(rootMidi: Int, scaleId: Int): IntArray =
        if (loaded) nativeIntroChord(rootMidi, scaleId) else intArrayOf(rootMidi, rootMidi + 4, rootMidi + 7)

    fun isCorrectNote(detectedMidi: Int, cents: Int, expectedMidi: Int): Boolean =
        if (loaded) nativeIsCorrectNote(detectedMidi, cents, expectedMidi) != 0
        else detectedMidi % 12 == expectedMidi % 12 && kotlin.math.abs(cents) <= 50

    fun testScore(maxAttempts: Int, attemptsUsed: Int, passed: Boolean): Int =
        if (loaded) nativeTestScore(maxAttempts, attemptsUsed, if (passed) 1 else 0) else if (!passed || maxAttempts <= 0) 0
        else (((maxAttempts - attemptsUsed + 1).coerceAtLeast(0)) * 100f / maxAttempts).toInt()

    fun midiToLabel(midi: Int): String =
        if (loaded) nativeMidiToLabel(midi) else {
            val pitchClass = midi % 12
            val octave = midi / 12 - 1
            val names = listOf("C","C#","D","D#","E","F","F#","G","G#","A","A#","B")
            "${names[pitchClass]}$octave"
        }

    fun noteName(chroma: Int): String =
        if (loaded) nativeNoteName(chroma) else
            listOf("C","C#","D","D#","E","F","F#","G","G#","A","A#","B")[chroma % 12]

    fun scaleName(scaleId: Int): String =
        if (loaded) nativeScaleName(scaleId) else
            listOf("Major","Natural Minor","Dorian","Mixolydian").getOrElse(scaleId) { "?" }

    fun scaleLabel(rootChroma: Int, scaleId: Int): String =
        if (loaded) nativeScaleLabel(rootChroma, scaleId) else {
            val base = scaleName(scaleId)
            val offsets = listOf(null, 3, 10, 5)
            val offset = offsets.getOrElse(scaleId) { null }
            if (offset == null) base
            else {
                val flat = listOf("C","Db","D","Eb","E","F","Gb","G","Ab","A","Bb","B")
                val key = flat[(rootChroma + offset) % 12]
                "$base ($key)"
            }
        }

    fun effectiveKeyChroma(rootChroma: Int, scaleId: Int): Int =
        if (loaded) nativeEffectiveKeyChroma(rootChroma, scaleId)
        else {
            val offsets = listOf(0, 3, 10, 5)
            (rootChroma + (offsets.getOrElse(scaleId) { 0 })) % 12
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

    fun transposeDisplayMidi(concertMidi: Int, instrumentIndex: Int): Int =
        if (loaded) nativeTransposeDisplayMidi(concertMidi, instrumentIndex) else concertMidi

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

    fun generateDiatonicChord(rootChroma: Int, scaleId: Int, noteCount: Int, centerMidi: Int, seed: Long): IntArray =
        if (loaded) nativeGenerateDiatonicChord(rootChroma, scaleId, noteCount, centerMidi, seed)
        else IntArray(noteCount) { centerMidi }

    fun diatonicChordLabel(rootChroma: Int, scaleId: Int, noteCount: Int, centerMidi: Int, seed: Long): String =
        if (loaded) nativeDiatonicChordLabel(rootChroma, scaleId, noteCount, centerMidi, seed)
        else ""
}
