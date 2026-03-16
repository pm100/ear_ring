package com.earring.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.drag
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

private const val PIANO_MIDI_MIN = 36  // C2
private const val PIANO_MIDI_MAX = 84  // C6
private val WHITE_KEY_CLASSES = setOf(0, 2, 4, 5, 7, 9, 11)
private val DIATONIC_STEP = intArrayOf(0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6)
private val TOTAL_WHITE_KEYS = (PIANO_MIDI_MIN..PIANO_MIDI_MAX).count { it % 12 in WHITE_KEY_CLASSES }

private fun whiteIndex(midi: Int): Int {
    val octave = (midi - PIANO_MIDI_MIN) / 12
    return octave * 7 + DIATONIC_STEP[midi % 12]
}

private fun isWhiteKey(midi: Int): Boolean = midi % 12 in WHITE_KEY_CLASSES

@Composable
fun PianoRangePicker(
    rangeStart: Int,
    rangeEnd: Int,
    onRangeChange: (Int, Int) -> Unit,
    modifier: Modifier = Modifier
) {
    val primaryColor = MaterialTheme.colorScheme.primary
    val density = LocalDensity.current

    val whiteKeyWidth: Dp = 22.dp
    val blackKeyWidth: Dp = 14.dp
    val whiteKeyHeight: Dp = 80.dp
    val blackKeyHeight: Dp = 52.dp
    val handleRadius: Dp = 9.dp
    val handleArea: Dp = 22.dp  // vertical area above keys for handles
    val totalHeight: Dp = handleArea + whiteKeyHeight
    val totalWidth: Dp = whiteKeyWidth * TOTAL_WHITE_KEYS

    Box(modifier = modifier.height(totalHeight).horizontalScroll(rememberScrollState())) {
        Canvas(
            modifier = Modifier
                .width(totalWidth)
                .height(totalHeight)
                .pointerInput(rangeStart, rangeEnd) {
                    val wkw = with(density) { whiteKeyWidth.toPx() }
                    val bkw = with(density) { blackKeyWidth.toPx() }
                    val bkh = with(density) { blackKeyHeight.toPx() }
                    val hArea = with(density) { handleArea.toPx() }
                    val hRadius = with(density) { handleRadius.toPx() }

                    fun keyX(midi: Int): Float =
                        if (isWhiteKey(midi)) whiteIndex(midi) * wkw + wkw / 2
                        else whiteIndex(midi - 1) * wkw + wkw - bkw / 2

                    fun xToMidi(x: Float, yInKeys: Float): Int {
                        if (yInKeys in 0f..bkh) {
                            for (m in PIANO_MIDI_MIN..PIANO_MIDI_MAX) {
                                if (!isWhiteKey(m)) {
                                    val cx = whiteIndex(m - 1) * wkw + wkw - bkw / 2
                                    if (x >= cx - bkw / 2 && x < cx + bkw / 2) return m
                                }
                            }
                        }
                        val idx = (x / wkw).toInt().coerceIn(0, TOTAL_WHITE_KEYS - 1)
                        for (m in PIANO_MIDI_MIN..PIANO_MIDI_MAX) {
                            if (isWhiteKey(m) && whiteIndex(m) == idx) return m
                        }
                        return rangeStart
                    }

                    awaitEachGesture {
                        val down = awaitFirstDown()
                        val x = down.position.x
                        val y = down.position.y
                        val handleY = hArea / 2
                        val startX = keyX(rangeStart)
                        val endX = keyX(rangeEnd)

                        val which: Int? = when {
                            kotlin.math.abs(x - startX) <= hRadius * 2.5f &&
                                kotlin.math.abs(y - handleY) <= hRadius * 2.5f -> 0
                            kotlin.math.abs(x - endX) <= hRadius * 2.5f &&
                                kotlin.math.abs(y - handleY) <= hRadius * 2.5f -> 1
                            else -> null
                        }

                        if (which == null) {
                            // Tap: shift range preserving span
                            val yInKeys = (y - hArea).coerceAtLeast(0f)
                            val tapped = xToMidi(x, yInKeys)
                            val span = rangeEnd - rangeStart
                            val newStart = tapped.coerceIn(PIANO_MIDI_MIN, PIANO_MIDI_MAX - span)
                            onRangeChange(newStart, newStart + span)
                        } else {
                            drag(down.id) { change ->
                                val nx = change.position.x
                                val m = xToMidi(nx, bkh / 2f)
                                if (which == 0) {
                                    val ns = m.coerceIn(PIANO_MIDI_MIN, rangeEnd - 12)
                                    onRangeChange(ns, rangeEnd)
                                } else {
                                    val ne = m.coerceIn(rangeStart + 12, PIANO_MIDI_MAX)
                                    onRangeChange(rangeStart, ne)
                                }
                            }
                        }
                    }
                }
        ) {
            val wkw = with(density) { whiteKeyWidth.toPx() }
            val bkw = with(density) { blackKeyWidth.toPx() }
            val wkh = with(density) { whiteKeyHeight.toPx() }
            val bkh = with(density) { blackKeyHeight.toPx() }
            val hArea = with(density) { handleArea.toPx() }
            val hRadius = with(density) { handleRadius.toPx() }
            val keyTop = hArea

            // White keys
            for (midi in PIANO_MIDI_MIN..PIANO_MIDI_MAX) {
                if (!isWhiteKey(midi)) continue
                val left = whiteIndex(midi) * wkw
                val inRange = midi in rangeStart..rangeEnd
                // Solid light-indigo for in-range keys, white otherwise
                drawRect(
                    color = if (inRange) Color(0xFFC5CAE9) else Color.White,
                    topLeft = Offset(left, keyTop),
                    size = Size(wkw - 1f, wkh)
                )
                drawRect(
                    color = if (inRange) Color(0xFF7986CB) else Color(0xFF888888),
                    topLeft = Offset(left, keyTop),
                    size = Size(wkw - 1f, wkh),
                    style = Stroke(width = 1f)
                )
            }

            // Black keys
            for (midi in PIANO_MIDI_MIN..PIANO_MIDI_MAX) {
                if (isWhiteKey(midi)) continue
                val cx = whiteIndex(midi - 1) * wkw + wkw - bkw / 2
                val left = cx - bkw / 2
                val inRange = midi in rangeStart..rangeEnd
                // Full primary colour for in-range black keys
                drawRect(
                    color = if (inRange) primaryColor else Color(0xFF222222),
                    topLeft = Offset(left, keyTop),
                    size = Size(bkw, bkh)
                )
            }

            // C key labels
            val labelPaint = android.graphics.Paint().apply {
                textSize = with(density) { 8.dp.toPx() }
                textAlign = android.graphics.Paint.Align.CENTER
                isAntiAlias = true
            }
            for (midi in PIANO_MIDI_MIN..PIANO_MIDI_MAX step 12) {
                val oct = midi / 12 - 1
                val left = whiteIndex(midi) * wkw
                val cx = left + wkw / 2
                labelPaint.color = if (midi in rangeStart..rangeEnd)
                    android.graphics.Color.parseColor("#3F51B5")
                else
                    android.graphics.Color.parseColor("#777777")
                drawContext.canvas.nativeCanvas.drawText(
                    "C$oct", cx, keyTop + wkh - with(density) { 4.dp.toPx() }, labelPaint
                )
            }

            // Handle helper
            fun keyX(midi: Int): Float =if (isWhiteKey(midi)) whiteIndex(midi) * wkw + wkw / 2
                else whiteIndex(midi - 1) * wkw + wkw - bkw / 2

            val hy = hArea / 2
            val sx = keyX(rangeStart)
            val ex = keyX(rangeEnd)

            // Connecting line
            drawLine(color = primaryColor, start = Offset(sx, hy), end = Offset(ex, hy), strokeWidth = 3f)
            // Handles
            drawCircle(color = primaryColor, radius = hRadius, center = Offset(sx, hy))
            drawCircle(color = primaryColor, radius = hRadius, center = Offset(ex, hy))
        }
    }
}
