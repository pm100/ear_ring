package com.earring

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
            listOf("Major","Natural Minor","Harmonic Minor","Dorian","Mixolydian").getOrElse(scaleId) { "?" }

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
}
