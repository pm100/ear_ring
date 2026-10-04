package com.jollygoodsw.earring

import android.content.Context
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.rules.ExternalResource

/**
 * Marks the first-run welcome flow as done before the Activity launches (issue #43), so a test
 * starts on Home with the tab bar instead of the welcome. Must run before the compose rule, i.e.
 * with a lower `order`.
 */
fun welcomeDoneRule(): ExternalResource = object : ExternalResource() {
    override fun before() {
        InstrumentationRegistry.getInstrumentation().targetContext
            .getSharedPreferences("ear_ring_settings", Context.MODE_PRIVATE)
            .edit().putBoolean("hasLaunched", true).commit()
    }
}
