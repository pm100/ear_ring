package com.earring.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val IndigoLight = Color(0xFF3F51B5)
private val PurpleLight = Color(0xFF7C4DFF)
private val IndigoDark = Color(0xFF9FA8DA)

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
)

@Composable
fun EarRingTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = LightColorScheme,
        content = content
    )
}
