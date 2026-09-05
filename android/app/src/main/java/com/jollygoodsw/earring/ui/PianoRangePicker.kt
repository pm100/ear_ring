package com.jollygoodsw.earring.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.drag
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
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

/** Keyboard length at keyScale=1 — the full unscaled span PianoRangePicker draws before any
 *  fit-to-available-space shrinking is applied. Exposed so callers can compute that scale. */
val PIANO_RANGE_PICKER_NATURAL_LENGTH: Dp = 22.dp * TOTAL_WHITE_KEYS

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
    modifier: Modifier = Modifier,
    keyScale: Float = 1f
) {
    val primaryColor = MaterialTheme.colorScheme.primary
    val density = LocalDensity.current

    val whiteKeyWidth: Dp = 22.dp * keyScale
    val blackKeyWidth: Dp = 14.dp * keyScale
    val whiteKeyHeight: Dp = 80.dp * keyScale
    val blackKeyHeight: Dp = 52.dp * keyScale
    val handleRadius: Dp = 9.dp * keyScale
    val handleArea: Dp = 22.dp * keyScale  // vertical area above keys for handles
    val labelTextSize: Dp = 13.dp * keyScale  // C-key octave labels
    val totalHeight: Dp = handleArea + whiteKeyHeight
    val totalWidth: Dp = whiteKeyWidth * TOTAL_WHITE_KEYS

    // Drawn and hit-tested below in this composable's normal (horizontal) coordinate frame
    // (width totalWidth x height totalHeight), then displayed sideways — its long axis runs
    // down the popup instead of needing wide horizontal scrolling — by rotating 90deg. The
    // Canvas itself is sized to that ACTUAL, post-rotation footprint (width totalHeight x
    // height totalWidth) from the start, and the rotation is applied as a DrawScope
    // transform around the draw calls below, NOT as a Modifier.rotate() on the Canvas.
    // Modifier.rotate() + Box(contentAlignment=...) was tried first and doesn't compose
    // correctly for this: with the Canvas's pre-rotation size wildly mismatched from its
    // rotated container's size, Box alignment placed it at a fixed, wrong offset no matter
    // which Alignment was tried (Center/TopCenter/an explicit align() modifier on the child
    // all produced pixel-identical, wrong output — confirmed by giving the outer Box a solid
    // debug background and watching the drawn keyboard sit far below it instead of filling
    // it). A DrawScope-level transform sidesteps that entirely: the canvas's LAYOUT size
    // already matches what's visually shown, so there's no mismatched-size alignment step to
    // go wrong. Because rotation only ever affects drawing, pointer input still reports raw
    // (untransformed) positions in the actual canvas frame, so touches are mapped back to
    // this composable's original (totalWidth x totalHeight) coordinate space by hand below —
    // the same technique desktop's HomeScreen.tsx uses for its own raw canvas + CSS rotation.
    //
    // keyScale shrinks every dimension so the whole keyboard fits without scrolling —
    // deliberately NOT wrapped in a scrollable container: this composable's own pointerInput
    // always claims the first touch it sees (tap-to-shift or drag-a-handle), so nesting it
    // inside a scroll region made ordinary swipes get misread as range edits instead of
    // scrolling.
    Canvas(
        modifier = modifier
            .width(totalHeight)
            .height(totalWidth)
            .pointerInput(rangeStart, rangeEnd) {
                val wkw = with(density) { whiteKeyWidth.toPx() }
                val bkw = with(density) { blackKeyWidth.toPx() }
                val bkh = with(density) { blackKeyHeight.toPx() }
                val hArea = with(density) { handleArea.toPx() }
                val hRadius = with(density) { handleRadius.toPx() }
                val totalHeightPx = with(density) { totalHeight.toPx() }

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

                // Inverse of the DrawScope rotate(90f) below: maps a touch reported in the
                // actual (totalHeight x totalWidth) canvas frame back to this composable's
                // original (totalWidth x totalHeight) drawing frame.
                fun toOriginal(actual: Offset): Offset = Offset(actual.y, totalHeightPx - actual.x)

                awaitEachGesture {
                    val down = awaitFirstDown(requireUnconsumed = false)
                    val (x, y) = toOriginal(down.position)
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
                        // Tap away from either handle: move whichever endpoint (start or
                        // end) is nearer to the tapped key directly there, instead of
                        // requiring a precise drag on a small handle — a single tap sets
                        // start or end.
                        val yInKeys = (y - hArea).coerceAtLeast(0f)
                        val tapped = xToMidi(x, yInKeys)
                        if (kotlin.math.abs(tapped - rangeStart) <= kotlin.math.abs(tapped - rangeEnd)) {
                            onRangeChange(tapped.coerceIn(PIANO_MIDI_MIN, rangeEnd - 12), rangeEnd)
                        } else {
                            onRangeChange(rangeStart, tapped.coerceIn(rangeStart + 12, PIANO_MIDI_MAX))
                        }
                    } else {
                        // Consume the down event so the parent scroll doesn't intercept
                        down.consume()
                        drag(down.id) { change ->
                            change.consume()
                            val (nx, _) = toOriginal(change.position)
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
        // Pivot derivation: rotate(pivot=P) maps point p -> P + R90(p - P). We need this to
        // equal the forward map used by the pointerInput's inverse above, T(x,y) = (H-y, x)
        // where H = totalHeight in px (this composable's own — pre-rotation — short axis).
        // Expanding P + R90(p-P) with R90(x,y) = (-y,x) and solving component-wise for which
        // constant P makes it equal (H-y, x) for every (x,y) gives P = (H/2, H/2) — notably
        // neither the canvas's own center nor this content's own center, since those two
        // centers aren't the same point once width/height are swapped by the rotation.
        val totalHeightPx = with(density) { totalHeight.toPx() }
        rotate(degrees = 90f, pivot = Offset(totalHeightPx / 2f, totalHeightPx / 2f)) {
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
                textSize = with(density) { labelTextSize.toPx() }
                textAlign = android.graphics.Paint.Align.CENTER
                isAntiAlias = true
                isFakeBoldText = true
            }
            for (midi in PIANO_MIDI_MIN..PIANO_MIDI_MAX step 12) {
                val oct = midi / 12 - 1
                val left = whiteIndex(midi) * wkw
                val cx = left + wkw / 2
                labelPaint.color = if (midi in rangeStart..rangeEnd)
                    android.graphics.Color.parseColor("#3F51B5")
                else
                    android.graphics.Color.parseColor("#555555")
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
}  // PianoRangePicker

/**
 * Full-screen presentation of [PianoRangePicker] — deliberately not a small dialog: at
 * natural size the rotated keyboard is far taller than a dialog/AlertDialog can offer
 * without either scrolling (which fights the picker's own drag-a-handle gesture — see
 * PianoRangePicker's own comment) or shrinking it down to an untappable size.
 *
 * Rendered as a plain in-tree overlay (a sibling Box in the caller, not a system Dialog) —
 * a Dialog was tried first, but its window resize to full-screen (needed since Dialog
 * windows default to WRAP_CONTENT height even with usePlatformDefaultWidth=false) raced
 * with Compose's first layout pass: the keyboard came back measured and positioned against
 * the small pre-resize constraints and stayed that way, silently, no matter what alignment
 * was tried on it afterward — swapping Center/TopCenter/an explicit align() modifier all
 * produced pixel-identical (wrong) output. An in-tree overlay gets real, correct full-size
 * constraints from its very first frame, no window/resize timing involved.
 */
@Composable
fun PianoRangePickerScreen(
    rangeStart: Int,
    rangeEnd: Int,
    onRangeChange: (Int, Int) -> Unit,
    onDone: () -> Unit
) {
    Surface(modifier = Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.surface) {
        Column(modifier = Modifier.fillMaxSize()) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp)
            ) {
                Text("Note Range", style = MaterialTheme.typography.titleLarge, modifier = Modifier.weight(1f))
                TextButton(onClick = onDone) { Text("Done") }
            }
            BoxWithConstraints(
                modifier = Modifier.fillMaxWidth().weight(1f),
                contentAlignment = Alignment.Center
            ) {
                val keyScale = (maxHeight / PIANO_RANGE_PICKER_NATURAL_LENGTH).coerceAtMost(1f)
                PianoRangePicker(
                    rangeStart = rangeStart,
                    rangeEnd = rangeEnd,
                    onRangeChange = onRangeChange,
                    keyScale = keyScale
                )
            }
        }
    }
}
