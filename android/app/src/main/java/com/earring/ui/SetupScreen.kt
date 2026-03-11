package com.earring.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.earring.AudioCapture
import com.earring.EarRingCore
import com.earring.MusicTheory
import com.earring.ui.components.MusicStaff
import com.earring.ui.components.NoteState
import com.earring.ui.components.PitchMeter
import com.earring.ui.components.StaffNote

@Composable
fun SetupScreen(onBack: () -> Unit, octave: Int = 4) {
    val context = LocalContext.current
    val audioCapture = remember { AudioCapture() }

    val noteStepDp = 44.dp
    val midiMin = (octave + 1) * 12
    val midiMax = midiMin + 23
    val maxHistory = 8

    var isListening by remember { mutableStateOf(false) }
    var detectedHz by remember { mutableFloatStateOf(-1f) }
    var detectedMidi by remember { mutableIntStateOf(-1) }
    var displayMidi by remember { mutableIntStateOf(-1) }
    var stableCount by remember { mutableIntStateOf(0) }
    var lastMidi by remember { mutableIntStateOf(-1) }
    // Rolling note history — accumulates stable notes left to right, max 8 visible
    val noteHistory = remember { mutableStateListOf<Int>() }
    var lastAddedMidi by remember { mutableIntStateOf(-1) }

    fun stopAll() {
        audioCapture.stop()
        isListening = false
        detectedHz = -1f
        detectedMidi = -1
        displayMidi = -1
        stableCount = 0
        lastMidi = -1
        noteHistory.clear()
        lastAddedMidi = -1
    }

    BackHandler { stopAll(); onBack() }

    DisposableEffect(Unit) { onDispose { audioCapture.stop() } }

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
            TextButton(onClick = { stopAll(); onBack() }) { Text("← Back") }
            Spacer(Modifier.weight(1f))
            Text("Mic Setup", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            Spacer(Modifier.weight(1f))
        }

        Spacer(Modifier.height(24.dp))
        Text("Sing or play a note to test your microphone.", style = MaterialTheme.typography.bodyMedium)
        Spacer(Modifier.height(16.dp))

        // Music staff — scrolling note history, newest note highlighted blue
        MusicStaff(
            notes = noteHistory.mapIndexed { i, m ->
                StaffNote(m, if (i == noteHistory.size - 1) NoteState.ACTIVE else NoteState.EXPECTED)
            },
            modifier = Modifier.fillMaxWidth(),
            fixedSpacingDp = noteStepDp
        )
        Spacer(Modifier.height(16.dp))

        // Large note name display
        val noteLabel = if (displayMidi >= 0) MusicTheory.midiToLabel(displayMidi) else "—"
        val hzLabel = if (detectedHz > 0f) "${detectedHz.toInt()} Hz" else ""
        Text(
            text = noteLabel,
            fontSize = 72.sp,
            fontWeight = FontWeight.Bold,
            color = if (displayMidi >= 0) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant
        )
        if (hzLabel.isNotEmpty()) {
            Text(hzLabel, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }

        Spacer(Modifier.height(24.dp))

        PitchMeter(detectedMidi = displayMidi, detectedHz = detectedHz)

        Spacer(Modifier.height(32.dp))

        if (!isListening) {
            Button(
                onClick = {
                    isListening = true
                    audioCapture.start(onAudio = { samples ->
                        val hz = EarRingCore.detectPitch(samples, 44100)
                        if (hz > 0f) {
                            detectedHz = hz
                            val midi = EarRingCore.freqToMidi(hz)
                            detectedMidi = midi
                            // Stability: require 3 consecutive frames of same note before displaying
                            if (midi == lastMidi) {
                                stableCount++
                                if (stableCount >= 3) {
                                    if (midi >= midiMin && midi <= midiMax) {
                                        displayMidi = midi
                                        // Add to rolling history when note changes
                                        if (midi != lastAddedMidi) {
                                            noteHistory.add(midi)
                                            if (noteHistory.size > maxHistory) noteHistory.removeAt(0)
                                            lastAddedMidi = midi
                                        }
                                    }
                                }
                            } else {
                                lastMidi = midi
                                stableCount = 1
                            }
                        } else {
                            detectedHz = -1f
                            detectedMidi = -1
                            stableCount = 0
                            lastMidi = -1
                            // Keep displayMidi for a moment so it doesn't flicker to "—"
                        }
                    })
                },
                modifier = Modifier.fillMaxWidth().height(52.dp)
            ) { Text("🎙 Start Listening", fontSize = 17.sp) }
        } else {
            Button(
                onClick = { stopAll() },
                colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error),
                modifier = Modifier.fillMaxWidth().height(52.dp)
            ) { Text("⏹ Stop", fontSize = 17.sp) }
        }
    }
}

