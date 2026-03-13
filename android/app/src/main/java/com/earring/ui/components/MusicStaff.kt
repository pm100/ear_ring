package com.earring.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.earring.EarRingCore
import com.earring.MusicTheory

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
    Canvas(
        modifier = modifier
            .fillMaxWidth()
            .height(160.dp)
    ) {
        val lineSpacing = lineSpacingDp.toPx()
        val staffTop = size.height / 2f - 2 * lineSpacing
        val leftMargin = 60f
        val noteRadius = lineSpacing * 0.45f
        val noteHeadWidth = noteRadius * 2.3f
        val noteHeadHeight = noteRadius * 1.7f
        val stemLength = lineSpacing * 3.2f

        // Draw 5 staff lines — start at left edge (x=5) so they overlap the clef
        for (i in 0..4) {
            val y = staffTop + i * lineSpacing
            drawLine(
                color = Color(0xFF333333),
                start = Offset(5f, y),
                end = Offset(size.width - 16f, y),
                strokeWidth = 1.5f
            )
        }

        // Draw treble clef symbol using native canvas for proper font fallback
        drawIntoCanvas { canvas ->
            val paint = android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG).apply {
                textSize = lineSpacing * 3.5f
                color = android.graphics.Color.parseColor("#333333")
            }
            canvas.nativeCanvas.drawText(
                "\uD834\uDD1E",
                4f,
                staffTop + lineSpacing * 3.0f,
                paint
            )
        }

        // Distribute notes horizontally
        val noteAreaStart = leftMargin + 20f
        val noteAreaWidth = size.width - noteAreaStart - 20f
        val noteCount = notes.size.coerceAtLeast(1)
        val noteStep = if (fixedSpacingDp != null) fixedSpacingDp.toPx() else noteAreaWidth / noteCount.toFloat()

        notes.forEachIndexed { index, staffNote ->
            val staffPos = EarRingCore.staffPosition(staffNote.midi)
            // staffPos: C4=0, D4=1, ... and B4=6, which sits on the centre line.
            val staffCenter = staffTop + 2 * lineSpacing // line 3 = B4 area
            val noteY = staffCenter - (staffPos - 6) * (lineSpacing / 2f)
            val noteX = noteAreaStart + index * noteStep + noteStep / 2f

            val noteColor = when (staffNote.state) {
                NoteState.EXPECTED -> Color(0xFF333333)
                NoteState.CORRECT -> Color(0xFF4CAF50)
                NoteState.INCORRECT -> Color(0xFFF44336)
                NoteState.ACTIVE -> Color(0xFF3F51B5)
            }
            val noteLabel = MusicTheory.midiToLabel(staffNote.midi)
            val accidental = when {
                noteLabel.contains("#") -> "\u266f"
                noteLabel.contains("b") || noteLabel.contains("\u266d") -> "\u266d"
                else -> null
            }
            val stemUp = staffPos < 6
            val stemX = if (stemUp) noteX + noteHeadWidth * 0.35f else noteX - noteHeadWidth * 0.35f
            val stemEndY = if (stemUp) noteY - stemLength else noteY + stemLength

            // Draw ledger lines if needed (outside staff lines 0-4)
            drawLedgerLines(noteX, noteY, staffTop, lineSpacing, noteRadius)

            drawIntoCanvas { canvas ->
                val fillPaint = android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG).apply {
                    style = android.graphics.Paint.Style.FILL
                    color = when (staffNote.state) {
                        NoteState.EXPECTED -> android.graphics.Color.parseColor("#333333")
                        NoteState.CORRECT -> android.graphics.Color.parseColor("#4CAF50")
                        NoteState.INCORRECT -> android.graphics.Color.parseColor("#F44336")
                        NoteState.ACTIVE -> android.graphics.Color.parseColor("#3F51B5")
                    }
                }
                val nativeCanvas = canvas.nativeCanvas
                nativeCanvas.save()
                nativeCanvas.rotate(-20f, noteX, noteY)
                nativeCanvas.drawOval(
                    android.graphics.RectF(
                        noteX - noteHeadWidth / 2f,
                        noteY - noteHeadHeight / 2f,
                        noteX + noteHeadWidth / 2f,
                        noteY + noteHeadHeight / 2f
                    ),
                    fillPaint
                )
                nativeCanvas.restore()

                accidental?.let {
                    val accidentalPaint = android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG).apply {
                        textSize = lineSpacing * 1.8f
                        color = fillPaint.color
                        textAlign = android.graphics.Paint.Align.CENTER
                    }
                    nativeCanvas.drawText(
                        it,
                        noteX - noteHeadWidth * 1.25f,
                        noteY + lineSpacing * 0.4f,
                        accidentalPaint
                    )
                }
            }

            drawLine(
                color = noteColor,
                start = Offset(stemX, noteY),
                end = Offset(stemX, stemEndY),
                strokeWidth = 1.7f
            )
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

    // Above staff
    var y = staffTop - lineSpacing
    while (noteY <= y + 1f) {
        drawLine(
            color = Color(0xFF555555),
            start = Offset(noteX - ledgerWidth, y),
            end = Offset(noteX + ledgerWidth, y),
            strokeWidth = 1.5f
        )
        y -= lineSpacing
    }

    // Below staff
    y = staffBottom + lineSpacing
    while (noteY >= y - 1f) {
        drawLine(
            color = Color(0xFF555555),
            start = Offset(noteX - ledgerWidth, y),
            end = Offset(noteX + ledgerWidth, y),
            strokeWidth = 1.5f
        )
        y += lineSpacing
    }
}
