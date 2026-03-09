package com.earring.ui

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
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
    onNavigateResults: () -> Unit,
    onBack: () -> Unit
) {
    val state by viewModel.state.collectAsState()
    val liveHz by viewModel.liveHz.collectAsState()
    val liveMidi = if (liveHz > 0f) EarRingCore.freqToMidi(liveHz) else -1

    // Navigate to results when exercise is done
    LaunchedEffect(state.status) {
        if (state.status == ExerciseStatus.DONE) {
            viewModel.stopListening()
            onNavigateResults()
        }
    }

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
            TextButton(onClick = {
                viewModel.stopListening()
                viewModel.audioPlayback.cancelPlayback()
                onBack()
            }) { Text("← Back") }
            Spacer(Modifier.weight(1f))
            Text(
                text = "${MusicTheory.NOTE_NAMES[state.rootNote]}${state.octave} ${MusicTheory.SCALE_NAMES[state.scaleId]}",
                style = MaterialTheme.typography.titleMedium
            )
        }

        Spacer(Modifier.height(8.dp))

        // Staff
        val staffNotes = buildStaffNotes(state.sequence, state.detected, state.currentNoteIndex, state.highlightIndex)
        MusicStaff(notes = staffNotes, modifier = Modifier.fillMaxWidth())

        Spacer(Modifier.height(12.dp))

        // Status text
        val statusText = when (state.status) {
            ExerciseStatus.IDLE -> "Press Play to hear the sequence"
            ExerciseStatus.PLAYING -> "Listen carefully…"
            ExerciseStatus.LISTENING -> {
                val idx = state.currentNoteIndex
                if (idx < state.sequence.size)
                    "Sing note ${idx + 1} of ${state.sequence.size}: ${MusicTheory.midiToLabel(state.sequence[idx])}"
                else "Done!"
            }
            ExerciseStatus.DONE -> "Calculating score…"
        }
        Text(text = statusText, style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)

        Spacer(Modifier.height(16.dp))

        // Pitch meter
        PitchMeter(
            detectedMidi = liveMidi,
            detectedHz = liveHz
        )

        Spacer(Modifier.height(20.dp))

        // Control buttons
        when (state.status) {
            ExerciseStatus.IDLE -> {
                Button(
                    onClick = { viewModel.playSequence() },
                    modifier = Modifier.fillMaxWidth().height(52.dp)
                ) { Text("▶ Play Sequence", fontSize = 17.sp) }
                Spacer(Modifier.height(10.dp))
                OutlinedButton(
                    onClick = { viewModel.startListening() },
                    modifier = Modifier.fillMaxWidth().height(48.dp)
                ) { Text("🎙 Start Listening", fontSize = 16.sp) }
            }
            ExerciseStatus.PLAYING -> {
                OutlinedButton(
                    onClick = { viewModel.audioPlayback.cancelPlayback() },
                    modifier = Modifier.fillMaxWidth().height(48.dp)
                ) { Text("⏹ Stop Playback", fontSize = 16.sp) }
            }
            ExerciseStatus.LISTENING -> {
                Button(
                    onClick = { viewModel.stopListening() },
                    colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error),
                    modifier = Modifier.fillMaxWidth().height(52.dp)
                ) { Text("⏹ Stop Listening", fontSize = 17.sp) }
            }
            ExerciseStatus.DONE -> {
                CircularProgressIndicator()
            }
        }

        // Note progress display
        if (state.sequence.isNotEmpty()) {
            Spacer(Modifier.height(20.dp))
            Text("Notes:", style = MaterialTheme.typography.labelLarge)
            Spacer(Modifier.height(4.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                state.sequence.forEachIndexed { idx, midi ->
                    val det = state.detected.getOrNull(idx)
                    val chip = when {
                        det == null && idx == state.currentNoteIndex -> "→"
                        det == null -> "○"
                        det.correct -> "✓"
                        else -> "✗"
                    }
                    val color = when {
                        det?.correct == true -> Color(0xFF4CAF50)
                        det?.correct == false -> Color(0xFFF44336)
                        idx == state.currentNoteIndex -> MaterialTheme.colorScheme.primary
                        else -> MaterialTheme.colorScheme.onSurfaceVariant
                    }
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(text = chip, color = color, fontWeight = FontWeight.Bold)
                        Text(text = MusicTheory.midiToLabel(midi), fontSize = 10.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
        }
    }
}

private fun buildStaffNotes(
    sequence: List<Int>,
    detected: List<com.earring.DetectedNote>,
    currentIdx: Int,
    highlightIdx: Int
): List<StaffNote> {
    return sequence.mapIndexed { idx, midi ->
        val det = detected.getOrNull(idx)
        val noteState = when {
            highlightIdx == idx -> NoteState.ACTIVE
            det == null && idx == currentIdx -> NoteState.ACTIVE
            det == null -> NoteState.EXPECTED
            det.correct -> NoteState.CORRECT
            else -> NoteState.INCORRECT
        }
        StaffNote(midi = midi, state = noteState)
    }
}
