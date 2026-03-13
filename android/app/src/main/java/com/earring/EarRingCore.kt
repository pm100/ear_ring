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
    @JvmStatic external fun nativeGenerateSequence(rootMidi: Int, scaleId: Int, length: Int, seed: Long): IntArray
    @JvmStatic external fun nativeIntroChord(rootMidi: Int, scaleId: Int): IntArray
    @JvmStatic external fun nativeIsCorrectNote(detectedMidi: Int, cents: Int, expectedMidi: Int): Int
    @JvmStatic external fun nativeTestScore(maxAttempts: Int, attemptsUsed: Int, passed: Int): Int

    fun detectPitch(samples: FloatArray, sampleRate: Int): Float =
        if (loaded) nativeDetectPitch(samples, sampleRate) else -1f

    fun freqToMidi(hz: Float): Int =
        if (loaded) nativeFreqToMidi(hz) else -1

    fun freqToCents(hz: Float): Int =
        if (loaded) nativeFreqToCents(hz) else 0

    fun staffPosition(midi: Int): Int =
        if (loaded) nativeStaffPosition(midi) else 0

    fun generateSequence(rootMidi: Int, scaleId: Int, length: Int, seed: Long): IntArray =
        if (loaded) nativeGenerateSequence(rootMidi, scaleId, length, seed) else IntArray(length) { rootMidi }

    fun introChord(rootMidi: Int, scaleId: Int): IntArray =
        if (loaded) nativeIntroChord(rootMidi, scaleId) else intArrayOf(rootMidi, rootMidi + 4, rootMidi + 7)

    fun isCorrectNote(detectedMidi: Int, cents: Int, expectedMidi: Int): Boolean =
        if (loaded) nativeIsCorrectNote(detectedMidi, cents, expectedMidi) != 0
        else detectedMidi % 12 == expectedMidi % 12 && kotlin.math.abs(cents) <= 50

    fun testScore(maxAttempts: Int, attemptsUsed: Int, passed: Boolean): Int =
        if (loaded) nativeTestScore(maxAttempts, attemptsUsed, if (passed) 1 else 0) else if (!passed || maxAttempts <= 0) 0
        else (((maxAttempts - attemptsUsed + 1).coerceAtLeast(0)) * 100f / maxAttempts).toInt()
}
