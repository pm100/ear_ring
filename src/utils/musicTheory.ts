/**
 * Music theory constants and helpers used by the UI layer.
 * Heavy computation is delegated to the Rust core via EarRingCoreModule.
 */

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;
export type NoteNameStr = (typeof NOTE_NAMES)[number];

export interface ScaleDefinition {
  id: number;
  name: string;
  intervals: number[];
}

export const SCALES: ScaleDefinition[] = [
  { id: 0, name: 'Major',            intervals: [0, 2, 4, 5, 7, 9, 11] },
  { id: 1, name: 'Natural Minor',    intervals: [0, 2, 3, 5, 7, 8, 10] },
  { id: 2, name: 'Harmonic Minor',   intervals: [0, 2, 3, 5, 7, 8, 11] },
  { id: 3, name: 'Pentatonic Major', intervals: [0, 2, 4, 7, 9] },
  { id: 4, name: 'Pentatonic Minor', intervals: [0, 3, 5, 7, 10] },
  { id: 5, name: 'Dorian',           intervals: [0, 2, 3, 5, 7, 9, 10] },
  { id: 6, name: 'Mixolydian',       intervals: [0, 2, 4, 5, 7, 9, 10] },
  { id: 7, name: 'Blues',            intervals: [0, 3, 5, 6, 7, 10] },
];

/** Octave choices for root note selection (C3–C5 covers most instruments). */
export const ROOT_OCTAVES = [3, 4, 5] as const;

/** MIDI note number for a given root name + octave. */
export function rootMidi(noteName: NoteNameStr, octave: number): number {
  const chroma = NOTE_NAMES.indexOf(noteName as NoteNameStr);
  return (octave + 1) * 12 + chroma;
}

/** Human-readable label for a MIDI note, e.g. "A4". */
export function midiLabel(midi: number): string {
  const chroma = midi % 12;
  const octave = Math.floor(midi / 12) - 1;
  return `${NOTE_NAMES[chroma]}${octave}`;
}

/** Whether two MIDI notes are the same pitch class (ignoring octave). */
export function samePitchClass(a: number, b: number): boolean {
  return a % 12 === b % 12;
}

/**
 * Check if a detected MIDI note matches an expected MIDI note within tolerance.
 * Tolerance: same pitch class (ignore octave) with ≤ 50 cent deviation.
 */
export function isCorrect(detected: number, expected: number, cents: number): boolean {
  return samePitchClass(detected, expected) && Math.abs(cents) <= 50;
}

// ── Key signature ─────────────────────────────────────────────────────────────

export type AccidentalType = 'sharp' | 'flat' | 'none';

export interface KeySignature {
  type: AccidentalType;
  count: number;
}

/** Major key signature for each chroma 0-11.
 *  Uses sharps for C, G, D, A, E, B, F#, C# and flats for F, Bb, Eb, Ab.
 *  D#/G#/A# use their flat enharmonic equivalents (Eb/Ab/Bb). */
const MAJOR_KEY_SIGS: Array<[AccidentalType, number]> = [
  ['none',  0], // C
  ['sharp', 7], // C#
  ['sharp', 2], // D
  ['flat',  3], // Eb (D#)
  ['sharp', 4], // E
  ['flat',  1], // F
  ['sharp', 6], // F#
  ['sharp', 1], // G
  ['flat',  4], // Ab (G#)
  ['sharp', 3], // A
  ['flat',  2], // Bb (A#)
  ['sharp', 5], // B
];

/** Semitones to add to scale root to reach the parent major scale root. */
const SCALE_MAJOR_OFFSET: Record<number, number> = {
  0: 0,  // Major
  1: 3,  // Natural Minor (relative major = root + 3)
  2: 3,  // Harmonic Minor
  3: 0,  // Pentatonic Major
  4: 3,  // Pentatonic Minor
  5: 10, // Dorian (parent major = root − 2)
  6: 5,  // Mixolydian (parent major = root + 5)
  7: 3,  // Blues (minor-based)
};

/** Return the key signature (sharps or flats) for a given root MIDI note + scale. */
export function getKeySignature(rootMidi: number, scaleId: number): KeySignature {
  const offset = SCALE_MAJOR_OFFSET[scaleId] ?? 0;
  const majorChroma = (rootMidi % 12 + offset) % 12;
  const [type, count] = MAJOR_KEY_SIGS[majorChroma];
  return { type, count };
}
