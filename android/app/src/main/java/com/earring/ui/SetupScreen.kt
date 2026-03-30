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
import com.earring.EarRingCore
import com.earring.MusicTheory
import com.earring.ui.components.MusicStaff
import com.earring.ui.components.NoteState
import com.earring.ui.components.PitchMeter
import com.earring.ui.components.StaffNote

@Composable
fun SetupScreen(onBack: () -> Unit, rangeStart: Int = 60, rangeEnd: Int = 71, rootChroma: Int = 0, keySignatureMode: Int = 0, silenceThreshold: Float = 0.003f, framesToConfirm: Int = 3, warmupFrames: Int = 4, instrumentIndex: Int = 0) {
    val noteStepDp = 44.dp
    val midiMin = rangeStart
    val midiMax = rangeEnd
    val maxHistory = 8

    var concertMidi by remember { mutableIntStateOf(-1) }
    val concertHistory = remember { mutableStateListOf<Int>() }

    // Shared pitch detection — identical pipeline to ExerciseScreen.
    val liveHz = rememberPitchDetector(
        active = true,
        midiMin = midiMin,
        midiMax = midiMax,
        silenceThreshold = silenceThreshold,
        framesToConfirm = framesToConfirm,
        warmupFrames = warmupFrames,
        onConfirmed = { midi, _ ->
            concertMidi = midi
            concertHistory.add(midi)
            if (concertHistory.size > maxHistory) concertHistory.removeAt(0)
        }
    )

    // Clear display when silence detected
    if (liveHz <= 0f) concertMidi = -1

    // Apply instrument transposition for display
    val displayMidi = if (concertMidi >= 0) EarRingCore.transposeDisplayMidi(concertMidi, instrumentIndex) else -1
    val displayHistory = concertHistory.map { EarRingCore.transposeDisplayMidi(it, instrumentIndex) }

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
        Text("Play a note to test your microphone.", style = MaterialTheme.typography.bodyMedium)
        Spacer(Modifier.height(16.dp))

        // Listening indicator
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.Center,
            modifier = Modifier.fillMaxWidth()
        ) {
            Text("👂", fontSize = 28.sp)
            Spacer(Modifier.width(8.dp))
            Text(
                "Listening…",
                style = MaterialTheme.typography.titleSmall,
                color = MaterialTheme.colorScheme.primary,
                fontWeight = FontWeight.SemiBold
            )
        }
        Spacer(Modifier.height(16.dp))

        MusicStaff(
            notes = displayHistory.mapIndexed { i, m ->
                StaffNote(m, if (i == displayHistory.size - 1) NoteState.ACTIVE else NoteState.EXPECTED)
            },
            modifier = Modifier.fillMaxWidth(),
            fixedSpacingDp = noteStepDp,
            rootChroma = rootChroma,
            keySignatureMode = keySignatureMode
        )
        Spacer(Modifier.height(8.dp))

        // Large note name + Hz
        val noteLabel = if (displayMidi >= 0) MusicTheory.midiToLabel(displayMidi) else "—"
        val noteHz = if (displayMidi >= 0) 440.0 * Math.pow(2.0, (displayMidi - 69) / 12.0) else 0.0
        Text(
            noteLabel,
            fontSize = if (noteLabel.length >= 3) 56.sp else 72.sp,
            fontWeight = FontWeight.Bold,
            color = if (displayMidi >= 0) MaterialTheme.colorScheme.primary
                    else MaterialTheme.colorScheme.onSurfaceVariant
        )
        if (displayMidi >= 0) {
            Text(
                String.format("%.1f Hz", noteHz),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
        Spacer(Modifier.height(24.dp))

        PitchMeter(detectedMidi = displayMidi, detectedHz = liveHz)
        Spacer(Modifier.height(32.dp))
    }
}

