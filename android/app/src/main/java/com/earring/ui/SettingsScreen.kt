package com.earring.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.earring.ExerciseViewModel

@Composable
fun SettingsScreen(viewModel: ExerciseViewModel) {
    val state by viewModel.state.collectAsState()
    val bpmOptions = listOf("60", "80", "100", "120", "140")
    val retryOptions = listOf(1, 2, 3, 5, 8, 10)
    val stabilityOptions = listOf(2, 3, 4, 5)
    val wrongPauseOptions = listOf(1000L to "1s", 2000L to "2s", 3000L to "3s", 5000L to "5s")

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp)
    ) {
        Spacer(Modifier.height(8.dp))

        Text("Playback", style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.Bold),
            color = MaterialTheme.colorScheme.primary, modifier = Modifier.padding(bottom = 4.dp))
        SectionLabel("Tempo (BPM)")
        ChipRow(
            items = bpmOptions,
            selected = bpmOptions.indexOf(state.tempoBpm.toString()).coerceAtLeast(0),
            onSelect = { viewModel.setTempoBpm(bpmOptions[it].toInt()) }
        )

        Spacer(Modifier.height(16.dp))
        Text("Exercise", style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.Bold),
            color = MaterialTheme.colorScheme.primary, modifier = Modifier.padding(bottom = 4.dp))
        SectionLabel("Max Retries")
        Text("Attempts per test before moving on", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(bottom = 6.dp))
        ChipRow(
            items = retryOptions.map { it.toString() },
            selected = retryOptions.indexOf(state.maxRetries).coerceAtLeast(0),
            onSelect = { viewModel.setMaxRetries(retryOptions[it]) }
        )

        Spacer(Modifier.height(16.dp))
        Text("Pitch Detection", style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.Bold),
            color = MaterialTheme.colorScheme.primary, modifier = Modifier.padding(bottom = 4.dp))
        SectionLabel("Mic Sensitivity (silence threshold)")
        Text("Lower = picks up quieter sounds (${String.format("%.3f", state.silenceThreshold)})",
            fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(bottom = 4.dp))
        Slider(
            value = state.silenceThreshold,
            onValueChange = { viewModel.setSilenceThreshold(it) },
            valueRange = 0.001f..0.010f,
            steps = 8,
            modifier = Modifier.fillMaxWidth()
        )

        SectionLabel("Note Stability (frames to confirm)")
        Text("Consecutive stable frames before confirming a note",
            fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(bottom = 6.dp))
        ChipRow(
            items = stabilityOptions.map { it.toString() },
            selected = stabilityOptions.indexOf(state.framesToConfirm).coerceAtLeast(0),
            onSelect = { viewModel.setFramesToConfirm(stabilityOptions[it]) }
        )

        Spacer(Modifier.height(16.dp))
        Text("Timing", style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.Bold),
            color = MaterialTheme.colorScheme.primary, modifier = Modifier.padding(bottom = 4.dp))
        SectionLabel("Pause Before Playing")
        Text("Gap between chord and test sequence (${state.postChordGapMs}ms)",
            fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(bottom = 4.dp))
        Slider(
            value = state.postChordGapMs.toFloat(),
            onValueChange = { viewModel.setPostChordGapMs(it.toLong()) },
            valueRange = 400f..2000f,
            steps = 15,
            modifier = Modifier.fillMaxWidth()
        )

        SectionLabel("Wrong Note Pause")
        Text("How long to display a wrong note before replaying",
            fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(bottom = 6.dp))
        ChipRow(
            items = wrongPauseOptions.map { it.second },
            selected = wrongPauseOptions.indexOfFirst { it.first == state.wrongNotePauseMs }.coerceAtLeast(0),
            onSelect = { viewModel.setWrongNotePauseMs(wrongPauseOptions[it].first) }
        )

        Spacer(Modifier.height(16.dp))
    }
}
