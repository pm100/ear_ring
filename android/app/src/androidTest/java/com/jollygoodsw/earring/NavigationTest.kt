package com.jollygoodsw.earring

import android.Manifest
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onFirst
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.rule.GrantPermissionRule
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Functional (instrumented) tests: boots the real app on an emulator/device and drives the
 * actual Compose UI, unlike the Rust core's unit tests which never touch a screen.
 *
 * Verifies each bottom-nav tab reaches a screen with its expected distinguishing content.
 *
 * Tab selectors use the visible text label ("Home", "Mic", ...), not the icon's
 * contentDescription — Material3's NavigationBarItem merges the icon + label into one
 * semantics node, and the icon's contentDescription isn't reliably queryable on the merged
 * tree (onNodeWithContentDescription("Home") found nothing on a real device, even with mic
 * permission pre-granted and correctly ordered). The label Text is a direct, reliable target.
 */
@RunWith(AndroidJUnit4::class)
class NavigationTest {

    // Pre-grant mic permission so the system permission dialog (outside the Compose
    // hierarchy, requested from MainActivity.onCreate) never blocks a test. Explicit
    // `order` matters here: without it JUnit doesn't guarantee this runs — and the
    // permission is granted — before composeRule launches the Activity.
    @get:Rule(order = 0)
    val permissionRule: GrantPermissionRule = GrantPermissionRule.grant(Manifest.permission.RECORD_AUDIO)

    @get:Rule(order = 1)
    val composeRule = createAndroidComposeRule<MainActivity>()

    /** First launch redirects to Help (see EarRingApp's consumeFirstLaunch effect) —
     *  always start from a known screen rather than assume where launch landed. */
    private fun goHome() {
        composeRule.onNodeWithText("Home").performClick()
        composeRule.onNodeWithText("Ear Ring").assertIsDisplayed()
    }

    @Test
    fun homeScreen_showsDefaultState() {
        goHome()
        composeRule.onNodeWithText("▶ Start Exercise").assertIsDisplayed()
    }

    @Test
    fun micTab_showsMicSetup() {
        goHome()
        composeRule.onNodeWithText("Mic").performClick()
        composeRule.onNodeWithText("Mic Setup").assertIsDisplayed()
        composeRule.onNodeWithText("Play a note to test your microphone.").assertIsDisplayed()
    }

    @Test
    fun progressTab_showsSessionHistory() {
        goHome()
        composeRule.onNodeWithText("Progress").performClick()
        composeRule.onNodeWithText("recorded tests", substring = true).assertIsDisplayed()
    }

    @Test
    fun settingsTab_showsResetButton() {
        goHome()
        composeRule.onNodeWithText("Settings").performClick()
        // "Instrument" appears twice (section header + field label) so it's not a safe
        // single-node selector — "Reset to Defaults" is unique and just as diagnostic.
        // It's below the fold on a real device (Settings is a long scrolling list), so
        // scroll to it before asserting — it exists either way, but isn't on-screen yet.
        composeRule.onNodeWithText("Reset to Defaults").performScrollTo().assertIsDisplayed()
    }

    @Test
    fun helpTab_showsGettingStarted() {
        goHome()
        composeRule.onNodeWithText("Help").performClick()
        composeRule.onAllNodesWithText("Getting Started", substring = true).onFirst().assertIsDisplayed()
    }
}
