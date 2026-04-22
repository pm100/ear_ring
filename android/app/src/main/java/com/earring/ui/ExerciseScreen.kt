package com.earring.ui

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
import com.earring.EarRingCore
import com.earring.ExerciseStatus
import com.earring.ExerciseViewModel
import com.earring.MusicTheory
import com.earring.ui.components.NoteState
import com.earring.ui.components.MusicStaff
import com.earring.ui.components.PitchMeter
import com.earring.ui.components.StaffNote

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
        onConfirmed = { midi, hz ->
            val cents = EarRingCore.freqToCents(hz)
            viewModel.confirmNote(midi, cents)
        }
    )

    val liveMidi = if (liveHz > 0f) EarRingCore.freqToMidi(liveHz) else -1
    val noteStepDp = 44.dp
    val instrIdx = state.instrumentIndex
    val staffNotes = if (state.showTestNotes) {
        state.sequence.mapIndexed { index, expectedMidi ->
            val attemptNote = state.detected.getOrNull(index)
            when {
                attemptNote == null -> StaffNote(EarRingCore.transposeDisplayMidi(expectedMidi, instrIdx), NoteState.EXPECTED)
                attemptNote.correct -> StaffNote(EarRingCore.transposeDisplayMidi(expectedMidi, instrIdx), NoteState.CORRECT)
                else -> StaffNote(EarRingCore.transposeDisplayMidi(attemptNote.midi, instrIdx), NoteState.INCORRECT)
            }
        }
    } else {
        state.detected.map { StaffNote(EarRingCore.transposeDisplayMidi(it.midi, instrIdx), if (it.correct) NoteState.CORRECT else NoteState.INCORRECT) }
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
        Text(
            text = "${MusicTheory.NOTE_NAMES[state.rootNote]} ${state.rangeLabel}  ${MusicTheory.SCALE_NAMES[state.scaleId]}",
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
            rootChroma = EarRingCore.effectiveKeyChroma(state.rootNote, state.scaleId),
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
            detectedHz = liveHz
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
                        text = MusicTheory.midiToLabel(EarRingCore.transposeDisplayMidi(it.midi, instrIdx)),
                        color = if (it.correct) androidx.compose.ui.graphics.Color(0xFF4CAF50) else androidx.compose.ui.graphics.Color(0xFFF44336),
                        fontWeight = FontWeight.SemiBold
                    )
                }
            }
        }
    }
}

private fun statusText(state: com.earring.ExerciseState): String =
    when (state.status) {
        ExerciseStatus.PLAYING -> "Listen carefully…"
        ExerciseStatus.LISTENING -> "Play note ${state.currentNoteIndex + 1} of ${state.sequence.size}"
        ExerciseStatus.RETRY_DELAY ->
            if (state.detected.lastOrNull()?.correct == false && state.currentAttempt < state.maxAttempts) {
                "Wrong note. Replaying the same test…"
            } else {
                "Starting the next test…"
            }
        ExerciseStatus.STOPPED -> "Testing stopped"
    }

