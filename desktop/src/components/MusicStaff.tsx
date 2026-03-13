import React from 'react';
import { StaffDisplayNote } from '../types';
import { midiToLabel, staffPositionForMidi } from '../music';

interface Props {
  notes: StaffDisplayNote[];
  fixedSpacing?: number;
}

export default function MusicStaff({ notes, fixedSpacing }: Props) {
  const svgWidth = 500;
  const svgHeight = 160;
  const lineSpacing = 12;
  const staffTop = svgHeight / 2 - 2 * lineSpacing;
  const leftMargin = 60;
  const noteRadius = lineSpacing * 0.45;
  const staffBottomY = staffTop + 4 * lineSpacing;
  const staffCenter = staffTop + 2 * lineSpacing;

  const calcNoteY = (staffPos: number) => staffCenter - (staffPos - 6) * (lineSpacing / 2);

  const clefH = lineSpacing * 8;
  const clefW = clefH * (149 / 307);
  const clefImgY = staffTop - lineSpacing * 2;

  const noteAreaStart = leftMargin + 20;
  const noteAreaWidth = svgWidth - noteAreaStart - 20;
  const noteStep = fixedSpacing ?? noteAreaWidth / Math.max(notes.length, 1);
  const calcNoteX = (i: number) => noteAreaStart + i * noteStep + noteStep / 2;

  const ledgerLineHalfWidth = noteRadius * 2.8;
  const noteHeadRx = noteRadius * 1.15;
  const noteHeadRy = noteRadius * 0.85;
  const stemLength = lineSpacing * 3.2;

  const accidentalForMidi = (midi: number): string | null => {
    const label = midiToLabel(midi);
    if (label.includes('#')) return '\u266f';
    if (label.includes('b') || label.includes('\u266d')) return '\u266d';
    return null;
  };

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

  const colorForState = (state: StaffDisplayNote['state']) => {
    switch (state) {
      case 'correct': return '#4CAF50';
      case 'incorrect': return '#F44336';
      case 'active': return '#3F51B5';
      default: return '#333333';
    }
  };

  return (
    <svg width="100%" viewBox={`0 0 ${svgWidth} ${svgHeight}`} style={{ display: 'block' }}>
      {[0, 1, 2, 3, 4].map(lineIdx => {
        const y = staffTop + lineIdx * lineSpacing;
        return <line key={lineIdx} x1={5} y1={y} x2={svgWidth - 10} y2={y} stroke="#333333" strokeWidth="1.5" />;
      })}

      <image href="treble_clef.png" x={2} y={clefImgY} width={clefW} height={clefH} />

      {notes.map((note, i) => {
        const sp = staffPositionForMidi(note.midi);
        const cx = calcNoteX(i);
        const cy = calcNoteY(sp);
        const color = colorForState(note.state);
        const ledgers = getLedgerLines(sp, cx);
        const stemUp = sp < 6;
        const accidental = accidentalForMidi(note.midi);
        const stemX = stemUp ? cx + noteHeadRx * 0.9 : cx - noteHeadRx * 0.9;
        const stemY2 = stemUp ? cy - stemLength : cy + stemLength;

        return (
          <g key={`${note.midi}-${i}`}>
            {ledgers}
            {accidental && (
              <text
                x={cx - noteHeadRx * 2.4}
                y={cy + 4}
                textAnchor="middle"
                fontSize={lineSpacing * 1.8}
                fill={color}
                style={{ userSelect: 'none' }}
              >
                {accidental}
              </text>
            )}
            <ellipse
              cx={cx}
              cy={cy}
              rx={noteHeadRx}
              ry={noteHeadRy}
              fill={color}
              stroke={color}
              strokeWidth="1.5"
              transform={`rotate(-20 ${cx} ${cy})`}
            />
            <line
              x1={stemX}
              y1={cy}
              x2={stemX}
              y2={stemY2}
              stroke={color}
              strokeWidth="1.7"
              strokeLinecap="round"
            />
          </g>
        );
      })}
    </svg>
  );
}
