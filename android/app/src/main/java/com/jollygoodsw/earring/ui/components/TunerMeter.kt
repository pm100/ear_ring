package com.jollygoodsw.earring.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.wrapContentHeight
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.jollygoodsw.earring.EarRingCore
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.sin

private val COLOR_GREEN = Color(0xFF4CAF50)
private val COLOR_AMBER = Color(0xFFFFA000)
private val COLOR_RED = Color(0xFFE53935)
private val COLOR_MUTED = Color(0xFFBDBDBD)
private val COLOR_TEXT = Color(0xFF212121)

// Cents bands, matching a typical clip-on chromatic tuner: tight green "in tune" zone,
// amber transition, red beyond that. freq_to_note (and so freqToCents) never returns
// more than ±50, which is also the arc's full sweep.
private const val GREEN_BAND = 5
private const val AMBER_BAND = 20
private const val MAX_CENTS = 50f

/**
 * Guitar-tuner-style meter for Mic Setup: a semicircular arc with a needle that sweeps
 * continuously with the live pitch, replacing [PitchMeter]'s plain circle+label. Unlike
 * [PitchMeter] (and the exercise pipeline generally), this reads every frame's raw [hz]
 * directly — it is not gated behind note-stability confirmation, matching how a real
 * tuner responds instantly rather than waiting for a "confirmed" note. Mic Setup only;
 * the Exercise screen keeps [PitchMeter].
 */
@Composable
fun TunerMeter(
    hz: Float,               // live detected frequency, -1/0/silent = no pitch
    instrumentIndex: Int = 0,
    rootChroma: Int = 0,      // concert-pitch key chroma, for spelling the concert half
    modifier: Modifier = Modifier
) {
    val midi = if (hz > 0f) EarRingCore.freqToMidi(hz) else -1
    val isDetecting = midi >= 0
    val cents = if (isDetecting) EarRingCore.freqToCents(hz) else 0
    val label = if (isDetecting) EarRingCore.dualNoteLabel(midi, instrumentIndex, rootChroma) else "♪"

    val zoneColor = when {
        !isDetecting -> COLOR_MUTED
        kotlin.math.abs(cents) <= GREEN_BAND -> COLOR_GREEN
        kotlin.math.abs(cents) <= AMBER_BAND -> COLOR_AMBER
        else -> COLOR_RED
    }

    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = modifier
    ) {
        Canvas(
            modifier = Modifier
                .width(200.dp)
                .height(110.dp)
        ) {
            val strokeWidth = 10.dp.toPx()
            val pivot = Offset(size.width / 2f, size.height - strokeWidth / 2f)
            val radius = (size.width - strokeWidth) / 2f
            val arcTopLeft = Offset(pivot.x - radius, pivot.y - radius)
            val arcSize = androidx.compose.ui.geometry.Size(radius * 2f, radius * 2f)

            // angleForCents(-50) = 180° (left end) … angleForCents(0) = 270° (top,
            // straight up) … angleForCents(+50) = 360° (right end) — Compose's arc/trig
            // convention measures clockwise from the positive x-axis, which happens to
            // match screen coordinates (y grows downward) with no extra sign-flipping.
            fun angleForCents(c: Float) = 180f + (c + MAX_CENTS) * 1.8f

            if (isDetecting) {
                val bands = listOf(
                    Triple(-MAX_CENTS, -AMBER_BAND.toFloat(), COLOR_RED),
                    Triple(-AMBER_BAND.toFloat(), -GREEN_BAND.toFloat(), COLOR_AMBER),
                    Triple(-GREEN_BAND.toFloat(), GREEN_BAND.toFloat(), COLOR_GREEN),
                    Triple(GREEN_BAND.toFloat(), AMBER_BAND.toFloat(), COLOR_AMBER),
                    Triple(AMBER_BAND.toFloat(), MAX_CENTS, COLOR_RED)
                )
                for ((fromCents, toCents, color) in bands) {
                    drawArc(
                        color = color,
                        startAngle = angleForCents(fromCents),
                        sweepAngle = angleForCents(toCents) - angleForCents(fromCents),
                        useCenter = false,
                        topLeft = arcTopLeft,
                        size = arcSize,
                        style = Stroke(width = strokeWidth)
                    )
                }
            } else {
                drawArc(
                    color = COLOR_MUTED,
                    startAngle = 180f,
                    sweepAngle = 180f,
                    useCenter = false,
                    topLeft = arcTopLeft,
                    size = arcSize,
                    style = Stroke(width = strokeWidth)
                )
            }

            // Needle: rests straight up (0¢ position) when idle.
            val needleAngleDeg = angleForCents(cents.toFloat().coerceIn(-MAX_CENTS, MAX_CENTS))
            val needleAngleRad = needleAngleDeg * PI.toFloat() / 180f
            val needleLength = radius - strokeWidth
            val needleTip = Offset(
                pivot.x + needleLength * cos(needleAngleRad),
                pivot.y + needleLength * sin(needleAngleRad)
            )
            drawLine(
                color = zoneColor,
                start = pivot,
                end = needleTip,
                strokeWidth = 4.dp.toPx()
            )
            drawCircle(color = zoneColor, radius = 5.dp.toPx(), center = pivot)
        }

        // Fixed height regardless of font size — the label shrinks to 15sp for longer
        // dual "written (concert)" labels (e.g. "D (C4)"), and without a reserved
        // height that alone shifts the rest of the screen up/down whenever detection
        // starts/stops, separately from the cents caption below.
        Text(
            text = label,
            fontSize = if (label.length > 5) 15.sp else 20.sp,
            fontWeight = FontWeight.Bold,
            color = if (isDetecting) COLOR_TEXT else COLOR_MUTED,
            modifier = Modifier.height(26.dp).wrapContentHeight(Alignment.CenterVertically)
        )
        // Always rendered (never conditional) so this line's height is reserved
        // whether or not a pitch is detected — otherwise the rest of the screen
        // shifts up/down every time detection starts or stops.
        Text(
            text = if (!isDetecting) " " else if (kotlin.math.abs(cents) <= GREEN_BAND) "in tune" else "%+d¢".format(cents),
            fontSize = 12.sp,
            color = zoneColor,
            modifier = Modifier.padding(top = 2.dp)
        )
    }
}
