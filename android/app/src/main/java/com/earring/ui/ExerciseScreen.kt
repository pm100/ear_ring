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
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.earring.EarRingCore
import com.earring.ExerciseStatus
import com.earring.ExerciseViewModel
import com.earring.MusicTheory
import com.earring.ui.components.MusicStaff
import com.earring.ui.components.NoteState
import com.earring.ui.components.PitchMeter
import com.earring.ui.components.StaffNote

@Composable
fun ExerciseScreen(
    viewModel: ExerciseViewModel,
    onBack: () -> Unit
) {
    val state by viewModel.state.collectAsState()
    val liveHz by viewModel.liveHz.collectAsState()
    val liveMidi = if (liveHz > 0f) EarRingCore.freqToMidi(liveHz) else -1
    val noteStepDp = 44.dp
    val staffNotes = if (state.showTestNotes) {
        state.sequence.mapIndexed { index, expectedMidi ->
            val attemptNote = state.detected.getOrNull(index)
            when {
                attemptNote == null -> StaffNote(expectedMidi, NoteState.EXPECTED)
                attemptNote.correct -> StaffNote(expectedMidi, NoteState.CORRECT)
                else -> StaffNote(attemptNote.midi, NoteState.INCORRECT)
            }
        }
    } else {
        state.detected.map { StaffNote(it.midi, if (it.correct) NoteState.CORRECT else NoteState.INCORRECT) }
    }

    fun exitSession() {
        viewModel.stopExercise()
        onBack()
    }

    BackHandler { exitSession() }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically
        ) {
            TextButtonLike(text = "← Back", onClick = { exitSession() })
            Spacer(Modifier.weight(1f))
            Text(
                text = "${MusicTheory.NOTE_NAMES[state.rootNote]}${state.octave} ${MusicTheory.SCALE_NAMES[state.scaleId]}",
                style = MaterialTheme.typography.titleMedium
            )
        }

        Spacer(Modifier.height(8.dp))

        MusicStaff(
            notes = staffNotes,
            modifier = Modifier.fillMaxWidth(),
            fixedSpacingDp = noteStepDp
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

        Spacer(Modifier.height(24.dp))

        Button(
            onClick = { exitSession() },
            colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error),
            modifier = Modifier
                .fillMaxWidth()
                .height(52.dp)
        ) {
            Text("⏹ Stop Testing", fontSize = 17.sp)
        }

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
                        text = MusicTheory.midiToLabel(it.midi),
                        color = if (it.correct) androidx.compose.ui.graphics.Color(0xFF4CAF50) else androidx.compose.ui.graphics.Color(0xFFF44336),
                        fontWeight = FontWeight.SemiBold
                    )
                }
            }
        }
    }
}

@Composable
private fun TextButtonLike(text: String, onClick: () -> Unit) {
    androidx.compose.material3.TextButton(onClick = onClick) {
        Text(text)
    }
}

private fun statusText(state: com.earring.ExerciseState): String =
    when (state.status) {
        ExerciseStatus.PLAYING -> "Listen carefully…"
        ExerciseStatus.LISTENING -> "Sing note ${state.currentNoteIndex + 1} of ${state.sequence.size}"
        ExerciseStatus.RETRY_DELAY ->
            if (state.detected.lastOrNull()?.correct == false && state.currentAttempt < state.maxAttempts) {
                "Wrong note. Replaying the same test…"
            } else {
                "Starting the next test…"
            }
        ExerciseStatus.STOPPED -> "Testing stopped"
    }
