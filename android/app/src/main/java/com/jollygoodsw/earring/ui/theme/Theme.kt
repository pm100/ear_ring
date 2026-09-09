package com.jollygoodsw.earring.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val IndigoLight = Color(0xFF3F51B5)
private val PurpleLight = Color(0xFF7C4DFF)
private val IndigoDark = Color(0xFF9FA8DA)
// Light tonal tint of the app's actual primary (Indigo 50), for tonal-filled
// buttons like Exercise's Repeat — explicitly set for the same reason as
// error/onError above: M3's unset-default primaryContainer is its own baseline
// purple tone, unrelated to our indigo primary, not a tint derived from it.
private val IndigoContainerLight = Color(0xFFE8EAF6)
// The app's one actual "danger" red, used everywhere else (iOS's erError, desktop's
// .btn-danger, incorrect-note text) — explicitly set here so MaterialTheme.colorScheme.error
// matches it instead of falling back to M3's unrelated default error palette, which every
// "danger" button on Android was silently using instead (issue #30).
private val DangerRed = Color(0xFFF44336)

private val LightColorScheme = lightColorScheme(
    primary = IndigoLight,
    secondary = PurpleLight,
    tertiary = Color(0xFF009688),
    background = Color(0xFFF5F5F5),
    surface = Color(0xFFFFFFFF),
    onPrimary = Color.White,
    onSecondary = Color.White,
    onBackground = Color(0xFF1C1B1F),
    onSurface = Color(0xFF1C1B1F),
    primaryContainer = IndigoContainerLight,
    onPrimaryContainer = IndigoLight,
    error = DangerRed,
    onError = Color.White,
)

@Composable
fun EarRingTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = LightColorScheme,
        content = content
    )
}
