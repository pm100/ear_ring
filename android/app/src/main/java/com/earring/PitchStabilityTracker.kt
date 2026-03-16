package com.earring

import kotlin.math.sqrt

/**
 * Shared pitch detection pipeline used identically by both Mic Setup and Exercise screens.
 *
 * Rules (per AGENTS.md):
 *  - Silence: RMS < 0.003 → reset and return no pitch
 *  - Stability: require 3 consecutive frames with the same pitch class (midi % 12)
 *  - After confirming, do not confirm again until the pitch class changes or silence resets
 *
 * The post-confirmation action (judgement vs. history append) is handled by the caller.
 */
class PitchStabilityTracker(
    private val silenceThreshold: Float = 0.003f,
    private val requiredFrames: Int = 3
) {
    @Volatile private var stablePitchClass: Int = -1
    @Volatile private var stableCount: Int = 0
    @Volatile private var pitchConsumed: Boolean = false
    @Volatile private var warmupRemaining: Int = 0

    /** Reset stability state (call between notes, on prompt start, or on stop). */
    fun reset() {
        stablePitchClass = -1
        stableCount = 0
        pitchConsumed = false
        warmupRemaining = 0
    }

    /**
     * Reset and discard the next [frames] audio frames before processing begins.
     * Use this when the microphone starts automatically (e.g. Exercise screen) to absorb
     * initialization noise or mic-settling transients before confirming any notes.
     * Not needed when the user explicitly presses a button (e.g. Mic Setup).
     */
    fun resetWithWarmup(frames: Int = 5) {
        reset()
        warmupRemaining = frames
    }

    /**
     * Process one audio frame.
     *
     * @return [PitchFrame] with the live Hz (−1 when silent/no pitch) and a non-null
     *         [PitchFrame.confirmedMidi] the first time a pitch class stabilises over
     *         [requiredFrames] consecutive frames.
     */
    fun process(samples: FloatArray): PitchFrame {
        if (warmupRemaining > 0) {
            warmupRemaining--
            return PitchFrame.Silence
        }
        val rms = computeRms(samples)
        if (rms < silenceThreshold) {
            reset()
            return PitchFrame.Silence
        }

        val hz = EarRingCore.detectPitch(samples, 44100)
        if (hz <= 0f) {
            reset()
            return PitchFrame.Silence
        }

        val midi = EarRingCore.freqToMidi(hz)
        if (midi < 0) {
            reset()
            return PitchFrame.Silence
        }

        val pitchClass = midi % 12
        if (pitchClass == stablePitchClass) {
            stableCount++
        } else {
            stablePitchClass = pitchClass
            stableCount = 1
            pitchConsumed = false
        }

        val confirmed = if (!pitchConsumed && stableCount >= requiredFrames) {
            pitchConsumed = true
            midi
        } else null

        return PitchFrame.Active(hz = hz, midi = midi, confirmedMidi = confirmed)
    }

    private fun computeRms(samples: FloatArray): Float {
        var sum = 0f
        for (s in samples) sum += s * s
        return sqrt(sum / samples.size)
    }
}

sealed class PitchFrame {
    /** No pitch detected or signal below silence threshold. */
    object Silence : PitchFrame()

    /**
     * A pitch is detected.
     * @param hz       Raw frequency (always > 0).
     * @param midi     MIDI note number for the detected frequency.
     * @param confirmedMidi  Non-null only on the frame the pitch class first stabilises;
     *                       null on subsequent frames while the same pitch is held.
     */
    data class Active(val hz: Float, val midi: Int, val confirmedMidi: Int?) : PitchFrame()
}
