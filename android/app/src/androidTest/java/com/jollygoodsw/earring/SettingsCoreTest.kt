package com.jollygoodsw.earring

import androidx.test.ext.junit.runners.AndroidJUnit4
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

/**
 * The JNI bridge to the Rust settings model. The rules themselves are unit-tested in Rust
 * (rust/src/settings.rs); these check that the Android bridge is wired end to end and that the
 * JSON Kotlin receives has the shape the app decodes.
 */
@RunWith(AndroidJUnit4::class)
class SettingsCoreTest {

    @Test
    fun defaults_haveTheAndroidValuesAndTheShapeTheAppDecodes() {
        val d = JSONObject(EarRingCore.settingsDefaults())
        assertEquals(24, d.length())
        assertEquals(100, d.getInt("tempoBpm"))
        assertEquals(3, d.getInt("framesToConfirm"))   // Android keeps 3 (iOS overrides to 2)
        assertEquals(60, d.getInt("rangeStart"))
        assertEquals(72, d.getInt("rangeEnd"))
        assertEquals(50.0, d.getDouble("pitchToleranceCents"), 0.0)
        assertEquals(800, d.getLong("postChordGapMs"))
    }

    @Test
    fun normalize_repairsStoredJsonAndTreatsNullAsEmpty() {
        assertEquals(EarRingCore.settingsDefaults(), EarRingCore.settingsNormalize(null))
        assertEquals(EarRingCore.settingsDefaults(), EarRingCore.settingsNormalize("garbage"))
        assertEquals(300, JSONObject(EarRingCore.settingsNormalize("""{"tempoBpm":99999}""")).getInt("tempoBpm"))
    }

    @Test
    fun apply_setInstrumentSnapsDetectionTuningToTheInstrumentTable() {
        val voice = JSONObject(
            EarRingCore.settingsApply(EarRingCore.settingsDefaults(), """{"type":"setInstrument","value":8}""")
        )
        assertEquals(8, voice.getInt("instrumentIndex"))
        assertEquals(80.0, voice.getDouble("pitchToleranceCents"), 0.0)
        assertTrue(voice.getBoolean("useTunerMeter"))
    }

    @Test
    fun apply_resetReturnsTheDefaultsWhateverTheCurrentSettings() {
        val customised = EarRingCore.settingsApply(
            EarRingCore.settingsDefaults(), """{"type":"set","values":{"tempoBpm":140}}"""
        )
        assertEquals(140, JSONObject(customised).getInt("tempoBpm"))
        assertEquals(EarRingCore.settingsDefaults(), EarRingCore.settingsApply(customised, """{"type":"reset"}"""))
    }
}
