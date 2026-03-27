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
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.Dp
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
    fixedSpacingDp: Dp? = null,
    rootChroma: Int = 0,
    keySignatureMode: Int = 0,
) {
    val context = LocalContext.current

    // Pre-load all bitmaps once (clef + accidentals).
    // Each accidental PNG has its visual anchor at exactly 50% of the image height:
    //   top = targetY - displayH / 2
    val clefBitmap = remember { BitmapFactory.decodeResource(context.resources, R.drawable.treble_clef) }
    val accBitmaps = remember {
        mapOf(
            "flat"          to BitmapFactory.decodeResource(context.resources, R.drawable.flat),
            "flat_correct"  to BitmapFactory.decodeResource(context.resources, R.drawable.flat_correct),
            "flat_wrong"    to BitmapFactory.decodeResource(context.resources, R.drawable.flat_wrong),
            "flat_active"   to BitmapFactory.decodeResource(context.resources, R.drawable.flat_active),
            "sharp"         to BitmapFactory.decodeResource(context.resources, R.drawable.sharp),
            "sharp_correct" to BitmapFactory.decodeResource(context.resources, R.drawable.sharp_correct),
            "sharp_wrong"   to BitmapFactory.decodeResource(context.resources, R.drawable.sharp_wrong),
            "sharp_active"  to BitmapFactory.decodeResource(context.resources, R.drawable.sharp_active),
        )
    }

    Canvas(
        modifier = modifier
            .fillMaxWidth()
            .height(160.dp)
    ) {
        val lineSpacing = lineSpacingDp.toPx()
        val staffTop = size.height / 2f - 2 * lineSpacing
        val staffCenter = staffTop + 2 * lineSpacing
        val noteRadius = lineSpacing * 0.45f
        val noteHeadWidth = noteRadius * 2.3f
        val noteHeadHeight = noteRadius * 1.7f
        val stemLength = lineSpacing * 3.2f

        // Display heights for accidental PNGs — same multiplier on all platforms.
        val flatDisplayH  = lineSpacing * 3.0f
        val sharpDisplayH = lineSpacing * 2.0f

        // Returns the correctly-coloured bitmap for a given symbol and note state.
        fun accBmp(isSharp: Boolean, state: NoteState = NoteState.EXPECTED): android.graphics.Bitmap? {
            val prefix = if (isSharp) "sharp" else "flat"
            val suffix = when (state) {
                NoteState.CORRECT   -> "_correct"
                NoteState.INCORRECT -> "_wrong"
                NoteState.ACTIVE    -> "_active"
                else                -> ""
            }
            return accBitmaps["$prefix$suffix"]
        }

        // Draw an accidental PNG: left edge at leftX, anchor (50% of height) on centerY.
        fun android.graphics.Canvas.drawAcc(
            bmp: android.graphics.Bitmap,
            leftX: Float, centerY: Float, displayH: Float
        ) {
            val displayW = displayH * bmp.width.toFloat() / bmp.height.toFloat()
            drawBitmap(bmp, null,
                android.graphics.RectF(leftX, centerY - displayH / 2f, leftX + displayW, centerY + displayH / 2f),
                null)
        }

        // ── Staff lines ──────────────────────────────────────────────────────
        for (i in 0..4) {
            val y = staffTop + i * lineSpacing
            drawLine(color = Color(0xFF333333), start = Offset(5f, y),
                end = Offset(size.width - 16f, y), strokeWidth = 1.5f)
        }

        // ── Treble clef (PNG bitmap — same as Tauri) ────────────────────────
        val clefH = lineSpacing * 8f
        val clefW = clefBitmap?.let { clefH * it.width.toFloat() / it.height.toFloat() } ?: (clefH * 149f / 307f)
        drawIntoCanvas { canvas ->
            clefBitmap?.let {
                canvas.nativeCanvas.drawBitmap(it, null,
                    android.graphics.RectF(2f, staffTop - lineSpacing * 2f, 2f + clefW, staffTop - lineSpacing * 2f + clefH),
                    null)
            }
        }

        val keySigStartX = 2f + clefW + 6f

        // ── Key signature (PNG bitmaps) ──────────────────────────────────────
        val keySigIsSharp = EarRingCore.isSharpKey(rootChroma)
        val keySigDisplayH = if (keySigIsSharp) sharpDisplayH else flatDisplayH
        val keySigBmp = accBmp(keySigIsSharp)
        val keySigStep = keySigBmp?.let { keySigDisplayH * it.width / it.height.toFloat() }
            ?: (lineSpacing * 1.2f)

        if (keySignatureMode == 1) {
            val keySigPositions = EarRingCore.keySigPositions(rootChroma)
            drawIntoCanvas { canvas ->
                keySigPositions.forEachIndexed { i, sp ->
                    val targetY = staffCenter - (sp - 6) * (lineSpacing / 2f)
                    keySigBmp?.let { canvas.nativeCanvas.drawAcc(it, keySigStartX + i * keySigStep, targetY, keySigDisplayH) }
                }
            }
        }

        // ── Note area start ──────────────────────────────────────────────────
        val keySigCount = if (keySignatureMode == 1) Math.abs(EarRingCore.keyAccidentalCount(rootChroma)) else 0
        val keySigEndX = keySigStartX + keySigCount * keySigStep + 8f
        val noteAreaStart = maxOf(keySigStartX + 20f, keySigEndX)
        val noteAreaWidth = size.width - noteAreaStart - 20f
        val noteCount = notes.size.coerceAtLeast(1)
        val noteStep = if (fixedSpacingDp != null) fixedSpacingDp.toPx() else noteAreaWidth / noteCount.toFloat()

        // ── Notes ────────────────────────────────────────────────────────────
        notes.forEachIndexed { index, staffNote ->
            val staffPos = EarRingCore.staffPositionInKey(staffNote.midi, rootChroma)
            val noteY = staffCenter - (staffPos - 6) * (lineSpacing / 2f)
            val noteX = noteAreaStart + index * noteStep + noteStep / 2f

            val noteColor = when (staffNote.state) {
                NoteState.EXPECTED  -> Color(0xFF333333)
                NoteState.CORRECT   -> Color(0xFF4CAF50)
                NoteState.INCORRECT -> Color(0xFFF44336)
                NoteState.ACTIVE    -> Color(0xFF3F51B5)
            }

            // Determine accidental type for this note (true=sharp, false=flat, null=none).
            val accIsSharp: Boolean? = if (keySignatureMode == 1) {
                when (EarRingCore.accidentalInKey(staffNote.midi, rootChroma)) {
                    1 -> true   // ♯
                    2 -> false  // ♭
                    else -> null
                }
            } else {
                val label = EarRingCore.preferredMidiLabel(staffNote.midi, rootChroma)
                when {
                    label.contains("#") -> true
                    label.contains("b") || label.contains("\u266d") -> false
                    else -> null
                }
            }

            val stemUp = staffPos < 6
            val stemX = if (stemUp) noteX + noteHeadWidth * 0.35f else noteX - noteHeadWidth * 0.35f
            val stemEndY = if (stemUp) noteY - stemLength else noteY + stemLength

            drawLedgerLines(noteX, noteY, staffTop, lineSpacing, noteRadius)

            drawIntoCanvas { canvas ->
                val fillPaint = android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG).apply {
                    style = android.graphics.Paint.Style.FILL
                    color = when (staffNote.state) {
                        NoteState.EXPECTED  -> android.graphics.Color.parseColor("#333333")
                        NoteState.CORRECT   -> android.graphics.Color.parseColor("#4CAF50")
                        NoteState.INCORRECT -> android.graphics.Color.parseColor("#F44336")
                        NoteState.ACTIVE    -> android.graphics.Color.parseColor("#3F51B5")
                    }
                }
                val nc = canvas.nativeCanvas
                nc.save()
                nc.rotate(-20f, noteX, noteY)
                nc.drawOval(
                    android.graphics.RectF(
                        noteX - noteHeadWidth / 2f, noteY - noteHeadHeight / 2f,
                        noteX + noteHeadWidth / 2f, noteY + noteHeadHeight / 2f
                    ), fillPaint
                )
                nc.restore()

                accIsSharp?.let { isSharp ->
                    val bmp = accBmp(isSharp, staffNote.state)
                    bmp?.let {
                        val dh = if (isSharp) sharpDisplayH else flatDisplayH
                        val dw = dh * it.width / it.height.toFloat()
                        nc.drawAcc(it, noteX - noteHeadWidth * 1.25f - dw / 2f, noteY, dh)
                    }
                }
            }

            drawLine(color = noteColor, start = Offset(stemX, noteY),
                end = Offset(stemX, stemEndY), strokeWidth = 1.7f)
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
