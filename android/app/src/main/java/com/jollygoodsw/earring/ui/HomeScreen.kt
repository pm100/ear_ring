package com.jollygoodsw.earring.ui

import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
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
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.foundation.shape.RoundedCornerShape
import com.jollygoodsw.earring.EarRingCore
import com.jollygoodsw.earring.ExerciseViewModel
import com.jollygoodsw.earring.MusicTheory
import com.jollygoodsw.earring.R
import org.json.JSONArray

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(
    viewModel: ExerciseViewModel,
    onStartExercise: () -> Unit
) {
    val state by viewModel.state.collectAsState()

    // Semitone offset for key display (written vs concert), mod 12.
    // Transposed Guitar has +12 which collapses to 0 mod 12 — no annotation shown.
    val instrKeyTranspose = remember(state.instrumentIndex) {
        try {
            val arr = JSONArray(EarRingCore.instrumentList())
            val sem = arr.getJSONObject(state.instrumentIndex).getInt("semitones")
            ((sem % 12) + 12) % 12
        } catch (_: Exception) { 0 }
    }

    // Hoisted above the scrollable Column so the full-screen picker overlay below can sit
    // as its sibling in this Box, rather than a system Dialog — Dialog's window resize
    // (needed for a true full-screen size; see PianoRangePickerScreen's history) raced with
    // the first Compose layout pass and left the keyboard measured against the small
    // pre-resize constraints, silently mispositioned no matter what alignment was tried.
    // An in-tree overlay gets correct full-size constraints from the very first frame.
    var showRangePicker by remember { mutableStateOf(false) }

    Box(modifier = Modifier.fillMaxSize()) {
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

        // Test Type dropdown — only Random Notes (0) and Diatonic Arpeggios (2) shown
        val testTypeOptions = listOf(0 to "Random Notes", 2 to "Diatonic Arpeggios")
        var testTypeExpanded by remember { mutableStateOf(false) }
        SectionLabel("Test Type")
        ExposedDropdownMenuBox(
            expanded = testTypeExpanded,
            onExpandedChange = { testTypeExpanded = it },
            modifier = Modifier.fillMaxWidth()
        ) {
            OutlinedTextField(
                value = testTypeOptions.firstOrNull { it.first == state.testType }?.second ?: "Random Notes",
                onValueChange = {},
                readOnly = true,
                singleLine = true,
                trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = testTypeExpanded) },
                modifier = Modifier.menuAnchor().fillMaxWidth()
            )
            ExposedDropdownMenu(
                expanded = testTypeExpanded,
                onDismissRequest = { testTypeExpanded = false }
            ) {
                testTypeOptions.forEach { (typeId, label) ->
                    DropdownMenuItem(
                        text = { Text(label) },
                        onClick = {
                            viewModel.setTestType(typeId)
                            testTypeExpanded = false
                        }
                    )
                }
            }
        }
        Spacer(Modifier.height(16.dp))

        // Key + Scale selections side by side
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Column(modifier = Modifier.weight(1f)) {
                SectionLabel("Key")
                var keyExpanded by remember { mutableStateOf(false) }
                // Selected display: show written key name + "(concert X)" when transposing
                val writtenRoot = (state.rootNote + instrKeyTranspose) % 12
                val selectedKeyLabel = if (instrKeyTranspose != 0)
                    "${MusicTheory.NOTE_NAMES[writtenRoot]} (concert ${MusicTheory.NOTE_NAMES[state.rootNote]})"
                else MusicTheory.NOTE_NAMES[state.rootNote]
                ExposedDropdownMenuBox(
                    expanded = keyExpanded,
                    onExpandedChange = { keyExpanded = it },
                    modifier = Modifier.fillMaxWidth()
                ) {
                    OutlinedTextField(
                        value = selectedKeyLabel,
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
                        // Iterate in written-key order; value stored as concert chroma
                        for (wc in 0..11) {
                            val concertChroma = (wc - instrKeyTranspose + 12) % 12
                            val label = if (instrKeyTranspose != 0)
                                "${MusicTheory.NOTE_NAMES[wc]} (concert ${MusicTheory.NOTE_NAMES[concertChroma]})"
                            else MusicTheory.NOTE_NAMES[wc]
                            DropdownMenuItem(
                                text = { Text(label) },
                                onClick = {
                                    viewModel.setRootNote(concertChroma)
                                    keyExpanded = false
                                }
                            )
                        }
                    }
                }
            }
            Column(modifier = Modifier.weight(1f).alpha(if (state.testType == 1) 0.38f else 1f)) {
                SectionLabel("Scale")
                var scaleExpanded by remember { mutableStateOf(false) }
                ExposedDropdownMenuBox(
                    expanded = scaleExpanded,
                    onExpandedChange = { if (state.testType != 1) scaleExpanded = it },
                    modifier = Modifier.fillMaxWidth()
                ) {
                    OutlinedTextField(
                        value = EarRingCore.writtenScaleLabel(state.rootNote, state.scaleId, state.instrumentIndex),
                        onValueChange = {},
                        readOnly = true,
                        singleLine = true,
                        enabled = state.testType != 1,
                        trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = scaleExpanded) },
                        modifier = Modifier.menuAnchor().fillMaxWidth()
                    )
                    ExposedDropdownMenu(
                        expanded = scaleExpanded,
                        onDismissRequest = { scaleExpanded = false }
                    ) {
                        MusicTheory.SELECTABLE_SCALE_IDS.forEach { index ->
                            DropdownMenuItem(
                                text = { Text(EarRingCore.writtenScaleLabel(state.rootNote, index, state.instrumentIndex)) },
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

        // Range selection — typed start/end fields, plus a button opening the piano
        // keyboard full-screen (it needs all the room it can get to stay tappable —
        // see PianoRangePickerScreen below for why this isn't a small dialog).
        SectionLabel("Range")
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            RangeTextInputs(
                rangeStart = state.rangeStart,
                rangeEnd = state.rangeEnd,
                enabled = state.testType != 1,
                onRangeChange = if (state.testType != 1) { s, e -> viewModel.setRange(s, e) } else { _, _ -> }
            )
            val focusManager = LocalFocusManager.current
            OutlinedButton(
                onClick = {
                    // Force any in-progress edit in the range fields to commit (their
                    // onFocusChanged only fires on real focus loss) before the full-screen
                    // picker opens over them — otherwise a value just typed and not yet
                    // blurred could be silently lost.
                    focusManager.clearFocus()
                    showRangePicker = true
                },
                contentPadding = PaddingValues(horizontal = 14.dp, vertical = 10.dp)
            ) {
                Text("🎹", fontSize = 20.sp)  // 🎹
            }
        }
        Spacer(Modifier.height(16.dp))

        // Sequence length
        SectionLabel("Sequence Length")
        val isDiatonicMode = state.testType == 2
        ChipRow(
            items = (1..8).map { it.toString() },
            selected = state.sequenceLength - 1,
            onSelect = { viewModel.setSequenceLength(it + 1) },
            enabled = state.testType == 0,
            enabledIndices = if (isDiatonicMode) setOf(2, 3) else null  // indices 2=3, 3=4
        )
        Spacer(Modifier.height(32.dp))

        Button(
            onClick = onStartExercise,
            modifier = Modifier.fillMaxWidth().height(52.dp)
        ) {
            Text("▶ Start Exercise", fontSize = 18.sp)
        }
        Spacer(Modifier.height(16.dp))
    }  // Column

    if (showRangePicker) {
        PianoRangePickerScreen(
            rangeStart = state.rangeStart,
            rangeEnd = state.rangeEnd,
            onRangeChange = if (state.testType != 1) { s, e -> viewModel.setRange(s, e) } else { _, _ -> },
            onDone = { showRangePicker = false }
        )
    }
    }  // Box
}

/** Typed start/end note entry ("C4", "D5"), alongside the piano keyboard picker. */
@Composable
private fun RangeTextInputs(
    rangeStart: Int,
    rangeEnd: Int,
    enabled: Boolean,
    onRangeChange: (Int, Int) -> Unit
) {
    var startText by remember(rangeStart) { mutableStateOf(MusicTheory.midiToLabel(rangeStart)) }
    var endText by remember(rangeEnd) { mutableStateOf(MusicTheory.midiToLabel(rangeEnd)) }

    fun commitStart() {
        val midi = EarRingCore.labelToMidi(startText)
        if (midi != null && rangeEnd - midi >= 12) onRangeChange(midi, rangeEnd)
        else startText = MusicTheory.midiToLabel(rangeStart) // invalid — revert to last valid value
    }
    fun commitEnd() {
        val midi = EarRingCore.labelToMidi(endText)
        if (midi != null && midi - rangeStart >= 12) onRangeChange(rangeStart, midi)
        else endText = MusicTheory.midiToLabel(rangeEnd) // invalid — revert to last valid value
    }

    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        OutlinedTextField(
            value = startText,
            onValueChange = { startText = it },
            enabled = enabled,
            singleLine = true,
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
            keyboardActions = KeyboardActions(onDone = { commitStart() }),
            modifier = Modifier.width(90.dp).onFocusChanged { if (!it.isFocused) commitStart() }
        )
        Text("to")
        OutlinedTextField(
            value = endText,
            onValueChange = { endText = it },
            enabled = enabled,
            singleLine = true,
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
            keyboardActions = KeyboardActions(onDone = { commitEnd() }),
            modifier = Modifier.width(90.dp).onFocusChanged { if (!it.isFocused) commitEnd() }
        )
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
    onSelect: (Int) -> Unit,
    enabled: Boolean = true,
    enabledIndices: Set<Int>? = null  // if non-null, overrides `enabled` per-chip
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
            val chipEnabled = enabledIndices?.contains(index) ?: enabled
            val isSelected = index == selected && chipEnabled
            FilterChip(
                selected = isSelected,
                onClick = { if (chipEnabled) onSelect(index) },
                label = { Text(label, fontSize = 13.sp) },
                modifier = Modifier.weight(1f).alpha(if (chipEnabled) 1f else 0.38f),
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
