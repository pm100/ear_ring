package com.jollygoodsw.earring.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.ui.draw.drawBehind
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ExpandLess
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.jollygoodsw.earring.EarRingCore
import com.jollygoodsw.earring.ExerciseViewModel
import org.json.JSONArray

/** A section that starts collapsed; tapping the header title toggles it open/closed.
 *  Expanded content is indented with a left rule, and every section is followed by
 *  a divider — a section groups several related settings under one heading, so no
 *  collapsed-value summary is shown (a summary can't stay short once a section holds
 *  more than one or two settings). */
@Composable
internal fun ExpandableSection(title: String, content: @Composable ColumnScope.() -> Unit) {
    var expanded by remember { mutableStateOf(false) }
    val borderColor = MaterialTheme.colorScheme.outlineVariant
    Column(modifier = Modifier.fillMaxWidth()) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier
                .fillMaxWidth()
                .clickable { expanded = !expanded }
                .padding(vertical = 10.dp)
        ) {
            Text(
                title,
                style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.Bold),
                color = MaterialTheme.colorScheme.primary,
                modifier = Modifier.weight(1f)
            )
            Icon(
                imageVector = if (expanded) Icons.Default.ExpandLess else Icons.Default.ExpandMore,
                contentDescription = if (expanded) "Collapse" else "Expand",
                tint = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
        AnimatedVisibility(
            visible = expanded,
            enter = expandVertically() + fadeIn(),
            exit = shrinkVertically() + fadeOut()
        ) {
            Column(
                modifier = Modifier
                    .padding(start = 12.dp, bottom = 12.dp)
                    .drawBehind {
                        drawLine(
                            color = borderColor,
                            start = androidx.compose.ui.geometry.Offset(0f, 0f),
                            end = androidx.compose.ui.geometry.Offset(0f, size.height),
                            strokeWidth = 2.dp.toPx()
                        )
                    }
                    .padding(start = 12.dp),
                content = content
            )
        }
        HorizontalDivider(color = borderColor.copy(alpha = 0.4f))
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(viewModel: ExerciseViewModel) {
    val state by viewModel.state.collectAsState()
    val bpmOptions = listOf("60", "80", "100", "120", "140")
    val retryOptions = listOf(1, 2, 3, 5, 8, 10)
    val noteRetryOptions = listOf(0, 1, 2, 3, 4, 5)
    val wrongPauseOptions = listOf(1000L to "1s", 2000L to "2s", 3000L to "3s", 5000L to "5s")
    val introSoundOptions = listOf("Root Note", "Chord", "Arpeggio", "Scale", "None")

    // Parse instrument list from Rust core once
    val instrumentNames = remember {
        try {
            val arr = JSONArray(EarRingCore.instrumentList())
            List(arr.length()) { arr.getJSONObject(it).getString("name") }
        } catch (_: Exception) { listOf("Piano") }
    }
    var instrumentExpanded by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp)
    ) {
        Spacer(Modifier.height(8.dp))

        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Spacer(Modifier.weight(1f))
            Text("Settings", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            Spacer(Modifier.weight(1f))
        }

        Spacer(Modifier.height(16.dp))

        ExpandableSection("Instrument & Playback") {
            SectionLabel("Instrument")
            ExposedDropdownMenuBox(
                expanded = instrumentExpanded,
                onExpandedChange = { instrumentExpanded = !instrumentExpanded }
            ) {
                OutlinedTextField(
                    value = instrumentNames.getOrElse(state.instrumentIndex) { "Piano" },
                    onValueChange = {},
                    readOnly = true,
                    singleLine = true,
                    trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = instrumentExpanded) },
                    modifier = Modifier.menuAnchor().fillMaxWidth()
                )
                ExposedDropdownMenu(
                    expanded = instrumentExpanded,
                    onDismissRequest = { instrumentExpanded = false }
                ) {
                    instrumentNames.forEachIndexed { idx, name ->
                        DropdownMenuItem(
                            text = { Text(name) },
                            onClick = { viewModel.setInstrumentIndex(idx); instrumentExpanded = false }
                        )
                    }
                }
            }

            Spacer(Modifier.height(12.dp))
            SectionLabel("Tempo (BPM)")
            ChipRow(
                items = bpmOptions,
                selected = bpmOptions.indexOf(state.tempoBpm.toString()).coerceAtLeast(0),
                onSelect = { viewModel.setTempoBpm(bpmOptions[it].toInt()) }
            )
        }

        ExpandableSection("Sound & Display") {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Checkbox(
                    checked = state.playPassFailSounds,
                    onCheckedChange = { viewModel.setPlayPassFailSounds(it) }
                )
                Text("Play Pass/Fail Sounds", style = MaterialTheme.typography.bodyLarge)
            }
            Text("A chime when a test is passed, a different tone when it fails",
                fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)

            Spacer(Modifier.height(12.dp))
            SectionLabel("Intro Sound")
            Text("What plays before each test",
                fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(bottom = 6.dp))
            var introSoundExpanded by remember { mutableStateOf(false) }
            ExposedDropdownMenuBox(
                expanded = introSoundExpanded,
                onExpandedChange = { introSoundExpanded = !introSoundExpanded }
            ) {
                OutlinedTextField(
                    value = introSoundOptions.getOrElse(state.introSoundMode) { "Chord" },
                    onValueChange = {},
                    readOnly = true,
                    singleLine = true,
                    trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = introSoundExpanded) },
                    modifier = Modifier.menuAnchor().fillMaxWidth()
                )
                ExposedDropdownMenu(
                    expanded = introSoundExpanded,
                    onDismissRequest = { introSoundExpanded = false }
                ) {
                    introSoundOptions.forEachIndexed { idx, name ->
                        DropdownMenuItem(
                            text = { Text(name) },
                            onClick = { viewModel.setIntroSoundMode(idx); introSoundExpanded = false }
                        )
                    }
                }
            }

            Spacer(Modifier.height(12.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Checkbox(
                    checked = state.showTestNotes,
                    onCheckedChange = { viewModel.setShowTestNotes(it) }
                )
                Text("Display Test Notes", style = MaterialTheme.typography.bodyLarge)
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                Checkbox(
                    checked = state.keySignatureMode == 1,
                    onCheckedChange = { viewModel.setKeySignatureMode(if (it) 1 else 0) }
                )
                Text("Use Key Signature", style = MaterialTheme.typography.bodyLarge)
            }
        }

        ExpandableSection("Exercise & Timing") {
            SectionLabel("Max Retries")
            Text("Attempts per test before moving on", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(bottom = 6.dp))
            ChipRow(
                items = retryOptions.map { it.toString() },
                selected = retryOptions.indexOf(state.maxRetries).coerceAtLeast(0),
                onSelect = { viewModel.setMaxRetries(retryOptions[it]) }
            )

            Spacer(Modifier.height(12.dp))
            SectionLabel("Retry Same Note")
            Text("Tries allowed on a wrong note before the whole test restarts — each retry costs a few points (0 = off)",
                fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(bottom = 6.dp))
            ChipRow(
                items = noteRetryOptions.map { it.toString() },
                selected = noteRetryOptions.indexOf(state.noteRetries).coerceAtLeast(0),
                onSelect = { viewModel.setNoteRetries(noteRetryOptions[it]) }
            )

            Spacer(Modifier.height(12.dp))
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

            Spacer(Modifier.height(12.dp))
            SectionLabel("Wrong Note Pause")
            Text("How long to display a wrong note before replaying",
                fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(bottom = 6.dp))
            ChipRow(
                items = wrongPauseOptions.map { it.second },
                selected = wrongPauseOptions.indexOfFirst { it.first == state.wrongNotePauseMs }.coerceAtLeast(0),
                onSelect = { viewModel.setWrongNotePauseMs(wrongPauseOptions[it].first) }
            )
        }

        Spacer(Modifier.height(32.dp))

        var showResetConfirm by remember { mutableStateOf(false) }
        if (showResetConfirm) {
            AlertDialog(
                onDismissRequest = { showResetConfirm = false },
                title = { Text("Reset Settings?") },
                text = { Text("All settings will be restored to their defaults. Your progress history will not be affected.") },
                confirmButton = {
                    TextButton(onClick = { viewModel.resetSettings(); showResetConfirm = false }) {
                        Text("Reset", color = MaterialTheme.colorScheme.error)
                    }
                },
                dismissButton = {
                    TextButton(onClick = { showResetConfirm = false }) { Text("Cancel") }
                }
            )
        }
        Button(
            onClick = { showResetConfirm = true },
            modifier = Modifier.fillMaxWidth(),
            colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.errorContainer)
        ) {
            Text("Reset to Defaults", color = MaterialTheme.colorScheme.onErrorContainer)
        }

        Spacer(Modifier.height(16.dp))
        Text(
            "Build ${EarRingCore.gitHash()}",
            fontSize = 11.sp,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = androidx.compose.ui.text.style.TextAlign.Center,
            modifier = Modifier.fillMaxWidth()
        )

        Spacer(Modifier.height(16.dp))
    }
}
