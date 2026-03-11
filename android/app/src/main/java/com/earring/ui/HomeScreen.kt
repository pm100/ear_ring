package com.earring.ui

import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.foundation.shape.RoundedCornerShape
import com.earring.ExerciseViewModel
import com.earring.MusicTheory
import com.earring.R

@Composable
fun HomeScreen(
    viewModel: ExerciseViewModel,
    onStartExercise: () -> Unit,
    onMicSetup: () -> Unit,
    onProgress: () -> Unit
) {
    val state by viewModel.state.collectAsState()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Spacer(Modifier.height(24.dp))
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Image(
                painter = painterResource(R.mipmap.ic_launcher),
                contentDescription = "Ear Ring icon",
                modifier = Modifier
                    .size(48.dp)
                    .clip(RoundedCornerShape(10.dp))
            )
            Text(
                text = "Ear Ring",
                fontSize = 32.sp,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.primary
            )
        }
        Text(
            text = "Ear Training",
            fontSize = 16.sp,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Spacer(Modifier.height(28.dp))

        // Root note selection
        SectionLabel("Root Note")
        WrappingChipRow(
            items = MusicTheory.NOTE_NAMES,
            selected = state.rootNote,
            onSelect = { viewModel.setRootNote(it) }
        )
        Spacer(Modifier.height(16.dp))

        // Octave selection
        SectionLabel("Octave")
        ChipRow(
            items = listOf("3", "4", "5"),
            selected = state.octave - 3,
            onSelect = { viewModel.setOctave(it + 3) }
        )
        Spacer(Modifier.height(16.dp))

        // Scale selection
        SectionLabel("Scale")
        WrappingChipRow(
            items = MusicTheory.SCALE_NAMES,
            selected = state.scaleId,
            onSelect = { viewModel.setScaleId(it) }
        )
        Spacer(Modifier.height(16.dp))

        // Sequence length
        SectionLabel("Sequence Length")
        ChipRow(
            items = (2..8).map { it.toString() },
            selected = state.sequenceLength - 2,
            onSelect = { viewModel.setSequenceLength(it + 2) }
        )
        Spacer(Modifier.height(32.dp))

        Button(
            onClick = onStartExercise,
            modifier = Modifier.fillMaxWidth().height(52.dp)
        ) {
            Text("▶ Start Exercise", fontSize = 18.sp)
        }
        Spacer(Modifier.height(12.dp))
        OutlinedButton(
            onClick = onMicSetup,
            modifier = Modifier.fillMaxWidth().height(48.dp)
        ) {
            Text("🎙 Mic Setup", fontSize = 16.sp)
        }
        Spacer(Modifier.height(8.dp))
        OutlinedButton(
            onClick = onProgress,
            modifier = Modifier.fillMaxWidth().height(48.dp)
        ) {
            Text("📊 Progress", fontSize = 16.sp)
        }
        Spacer(Modifier.height(16.dp))
    }
}

@Composable
private fun SectionLabel(text: String) {
    Text(
        text = text,
        style = MaterialTheme.typography.labelLarge,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier
            .fillMaxWidth()
            .padding(bottom = 6.dp)
    )
}

@Composable
private fun ChipRow(
    items: List<String>,
    selected: Int,
    onSelect: (Int) -> Unit
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(6.dp)
    ) {
        items.forEachIndexed { index, label ->
            val isSelected = index == selected
            FilterChip(
                selected = isSelected,
                onClick = { onSelect(index) },
                label = { Text(label, fontSize = 13.sp) },
                modifier = Modifier.weight(1f)
            )
        }
    }
}

@Composable
@OptIn(ExperimentalLayoutApi::class)
private fun WrappingChipRow(
    items: List<String>,
    selected: Int,
    onSelect: (Int) -> Unit
) {
    FlowRow(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp)
    ) {
        items.forEachIndexed { index, label ->
            FilterChip(
                selected = index == selected,
                onClick = { onSelect(index) },
                label = { Text(label, fontSize = 13.sp) }
            )
        }
    }
}
