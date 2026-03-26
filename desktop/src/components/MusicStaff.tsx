import React from 'react';
import { StaffDisplayNote } from '../types';
import { preferredMidiLabel, accidentalInKey, keySigPositions, staffPositionForMidi, keyAccidentalCount } from '../music';

interface Props {
  notes: StaffDisplayNote[];
  fixedSpacing?: number;
  rootChroma?: number;
  keySignatureMode?: number;
}

export default function MusicStaff({ notes, fixedSpacing, rootChroma = 0, keySignatureMode = 0 }: Props) {
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

  const keySigStartX = 2 + clefW + 6;
  const keySigStep = lineSpacing * 0.95;
  const keySigCount = keySignatureMode === 1 ? Math.abs(keyAccidentalCount(rootChroma)) : 0;
  const keySigEndX = keySigStartX + keySigCount * keySigStep + 8;
  const dynamicNoteAreaStart = Math.max(keySigStartX + 20, keySigEndX);
  const noteAreaWidth = svgWidth - dynamicNoteAreaStart - 20;
  const noteStep = fixedSpacing ?? noteAreaWidth / Math.max(notes.length, 1);
  const calcNoteX = (i: number) => dynamicNoteAreaStart + i * noteStep + noteStep / 2;

  const ledgerLineHalfWidth = noteRadius * 1.65;
  const noteHeadRx = noteRadius * 1.15;
  const noteHeadRy = noteRadius * 0.85;
  const stemLength = lineSpacing * 3.2;

  const accidentalForNote = (midi: number): string | null => {
    if (keySignatureMode === 1) {
      const acc = accidentalInKey(midi, rootChroma);
      if (acc === 1) return '\u266f';
      if (acc === 2) return '\u266d';
      if (acc === 3) return '\u266e';
      return null;
    }
    const label = preferredMidiLabel(midi, rootChroma);
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

      <image href="/treble_clef.png" x={2} y={clefImgY} width={clefW} height={clefH} />

      {keySignatureMode === 1 && (() => {
        const keySig = keySigPositions(rootChroma);
        const symbol = keySig.isSharp ? '\u266f' : '\u266d';
        // Start just after clef PNG right edge (x=2+clefW), step lineSpacing*0.95
        const keySigStartX = 2 + clefW + 6;
        const keySigStep = lineSpacing * 0.95;
        return keySig.positions.map((staffPos, i) => {
          const cy = calcNoteY(staffPos);
          const cx = keySigStartX + i * keySigStep;
          const keySigFontSize = keySig.isSharp ? lineSpacing * 3.0 : lineSpacing * 3.5;
          // ♭: use alphabetic baseline; belly sits just above baseline → y = cy + fontSize*0.15
          // ♯: use central baseline; bars centred on cy
          const drawY = keySig.isSharp ? cy : cy + keySigFontSize * 0.15;
          const baseline = keySig.isSharp ? 'central' : 'auto';
          return (
            <text
              key={`ks-${i}`}
              x={cx}
              y={drawY}
              textAnchor="start"
              dominantBaseline={baseline}
              fontSize={keySigFontSize}
              fill="#333333"
              style={{ userSelect: 'none' }}
            >
              {symbol}
            </text>
          );
        });
      })()}

      {notes.map((note, i) => {
        const sp = staffPositionForMidi(note.midi, rootChroma);
        const cx = calcNoteX(i);
        const cy = calcNoteY(sp);
        const color = colorForState(note.state);
        const ledgers = getLedgerLines(sp, cx);
        const stemUp = sp < 6;
        const accidental = accidentalForNote(note.midi);
        const stemX = stemUp ? cx + noteHeadRx * 0.9 : cx - noteHeadRx * 0.9;
        const stemY2 = stemUp ? cy - stemLength : cy + stemLength;

        return (
          <g key={`${note.midi}-${i}`}>
            {ledgers}
            {accidental && (
              <text
                x={cx - noteHeadRx * 2.4}
                y={accidental === '♭' ? cy + lineSpacing * 3.5 * 0.15 : cy}
                textAnchor="middle"
                dominantBaseline={accidental === '♭' ? 'auto' : 'central'}
                fontSize={accidental === '♭' ? lineSpacing * 3.5 : lineSpacing * 3.0}
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
