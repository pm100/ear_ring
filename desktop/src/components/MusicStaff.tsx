import React from 'react';
import { StaffDisplayNote } from '../types';
import { preferredMidiLabel, accidentalInKey, keySigPositions, staffPositionForMidi, keyAccidentalCount } from '../music';

// Flat PNG: 141×378px, belly (anchor) at exactly 50% height.
// Sharp PNG: 179×305px, bar-centre (anchor) at exactly 50% height.
// Position formula on every platform: top = targetY - displayH / 2
const FLAT_W  = 141;
const FLAT_H  = 378;
const SHARP_W = 179;
const SHARP_H = 305;

// Display height multipliers (same on all platforms).
// Width is derived from aspect ratio so images are never distorted.
const FLAT_H_MULT  = 3.0;
const SHARP_H_MULT = 2.0;

interface Props {
  notes: StaffDisplayNote[];
  fixedSpacing?: number;
  rootChroma?: number;
  keySignatureMode?: number;
}

// Map note state → colour-variant suffix used in PNG filenames.
function accSuffix(state: StaffDisplayNote['state']): string {
  switch (state) {
    case 'correct':   return '_correct';
    case 'incorrect': return '_wrong';
    case 'active':    return '_active';
    default:          return '';
  }
}

export default function MusicStaff({ notes, fixedSpacing, rootChroma = 0, keySignatureMode = 0 }: Props) {
  const svgWidth = 500;
  const svgHeight = 160;
  const lineSpacing = 12;
  const staffTop = svgHeight / 2 - 2 * lineSpacing;
  const noteRadius = lineSpacing * 0.45;
  const staffBottomY = staffTop + 4 * lineSpacing;
  const staffCenter = staffTop + 2 * lineSpacing;

  const calcNoteY = (staffPos: number) => staffCenter - (staffPos - 6) * (lineSpacing / 2);

  const clefH = lineSpacing * 8;
  const clefW = clefH * (299 / 638);
  const clefImgY = staffTop - lineSpacing * 2;

  // Accidental display sizes
  const flatDisplayH  = lineSpacing * FLAT_H_MULT;
  const sharpDisplayH = lineSpacing * SHARP_H_MULT;
  const flatDisplayW  = flatDisplayH  * (FLAT_W  / FLAT_H);
  const sharpDisplayW = sharpDisplayH * (SHARP_W / SHARP_H);

  // Key signature layout
  const keySigStartX = 2 + clefW + 6;
  const keySig = keySignatureMode === 1 ? keySigPositions(rootChroma) : null;
  const keySigDisplayH = keySig?.isSharp ? sharpDisplayH : flatDisplayH;
  const keySigDisplayW = keySig?.isSharp ? sharpDisplayW : flatDisplayW;
  const keySigCount = keySignatureMode === 1 ? Math.abs(keyAccidentalCount(rootChroma)) : 0;
  const keySigEndX = keySigStartX + keySigCount * keySigDisplayW + 8;
  const dynamicNoteAreaStart = Math.max(keySigStartX + 20, keySigEndX);
  const noteAreaWidth = svgWidth - dynamicNoteAreaStart - 20;
  const noteStep = fixedSpacing ?? noteAreaWidth / Math.max(notes.length, 1);
  const calcNoteX = (i: number) => dynamicNoteAreaStart + i * noteStep + noteStep / 2;

  const ledgerLineHalfWidth = noteRadius * 1.65;
  const noteHeadRx = noteRadius * 1.15;
  const noteHeadRy = noteRadius * 0.85;
  const stemLength = lineSpacing * 3.2;

  // Returns true=sharp, false=flat, null=none
  const accidentalIsSharp = (midi: number): boolean | null => {
    if (keySignatureMode === 1) {
      const acc = accidentalInKey(midi, rootChroma);
      if (acc === 1) return true;
      if (acc === 2) return false;
      return null;
    }
    const label = preferredMidiLabel(midi, rootChroma);
    if (label.includes('#')) return true;
    if (label.includes('b') || label.includes('\u266d')) return false;
    return null;
  };

  const getLedgerLines = (staffPos: number, cx: number): React.ReactNode[] => {
    const lines: React.ReactNode[] = [];
    const noteY = calcNoteY(staffPos);
    for (let n = 1; ; n++) {
      const ly = staffTop - n * lineSpacing;
      if (noteY > ly) break;
      lines.push(
        <line key={`above-${n}`} x1={cx - ledgerLineHalfWidth} y1={ly}
          x2={cx + ledgerLineHalfWidth} y2={ly} stroke="#555555" strokeWidth="1.5" />
      );
      if (n > 10) break;
    }
    for (let n = 1; ; n++) {
      const ly = staffBottomY + n * lineSpacing;
      if (noteY < ly) break;
      lines.push(
        <line key={`below-${n}`} x1={cx - ledgerLineHalfWidth} y1={ly}
          x2={cx + ledgerLineHalfWidth} y2={ly} stroke="#555555" strokeWidth="1.5" />
      );
      if (n > 10) break;
    }
    return lines;
  };

  const colorForState = (state: StaffDisplayNote['state']) => {
    switch (state) {
      case 'correct':   return '#4CAF50';
      case 'incorrect': return '#F44336';
      case 'active':    return '#3F51B5';
      default:          return '#333333';
    }
  };

  return (
    <svg width="100%" viewBox={`0 0 ${svgWidth} ${svgHeight}`} style={{ display: 'block' }}>
      {/* Staff lines */}
      {[0, 1, 2, 3, 4].map(lineIdx => {
        const y = staffTop + lineIdx * lineSpacing;
        return <line key={lineIdx} x1={5} y1={y} x2={svgWidth - 10} y2={y} stroke="#333333" strokeWidth="1.5" />;
      })}

      {/* Treble clef */}
      <image href="/treble_clef.png" x={2} y={clefImgY} width={clefW} height={clefH} />

      {/* Key signature — PNG images, anchor@50% → top = targetY - displayH/2 */}
      {keySig && keySig.positions.map((staffPos, i) => {
        const cy = calcNoteY(staffPos);
        const x = keySigStartX + i * keySigDisplayW;
        const href = keySig.isSharp ? '/sharp.png' : '/flat.png';
        return (
          <image
            key={`ks-${i}`}
            href={href}
            x={x}
            y={cy - keySigDisplayH / 2}
            width={keySigDisplayW}
            height={keySigDisplayH}
          />
        );
      })}

      {/* Notes */}
      {notes.map((note, i) => {
        const sp = staffPositionForMidi(note.midi, rootChroma);
        const cx = calcNoteX(i);
        const cy = calcNoteY(sp);
        const color = colorForState(note.state);
        const ledgers = getLedgerLines(sp, cx);
        const stemUp = sp < 6;
        const stemX = stemUp ? cx + noteHeadRx * 0.9 : cx - noteHeadRx * 0.9;
        const stemY2 = stemUp ? cy - stemLength : cy + stemLength;
        const isSharpAcc = accidentalIsSharp(note.midi);
        const suffix = accSuffix(note.state);

        return (
          <g key={`${note.midi}-${i}`}>
            {ledgers}
            {/* Per-note accidental PNG — anchor@50% → top = noteY - displayH/2 */}
            {isSharpAcc !== null && (() => {
              const dh = isSharpAcc ? sharpDisplayH : flatDisplayH;
              const dw = isSharpAcc ? sharpDisplayW : flatDisplayW;
              const href = isSharpAcc ? `/sharp${suffix}.png` : `/flat${suffix}.png`;
              return (
                <image
                  href={href}
                  x={cx - noteHeadRx * 2.4 - dw / 2}
                  y={cy - dh / 2}
                  width={dw}
                  height={dh}
                />
              );
            })()}
            <ellipse
              cx={cx} cy={cy} rx={noteHeadRx} ry={noteHeadRy}
              fill={color} stroke={color} strokeWidth="1.5"
              transform={`rotate(-20 ${cx} ${cy})`}
            />
            <line x1={stemX} y1={cy} x2={stemX} y2={stemY2}
              stroke={color} strokeWidth="1.7" strokeLinecap="round" />
          </g>
        );
      })}
    </svg>
  );
}
