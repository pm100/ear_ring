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
}
