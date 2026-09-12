package com.jollygoodsw.earring.ui.components

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
import com.jollygoodsw.earring.EarRingCore

@Composable
fun PitchMeter(
    detectedMidi: Int,      // -1 = no pitch, concert MIDI
    detectedHz: Float,      // for display accuracy; not required
    instrumentIndex: Int = 0,
    rootChroma: Int = 0,    // concert-pitch key chroma, for spelling the concert half
    modifier: Modifier = Modifier
) {
    val isDetecting = detectedMidi >= 0
    // "♪" (plain monochrome glyph, no emoji presentation — same family as the app's
    // ▶/■/↻ button glyphs), not a bare "—", so the idle state reads as "no note
    // detected yet" rather than a misplaced divider (fixed during the UI review,
    // issue #30).
    val label = if (isDetecting) EarRingCore.dualNoteLabel(detectedMidi, instrumentIndex, rootChroma) else "♪"
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
            fontSize = if (label.length > 5) 13.sp else if (label.length > 2) 16.sp else 20.sp,
            fontWeight = FontWeight.Bold,
            color = if (isDetecting) Color(0xFF212121) else Color(0xFFBDBDBD)
        )
    }
}
