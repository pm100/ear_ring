package com.earring.ui.components

import android.graphics.BitmapFactory
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import com.earring.EarRingCore
import com.earring.R

enum class NoteState { EXPECTED, CORRECT, INCORRECT, ACTIVE }

data class StaffNote(
    val midi: Int,
    val state: NoteState
)

@Composable
fun MusicStaff(
    notes: List<StaffNote>,
    modifier: Modifier = Modifier,
    lineSpacingDp: Dp = 12.dp,
    fixedSpacingDp: Dp? = null
) {
    val context = LocalContext.current
    val clefBitmap = remember {
        BitmapFactory.decodeResource(context.resources, R.drawable.ic_treble_clef)
            ?.asImageBitmap()
    }

    Canvas(
        modifier = modifier
            .fillMaxWidth()
            .height(160.dp)
    ) {
        val lineSpacing = lineSpacingDp.toPx()
        val staffTop = size.height / 2f - 2 * lineSpacing
        // Left margin is proportional to line spacing so it scales with density
        val leftMargin = lineSpacing * 4.2f
        val noteRadius = lineSpacing * 0.45f

        // Draw 5 staff lines
        for (i in 0..4) {
            val y = staffTop + i * lineSpacing
            drawLine(
                color = Color(0xFF333333),
                start = Offset(leftMargin, y),
                end = Offset(size.width - 16f, y),
                strokeWidth = 1.5f
            )
        }

        // Draw treble clef from bundled PNG (Android system fonts lack U+1D11E)
        clefBitmap?.let { bmp ->
            val clefH = (lineSpacing * 7f).toInt()
            val clefW = (clefH * bmp.width.toFloat() / bmp.height.toFloat()).toInt()
            val clefTop = (staffTop - lineSpacing * 1.5f).toInt()
            drawImage(
                image = bmp,
                dstOffset = IntOffset(2, clefTop),
                dstSize = IntSize(clefW, clefH)
            )
        }

        // Distribute notes horizontally
        val noteAreaStart = leftMargin + lineSpacing
        val noteAreaWidth = size.width - noteAreaStart - 16f
        val noteCount = notes.size.coerceAtLeast(1)
        val noteStep = if (fixedSpacingDp != null) fixedSpacingDp.toPx() else noteAreaWidth / noteCount.toFloat()

        notes.forEachIndexed { index, staffNote ->
            val staffPos = EarRingCore.staffPosition(staffNote.midi)
            val staffCenter = staffTop + 2 * lineSpacing
            val noteY = staffCenter - staffPos * (lineSpacing / 2f)
            val noteX = noteAreaStart + index * noteStep + noteStep / 2f

            val noteColor = when (staffNote.state) {
                NoteState.EXPECTED -> Color(0xFF333333)
                NoteState.CORRECT -> Color(0xFF4CAF50)
                NoteState.INCORRECT -> Color(0xFFF44336)
                NoteState.ACTIVE -> Color(0xFF3F51B5)
            }

            drawLedgerLines(noteX, noteY, staffTop, lineSpacing, noteRadius)

            drawCircle(color = noteColor, radius = noteRadius, center = Offset(noteX, noteY))
            if (staffNote.state == NoteState.EXPECTED) {
                drawCircle(color = Color.White, radius = noteRadius - 2.5f, center = Offset(noteX, noteY))
            }
        }
    }
}

private fun DrawScope.drawLedgerLines(
    noteX: Float,
    noteY: Float,
    staffTop: Float,
    lineSpacing: Float,
    noteRadius: Float
) {
    val staffBottom = staffTop + 4 * lineSpacing
    val ledgerWidth = noteRadius * 2.8f

    var y = staffTop - lineSpacing
    while (noteY <= y + 1f) {
        drawLine(color = Color(0xFF555555), start = Offset(noteX - ledgerWidth, y), end = Offset(noteX + ledgerWidth, y), strokeWidth = 1.5f)
        y -= lineSpacing
    }

    y = staffBottom + lineSpacing
    while (noteY >= y - 1f) {
        drawLine(color = Color(0xFF555555), start = Offset(noteX - ledgerWidth, y), end = Offset(noteX + ledgerWidth, y), strokeWidth = 1.5f)
        y += lineSpacing
    }
}
