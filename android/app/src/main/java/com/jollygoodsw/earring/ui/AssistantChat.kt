package com.jollygoodsw.earring.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.jollygoodsw.earring.AssistantCard
import com.jollygoodsw.earring.AssistantClient
import com.jollygoodsw.earring.AssistantTurn
import com.jollygoodsw.earring.ExerciseViewModel
import kotlinx.coroutines.launch
import org.json.JSONArray

private const val MAX_INPUT_CHARS = 500

private enum class CardState { PENDING, APPLIED, DISMISSED }

private data class ChatEntry(
    val id: Int,
    val role: String,
    val text: String,
    val card: AssistantCard? = null,
    val proposal: JSONArray? = null,
    val cardState: CardState? = null,
    val appliedCount: Int = 0,
    val feedbackSent: Boolean = false,
    val isError: Boolean = false,
)

/**
 * "Ask about setup" chat at the top of Help. The transcript lives only in this composable, so it
 * is discarded when the user leaves the screen. Nothing changes until Apply is tapped.
 */
@Composable
fun AssistantChat(viewModel: ExerciseViewModel) {
    val context = LocalContext.current
    val state by viewModel.state.collectAsState()
    val scope = rememberCoroutineScope()
    var entries by remember { mutableStateOf(listOf<ChatEntry>()) }
    var input by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var remaining by remember { mutableStateOf<Int?>(null) }
    var nextId by remember { mutableStateOf(1) }

    fun ask(transcript: List<ChatEntry>) {
        busy = true
        val history = transcript.filter { !it.isError }.map { AssistantTurn(it.role, it.text) }
        val settings = viewModel.settingsSnapshot()
        val premium = state.isPremium
        scope.launch {
            val view = AssistantClient.ask(context, history, settings, premium)
            view.remaining?.let { remaining = it }
            entries = transcript + ChatEntry(
                id = nextId++,
                role = "assistant",
                text = view.reply,
                card = view.card,
                proposal = view.proposal,
                cardState = if (view.card != null) CardState.PENDING else null,
                feedbackSent = view.feedbackSent,
                isError = view.isError,
            )
            busy = false
        }
    }

    fun send() {
        val text = input.trim()
        if (text.isEmpty() || busy) return
        input = ""
        ask(entries + ChatEntry(id = nextId++, role = "user", text = text))
    }

    fun apply(entry: ChatEntry) {
        val proposal = entry.proposal ?: return
        val card = AssistantClient.resolveProposal(proposal, viewModel.settingsSnapshot(), state.isPremium)
        viewModel.applyAssistantActions(card.items.map { it.action })
        entries = entries.map {
            if (it.id == entry.id) it.copy(cardState = CardState.APPLIED, appliedCount = card.items.size) else it
        }
    }

    fun dismiss(entry: ChatEntry) {
        entries = entries.map { if (it.id == entry.id) it.copy(cardState = CardState.DISMISSED) else it }
    }

    Column(modifier = Modifier.fillMaxWidth()) {
        Text(
            "Ask about setup", fontSize = 16.sp, fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.primary,
            modifier = Modifier.padding(top = 16.dp, bottom = 8.dp),
        )
        Text(
            "Describe what you want, e.g. “I want a chance to correct a wrong note”. " +
                "Your question and current settings are sent to a server to get an answer.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(8.dp))

        entries.forEach { entry ->
            ChatBubble(entry, onApply = { apply(entry) }, onDismiss = { dismiss(entry) })
            Spacer(Modifier.height(8.dp))
        }

        if (entries.lastOrNull()?.isError == true && !busy) {
            OutlinedButton(onClick = { ask(entries.filter { !it.isError }) }) { Text("Try again") }
            Spacer(Modifier.height(8.dp))
        }
        if (busy) {
            Text("Thinking…", style = MaterialTheme.typography.bodySmall)
            Spacer(Modifier.height(8.dp))
        }

        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedTextField(
                value = input,
                onValueChange = { if (it.length <= MAX_INPUT_CHARS) input = it },
                modifier = Modifier.weight(1f),
                placeholder = { Text("Ask how to set something up") },
                singleLine = true,
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Send),
                keyboardActions = KeyboardActions(onSend = { send() }),
            )
            Button(onClick = { send() }, enabled = !busy && input.isNotBlank()) { Text("Send") }
        }
        remaining?.let {
            Text(
                "$it question${if (it == 1) "" else "s"} left today",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 4.dp),
            )
        }
    }
}

@Composable
private fun ChatBubble(entry: ChatEntry, onApply: () -> Unit, onDismiss: () -> Unit) {
    val fromUser = entry.role == "user"
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = if (fromUser) Arrangement.End else Arrangement.Start,
    ) {
        Surface(
            shape = RoundedCornerShape(12.dp),
            color = when {
                fromUser -> MaterialTheme.colorScheme.primary
                entry.isError -> MaterialTheme.colorScheme.errorContainer
                else -> MaterialTheme.colorScheme.secondaryContainer
            },
            contentColor = when {
                fromUser -> MaterialTheme.colorScheme.onPrimary
                entry.isError -> MaterialTheme.colorScheme.onErrorContainer
                else -> MaterialTheme.colorScheme.onSecondaryContainer
            },
            modifier = Modifier.widthIn(max = 320.dp),
        ) {
            Column(modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp)) {
                Text(entry.text, style = MaterialTheme.typography.bodyMedium)
                val card = entry.card
                if (card != null && entry.cardState == CardState.PENDING) {
                    Spacer(Modifier.height(8.dp))
                    Surface(shape = RoundedCornerShape(8.dp), color = MaterialTheme.colorScheme.surface) {
                        Column(modifier = Modifier.padding(8.dp)) {
                            card.items.forEach {
                                Text("${it.label}: ${it.from} → ${it.to}", style = MaterialTheme.typography.bodyMedium,
                                    color = MaterialTheme.colorScheme.onSurface)
                            }
                            card.rejected.forEach { (key, reason) ->
                                Text("Skipped $key: $reason", style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                            Spacer(Modifier.height(8.dp))
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                Button(onClick = onApply) { Text("Apply") }
                                OutlinedButton(onClick = onDismiss) { Text("Not now") }
                            }
                        }
                    }
                }
                when (entry.cardState) {
                    CardState.APPLIED -> Text(
                        if (entry.appliedCount > 0) "Applied. You can review it in Settings." else "Already up to date.",
                        style = MaterialTheme.typography.bodySmall,
                    )
                    CardState.DISMISSED -> Text("No changes made.", style = MaterialTheme.typography.bodySmall)
                    else -> {}
                }
                if (entry.feedbackSent) {
                    Text("Sent as feedback, thanks.", style = MaterialTheme.typography.bodySmall)
                }
            }
        }
    }
}
