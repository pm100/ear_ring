package com.earring.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.earring.MusicTheory

@Composable
fun PitchMeter(
    detectedMidi: Int,      // -1 = no pitch
    detectedHz: Float,      // for display accuracy; not required
    modifier: Modifier = Modifier
) {
    val isDetecting = detectedMidi >= 0
    val label = if (isDetecting) MusicTheory.midiToLabel(detectedMidi) else "—"
    val borderColor = if (isDetecting) Color(0xFF4CAF50) else Color(0xFFBDBDBD)

    Box(
        contentAlignment = Alignment.Center,
        modifier = modifier.size(90.dp)
    ) {
        Canvas(modifier = Modifier.size(90.dp)) {
            drawCircle(
                color = borderColor,
                radius = size.minDimension / 2f - 4f,
                style = Stroke(width = 4f)
            )
        }
        Text(
            text = label,
            fontSize = if (label.length > 2) 16.sp else 20.sp,
            fontWeight = FontWeight.Bold,
            color = if (isDetecting) Color(0xFF212121) else Color(0xFFBDBDBD)
        )
    }
}
