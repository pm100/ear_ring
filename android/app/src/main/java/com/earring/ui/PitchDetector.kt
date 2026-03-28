package com.earring.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.remember
import com.earring.AudioCapture
import com.earring.PitchFrame
import com.earring.PitchStabilityTracker

/**
 * Shared pitch detection composable used identically by Mic Setup and Exercise screens.
 *
 * Owns [AudioCapture] and [PitchStabilityTracker] as remembered composable locals.
 * The only difference between screens is the [onConfirmed] callback — what to DO
 * with a confirmed note. Detection rules are enforced here, once, for both.
 *
 * Detection rules (per AGENTS.md):
 *  - Silence: RMS < 0.003 → reset tracker, return no pitch
 *  - Stability: 3 consecutive frames of the same pitch class before confirming
 *  - After confirming, do NOT re-confirm until the pitch class changes or silence resets
 *  - Only notes in [midiMin]..[midiMax] are forwarded to [onConfirmed]
 *
 * @param active       When true the microphone is open and processing. Changing this
 *                     restarts the effect, stopping or starting audio accordingly.
 * @param midiMin      Lowest accepted MIDI note (inclusive).
 * @param midiMax      Highest accepted MIDI note (inclusive).
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
    warmupFrames: Int = 0,
    onConfirmed: (midi: Int, hz: Float) -> Unit
): Float {
    val audioCapture = remember { AudioCapture() }
    val pitchTracker = remember(silenceThreshold, framesToConfirm) { PitchStabilityTracker(silenceThreshold = silenceThreshold, requiredFrames = framesToConfirm) }
    val liveHzState = remember { mutableFloatStateOf(-1f) }

    DisposableEffect(active) {
        if (active) {
            if (warmupFrames > 0) pitchTracker.resetWithWarmup(warmupFrames)
            else pitchTracker.reset()
            liveHzState.floatValue = -1f

            audioCapture.start { samples ->
                when (val frame = pitchTracker.process(samples)) {
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
            pitchTracker.reset()
            liveHzState.floatValue = -1f
        }

        onDispose {
            audioCapture.stop()
            pitchTracker.reset()
        }
    }

    return liveHzState.floatValue
}
