package com.earring.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.earring.MusicTheory
import com.earring.ui.components.MusicStaff
import com.earring.ui.components.NoteState
import com.earring.ui.components.PitchMeter
import com.earring.ui.components.StaffNote

@Composable
fun SetupScreen(onBack: () -> Unit, rangeStart: Int = 60, rangeEnd: Int = 71) {
    val noteStepDp = 44.dp
    val midiMin = rangeStart
    val midiMax = rangeEnd
    val maxHistory = 8

    var displayMidi by remember { mutableIntStateOf(-1) }
    val noteHistory = remember { mutableStateListOf<Int>() }
    var lastAddedMidi by remember { mutableIntStateOf(-1) }

    // Shared pitch detection — identical pipeline to ExerciseScreen.
    // auto-starts on entry; onConfirmed decides what to do with each stable note.
    val liveHz = rememberPitchDetector(
        active = true,
        midiMin = midiMin,
        midiMax = midiMax,
        onConfirmed = { midi, _ ->
            displayMidi = midi
            if (midi != lastAddedMidi) {
                noteHistory.add(midi)
                if (noteHistory.size > maxHistory) noteHistory.removeAt(0)
                lastAddedMidi = midi
            }
        }
    )

    BackHandler { onBack() }

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
            Spacer(Modifier.weight(1f))
            Text("Mic Setup", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            Spacer(Modifier.weight(1f))
        }

        Spacer(Modifier.height(24.dp))
        Text("Sing or play a note to test your microphone.", style = MaterialTheme.typography.bodyMedium)
        Spacer(Modifier.height(16.dp))

        MusicStaff(
            notes = noteHistory.mapIndexed { i, m ->
                StaffNote(m, if (i == noteHistory.size - 1) NoteState.ACTIVE else NoteState.EXPECTED)
            },
            modifier = Modifier.fillMaxWidth(),
            fixedSpacingDp = noteStepDp
        )
        Spacer(Modifier.height(16.dp))

        PitchMeter(detectedMidi = displayMidi, detectedHz = liveHz)
        Spacer(Modifier.height(32.dp))

        Button(
            onClick = { onBack() },
            colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error),
            modifier = Modifier.fillMaxWidth().height(52.dp)
        ) { Text("⏹ Stop", fontSize = 17.sp) }
    }
}

