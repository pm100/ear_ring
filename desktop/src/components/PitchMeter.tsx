import React from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { useState, useEffect } from 'react';

interface Props {
  hz: number;
}

const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];

export default function PitchMeter({ hz }: Props) {
  const [noteName, setNoteName] = useState('\u2014');

  useEffect(() => {
    if (hz <= 0) {
      setNoteName('\u2014');
      return;
    }
    invoke<number>('cmd_freq_to_midi', { hz }).then((m) => {
      if (m >= 0) {
        const octave = Math.floor(m / 12) - 1;
        setNoteName(`${NOTE_NAMES[m % 12]}${octave}`);
      } else {
        setNoteName('\u2014');
      }
    });
  }, [hz]);

  const active = hz > 0;
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
