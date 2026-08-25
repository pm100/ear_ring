package com.jollygoodsw.earring.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import com.jollygoodsw.earring.AudioCapture
import com.jollygoodsw.earring.EarRingCore
import com.jollygoodsw.earring.PitchFrame

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
 * @return [PitchDetectorResult] with the live Hz and a debounced concert-pitch MIDI
 *         note suitable for display (see its doc for why raw per-frame MIDI isn't).
 */
data class PitchDetectorResult(
    /** Live detected frequency (Hz), or -1f when silent / no pitch. */
    val liveHz: Float,
    /** Concert-pitch MIDI note, debounced to 2 consecutive frames so a single-frame
     *  detection glitch (most common on higher notes) never reaches the screen. -1 when
     *  silent / not yet debounced. Never lags behind a confirmed note. Apply instrument
     *  transposition before display, same as any other concert MIDI value. */
    val displayMidi: Int,
)

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
): PitchDetectorResult {
    val audioCapture = remember { AudioCapture() }
    val trackerHandle = remember { EarRingCore.trackerNew(silenceThreshold, framesToConfirm) }
    val liveHzState = remember { mutableFloatStateOf(-1f) }
    val displayMidiState = remember { mutableIntStateOf(-1) }

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
            displayMidiState.intValue = -1

            audioCapture.start { samples ->
                when (val frame = EarRingCore.trackerProcess(trackerHandle, samples)) {
                    is PitchFrame.Silence -> {
                        liveHzState.floatValue = -1f
                        displayMidiState.intValue = -1
                    }
                    is PitchFrame.Active -> {
                        liveHzState.floatValue = frame.hz
                        displayMidiState.intValue = frame.displayMidi
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
            displayMidiState.intValue = -1
        }

        onDispose {
            audioCapture.stop()
        }
    }

    return PitchDetectorResult(liveHz = liveHzState.floatValue, displayMidi = displayMidiState.intValue)
}
