package com.jollygoodsw.earring.ui

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import com.jollygoodsw.earring.EarRingCore
import com.jollygoodsw.earring.ExerciseViewModel
import com.jollygoodsw.earring.MusicTheory
import com.jollygoodsw.earring.R
import kotlinx.coroutines.delay
import org.json.JSONArray

private data class WelcomeStep(
    val id: String,
    val title: String,
    val body: String,
    val primaryLabel: String,
    val hint: String,
    val success: String,
    val exitLabel: String,
)

private fun parseWelcomeSteps(json: String): List<WelcomeStep> = try {
    val arr = JSONArray(json)
    (0 until arr.length()).map { i ->
        val o = arr.getJSONObject(i)
        WelcomeStep(
            o.getString("id"), o.getString("title"), o.getString("body"),
            o.getString("primaryLabel"), o.optString("hint"), o.optString("success"),
            o.optString("exitLabel"),
        )
    }
} catch (_: Exception) {
    emptyList()
}

/** First-run welcome flow (issue #43). Step text comes from the Rust core. */
@Composable
fun WelcomeScreen(viewModel: ExerciseViewModel, onFinished: () -> Unit) {
    val steps = remember { parseWelcomeSteps(EarRingCore.onboardingSteps()) }
    var index by rememberSaveable { mutableIntStateOf(0) }
    if (steps.isEmpty()) {
        LaunchedEffect(Unit) { onFinished() }
        return
    }
    val step = steps[index.coerceIn(0, steps.lastIndex)]
    val isMic = step.id == "mic"
    val isWelcome = index == 0
    var micHeard by rememberSaveable { mutableStateOf(false) }

    fun next() {
        if (index >= steps.lastIndex) onFinished() else index++
    }

    BackHandler(enabled = index > 0) { index-- }

    // Swipe left for Next, right for Back; inner controls (the sensitivity slider) consume their own drags.
    val swipePx = with(LocalDensity.current) { 80.dp.toPx() }
    val canNext = index < steps.lastIndex && (!isMic || micHeard)

    // Skip on top and the nav pinned at the bottom (same place on every step); the content between
    // them scrolls, except on the mic step, which embeds the real Mic Setup screen (it scrolls itself).
    Column(
        modifier = Modifier
            .fillMaxSize()
            .pointerInput(index, canNext) {
                var total = 0f
                detectHorizontalDragGestures(
                    onDragStart = { total = 0f },
                    onDragCancel = { total = 0f },
                    onDragEnd = {
                        if (total < -swipePx && canNext) next()
                        else if (total > swipePx && index > 0) index--
                    }
                ) { _, delta -> total += delta }
            }
            .padding(horizontal = 24.dp, vertical = 16.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Box(modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp), contentAlignment = Alignment.CenterEnd) {
            if (step.exitLabel.isNotEmpty()) {
                TextButton(onClick = onFinished) { Text(step.exitLabel) }
            }
        }
        Column(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth()
                .then(if (isMic) Modifier else Modifier.verticalScroll(rememberScrollState())),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
        if (isWelcome) {
            Spacer(Modifier.height(16.dp))
            Image(
                painter = painterResource(R.mipmap.ic_launcher),
                contentDescription = "Ear Ring icon",
                modifier = Modifier.size(96.dp).clip(RoundedCornerShape(20.dp))
            )
            Spacer(Modifier.height(24.dp))
        } else {
            Spacer(Modifier.height(12.dp))
        }
        Text(
            step.title,
            style = MaterialTheme.typography.headlineSmall,
            fontWeight = FontWeight.Bold,
            textAlign = TextAlign.Center
        )
        Spacer(Modifier.height(12.dp))
        step.body.split("\n\n").forEachIndexed { i, para ->
            if (i > 0) Spacer(Modifier.height(8.dp))
            Text(
                para.trim(),
                style = if (isMic) MaterialTheme.typography.bodyMedium else MaterialTheme.typography.bodyLarge,
                textAlign = TextAlign.Center
            )
        }
        Spacer(Modifier.height(12.dp))

        if (step.id == "instrument") {
            InstrumentChoice(viewModel)
            Spacer(Modifier.height(12.dp))
        }

        if (isMic) {
            MicCheck(viewModel, step, heard = micHeard, onHeard = { micHeard = true }, modifier = Modifier.weight(1f))
        }
        }

        Spacer(Modifier.height(8.dp))
        Box(modifier = Modifier.fillMaxWidth().height(56.dp), contentAlignment = Alignment.Center) {
            if (isWelcome) {
                Button(onClick = { next() }, modifier = Modifier.fillMaxWidth()) { Text(step.primaryLabel) }
            } else {
                NavRow(
                    dots = steps.size - 1,
                    current = index - 1,
                    nextLabel = step.primaryLabel,
                    nextEnabled = !isMic || micHeard,
                    onBack = { index-- },
                    onNext = { next() }
                )
            }
        }
    }
}

/** Back (left), progress dots (centre), Next (right); the dots cover every step after Welcome. */
@Composable
private fun NavRow(
    dots: Int,
    current: Int,
    nextLabel: String,
    nextEnabled: Boolean,
    onBack: () -> Unit,
    onNext: () -> Unit
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(modifier = Modifier.weight(1f), contentAlignment = Alignment.CenterStart) {
            TextButton(onClick = onBack) { Text("Back") }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            repeat(dots) { i ->
                Box(
                    modifier = Modifier
                        .size(10.dp)
                        .clip(CircleShape)
                        .background(
                            if (i == current) MaterialTheme.colorScheme.primary
                            else MaterialTheme.colorScheme.outlineVariant
                        )
                )
            }
        }
        Box(modifier = Modifier.weight(1f), contentAlignment = Alignment.CenterEnd) {
            TextButton(onClick = onNext, enabled = nextEnabled) {
                Text(nextLabel, fontWeight = FontWeight.Bold)
            }
        }
    }
}

@Composable
@OptIn(ExperimentalMaterial3Api::class)
private fun InstrumentChoice(viewModel: ExerciseViewModel) {
    val state by viewModel.state.collectAsState()
    val all = remember {
        try {
            val arr = JSONArray(EarRingCore.instrumentList())
            List(arr.length()) { i ->
                val inst = arr.getJSONObject(i)
                Triple(inst.getInt("id"), inst.getString("name"), inst.optBoolean("premium", false))
            }
        } catch (_: Exception) { listOf(Triple(0, "Piano", false)) }
    }
    val selectable = all.filter { (_, _, premium) -> !premium || state.isPremium }
    val currentName = all.firstOrNull { it.first == state.instrumentIndex }?.second ?: "Piano"
    var expanded by remember { mutableStateOf(false) }

    ExposedDropdownMenuBox(expanded = expanded, onExpandedChange = { expanded = !expanded }) {
        OutlinedTextField(
            value = currentName,
            onValueChange = {},
            readOnly = true,
            singleLine = true,
            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded) },
            modifier = Modifier.menuAnchor().fillMaxWidth()
        )
        ExposedDropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            selectable.forEach { (id, name, _) ->
                DropdownMenuItem(
                    text = { Text(name) },
                    onClick = { viewModel.setInstrumentIndex(id); expanded = false }
                )
            }
        }
    }
    Spacer(Modifier.height(8.dp))
    // Concert pitch, the same as the Range on Home.
    val low = MusicTheory.midiToLabel(state.rangeStart)
    val high = MusicTheory.midiToLabel(state.rangeEnd)
    Text(
        "Range: $low to $high",
        style = MaterialTheme.typography.bodyMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant
    )
}

/** Asks for the mic, then shows the real Mic Setup screen (staff, tuner meter, sensitivity). */
@Composable
private fun MicCheck(
    viewModel: ExerciseViewModel,
    step: WelcomeStep,
    heard: Boolean,
    onHeard: () -> Unit,
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    var granted by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) ==
                PackageManager.PERMISSION_GRANTED
        )
    }
    var denied by remember { mutableStateOf(false) }
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { ok ->
        granted = ok
        denied = !ok
    }
    // The system prompt appears only now, after the previous step has warned about it.
    LaunchedEffect(Unit) {
        if (!granted) launcher.launch(Manifest.permission.RECORD_AUDIO)
    }

    var showHint by remember { mutableStateOf(false) }
    LaunchedEffect(heard) {
        if (!heard) {
            delay(10_000)
            showHint = true
        }
    }

    Column(modifier = modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
        if (denied) {
            Text(
                "Microphone access was not allowed. You can turn it on in your device's Settings under Apps, Ear Ring, Permissions. Then replay the welcome from the Help tab, or tap Skip setup to carry on without it.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.error,
                textAlign = TextAlign.Center
            )
        } else if (granted) {
            Box(modifier = Modifier.weight(1f)) {
                SetupScreenForState(viewModel = viewModel, onBack = {}, embedded = true, onNoteHeard = onHeard)
            }
            when {
                heard -> Text(
                    "✓ " + step.success,
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold,
                    color = MaterialTheme.colorScheme.primary,
                    textAlign = TextAlign.Center
                )
                showHint -> Text(step.hint, style = MaterialTheme.typography.bodyMedium, textAlign = TextAlign.Center)
            }
        }
    }
}
