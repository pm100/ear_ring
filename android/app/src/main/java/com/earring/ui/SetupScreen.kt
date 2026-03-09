package com.earring.ui

import android.content.Context
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
import com.earring.AudioPlayback
import com.earring.EarRingCore
import com.earring.MusicTheory
import com.earring.ui.components.MusicStaff
import com.earring.ui.components.NoteState
import com.earring.ui.components.PitchMeter
import com.earring.ui.components.StaffNote

@Composable
fun SetupScreen(onBack: () -> Unit) {
    val context = LocalContext.current
    val audioCapture = remember { AudioCapture() }
    val audioPlayback = remember { AudioPlayback(context) }

    var isListening by remember { mutableStateOf(false) }
    var detectedHz by remember { mutableFloatStateOf(-1f) }
    var detectedMidi by remember { mutableIntStateOf(-1) }

    DisposableEffect(Unit) {
        onDispose {
            audioCapture.stop()
            audioPlayback.cancelPlayback()
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
                audioCapture.stop()
                audioPlayback.cancelPlayback()
                onBack()
            }) { Text("← Back") }
            Spacer(Modifier.weight(1f))
            Text("Mic Setup", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            Spacer(Modifier.weight(1f))
        }

        Spacer(Modifier.height(20.dp))
        Text("Test your microphone — sing or play a note.", style = MaterialTheme.typography.bodyMedium)
        Spacer(Modifier.height(20.dp))

        // Staff showing currently detected note
        val staffNotes = if (detectedMidi >= 0)
            listOf(StaffNote(midi = detectedMidi, state = NoteState.ACTIVE))
        else emptyList()
        MusicStaff(notes = staffNotes, modifier = Modifier.fillMaxWidth())

        Spacer(Modifier.height(16.dp))

        // Pitch meter
        PitchMeter(detectedMidi = detectedMidi, detectedHz = detectedHz)

        if (detectedMidi >= 0) {
            Spacer(Modifier.height(8.dp))
            Text(
                text = "${detectedHz.toInt()} Hz  •  ${MusicTheory.midiToLabel(detectedMidi)}",
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.primary
            )
        }

        Spacer(Modifier.height(20.dp))

        // Listen toggle
        if (!isListening) {
            Button(
                onClick = {
                    isListening = true
                    audioCapture.start(onAudio = { samples ->
                        val hz = EarRingCore.detectPitch(samples, 44100)
                        if (hz > 0f) {
                            detectedHz = hz
                            detectedMidi = EarRingCore.freqToMidi(hz)
                        } else {
                            detectedHz = -1f
                            detectedMidi = -1
                        }
                    })
                },
                modifier = Modifier.fillMaxWidth().height(52.dp)
            ) { Text("🎙 Start Listening", fontSize = 17.sp) }
        } else {
            Button(
                onClick = {
                    isListening = false
                    audioCapture.stop()
                    detectedHz = -1f
                    detectedMidi = -1
                },
                colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error),
                modifier = Modifier.fillMaxWidth().height(52.dp)
            ) { Text("⏹ Stop", fontSize = 17.sp) }
        }

        Spacer(Modifier.height(24.dp))
        Text("Play test notes:", style = MaterialTheme.typography.labelLarge)
        Spacer(Modifier.height(10.dp))

        // Test note buttons
        val testNotes = listOf(60 to "C4", 64 to "E4", 67 to "G4", 69 to "A4", 72 to "C5")
        Row(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            modifier = Modifier.fillMaxWidth()
        ) {
            testNotes.forEach { (midi, label) ->
                OutlinedButton(
                    onClick = { audioPlayback.playNote(midi) },
                    modifier = Modifier.weight(1f)
                ) {
                    Text(label, fontSize = 13.sp)
                }
            }
        }
    }
}
