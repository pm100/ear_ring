package com.jollygoodsw.earring

import android.Manifest
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.rule.GrantPermissionRule
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Drives a real exercise session end to end: Start Exercise from Home, confirm the Exercise
 * screen is actually showing live session state, then exit via the on-screen "Stop Testing"
 * button (added because back-navigation alone wasn't discoverable — see AGENTS.md) and confirm
 * it lands back on Home rather than leaving the session running or crashing.
 */
@RunWith(AndroidJUnit4::class)
class ExerciseFlowTest {

    // Explicit `order` matters: without it JUnit doesn't guarantee the mic permission
    // is granted before composeRule launches the Activity (see NavigationTest for why
    // that matters — an ungranted permission shows a system dialog outside Compose).
    @get:Rule(order = 0)
    val permissionRule: GrantPermissionRule = GrantPermissionRule.grant(Manifest.permission.RECORD_AUDIO)

    @get:Rule(order = 1)
    val composeRule = createAndroidComposeRule<MainActivity>()

    @Test
    fun startExercise_thenStopTesting_returnsHome() {
        composeRule.onNodeWithText("Home").performClick()
        composeRule.onNodeWithText("▶ Start Exercise").assertIsDisplayed()

        composeRule.onNodeWithText("▶ Start Exercise").performClick()

        // Session setup (sequence generation, intro chord) runs off the Compose recomposition
        // clock, so wait for real state rather than assuming the first frame after the click
        // already reflects it.
        composeRule.waitUntil(timeoutMillis = 8_000) {
            composeRule.onAllNodesWithText("Attempt", substring = true).fetchSemanticsNodes().isNotEmpty()
        }
        composeRule.onNodeWithText("⏹ Stop Testing").assertIsDisplayed()

        composeRule.onNodeWithText("⏹ Stop Testing").performClick()

        // Back on Home, and the exercise screen's controls are gone.
        composeRule.onNodeWithText("▶ Start Exercise").assertIsDisplayed()
        composeRule.onAllNodesWithText("⏹ Stop Testing").assertCountEquals(0)
    }
}
