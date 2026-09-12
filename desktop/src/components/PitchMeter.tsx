import React from 'react';
import { useMemo } from 'react';
import { freqToMidi, dualNoteLabel } from '../music';

interface Props {
  hz: number;
  /** Instrument's transposition in semitones (0 = concert pitch, e.g. Piano). */
  transposeSemitones?: number;
  /** Concert-pitch key chroma, for spelling the concert half of the label. */
  keyChroma?: number;
}

export default function PitchMeter({ hz, transposeSemitones = 0, keyChroma = 0 }: Props) {
  const active = hz > 0;
  // '♪' (plain monochrome glyph, no emoji presentation — same family as
  // the app's '▶'/'■'/'↻' button glyphs), not the bare '—' a raw idle label
  // would produce, so the idle state reads as "no note detected yet" rather
  // than a misplaced divider (fixed during the UI review, issue #30).
  const noteName = useMemo(() => {
    if (!active) return '♪';
    const midi = freqToMidi(hz);
    if (midi < 0) return '♪';
    return dualNoteLabel(midi, transposeSemitones, keyChroma);
  }, [hz, active, transposeSemitones, keyChroma]);

  const ringColor = active ? '#4CAF50' : '#BDBDBD';
  const textColor = active ? '#212121' : '#BDBDBD';
  const fontSize = noteName.length > 5 ? 13 : noteName.length >= 3 ? 16 : 20;
  const size = 90;
  const cx = size / 2;
  const cy = size / 2;
  const r = (size - 4) / 2;

  return (
    <svg width={size} height={size}>
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="white"
        stroke={ringColor}
        strokeWidth={4}
      />
      <text
        x={cx}
        y={cy}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={fontSize}
        fontWeight="bold"
        fill={textColor}
      >
        {noteName}
      </text>
    </svg>
  );
}
