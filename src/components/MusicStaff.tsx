import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Line, G, Ellipse, Text as SvgText } from 'react-native-svg';
import type { KeySignature } from '../utils/musicTheory';

export type NoteColor = 'white' | 'green' | 'red';
export type { KeySignature };

interface NoteHeadProps {
  /** Diatonic steps above middle C (C4=0, D4=1, … C5=7, B3=-1, …) */
  staffStep: number;
  color: NoteColor;
  /** Horizontal x position on the staff */
  x: number;
  /** Whether to draw a ledger line for this note */
  needsLedger?: boolean;
  /** Accidental to show to the left of this note head */
  accidental?: 'sharp' | 'flat';
}

const LINE_SPACING = 10; // px between staff lines
const STAFF_TOP = 40;    // y of top staff line (E5 in treble)

/** Convert a staff step (relative to C4) to a y pixel coordinate.
 *  staffPosition() returns: C4=0, D4=1, E4=2, F4=3, G4=4, A4=5, B4=6, C5=7, …
 *  Treble staff lines (bottom→top): E4(2), G4(4), B4(6), D5(8), F5(10)
 *  Middle C (C4, step 0) sits one ledger line below the staff.
 *  Each step = LINE_SPACING/2 pixels vertically.
 */
function staffY(step: number): number {
  // Bottom staff line = E4 = step 2.
  const bottomLineY = STAFF_TOP + 4 * LINE_SPACING;
  return bottomLineY - (step - 2) * (LINE_SPACING / 2);
}

export function NoteHead({ staffStep, color, x, needsLedger, accidental }: NoteHeadProps) {
  const y = staffY(staffStep);
  const fill = color === 'white' ? '#ffffff' : color === 'green' ? '#4ade80' : '#f87171';
  const stroke = color === 'white' ? '#94a3b8' : fill;

  return (
    <G>
      {/* Ledger line for notes outside the staff (middle C, etc.) */}
      {needsLedger && (
        <Line
          x1={x - 14}
          y1={y}
          x2={x + 14}
          y2={y}
          stroke="#94a3b8"
          strokeWidth={1.5}
        />
      )}
      {/* Accidental symbol to the left of the note head */}
      {accidental && (
        <SvgText
          x={x - 14}
          y={y + (accidental === 'flat' ? 7 : 5)}
          fontSize={20}
          fill={fill}
          fontFamily="serif"
          textAnchor="middle"
        >
          {accidental === 'sharp' ? '♯' : '♭'}
        </SvgText>
      )}
      <Ellipse
        cx={x}
        cy={y}
        rx={7}
        ry={5}
        fill={fill}
        stroke={stroke}
        strokeWidth={1.5}
        transform={`rotate(-20, ${x}, ${y})`}
      />
    </G>
  );
}

// ── MusicStaff ────────────────────────────────────────────────────────────────

interface DisplayNote {
  staffStep: number;
  color: NoteColor;
  accidental?: 'sharp' | 'flat';
}

interface MusicStaffProps {
  notes: DisplayNote[];
  width?: number;
  keySignature?: KeySignature;
}

const STAFF_HEIGHT = STAFF_TOP + 4 * LINE_SPACING + 40; // some padding below
const CLEF_WIDTH = 48;
const NOTE_SPACING = 50;
const ACCIDENTAL_WIDTH = 16; // px per accidental symbol

/** Treble-clef staff steps for each sharp in circle-of-fifths order: F C G D A E B */
const SHARP_STEPS = [10, 7, 11, 8, 5, 9, 6];
/** Treble-clef staff steps for each flat in order: B E A D G C F */
const FLAT_STEPS  = [6, 9, 5, 8, 4, 7, 3];

function needsLedgerLine(step: number): boolean {
  // C4 (step 0) needs a ledger line below the staff.
  // A5 (step 12) and above need a ledger line above the staff.
  // Notes in the space above/below the staff (steps 1, 11) do not need one.
  return step <= 0 || step >= 12;
}

export default function MusicStaff({ notes, width = 360, keySignature }: MusicStaffProps) {
  const accCount = (keySignature && keySignature.type !== 'none') ? keySignature.count : 0;
  const keySigWidth = accCount > 0 ? accCount * ACCIDENTAL_WIDTH + 6 : 0;
  const noteStartX = CLEF_WIDTH + keySigWidth + 20;
  const staffWidth = Math.max(width, noteStartX + notes.length * NOTE_SPACING + 30);

  const accSteps = keySignature?.type === 'flat' ? FLAT_STEPS : SHARP_STEPS;
  const accChar  = keySignature?.type === 'flat' ? '♭' : '♯';
  const keySigX  = CLEF_WIDTH + 4; // x of first accidental symbol (centered)

  return (
    <View style={styles.container}>
      <Svg width={staffWidth} height={STAFF_HEIGHT}>
        {/* 5 staff lines */}
        {[0, 1, 2, 3, 4].map((i) => (
          <Line
            key={i}
            x1={0}
            y1={STAFF_TOP + i * LINE_SPACING}
            x2={staffWidth}
            y2={STAFF_TOP + i * LINE_SPACING}
            stroke="#94a3b8"
            strokeWidth={1.5}
          />
        ))}

        {/* Treble clef symbol (simplified as text; swap for SVG path in production) */}
        <SvgText
          x={6}
          y={STAFF_TOP + 3 * LINE_SPACING + 4}
          fontSize={52}
          fill="#94a3b8"
          fontFamily="serif"
        >
          𝄞
        </SvgText>

        {/* Key signature accidentals */}
        {Array.from({ length: accCount }, (_, i) => {
          const step = accSteps[i];
          const x = keySigX + i * ACCIDENTAL_WIDTH + ACCIDENTAL_WIDTH / 2;
          // y offset: place accidental visually centered on the staff step
          const y = staffY(step) + (keySignature?.type === 'flat' ? 6 : 4);
          return (
            <SvgText
              key={`acc-${i}`}
              x={x}
              y={y}
              fontSize={20}
              fill="#94a3b8"
              fontFamily="serif"
              textAnchor="middle"
            >
              {accChar}
            </SvgText>
          );
        })}

        {/* Note heads */}
        {notes.map((n, i) => (
          <NoteHead
            key={i}
            staffStep={n.staffStep}
            color={n.color}
            x={noteStartX + i * NOTE_SPACING}
            needsLedger={needsLedgerLine(n.staffStep)}
            accidental={n.accidental}
          />
        ))}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 8,
    overflow: 'hidden',
  },
});
