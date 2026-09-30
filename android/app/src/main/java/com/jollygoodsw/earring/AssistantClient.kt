package com.jollygoodsw.earring

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONException
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.util.UUID

data class AssistantTurn(val role: String, val text: String)

data class AssistantItem(val key: String, val label: String, val from: String, val to: String, val action: JSONObject)

data class AssistantCard(val items: List<AssistantItem>, val rejected: List<Pair<String, String>>)

/** What the chat shows for one round trip: the Rust core's `resolve_outcome_json`, parsed. */
data class AssistantView(
    val reply: String,
    val card: AssistantCard?,
    /** Kept so the proposal can be re-validated against current settings when Apply is tapped. */
    val proposal: JSONArray?,
    val feedbackSent: Boolean,
    val remaining: Int?,
    val isError: Boolean,
)

/**
 * The setup assistant's network round trip. The rules (request body, HTTP status handling,
 * which proposed changes are valid) live in the Rust core (rust/src/assistant.rs); this only
 * moves strings between Rust and the proxy.
 */
object AssistantClient {
    private const val PREFS = "ear_ring_assistant"
    private const val KEY_INSTALL_ID = "install_id"
    private const val CONNECT_TIMEOUT_MS = 10_000
    private const val READ_TIMEOUT_MS = 30_000
    private const val FALLBACK_ERROR = "Something went wrong. Please try again."

    /** A random id, created on first use, that lets the proxy count questions per install. */
    fun installId(context: Context): String {
        val prefs = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        prefs.getString(KEY_INSTALL_ID, null)?.let { return it }
        val created = UUID.randomUUID().toString()
        prefs.edit().putString(KEY_INSTALL_ID, created).apply()
        return created
    }

    /** Sends the conversation to the proxy and returns what to show. Never throws. */
    suspend fun ask(
        context: Context,
        history: List<AssistantTurn>,
        settingsJson: String,
        isPremium: Boolean,
    ): AssistantView = withContext(Dispatchers.IO) {
        var status = 0 // the core reads 0 as "couldn't reach the assistant"
        var body = ""
        try {
            val historyJson = JSONArray().also { array ->
                history.forEach { array.put(JSONObject().put("role", it.role).put("text", it.text)) }
            }
            val requestBody = EarRingCore.assistantRequest(historyJson.toString(), settingsJson, isPremium)
            val (code, text) = post(EarRingCore.assistantEndpoint(), installId(context), requestBody)
            status = code
            body = text
        } catch (e: IOException) {
            status = 0
        }
        parseView(EarRingCore.assistantResolveOutcome(status, body, settingsJson, isPremium))
    }

    private fun post(url: String, installId: String, body: String): Pair<Int, String> {
        val connection = URL(url).openConnection() as HttpURLConnection
        try {
            connection.requestMethod = "POST"
            connection.connectTimeout = CONNECT_TIMEOUT_MS
            connection.readTimeout = READ_TIMEOUT_MS
            connection.doOutput = true
            connection.setRequestProperty("Content-Type", "application/json")
            connection.setRequestProperty("X-Install-Id", installId)
            connection.setRequestProperty("X-Client", "android")
            connection.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
            val status = connection.responseCode
            val stream = if (status in 200..299) connection.inputStream else connection.errorStream
            val text = stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() } ?: ""
            return status to text
        } finally {
            connection.disconnect()
        }
    }

    /** Re-validates [proposal] against the settings as they are now (they may have changed
     *  since it was proposed). Its items' actions are what to dispatch, in order. */
    fun resolveProposal(proposal: JSONArray, settingsJson: String, isPremium: Boolean): AssistantCard =
        parseCard(JSONObject(EarRingCore.assistantResolveProposal(proposal.toString(), settingsJson, isPremium)))

    fun parseView(json: String): AssistantView = try {
        val o = JSONObject(json)
        AssistantView(
            reply = o.optString("reply", FALLBACK_ERROR),
            card = o.optJSONObject("card")?.let { parseCard(it) },
            proposal = o.optJSONArray("proposal"),
            feedbackSent = o.optBoolean("feedbackSent", false),
            remaining = o.optJSONObject("quota")?.optInt("remaining"),
            isError = o.optBoolean("isError", false),
        )
    } catch (e: JSONException) {
        AssistantView(FALLBACK_ERROR, null, null, false, null, isError = true)
    }

    fun parseCard(o: JSONObject): AssistantCard {
        val items = o.optJSONArray("items") ?: JSONArray()
        val rejected = o.optJSONArray("rejected") ?: JSONArray()
        return AssistantCard(
            items = (0 until items.length()).map { i ->
                val item = items.getJSONObject(i)
                AssistantItem(
                    key = item.getString("key"),
                    label = item.getString("label"),
                    from = item.getString("from"),
                    to = item.getString("to"),
                    action = item.getJSONObject("action"),
                )
            },
            rejected = (0 until rejected.length()).map { i ->
                val r = rejected.getJSONObject(i)
                r.getString("key") to r.getString("reason")
            },
        )
    }
}
