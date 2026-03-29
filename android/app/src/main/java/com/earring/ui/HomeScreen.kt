package com.earring.ui

import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
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

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(
    viewModel: ExerciseViewModel,
    onStartExercise: () -> Unit
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

        // Key + Scale selections side by side
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Column(modifier = Modifier.weight(1f)) {
                SectionLabel("Key")
                var keyExpanded by remember { mutableStateOf(false) }
                ExposedDropdownMenuBox(
                    expanded = keyExpanded,
                    onExpandedChange = { keyExpanded = it },
                    modifier = Modifier.fillMaxWidth()
                ) {
                    OutlinedTextField(
                        value = MusicTheory.NOTE_NAMES[state.rootNote],
                        onValueChange = {},
                        readOnly = true,
                        singleLine = true,
                        trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = keyExpanded) },
                        modifier = Modifier.menuAnchor().fillMaxWidth()
                    )
                    ExposedDropdownMenu(
                        expanded = keyExpanded,
                        onDismissRequest = { keyExpanded = false }
                    ) {
                        MusicTheory.NOTE_NAMES.forEachIndexed { index, name ->
                            DropdownMenuItem(
                                text = { Text(name) },
                                onClick = {
                                    viewModel.setRootNote(index)
                                    keyExpanded = false
                                }
                            )
                        }
                    }
                }
            }
            Column(modifier = Modifier.weight(1f)) {
                SectionLabel("Scale")
                var scaleExpanded by remember { mutableStateOf(false) }
                ExposedDropdownMenuBox(
                    expanded = scaleExpanded,
                    onExpandedChange = { scaleExpanded = it },
                    modifier = Modifier.fillMaxWidth()
                ) {
                    OutlinedTextField(
                        value = MusicTheory.SCALE_NAMES[state.scaleId],
                        onValueChange = {},
                        readOnly = true,
                        singleLine = true,
                        trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = scaleExpanded) },
                        modifier = Modifier.menuAnchor().fillMaxWidth()
                    )
                    ExposedDropdownMenu(
                        expanded = scaleExpanded,
                        onDismissRequest = { scaleExpanded = false }
                    ) {
                        MusicTheory.SCALE_NAMES.forEachIndexed { index, name ->
                            DropdownMenuItem(
                                text = { Text(name) },
                                onClick = {
                                    viewModel.setScaleId(index)
                                    scaleExpanded = false
                                }
                            )
                        }
                    }
                }
            }
        }
        Spacer(Modifier.height(16.dp))

        // Range selection — piano keyboard
        SectionLabel("Range  (${MusicTheory.midiToLabel(state.rangeStart)} – ${MusicTheory.midiToLabel(state.rangeEnd)})")
        PianoRangePicker(
            rangeStart = state.rangeStart,
            rangeEnd = state.rangeEnd,
            onRangeChange = { s, e -> viewModel.setRange(s, e) },
            modifier = Modifier.fillMaxWidth()
        )
        Spacer(Modifier.height(16.dp))

        // Sequence length
        SectionLabel("Sequence Length")
        ChipRow(
            items = (2..8).map { it.toString() },
            selected = state.sequenceLength - 2,
            onSelect = { viewModel.setSequenceLength(it + 2) }
        )
        Spacer(Modifier.height(16.dp))

        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.fillMaxWidth()
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.weight(1f)
            ) {
                Checkbox(
                    checked = state.showTestNotes,
                    onCheckedChange = { viewModel.setShowTestNotes(it) }
                )
                Text("Display Test Notes", style = MaterialTheme.typography.bodyLarge, maxLines = 1)
            }
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.weight(1f)
            ) {
                Checkbox(
                    checked = state.keySignatureMode == 1,
                    onCheckedChange = { viewModel.setKeySignatureMode(if (it) 1 else 0) }
                )
                Text("Use Key Signature", style = MaterialTheme.typography.bodyLarge, maxLines = 1)
            }
        }
        Spacer(Modifier.height(32.dp))

        Button(
            onClick = onStartExercise,
            modifier = Modifier.fillMaxWidth().height(52.dp)
        ) {
            Text("▶ Start Exercise", fontSize = 18.sp)
        }
        Spacer(Modifier.height(16.dp))
    }
}

@Composable
internal fun SectionLabel(text: String) {
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
internal fun ChipRow(
    items: List<String>,
    selected: Int,
    onSelect: (Int) -> Unit
) {
    val chipColors = FilterChipDefaults.filterChipColors(
        selectedContainerColor = MaterialTheme.colorScheme.primary,
        selectedLabelColor = MaterialTheme.colorScheme.onPrimary
    )
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
                modifier = Modifier.weight(1f),
                colors = chipColors
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
    val chipColors = FilterChipDefaults.filterChipColors(
        selectedContainerColor = MaterialTheme.colorScheme.primary,
        selectedLabelColor = MaterialTheme.colorScheme.onPrimary
    )
    FlowRow(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp)
    ) {
        items.forEachIndexed { index, label ->
            FilterChip(
                selected = index == selected,
                onClick = { onSelect(index) },
                label = { Text(label, fontSize = 13.sp) },
                colors = chipColors
            )
        }
    }
}
