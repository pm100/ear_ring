package com.jollygoodsw.earring.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
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
import com.jollygoodsw.earring.ui.components.StaffNote
import com.jollygoodsw.earring.ui.components.TunerMeter
import kotlin.math.roundToInt

@Composable
@OptIn(ExperimentalMaterial3Api::class)
fun SetupScreen(viewModel: ExerciseViewModel, onBack: () -> Unit, rangeStart: Int = 60, rangeEnd: Int = 72, rootChroma: Int = 0, concertKeyChroma: Int = 0, keySignatureMode: Int = 0, silenceThreshold: Float = 0.003f, framesToConfirm: Int = 3, warmupFrames: Int = 4, instrumentIndex: Int = 0, graceFrames: Int = 3, octaveCorrection: Boolean = false, yinThreshold: Float = 0.15f, pitchToleranceCents: Float = 50f, useTunerMeter: Boolean = false) {
    val noteStepDp = 44.dp
    var advancedOpen by remember { mutableStateOf(false) }
    // Mic Setup exists to test what the mic can hear, independent of whatever
    // range the exercise happens to be configured for right now — a narrow
    // exercise range (e.g. the default one-octave Piano range) must not make
    // notes outside it silently vanish here.
    val midiMin = 0
    val midiMax = 127
    val maxHistory = 8

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
        graceFrames = graceFrames,
        octaveCorrection = octaveCorrection,
        yinThreshold = yinThreshold,
        pitchToleranceCents = pitchToleranceCents,
        onConfirmed = { midi, _ ->
            if (midi in rangeStart..rangeEnd) {
                concertHistory.add(midi)
                if (concertHistory.size > maxHistory) concertHistory.removeAt(0)
            }
        }
    )

    // Apply instrument transposition for display
    val displayHistory = concertHistory.map { EarRingCore.transposeDisplayMidi(it, instrumentIndex) }

    BackHandler { onBack() }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
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
        // Clears only the rolling staff history above — the live meter is untouched
        // and keeps tracking whatever the mic hears next.
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
            TextButton(onClick = { concertHistory.clear() }) {
                Text("Clear")
            }
        }

        // Always the tuner needle (TunerMeter) — the classic note-name circle
        // (PitchMeter) is still used by the Exercise screen and kept around here too
        // (unused) in case this ever needs to be user-choosable again, but Mic Setup
        // no longer offers a Display toggle for it.
        // The meter is the only detected-note readout below the staff — the large
        // note-name/Hz text that used to sit here was removed to make room for the
        // always-visible Pitch Detection controls, without this screen needing to
        // scroll. TunerMeter reads liveHz directly (not gated on note confirmation) so
        // it behaves like a real tuner — see TunerMeter's doc.
        TunerMeter(hz = liveHz, instrumentIndex = instrumentIndex, rootChroma = concertKeyChroma)
        Spacer(Modifier.height(16.dp))

        // Mic Sensitivity lives here rather than in Settings — this screen already
        // gives live feedback on what the mic hears, so it can be tuned by ear against
        // that feedback instead of blind. Always visible (no heading, no collapse)
        // since this is the screen's primary purpose. Note Stability and Mic Warmup
        // Frames moved into Advanced alongside the other detection-tuning controls —
        // Mic Sensitivity is the only one most people ever need to touch.
        SectionLabel("Mic Sensitivity", tooltipKey = "mic_sensitivity")
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
        TextButton(
            onClick = { advancedOpen = true },
            modifier = Modifier.align(Alignment.Start)
        ) {
            Text("Advanced")
        }
    }

    if (advancedOpen) {
        ModalBottomSheet(onDismissRequest = { advancedOpen = false }) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = 24.dp, vertical = 8.dp)
                    .padding(bottom = 24.dp)
            ) {
                Text(
                    "Advanced",
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold
                )
                Spacer(Modifier.height(16.dp))
            val stabilityOptions = listOf(2, 3, 4, 5)
            val warmupOptions = listOf(0, 1, 2, 3, 4, 5, 6)
            val graceFramesOptions = listOf(0, 1, 2, 3, 4, 5, 6)

            SectionLabel("Note Stability (frames to confirm)", tooltipKey = "note_stability")
            ChipRow(
                items = stabilityOptions.map { it.toString() },
                selected = stabilityOptions.indexOf(framesToConfirm).coerceAtLeast(0),
                onSelect = { viewModel.setFramesToConfirm(stabilityOptions[it]) }
            )

            Spacer(Modifier.height(8.dp))
            SectionLabel("Mic Warmup Frames", tooltipKey = "mic_warmup_frames")
            ChipRow(
                items = warmupOptions.map { it.toString() },
                selected = warmupOptions.indexOf(warmupFrames).coerceAtLeast(0),
                onSelect = { viewModel.setWarmupFrames(warmupOptions[it]) }
            )

            Spacer(Modifier.height(8.dp))
            SectionLabel("Grace Frames", tooltipKey = "grace_frames")
            ChipRow(
                items = graceFramesOptions.map { it.toString() },
                selected = graceFramesOptions.indexOf(graceFrames).coerceAtLeast(0),
                onSelect = { viewModel.setGraceFrames(graceFramesOptions[it]) }
            )

            Spacer(Modifier.height(8.dp))
            SettingSwitchRow(
                label = "Octave Correction",
                checked = octaveCorrection,
                tooltipKey = "octave_correction",
                onCheckedChange = { viewModel.setOctaveCorrection(it) }
            )

            Spacer(Modifier.height(8.dp))
            SectionLabel("YIN Threshold", tooltipKey = "yin_threshold")
            Text("%.2f".format(yinThreshold),
                fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(bottom = 4.dp))
            Slider(
                value = yinThreshold,
                onValueChange = { viewModel.setYinThreshold(it.coerceIn(0.05f, 0.30f)) },
                valueRange = 0.05f..0.30f,
                steps = 24,
                modifier = Modifier.fillMaxWidth()
            )

            Spacer(Modifier.height(8.dp))
            SectionLabel("Pitch Tolerance (cents)", tooltipKey = "pitch_tolerance_cents")
            Text("%.0f".format(pitchToleranceCents),
                fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(bottom = 4.dp))
            Slider(
                value = pitchToleranceCents,
                onValueChange = { viewModel.setPitchToleranceCents(it.coerceIn(50f, 150f)) },
                valueRange = 50f..150f,
                steps = 19,
                modifier = Modifier.fillMaxWidth()
            )
            }
        }
    }
}
