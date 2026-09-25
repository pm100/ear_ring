import React, { useMemo } from 'react';
import { freqToMidi, freqToCents, dualNoteLabel } from '../music';

const COLOR_GREEN = '#4CAF50';
const COLOR_AMBER = '#FFA000';
const COLOR_RED = '#E53935';
const COLOR_MUTED = '#BDBDBD';
const COLOR_TEXT = '#212121';

// Cents bands, matching a typical clip-on chromatic tuner: tight green "in tune" zone,
// amber transition, red beyond that. freq_to_note (and so freqToCents) never returns
// more than ±50, which is also the arc's full sweep.
const GREEN_BAND = 5;
const AMBER_BAND = 20;
const MAX_CENTS = 50;

// angleForCents(-50) = 180° (left end) … angleForCents(0) = 270° (top, straight up) …
// angleForCents(+50) = 360° (right end). SVG's y axis grows downward, same as this
// convention (0° = 3 o'clock, clockwise), so no sign-flipping is needed anywhere below.
function angleForCents(c: number): number {
  return 180 + (c + MAX_CENTS) * 1.8;
}

function pointOnArc(cx: number, cy: number, r: number, angleDeg: number): { x: number; y: number } {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arcPath(cx: number, cy: number, r: number, fromCents: number, toCents: number): string {
  const start = pointOnArc(cx, cy, r, angleForCents(fromCents));
  const end = pointOnArc(cx, cy, r, angleForCents(toCents));
  return `M ${start.x} ${start.y} A ${r} ${r} 0 0 1 ${end.x} ${end.y}`;
}

interface Props {
  hz: number;
  /** Instrument's transposition in semitones (0 = concert pitch, e.g. Piano). */
  transposeSemitones?: number;
  /** Concert-pitch key chroma, for spelling the concert half of the label. */
  keyChroma?: number;
}

/**
 * Guitar-tuner-style meter for Mic Setup: a semicircular arc with a needle that sweeps
 * continuously with the live pitch, replacing PitchMeter's plain circle+label. Unlike
 * PitchMeter (and the exercise pipeline generally), this reads every frame's raw `hz`
 * directly — it is not gated behind note-stability confirmation, matching how a real
 * tuner responds instantly rather than waiting for a "confirmed" note. Mic Setup only;
 * the Exercise screen keeps PitchMeter.
 */
export default function TunerMeter({ hz, transposeSemitones = 0, keyChroma = 0 }: Props) {
  const midi = hz > 0 ? freqToMidi(hz) : -1;
  const isDetecting = midi >= 0;
  const cents = isDetecting ? freqToCents(hz) : 0;
  const label = useMemo(
    () => (isDetecting ? dualNoteLabel(midi, transposeSemitones, keyChroma) : '♪'),
    [isDetecting, midi, transposeSemitones, keyChroma]
  );

  const zoneColor = !isDetecting
    ? COLOR_MUTED
    : Math.abs(cents) <= GREEN_BAND
    ? COLOR_GREEN
    : Math.abs(cents) <= AMBER_BAND
    ? COLOR_AMBER
    : COLOR_RED;

  const width = 200;
  const height = 110;
  const strokeWidth = 10;
  const cx = width / 2;
  const cy = height - strokeWidth / 2;
  const radius = (width - strokeWidth) / 2;

  const bands: [number, number, string][] = [
    [-MAX_CENTS, -AMBER_BAND, COLOR_RED],
    [-AMBER_BAND, -GREEN_BAND, COLOR_AMBER],
    [-GREEN_BAND, GREEN_BAND, COLOR_GREEN],
    [GREEN_BAND, AMBER_BAND, COLOR_AMBER],
    [AMBER_BAND, MAX_CENTS, COLOR_RED],
  ];

  const needleAngle = angleForCents(Math.max(-MAX_CENTS, Math.min(MAX_CENTS, cents)));
  const needleTip = pointOnArc(cx, cy, radius - strokeWidth, needleAngle);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <svg width={width} height={height}>
        {isDetecting ? (
          bands.map(([from, to, color]) => (
            <path key={`${from}-${to}`} d={arcPath(cx, cy, radius, from, to)} stroke={color} strokeWidth={strokeWidth} fill="none" />
          ))
        ) : (
          <path d={arcPath(cx, cy, radius, -MAX_CENTS, MAX_CENTS)} stroke={COLOR_MUTED} strokeWidth={strokeWidth} fill="none" />
        )}
        <line x1={cx} y1={cy} x2={needleTip.x} y2={needleTip.y} stroke={zoneColor} strokeWidth={4} />
        <circle cx={cx} cy={cy} r={5} fill={zoneColor} />
      </svg>
      {/* Fixed height regardless of font size — the label shrinks to 15px for longer
          dual "written (concert)" labels (e.g. "D (C4)"), and without a reserved
          height that alone shifts the rest of the screen up/down whenever detection
          starts/stops, separately from the cents caption below. */}
      <div style={{ height: 26, display: 'flex', alignItems: 'center' }}>
        <span style={{ fontSize: label.length > 5 ? 15 : 20, fontWeight: 'bold', color: isDetecting ? COLOR_TEXT : COLOR_MUTED }}>
          {label}
        </span>
      </div>
      {/* Always rendered (never conditional) so this line's height is reserved
          whether or not a pitch is detected — otherwise the rest of the screen
          shifts up/down every time detection starts or stops. */}
      <span style={{ fontSize: 12, color: zoneColor, marginTop: 2 }}>
        {!isDetecting ? ' ' : Math.abs(cents) <= GREEN_BAND ? 'in tune' : `${cents > 0 ? '+' : ''}${cents}¢`}
      </span>
    </div>
  );
}
