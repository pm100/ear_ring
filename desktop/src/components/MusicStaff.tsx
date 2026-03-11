import React from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { useEffect, useState } from 'react';

interface Props {
  sequence: number[];
  currentNoteIndex: number;
  highlightIndex: number;
  detected: { midi: number; correct: boolean }[];
  status: string;
  fixedSpacing?: number;
}

const NOTE_NAMES_SHARP = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];

function midiToLabel(midi: number): string {
  const octave = Math.floor(midi / 12) - 1;
  return `${NOTE_NAMES_SHARP[midi % 12]}${octave}`;
}

function useStaffPositions(sequence: number[]) {
  const [positions, setPositions] = useState<number[]>([]);
  useEffect(() => {
    if (sequence.length === 0) { setPositions([]); return; }
    Promise.all(sequence.map(midi => invoke<number>('cmd_staff_position', { midi }))).then(setPositions);
  }, [sequence]);
  return positions;
}

export default function MusicStaff({ sequence, currentNoteIndex, highlightIndex, detected, status, fixedSpacing }: Props) {
  const staffPositions = useStaffPositions(sequence);
  const svgWidth = 500;
  const svgHeight = 160;
  const lineSpacing = 12;
  const staffTop = svgHeight / 2 - 2 * lineSpacing;
  const leftMargin = 60;
  const noteRadius = lineSpacing * 0.45;
  const staffBottomY = staffTop + 4 * lineSpacing;

  const calcNoteY = (staffPos: number) => staffBottomY - (staffPos - 2) * (lineSpacing / 2);

  const clefFontSize = 85;
  const clefX = 2;
  // SVG text y = baseline. With fontSize 85, the treble clef glyph sits
  // roughly from (baseline - 85) to (baseline + 15). Position baseline so
  // the clef spans the full staff height (staffTop to staffBottom + a bit).
  const clefY = staffTop + 5.2 * lineSpacing;

  const noteAreaStart = leftMargin + 20;
  const noteAreaWidth = svgWidth - noteAreaStart - 20;
  const noteStep = fixedSpacing ?? noteAreaWidth / Math.max(sequence.length, 1);
  const calcNoteX = (i: number) => noteAreaStart + i * noteStep + noteStep / 2;

  const getNoteColor = (i: number): string => {
    if (i < detected.length) return detected[i].correct ? '#4CAF50' : '#F44336';
    if (i === highlightIndex && status === 'playing') return '#3F51B5';
    if (i === currentNoteIndex && status === 'listening') return '#3F51B5';
    return '#333333';
  };

  const isFilled = (i: number): boolean => {
    if (i < detected.length) return true;
    if (i === highlightIndex && status === 'playing') return true;
    if (i === currentNoteIndex && status === 'listening') return true;
    return false;
  };

  const ledgerLineHalfWidth = noteRadius * 2.8;

  const getLedgerLines = (staffPos: number, cx: number): React.ReactNode[] => {
    const lines: React.ReactNode[] = [];
    const noteY = calcNoteY(staffPos);
    for (let n = 1; ; n++) {
      const ly = staffTop - n * lineSpacing;
      if (noteY > ly) break;
      lines.push(
        <line
          key={`above-${n}`}
          x1={cx - ledgerLineHalfWidth}
          y1={ly}
          x2={cx + ledgerLineHalfWidth}
          y2={ly}
          stroke="#555555"
          strokeWidth="1.5"
        />
      );
      if (n > 10) break;
    }
    for (let n = 1; ; n++) {
      const ly = staffBottomY + n * lineSpacing;
      if (noteY < ly) break;
      lines.push(
        <line
          key={`below-${n}`}
          x1={cx - ledgerLineHalfWidth}
          y1={ly}
          x2={cx + ledgerLineHalfWidth}
          y2={ly}
          stroke="#555555"
          strokeWidth="1.5"
        />
      );
      if (n > 10) break;
    }
    return lines;
  };

  return (
    <svg width="100%" viewBox={`0 0 ${svgWidth} ${svgHeight}`} style={{ display: 'block' }}>
      {[0, 1, 2, 3, 4].map(lineIdx => {
        const y = staffTop + lineIdx * lineSpacing;
        return <line key={lineIdx} x1={leftMargin} y1={y} x2={svgWidth - 10} y2={y} stroke="#333333" strokeWidth="1.5" />;
      })}

      <text x={clefX} y={clefY} fontSize={clefFontSize} fontFamily="'Segoe UI Symbol','Apple Symbols','FreeSerif','Arial Unicode MS',serif" fill="#333" style={{ userSelect: 'none' }}>{'\uD834\uDD1E'}</text>

      {sequence.map((midi, i) => {
        const sp = staffPositions[i];
        if (sp === undefined) return null;
        const cx = calcNoteX(i);
        const cy = calcNoteY(sp);
        const color = getNoteColor(i);
        const filled = isFilled(i);
        const ledgers = getLedgerLines(sp, cx);

        return (
          <g key={i}>
            {ledgers}
            <circle
              cx={cx}
              cy={cy}
              r={noteRadius}
              fill={color}
              stroke={color}
              strokeWidth="1.5"
            />
            {!filled && (
              <circle
                cx={cx}
                cy={cy}
                r={noteRadius - 2.5}
                fill="white"
              />
            )}
            <text
              x={cx}
              y={cy + noteRadius + 12}
              textAnchor="middle"
              fontSize="10"
              fill={color}
              style={{ userSelect: 'none' }}
            >
              {midiToLabel(midi)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
