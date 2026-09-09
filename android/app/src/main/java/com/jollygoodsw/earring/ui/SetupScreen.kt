package com.jollygoodsw.earring.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.jollygoodsw.earring.EarRingCore
import com.jollygoodsw.earring.ExerciseViewModel
import com.jollygoodsw.earring.ui.components.MusicStaff
import com.jollygoodsw.earring.ui.components.NoteState
import com.jollygoodsw.earring.ui.components.PitchMeter
import com.jollygoodsw.earring.ui.components.StaffNote
import kotlin.math.roundToInt

@Composable
fun SetupScreen(viewModel: ExerciseViewModel, onBack: () -> Unit, rangeStart: Int = 60, rangeEnd: Int = 72, rootChroma: Int = 0, keySignatureMode: Int = 0, silenceThreshold: Float = 0.003f, framesToConfirm: Int = 3, warmupFrames: Int = 4, instrumentIndex: Int = 0) {
    val noteStepDp = 44.dp
    // Mic Setup exists to test what the mic can hear, independent of whatever
    // range the exercise happens to be configured for right now — a narrow
    // exercise range (e.g. the default one-octave Piano range) must not make
    // notes outside it silently vanish here.
    val midiMin = 0
    val midiMax = 127
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
        instrumentIndex = instrumentIndex,
        warmupFrames = warmupFrames,
        onConfirmed = { midi, _ ->
            concertMidi = midi
            if (midi in rangeStart..rangeEnd) {
                concertHistory.add(midi)
                if (concertHistory.size > maxHistory) concertHistory.removeAt(0)
            }
        }
    )

    // Clear display when silence detected
    if (liveHz <= 0f) concertMidi = -1

    // Apply instrument transposition for display
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

        Spacer(Modifier.height(16.dp))
        Text("Play a note to test your microphone.", style = MaterialTheme.typography.bodyMedium)
        Spacer(Modifier.height(12.dp))

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
        Spacer(Modifier.height(12.dp))

        MusicStaff(
            notes = displayHistory.mapIndexed { i, m ->
                StaffNote(m, if (i == displayHistory.size - 1) NoteState.ACTIVE else NoteState.EXPECTED)
            },
            modifier = Modifier.fillMaxWidth(),
            fixedSpacingDp = noteStepDp,
            rootChroma = rootChroma,
            keySignatureMode = keySignatureMode
        )
        Spacer(Modifier.height(12.dp))

        // The pitch meter is the only detected-note readout below the staff — the
        // large note-name/Hz text that used to sit here was removed to make room
        // for the always-visible Pitch Detection controls, without this screen
        // needing to scroll.
        PitchMeter(detectedMidi = concertMidi, detectedHz = liveHz)
        Spacer(Modifier.height(16.dp))

        // Pitch Detection controls live here rather than in Settings — this screen
        // already gives live feedback on what the mic hears, so sensitivity/stability
        // adjustments can be tuned by ear against that feedback instead of blind.
        // Always visible (no heading, no collapse) since this is the screen's
        // primary purpose.
        val stabilityOptions = listOf(2, 3, 4, 5)
        val warmupOptions = listOf(0, 1, 2, 3, 4, 5, 6)

        SectionLabel("Mic Sensitivity")
        val sensitivity = ((0.011f - silenceThreshold) / 0.001f).roundToInt().coerceIn(1, 10)
        Text("${sensitivity} / 10",
            fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(bottom = 4.dp))
        Slider(
            value = sensitivity.toFloat(),
            onValueChange = { viewModel.setSilenceThreshold((0.011f - it * 0.001f).coerceIn(0.001f, 0.010f)) },
            valueRange = 1f..10f,
            steps = 8,
            modifier = Modifier.fillMaxWidth()
        )

        Spacer(Modifier.height(8.dp))
        SectionLabel("Note Stability (frames to confirm)")
        ChipRow(
            items = stabilityOptions.map { it.toString() },
            selected = stabilityOptions.indexOf(framesToConfirm).coerceAtLeast(0),
            onSelect = { viewModel.setFramesToConfirm(stabilityOptions[it]) }
        )

        Spacer(Modifier.height(8.dp))
        SectionLabel("Mic Warmup Frames")
        ChipRow(
            items = warmupOptions.map { it.toString() },
            selected = warmupOptions.indexOf(warmupFrames).coerceAtLeast(0),
            onSelect = { viewModel.setWarmupFrames(warmupOptions[it]) }
        )
    }
}
