package com.earring.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.remember
import com.earring.AudioCapture
import com.earring.EarRingCore
import com.earring.PitchFrame

/**
 * Shared pitch detection composable used identically by Mic Setup and Exercise screens.
 *
 * Owns [AudioCapture] and a Rust-side `PitchTracker` (via [EarRingCore.trackerNew]).
 * All detection rules (silence gating, warmup, stability, grace period) live in Rust;
 * this composable only owns lifecycle and threading concerns.
 *
 * @param active       When true the microphone is open and processing. Changing this
 *                     restarts the effect, stopping or starting audio accordingly.
 * @param midiMin      Lowest accepted MIDI note (inclusive).
 * @param midiMax      Highest accepted MIDI note (inclusive).
 * @param instrumentIndex Index into the INSTRUMENTS table. Applies per-instrument grace frames
 *                     and octave-correction settings automatically.
 * @param warmupFrames Frames discarded after the mic opens. Use a non-zero value when
 *                     auto-starting (Exercise) to absorb mic-settling transients.
 *                     Not needed when the mic starts because of a user action.
 * @param onConfirmed  Called exactly once per stable note. Receives the confirmed MIDI
 *                     note number and the raw frequency in Hz.
 * @return Live detected frequency (Hz), or -1f when silent / no pitch.
 */
@Composable
fun rememberPitchDetector(
    active: Boolean,
    midiMin: Int,
    midiMax: Int,
    silenceThreshold: Float = 0.003f,
    framesToConfirm: Int = 3,
    instrumentIndex: Int = 0,
    warmupFrames: Int = 0,
    onConfirmed: (midi: Int, hz: Float) -> Unit
): Float {
    val audioCapture = remember { AudioCapture() }
    val trackerHandle = remember { EarRingCore.trackerNew(silenceThreshold, framesToConfirm) }
    val liveHzState = remember { mutableFloatStateOf(-1f) }

    // Apply per-instrument detection params (grace frames, octave correction) whenever the
    // instrument changes. This does not reset any accumulated stability state.
    LaunchedEffect(instrumentIndex) {
        EarRingCore.trackerApplyInstrument(trackerHandle, instrumentIndex)
    }

    // Tracker lifetime is tied to the composable, NOT to active — freeing on every
    // active toggle would cause a use-after-free when the tracker is reused.
    DisposableEffect(Unit) {
        onDispose {
            audioCapture.stop()
            EarRingCore.trackerFree(trackerHandle)
        }
    }

    DisposableEffect(active) {
        if (active) {
            if (warmupFrames > 0) EarRingCore.trackerResetWithWarmup(trackerHandle, warmupFrames)
            else EarRingCore.trackerReset(trackerHandle)
            liveHzState.floatValue = -1f

            audioCapture.start { samples ->
                when (val frame = EarRingCore.trackerProcess(trackerHandle, samples)) {
                    is PitchFrame.Silence -> liveHzState.floatValue = -1f
                    is PitchFrame.Active -> {
                        liveHzState.floatValue = frame.hz
                        frame.confirmedMidi?.let { midi ->
                            if (midi in midiMin..midiMax) {
                                onConfirmed(midi, frame.hz)
                            }
                        }
                    }
                }
            }
        } else {
            audioCapture.stop()
            EarRingCore.trackerReset(trackerHandle)
            liveHzState.floatValue = -1f
        }

        onDispose {
            audioCapture.stop()
        }
    }

    return liveHzState.floatValue
}
