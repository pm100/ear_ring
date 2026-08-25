import React from 'react';
import { useMemo } from 'react';
import { midiToLabel } from '../music';

interface Props {
  /** MIDI note to display, or -1 when nothing is detected. Callers are responsible for
   *  resolving this to the right value first — debounced (TrackerFrame.displayMidi, not
   *  liveMidi, so a single-frame detection glitch never flashes on screen) and, for a
   *  transposing instrument, already shifted to written/display pitch. This component
   *  does no detection or transposition logic of its own. */
  midi: number;
}

export default function PitchMeter({ midi }: Props) {
  const active = midi >= 0;
  const noteName = useMemo(() => (active ? midiToLabel(midi) : '—'), [active, midi]);

  const ringColor = active ? '#4CAF50' : '#BDBDBD';
  const textColor = active ? '#212121' : '#BDBDBD';
  const fontSize = noteName.length >= 3 ? 16 : 20;
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
