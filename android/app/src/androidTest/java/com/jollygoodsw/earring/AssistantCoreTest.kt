package com.jollygoodsw.earring

import android.app.Application
import android.content.Context
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.json.JSONArray
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

/**
 * The setup assistant on Android: the JNI bridge to the Rust core, the parsing of what it
 * returns, and how a confirmed proposal reaches the settings. The rules themselves (validation,
 * status handling) are unit-tested in Rust; the network call is not exercised here.
 */
@RunWith(AndroidJUnit4::class)
class AssistantCoreTest {

    private val app: Application = ApplicationProvider.getApplicationContext()
    private val settingsPrefs get() = app.getSharedPreferences("ear_ring_settings", Context.MODE_PRIVATE)
    private val assistantPrefs get() = app.getSharedPreferences("ear_ring_assistant", Context.MODE_PRIVATE)

    @Before fun clean() { settingsPrefs.edit().clear().commit(); assistantPrefs.edit().clear().commit() }
    @After fun cleanUp() { settingsPrefs.edit().clear().commit(); assistantPrefs.edit().clear().commit() }

    private val defaults get() = EarRingCore.settingsDefaults()

    @Test
    fun endpoint_isAnHttpsAskUrl() {
        val url = EarRingCore.assistantEndpoint()
        assertTrue(url, url.startsWith("https://") && url.endsWith("/v1/ask"))
    }

    @Test
    fun request_carriesTheAndroidPlatformTheHistoryAndThePremiumFlag() {
        val history = JSONArray().put(JSONObject().put("role", "user").put("text", "hello")).toString()
        val body = JSONObject(EarRingCore.assistantRequest(history, defaults, isPremium = true))
        assertEquals("hello", body.getJSONArray("messages").getJSONObject(0).getString("text"))
        assertEquals("android", body.getJSONObject("context").getString("platform"))
        assertTrue(body.getJSONObject("context").getBoolean("premium"))
    }

    @Test
    fun outcomeZero_isAnOfflineError() {
        val view = AssistantClient.parseView(EarRingCore.assistantResolveOutcome(0, "", defaults, false))
        assertTrue(view.isError)
        assertTrue(view.reply.isNotEmpty())
        assertNull(view.card)
    }

    @Test
    fun outcome429_isAnErrorThatKeepsTheQuota() {
        val body = """{"error":"quota_exceeded","quota":{"remaining":0,"resetsAt":"2026-10-02T00:00:00Z"}}"""
        val view = AssistantClient.parseView(EarRingCore.assistantResolveOutcome(429, body, defaults, false))
        assertTrue(view.isError)
        assertEquals(0, view.remaining)
    }

    @Test
    fun outcome200_withAProposal_givesAValidatedCard() {
        val body = """{"reply":"More tries.","proposal":[{"setting":"noteRetries","value":5}],"feedbackSent":false,"quota":{"remaining":4,"resetsAt":"x"}}"""
        val view = AssistantClient.parseView(EarRingCore.assistantResolveOutcome(200, body, defaults, false))
        assertFalse(view.isError)
        assertEquals("More tries.", view.reply)
        assertEquals(4, view.remaining)
        val item = view.card!!.items.single()
        assertEquals("Retry Same Note", item.label)
        assertEquals("2", item.from)
        assertEquals("5", item.to)
    }

    @Test
    fun anUnusableProposalNeverProducesACard() {
        val body = """{"reply":"","proposal":[{"setting":"theme","value":"dark"}]}"""
        val view = AssistantClient.parseView(EarRingCore.assistantResolveOutcome(200, body, defaults, false))
        assertNull(view.card)
        assertNull(view.proposal)
    }

    @Test
    fun parseView_survivesGarbage() {
        val view = AssistantClient.parseView("not json")
        assertTrue(view.isError)
        assertTrue(view.reply.isNotEmpty())
    }

    @Test
    fun applyingACardChangesTheSettings() {
        val vm = ExerciseViewModel(app)
        val proposal = JSONArray().put(JSONObject().put("setting", "noteRetries").put("value", 5))
        val card = AssistantClient.resolveProposal(proposal, vm.settingsSnapshot(), vm.state.value.isPremium)
        vm.applyAssistantActions(card.items.map { it.action })
        assertEquals(5, vm.state.value.noteRetries)
        assertEquals(5, JSONObject(vm.settingsSnapshot()).getInt("noteRetries"))
    }

    @Test
    fun aStaleProposalIsRevalidatedAgainstTheCurrentSettings() {
        val vm = ExerciseViewModel(app)
        val proposal = JSONArray().put(JSONObject().put("setting", "noteRetries").put("value", 5))
        vm.setNoteRetries(5) // the user got there by hand before tapping Apply
        val card = AssistantClient.resolveProposal(proposal, vm.settingsSnapshot(), vm.state.value.isPremium)
        assertTrue(card.items.isEmpty())
    }

    @Test
    fun installId_isCreatedOnceAndThenKept() {
        val first = AssistantClient.installId(app)
        assertEquals(first, AssistantClient.installId(app))
        assertEquals(36, first.length)
    }
}
