package com.jollygoodsw.earring

import android.app.Application
import android.content.Context
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

/**
 * How ExerciseViewModel stores and restores settings. The rules (defaults, clamping, instrument
 * snapping, ...) are unit-tested in Rust; here we check the Android side only persists and
 * renders what Rust returns: one JSON blob, restored across "restarts" (a new ViewModel over the
 * same SharedPreferences), tolerant of bad stored data.
 */
@RunWith(AndroidJUnit4::class)
class SettingsPersistenceTest {

    private val app: Application = ApplicationProvider.getApplicationContext()
    private val prefs get() = app.getSharedPreferences("ear_ring_settings", Context.MODE_PRIVATE)

    @Before fun clean() { prefs.edit().clear().commit() }
    @After fun cleanUp() { prefs.edit().clear().commit() }

    /** A fresh ViewModel over the same prefs stands in for an app restart. */
    private fun newViewModel() = ExerciseViewModel(app)

    @Test
    fun settings_persistAsOneNormalizedJsonBlob() {
        newViewModel().setTempoBpm(140)

        val blob = prefs.getString("settings", null)
        assertNotNull("settings must be stored as a single JSON string under \"settings\"", blob)
        assertEquals(140, JSONObject(blob!!).getInt("tempoBpm"))
        assertEquals("stored blob must already be Rust-normalized", EarRingCore.settingsNormalize(blob), blob)
    }

    @Test
    fun settings_surviveARestart() {
        val vm = newViewModel()
        vm.setTempoBpm(140)
        vm.setInstrumentIndex(8) // Soprano Voice

        val restored = newViewModel().state.value
        assertEquals(140, restored.tempoBpm)
        assertEquals(8, restored.instrumentIndex)
        assertEquals(80f, restored.pitchToleranceCents, 0f)
        assertTrue(restored.useTunerMeter)
    }

    @Test
    fun corruptStoredBlob_fallsBackToDefaultsWithoutCrashing() {
        prefs.edit().putString("settings", "{{ not json").commit()

        val state = newViewModel().state.value
        assertEquals(100, state.tempoBpm)
        assertEquals(60, state.rangeStart)
        assertEquals(72, state.rangeEnd)
    }

    @Test
    fun partialStoredBlob_fillsMissingFieldsFromDefaults() {
        prefs.edit().putString("settings", """{"tempoBpm":120}""").commit()

        val state = newViewModel().state.value
        assertEquals(120, state.tempoBpm)
        assertEquals(5, state.maxRetries)
        assertEquals(3, state.framesToConfirm)
    }

    @Test
    fun outOfRangeStoredValues_areClampedOnLoad() {
        prefs.edit().putString("settings", """{"tempoBpm":99999,"maxRetries":0}""").commit()

        val state = newViewModel().state.value
        assertEquals(300, state.tempoBpm)
        assertEquals(1, state.maxRetries)
    }

    @Test
    fun exerciseStartsWithMaxAttemptsMatchingTheStoredRetries() {
        prefs.edit().putString("settings", """{"maxRetries":8}""").commit()
        assertEquals(8, newViewModel().state.value.maxAttempts)
    }

    // ── Reset ────────────────────────────────────────────────────────────────

    @Test
    fun reset_restoresDefaultsAndPersistsThem() {
        val vm = newViewModel()
        vm.setTempoBpm(140)
        vm.setInstrumentIndex(8)
        vm.resetSettings()

        assertEquals(100, vm.state.value.tempoBpm)
        assertEquals(0, vm.state.value.instrumentIndex)
        assertEquals(100, newViewModel().state.value.tempoBpm)
    }

    @Test
    fun reset_doesNotClearTheFirstLaunchFlag() {
        val vm = newViewModel()
        assertTrue(vm.consumeFirstLaunch())
        vm.resetSettings()
        assertFalse("reset must not make the next navigation redirect to Help", vm.consumeFirstLaunch())
    }

    @Test
    fun reset_keepsThePremiumEntitlement() {
        val vm = newViewModel()
        vm.setPremium(true)
        vm.resetSettings()
        assertTrue(vm.state.value.isPremium)
        assertTrue(newViewModel().state.value.isPremium)
    }

    // ── Rules that now live in Rust, exercised through the ViewModel ──────────

    @Test
    fun setRootNote_rederivesTheDefaultRange() {
        val vm = newViewModel()
        vm.setRootNote(5)
        assertEquals(5, vm.state.value.rootNote)
        assertEquals(65, vm.state.value.rangeStart)
        assertEquals(77, vm.state.value.rangeEnd)
    }

    @Test
    fun setRange_enforcesTheOneOctaveMinimum() {
        val vm = newViewModel()
        vm.setRange(60, 62)
        assertEquals(50, vm.state.value.rangeStart)
        assertEquals(62, vm.state.value.rangeEnd)
    }

    @Test
    fun setTestType_diatonicForcesASequenceLengthOfThree() {
        val vm = newViewModel()
        vm.setSequenceLength(4)
        vm.setTestType(2)
        assertEquals(3, vm.state.value.sequenceLength)
    }
}
