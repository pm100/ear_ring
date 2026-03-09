/**
 * EarRingCoreModule — Turbo Native Module (Kotlin/Android)
 *
 * Setup instructions:
 * 1. Build the Rust library for Android targets using cargo-ndk:
 *      cargo install cargo-ndk
 *      cargo ndk -t arm64-v8a -t x86_64 -o android/app/src/main/jniLibs build --release -p ear_ring_core
 *
 * 2. Add this file to the project (it should already be in the right package).
 *
 * 3. Register the module in MainApplication.kt by adding it to the package list:
 *      packages.add(EarRingCorePackage())
 *
 * The JNI bridge calls the C FFI functions defined in rust/src/lib.rs.
 * Java signatures are auto-generated from the function names.
 */

package com.earring

import com.facebook.react.bridge.*
import com.facebook.react.module.annotations.ReactModule

@ReactModule(name = EarRingCoreModule.NAME)
class EarRingCoreModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val NAME = "EarRingCore"

        private var libraryLoaded = false

        init {
            try {
                System.loadLibrary("ear_ring_core")
                libraryLoaded = true
            } catch (e: UnsatisfiedLinkError) {
                android.util.Log.w(NAME, "ear_ring_core native library not found: ${e.message}")
            }
        }

        // JNI declarations — implemented in rust/src/lib.rs via C FFI
        @JvmStatic external fun nativeDetectPitch(samples: FloatArray, sampleRate: Int): Float
        @JvmStatic external fun nativeFreqToMidi(hz: Float): Int
        @JvmStatic external fun nativeFreqToCents(hz: Float): Int
        @JvmStatic external fun nativeStaffPosition(midi: Int): Int
        @JvmStatic external fun nativeGenerateSequence(
            rootMidi: Int, scaleId: Int, length: Int, seed: Long
        ): IntArray
    }

    override fun getName() = NAME

    @ReactMethod(isBlockingSynchronousMethod = true)
    fun detectPitch(samples: ReadableArray, sampleRate: Int): Float {
        val floats = FloatArray(samples.size()) { samples.getDouble(it).toFloat() }
        return nativeDetectPitch(floats, sampleRate)
    }

    @ReactMethod(isBlockingSynchronousMethod = true)
    fun freqToNote(hz: Double): WritableMap? {
        val midi = nativeFreqToMidi(hz.toFloat())
        if (midi < 0) return null
        val cents = nativeFreqToCents(hz.toFloat())
        val result = WritableNativeMap()
        result.putInt("midi", midi)
        result.putInt("cents", cents)
        return result
    }

    @ReactMethod(isBlockingSynchronousMethod = true)
    fun staffPosition(midi: Int): Int = nativeStaffPosition(midi)

    @ReactMethod(isBlockingSynchronousMethod = true)
    fun generateSequence(rootMidi: Int, scaleId: Int, length: Int, seed: Double): WritableArray {
        val arr = nativeGenerateSequence(rootMidi, scaleId, length, seed.toLong())
        val result = WritableNativeArray()
        arr.forEach { result.pushInt(it) }
        return result
    }
}
