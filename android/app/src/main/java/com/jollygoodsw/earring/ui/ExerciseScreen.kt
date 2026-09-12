package com.jollygoodsw.earring.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.platform.LocalContext
import android.app.Activity
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.jollygoodsw.earring.EarRingCore
import com.jollygoodsw.earring.ExerciseStatus
import com.jollygoodsw.earring.ExerciseViewModel
import com.jollygoodsw.earring.MusicTheory
import com.jollygoodsw.earring.ui.components.NoteState
import com.jollygoodsw.earring.ui.components.MusicStaff
import com.jollygoodsw.earring.ui.components.PitchMeter
import com.jollygoodsw.earring.ui.components.StaffNote
import org.json.JSONArray

@Composable
fun ExerciseScreen(
    viewModel: ExerciseViewModel,
    onBack: () -> Unit
) {
    val state by viewModel.state.collectAsState()

    // Keep screen on for the duration of the exercise session.
    val context = LocalContext.current
    DisposableEffect(Unit) {
        val window = (context as? Activity)?.window
        window?.addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        onDispose {
            window?.clearFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        }
    }

    val midiMin = (state.rangeStart - 6).coerceAtLeast(0)
    val midiMax = (state.rangeEnd + 6).coerceAtMost(127)

    // Shared pitch detection — same pipeline as SetupScreen.
    // warmupFrames absorbs mic-settling transients when auto-starting.
    // onConfirmed judges the detected note against the expected sequence.
    val liveHz = rememberPitchDetector(
        active = state.status == ExerciseStatus.LISTENING,
        midiMin = midiMin,
        midiMax = midiMax,
        silenceThreshold = state.silenceThreshold,
        framesToConfirm = state.framesToConfirm,
        instrumentIndex = state.instrumentIndex,
        warmupFrames = state.warmupFrames,
        graceFrames = state.graceFrames,
        octaveCorrection = state.octaveCorrection,
        yinThreshold = state.yinThreshold,
        onConfirmed = { midi, hz ->
            val cents = EarRingCore.freqToCents(hz)
            viewModel.confirmNote(midi, cents)
        }
    )

    val liveMidi = if (liveHz > 0f) EarRingCore.freqToMidi(liveHz) else -1
    val noteStepDp = 44.dp
    val instrIdx = state.instrumentIndex
    val instrKeyTranspose = remember(instrIdx) {
        try {
            val arr = JSONArray(EarRingCore.instrumentList())
            val sem = arr.getJSONObject(instrIdx).getInt("semitones")
            ((sem % 12) + 12) % 12
        } catch (_: Exception) { 0 }
    }
    val staffNotes = if (state.showTestNotes) {
        state.sequence.mapIndexed { index, expectedMidi ->
            val attemptNote = state.detected.getOrNull(index)
            val dur = state.melodyDurations.getOrNull(index)
            when {
                attemptNote == null -> StaffNote(EarRingCore.transposeDisplayMidi(expectedMidi, instrIdx), NoteState.EXPECTED, dur)
                attemptNote.correct -> StaffNote(EarRingCore.transposeDisplayMidi(expectedMidi, instrIdx), NoteState.CORRECT, dur)
                else -> StaffNote(EarRingCore.transposeDisplayMidi(attemptNote.midi, instrIdx), NoteState.INCORRECT)
            }
        }
    } else {
        state.detected.mapIndexed { index, it ->
            StaffNote(
                EarRingCore.transposeDisplayMidi(it.midi, instrIdx),
                if (it.correct) NoteState.CORRECT else NoteState.INCORRECT,
                if (it.correct) state.melodyDurations.getOrNull(index) else null
            )
        }
    }

    // Guard against double back-navigation (predictive back + BackHandler race).
    var exited by remember { mutableStateOf(false) }
    fun exitSession() {
        if (exited) return
        exited = true
        viewModel.stopExercise()
        onBack()
    }

    BackHandler(enabled = !exited) { exitSession() }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        // Note-name text always states the actual (concert) pitch, regardless of
        // instrument transposition -- unlike the staff below, it's not notation to
        // read/play, so it should never change just because the instrument does.
        val concertKeyChroma = EarRingCore.effectiveKeyChroma(state.rootNote, state.scaleId)
        val rootLabel = EarRingCore.preferredNoteLabel(state.rootNote, concertKeyChroma)
        val rangeLabel = "${EarRingCore.preferredMidiLabel(state.rangeStart, concertKeyChroma)}–${EarRingCore.preferredMidiLabel(state.rangeEnd, concertKeyChroma)}"
        Text(
            text = "$rootLabel $rangeLabel  ${MusicTheory.SCALE_NAMES[state.scaleId]}",
            style = MaterialTheme.typography.titleMedium
        )

        if (state.chordLabel.isNotEmpty() && state.showTestNotes) {
            Text(
                text = "🎵 ${state.chordLabel}",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.primary
            )
        }

        Spacer(Modifier.height(8.dp))

        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.Center,
            modifier = Modifier
                .fillMaxWidth()
                .alpha(if (state.status == ExerciseStatus.LISTENING) 1f else 0f)
        ) {
            Text("👂", fontSize = 28.sp)
            Spacer(Modifier.width(8.dp))
            Text(
                "Listening…",
                style = MaterialTheme.typography.titleSmall,
                color = MaterialTheme.colorScheme.primary,
                fontWeight = FontWeight.SemiBold
            )
        }
        Spacer(Modifier.height(8.dp))

        MusicStaff(
            notes = staffNotes,
            modifier = Modifier.fillMaxWidth(),
            fixedSpacingDp = noteStepDp,
            rootChroma = (EarRingCore.effectiveKeyChroma(state.rootNote, state.scaleId) + instrKeyTranspose) % 12,
            keySignatureMode = state.keySignatureMode
        )

        Spacer(Modifier.height(12.dp))

        Text(
            text = statusText(state),
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )

        Spacer(Modifier.height(8.dp))

        Text(
            text = "Attempt ${state.currentAttempt} of ${state.maxAttempts}  •  Tests ${state.testsCompleted}  •  Score ${state.averageScorePercent}%",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )

        Spacer(Modifier.height(16.dp))

        PitchMeter(
            detectedMidi = liveMidi,
            detectedHz = liveHz,
            instrumentIndex = instrIdx,
            rootChroma = concertKeyChroma
        )

        if (state.detected.isNotEmpty()) {
            Spacer(Modifier.height(20.dp))
            Text(
                text = "Current attempt",
                style = MaterialTheme.typography.labelLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Spacer(Modifier.height(4.dp))
            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                state.detected.forEach {
                    Text(
                        text = EarRingCore.dualNoteLabel(it.midi, instrIdx, concertKeyChroma),
                        color = if (it.correct) androidx.compose.ui.graphics.Color(0xFF4CAF50) else androidx.compose.ui.graphics.Color(0xFFF44336),
                        fontWeight = FontWeight.SemiBold
                    )
                }
            }
        }

        Spacer(Modifier.height(24.dp))

        Row(
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            modifier = Modifier.fillMaxWidth()
        ) {
            OutlinedButton(
                onClick = { viewModel.repeatCurrentTest() },
                enabled = state.status == ExerciseStatus.LISTENING,
                colors = ButtonDefaults.outlinedButtonColors(
                    containerColor = MaterialTheme.colorScheme.primaryContainer
                ),
                modifier = Modifier.weight(1f).height(52.dp)
            ) {
                Text("↻ Repeat", fontSize = 17.sp)
            }
            Button(
                onClick = { exitSession() },
                // Default (primary-filled) colors, not error/danger red — stopping a test
                // is a normal, reversible navigation action (it saves the session, same as
                // leaving any other way), not a destructive one like Reset to Defaults or
                // Clear All Progress. Red here was also a real accessibility problem: a
                // colour-blind (red/green) user can't distinguish it from Start Exercise's
                // intent by colour alone, and it wrongly signals danger for a safe action.
                modifier = Modifier.weight(1f).height(52.dp)
            ) {
                // "■" (Geometric Shapes, same block as "▶" on Start Exercise), not "⏹"
                // (Miscellaneous Technical), which renders as a colour emoji by default —
                // an outlier next to Repeat's plain "↻" and Start's plain "▶".
                Text("■ Stop Testing", fontSize = 17.sp)
            }
        }
    }
}

private fun statusText(state: com.jollygoodsw.earring.ExerciseState): String =
    when (state.status) {
        ExerciseStatus.PLAYING -> "Listen carefully…"
        ExerciseStatus.LISTENING ->
            // Issue #9 "note correction": a wrong note within the noteRetries budget keeps
            // listening (no capture stop/restart) rather than leaving LISTENING — this is
            // the only visible sign it happened, since the wrong note isn't drawn.
            if (state.noteRetryCount > 0) {
                "Wrong note. Try again (${state.noteRetryCount}/${state.noteRetries})…"
            } else {
                "Play note ${state.currentNoteIndex + 1} of ${state.sequence.size}"
            }
        ExerciseStatus.RETRY_DELAY ->
            if (state.detected.lastOrNull()?.correct == false && state.currentAttempt < state.maxAttempts) {
                "Wrong note. Replaying the same test…"
            } else {
                "Starting the next test…"
            }
        ExerciseStatus.STOPPED -> "Testing stopped"
    }

