package com.jollygoodsw.earring.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.VolumeUp
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.MusicNote
import androidx.compose.material.icons.filled.Timer
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.jollygoodsw.earring.BuildConfig
import com.jollygoodsw.earring.EarRingCore
import com.jollygoodsw.earring.ExerciseViewModel
import org.json.JSONArray

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(viewModel: ExerciseViewModel) {
    val state by viewModel.state.collectAsState()
    val bpmOptions = listOf("60", "80", "100", "120", "140")
    val retryOptions = listOf(1, 2, 3, 5, 8, 10)
    val noteRetryOptions = listOf(0, 1, 2, 3, 4, 5)
    val wrongPauseOptions = listOf(1000L to "1s", 2000L to "2s", 3000L to "3s", 5000L to "5s")
    val introSoundOptions = listOf("Root Note", "Chord", "Arpeggio", "Scale", "None")

    // Parse instrument list from Rust core once. Kept as (id, name) pairs, not a plain
    // List<String>, so the dropdown can filter out premium instruments for a non-premium
    // user without the remaining entries' positions drifting out of sync with their real
    // Rust instrumentIndex.
    val allInstruments = remember {
        try {
            val arr = JSONArray(EarRingCore.instrumentList())
            List(arr.length()) { i ->
                val inst = arr.getJSONObject(i)
                Triple(inst.getInt("id"), inst.getString("name"), inst.optBoolean("premium", false))
            }
        } catch (_: Exception) { listOf(Triple(0, "Piano", false)) }
    }
    val selectableInstruments = allInstruments.filter { (_, _, premium) -> !premium || state.isPremium }
    val currentInstrumentName = allInstruments.firstOrNull { it.first == state.instrumentIndex }?.second ?: "Piano"
    var instrumentExpanded by remember { mutableStateOf(false) }
    // 0 = the list of categories; 1..3 = one category's settings.
    var page by rememberSaveable { mutableIntStateOf(0) }
    BackHandler(enabled = page != 0) { page = 0 }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp)
    ) {
        Spacer(Modifier.height(8.dp))

        if (page == 0) {
            Text(
                "Settings",
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.fillMaxWidth(),
                textAlign = androidx.compose.ui.text.style.TextAlign.Center
            )
            Spacer(Modifier.height(16.dp))
            // The usual Material settings list: icon, title, current value, chevron.
            SettingsCategoryRow(Icons.Default.MusicNote, "Instrument & Playback", currentInstrumentName) { page = 1 }
            SettingsCategoryRow(Icons.AutoMirrored.Filled.VolumeUp, "Sound & Display", null) { page = 2 }
            SettingsCategoryRow(Icons.Default.Timer, "Exercise & Timing", null) { page = 3 }
        } else {
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = { page = 0 }) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                }
                Text(
                    when (page) { 1 -> "Instrument & Playback"; 2 -> "Sound & Display"; else -> "Exercise & Timing" },
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold
                )
            }
            Spacer(Modifier.height(8.dp))
        }

        if (page == 1) {
            SectionLabel("Instrument", tooltipKey = "instrument")
            ExposedDropdownMenuBox(
                expanded = instrumentExpanded,
                onExpandedChange = { instrumentExpanded = !instrumentExpanded }
            ) {
                OutlinedTextField(
                    value = currentInstrumentName,
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
                    selectableInstruments.forEach { (id, name, _) ->
                        DropdownMenuItem(
                            text = { Text(name) },
                            onClick = { viewModel.setInstrumentIndex(id); instrumentExpanded = false }
                        )
                    }
                }
            }

            Spacer(Modifier.height(12.dp))
            SectionLabel("Tempo (BPM)", tooltipKey = "tempo")
            ChipRow(
                items = bpmOptions,
                selected = bpmOptions.indexOf(state.tempoBpm.toString()).coerceAtLeast(0),
                onSelect = { viewModel.setTempoBpm(bpmOptions[it].toInt()) }
            )
        }

        if (page == 2) {
            // Switch, not Checkbox — a checkbox reads as "select from a list," a
            // switch as "toggle a setting," and Switch is what every other on/off
            // preference on the platform (including this app's own OS settings)
            // uses. Grouped together rather than split around the Intro Sound
            // dropdown, and without a caption restating each control's own label.
            SettingSwitchRow("Play Pass/Fail Sounds", state.playPassFailSounds, tooltipKey = "play_pass_fail_sounds") {
                viewModel.setPlayPassFailSounds(it)
            }
            SettingSwitchRow("Display Test Notes", state.showTestNotes, tooltipKey = "display_test_notes") {
                viewModel.setShowTestNotes(it)
            }
            SettingSwitchRow("Use Key Signature", state.keySignatureMode == 1, tooltipKey = "use_key_signature") {
                viewModel.setKeySignatureMode(if (it) 1 else 0)
            }

            Spacer(Modifier.height(12.dp))
            SectionLabel("Intro Sound", tooltipKey = "intro_sound")
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
        }

        if (page == 3) {
            // Explanatory captions removed under each label here — redundant now that
            // every label has a tooltip icon (issue #11). Pause Before Playing keeps its
            // live ms readout since the Slider itself shows no value of its own.
            SectionLabel("Max Retries", tooltipKey = "max_retries")
            ChipRow(
                items = retryOptions.map { it.toString() },
                selected = retryOptions.indexOf(state.maxRetries).coerceAtLeast(0),
                onSelect = { viewModel.setMaxRetries(retryOptions[it]) }
            )

            Spacer(Modifier.height(12.dp))
            SectionLabel("Retry Same Note", tooltipKey = "retry_same_note")
            ChipRow(
                items = noteRetryOptions.map { it.toString() },
                selected = noteRetryOptions.indexOf(state.noteRetries).coerceAtLeast(0),
                onSelect = { viewModel.setNoteRetries(noteRetryOptions[it]) }
            )

            Spacer(Modifier.height(12.dp))
            SectionLabel("Pause Before Playing", tooltipKey = "pause_before_playing")
            Text("${state.postChordGapMs}ms", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(bottom = 4.dp))
            Slider(
                value = state.postChordGapMs.toFloat(),
                onValueChange = { viewModel.setPostChordGapMs(it.toLong()) },
                valueRange = 400f..2000f,
                steps = 15,
                modifier = Modifier.fillMaxWidth()
            )

            Spacer(Modifier.height(12.dp))
            SectionLabel("Wrong Note Pause", tooltipKey = "wrong_note_pause")
            ChipRow(
                items = wrongPauseOptions.map { it.second },
                selected = wrongPauseOptions.indexOfFirst { it.first == state.wrongNotePauseMs }.coerceAtLeast(0),
                onSelect = { viewModel.setWrongNotePauseMs(wrongPauseOptions[it].first) }
            )
        }

        if (page == 0 && BuildConfig.DEBUG) {
            // Debug-build-only: excluded from release/Play Store builds. Nothing else can
            // set isPremium true yet (no billing/gifting wired up), so this is the only way
            // to test the premium gate before that lands.
            Spacer(Modifier.height(16.dp))
            SettingSwitchRow("Debug: Premium", state.isPremium) { viewModel.setPremium(it) }
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
        if (page == 0) {
            HorizontalDivider()
            ListItem(
                headlineContent = { Text("Reset to Defaults", color = MaterialTheme.colorScheme.error) },
                modifier = Modifier.clickable { showResetConfirm = true }
            )
            HorizontalDivider()
        }

        if (page == 0) Text(
            "Build ${EarRingCore.gitHash()}",
            fontSize = 11.sp,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = androidx.compose.ui.text.style.TextAlign.Center,
            modifier = Modifier.fillMaxWidth().padding(top = 16.dp)
        )

        Spacer(Modifier.height(16.dp))
    }
}

@Composable
private fun SettingsCategoryRow(icon: ImageVector, title: String, value: String?, onClick: () -> Unit) {
    Column {
        ListItem(
            leadingContent = { Icon(icon, contentDescription = null, tint = MaterialTheme.colorScheme.primary) },
            headlineContent = { Text(title) },
            supportingContent = value?.let { { Text(it) } },
            trailingContent = {
                Icon(Icons.Default.ChevronRight, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
            },
            modifier = Modifier.clickable(onClick = onClick)
        )
        HorizontalDivider()
    }
}
