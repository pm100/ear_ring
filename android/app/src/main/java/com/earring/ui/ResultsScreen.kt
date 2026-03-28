package com.earring.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.earring.ExerciseViewModel
import com.earring.MusicTheory
import com.earring.ProgressViewModel

@Composable
fun ResultsScreen(
    viewModel: ExerciseViewModel,
    progressViewModel: ProgressViewModel,
    onTryAgain: () -> Unit,
    onNewExercise: () -> Unit,
    onProgress: () -> Unit
) {
    val state by viewModel.state.collectAsState()

    // Save session on first composition
    var saved by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) {
        if (!saved) {
            saved = true
            val scaleName = MusicTheory.SCALE_NAMES[state.scaleId]
            val rootLabel = MusicTheory.NOTE_NAMES[state.rootNote] + " " + state.rangeLabel
            progressViewModel.addSession(scaleName, rootLabel, state.score, state.sequenceLength)
        }
    }

    val scorePercent = (state.score * 100).toInt()
    val emoji = when {
        scorePercent == 100 -> "🏆"
        scorePercent >= 80 -> "🎉"
        scorePercent >= 50 -> "👍"
        else -> "💪"
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Spacer(Modifier.height(32.dp))
        Text(emoji, fontSize = 64.sp)
        Spacer(Modifier.height(12.dp))
        Text("$scorePercent%", fontSize = 56.sp, fontWeight = FontWeight.Bold, color = scoreColor(scorePercent))
        Text("Score", style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.height(8.dp))
        Text(
            text = "${MusicTheory.NOTE_NAMES[state.rootNote]} ${state.rangeLabel}  ${MusicTheory.SCALE_NAMES[state.scaleId]}",
            style = MaterialTheme.typography.bodyLarge
        )

        Spacer(Modifier.height(24.dp))
        HorizontalDivider()
        Spacer(Modifier.height(16.dp))

        Text("Note by Note", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
        Spacer(Modifier.height(12.dp))

        state.sequence.forEachIndexed { idx, expectedMidi ->
            val det = state.detected.getOrNull(idx)
            NoteResultRow(
                index = idx + 1,
                expectedLabel = MusicTheory.midiToLabel(expectedMidi),
                detectedLabel = if (det != null) MusicTheory.midiToLabel(det.midi) else "—",
                correct = det?.correct ?: false,
                wasAttempted = det != null
            )
            if (idx < state.sequence.lastIndex) HorizontalDivider(color = MaterialTheme.colorScheme.surfaceVariant)
        }

        Spacer(Modifier.height(28.dp))

        Button(
            onClick = onTryAgain,
            modifier = Modifier.fillMaxWidth().height(52.dp)
        ) { Text("🔄 Try Again", fontSize = 17.sp) }
        Spacer(Modifier.height(10.dp))
        OutlinedButton(
            onClick = onNewExercise,
            modifier = Modifier.fillMaxWidth().height(48.dp)
        ) { Text("🏠 New Exercise", fontSize = 16.sp) }
        Spacer(Modifier.height(8.dp))
        OutlinedButton(
            onClick = onProgress,
            modifier = Modifier.fillMaxWidth().height(48.dp)
        ) { Text("📊 View Progress", fontSize = 16.sp) }
        Spacer(Modifier.height(16.dp))
    }
}

@Composable
private fun NoteResultRow(
    index: Int,
    expectedLabel: String,
    detectedLabel: String,
    correct: Boolean,
    wasAttempted: Boolean
) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text("$index.", modifier = Modifier.width(28.dp), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text("Expected: $expectedLabel", modifier = Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium)
        Text("Played: $detectedLabel", modifier = Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium)
        Text(
            text = if (!wasAttempted) "—" else if (correct) "✓" else "✗",
            color = if (!wasAttempted) MaterialTheme.colorScheme.onSurfaceVariant else if (correct) Color(0xFF4CAF50) else Color(0xFFF44336),
            fontWeight = FontWeight.Bold,
            fontSize = 20.sp
        )
    }
}

private fun scoreColor(percent: Int) = when {
    percent >= 80 -> Color(0xFF4CAF50)
    percent >= 50 -> Color(0xFFFF9800)
    else -> Color(0xFFF44336)
}
