import React from 'react';
import { useMemo } from 'react';
import { hzToLabel } from '../music';

interface Props {
  hz: number;
}

export default function PitchMeter({ hz }: Props) {
  const noteName = useMemo(() => hzToLabel(hz), [hz]);

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
