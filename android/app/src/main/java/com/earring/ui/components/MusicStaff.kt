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
    fixedSpacingDp: Dp? = null,
    rootChroma: Int = 0,
    keySignatureMode: Int = 0,
) {
    Canvas(
        modifier = modifier
            .fillMaxWidth()
            .height(160.dp)
    ) {
        val lineSpacing = lineSpacingDp.toPx()
        val staffTop = size.height / 2f - 2 * lineSpacing
        val staffCenter = staffTop + 2 * lineSpacing   // B4 middle line
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

        // Treble clef: original size was correct, baseline just needed moving down.
        // G line (curl target) = staffTop + 3*lineSpacing.
        val clefPaint = android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG).apply {
            textSize = lineSpacing * 3.5f
        }
        val clefWidth = clefPaint.measureText("\uD834\uDD1E")

        // Draw treble clef — baseline at G line + 1 lineSpacing to centre curl on G line
        drawIntoCanvas { canvas ->
            clefPaint.color = android.graphics.Color.parseColor("#333333")
            canvas.nativeCanvas.drawText("\uD834\uDD1E", 4f, staffTop + lineSpacing * 4.0f, clefPaint)
        }

        // Key sig symbols start just after the clef (with breathing room)
        val keySigStartX = 4f + clefWidth + 6f
        // ♭ needs a tall font for the ascender; ♯ bars should only span ~2 staff spaces
        val keySigFlatSize = lineSpacing * 3.5f
        val keySigSharpSize = lineSpacing * 2.0f
        val keySigStep = lineSpacing * 0.95f

        // Helper: compute y baseline so the loop of ♭ / bars of ♯ land on targetY.
        // LEFT-aligned text: x is the left edge of the glyph.
        // ♭ loop centre is ~15% of textSize above the baseline.
        // ♯: bars centred at 50% of bounding box height.
        fun accidentalBaseline(targetY: Float, symbol: String, isSharp: Boolean, paint: android.graphics.Paint): Float {
            return if (!isSharp) {
                targetY + paint.textSize * 0.15f   // shift baseline so loop centre lands on targetY
            } else {
                val b = android.graphics.Rect()
                paint.getTextBounds(symbol, 0, symbol.length, b)
                val glyphH = (b.bottom - b.top).toFloat()
                targetY + (-b.top.toFloat()) - glyphH * 0.50f
            }
        }

        // Draw key signature symbols when in key-signature mode
        if (keySignatureMode == 1) {
            val keySigPositions = EarRingCore.keySigPositions(rootChroma)
            val isSharp = EarRingCore.isSharpKey(rootChroma)
            val keySigSymbol = if (isSharp) "\u266f" else "\u266d"
            val keySigTextSize = if (isSharp) keySigSharpSize else keySigFlatSize
            val staffCenter = staffTop + 2 * lineSpacing
            drawIntoCanvas { canvas ->
                val paint = android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG).apply {
                    textSize = keySigTextSize
                    color = android.graphics.Color.parseColor("#333333")
                    textAlign = android.graphics.Paint.Align.LEFT
                }
                keySigPositions.forEachIndexed { i, sp ->
                    val keySigY = staffCenter - (sp - 6) * (lineSpacing / 2f)
                    val keySigX = keySigStartX + i * keySigStep
                    val drawY = accidentalBaseline(keySigY, keySigSymbol, isSharp, paint)
                    canvas.nativeCanvas.drawText(keySigSymbol, keySigX, drawY, paint)
                }
            }
        }

        // Dynamic noteAreaStart: push right to avoid overlapping key sig symbols
        val keySigCount = if (keySignatureMode == 1) Math.abs(EarRingCore.keyAccidentalCount(rootChroma)) else 0
        val keySigEndX = keySigStartX + keySigCount * keySigStep + 8f
        // noteAreaStart is at least 24px after clef; more if key sig extends further
        val noteAreaStart = maxOf(keySigStartX + 20f, keySigEndX)
        val noteAreaWidth = size.width - noteAreaStart - 20f
        val noteCount = notes.size.coerceAtLeast(1)
        val noteStep = if (fixedSpacingDp != null) fixedSpacingDp.toPx() else noteAreaWidth / noteCount.toFloat()

        notes.forEachIndexed { index, staffNote ->
            val staffPos = EarRingCore.staffPositionInKey(staffNote.midi, rootChroma)
            val staffCenter = staffTop + 2 * lineSpacing
            val noteY = staffCenter - (staffPos - 6) * (lineSpacing / 2f)
            val noteX = noteAreaStart + index * noteStep + noteStep / 2f

            val noteColor = when (staffNote.state) {
                NoteState.EXPECTED -> Color(0xFF333333)
                NoteState.CORRECT -> Color(0xFF4CAF50)
                NoteState.INCORRECT -> Color(0xFFF44336)
                NoteState.ACTIVE -> Color(0xFF3F51B5)
            }
            val accidental = if (keySignatureMode == 1) {
                when (EarRingCore.accidentalInKey(staffNote.midi, rootChroma)) {
                    1 -> "\u266f"  // ♯
                    2 -> "\u266d"  // ♭
                    3 -> "\u266e"  // ♮
                    else -> null
                }
            } else {
                val noteLabel = EarRingCore.preferredMidiLabel(staffNote.midi, rootChroma)
                when {
                    noteLabel.contains("#") -> "\u266f"
                    noteLabel.contains("b") || noteLabel.contains("\u266d") -> "\u266d"
                    else -> null
                }
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
                    val isAccSharp = it == "\u266f"
                    val accidentalPaint = android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG).apply {
                        textSize = if (isAccSharp) lineSpacing * 2.0f else lineSpacing * 3.5f
                        color = fillPaint.color
                        textAlign = android.graphics.Paint.Align.CENTER
                    }
                    val drawY = accidentalBaseline(noteY, it, isAccSharp, accidentalPaint)
                    nativeCanvas.drawText(
                        it,
                        noteX - noteHeadWidth * 1.25f,
                        drawY,
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
    val ledgerWidth = noteRadius * 1.65f

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
