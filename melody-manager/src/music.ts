export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const NOTE_NAMES_FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

// Order of sharps/flats by pitch class (matches Rust SHARP_ORDER / FLAT_ORDER)
const SHARP_ORDER = [6, 1, 8, 3, 10, 5, 11];
const FLAT_ORDER  = [10, 3, 8, 1, 6, 11, 5];

// Treble-clef staff positions for key sig accidentals (matches Rust constants)
const SHARP_STAFF_POSITIONS = [10, 7, 11, 8, 5, 9, 6];
const FLAT_STAFF_POSITIONS  = [6, 9, 5, 8, 4, 7, 3];

export function keyAccidentalCount(rootChroma: number): number {
  switch (rootChroma % 12) {
    case 0: return 0;
    case 7: return 1;
    case 2: return 2;
    case 9: return 3;
    case 4: return 4;
    case 11: return 5;
    case 6: return 6;
    case 1: return 7;
    case 5: return -1;
    case 10: return -2;
    case 3: return -3;
    case 8: return -4;
    default: return 0;
  }
}

export function isSharpKey(rootChroma: number): boolean {
  return keyAccidentalCount(rootChroma) >= 0;
}

export function preferredMidiLabel(midi: number, rootChroma: number): string {
  const octave = Math.floor(midi / 12) - 1;
  const chroma = ((midi % 12) + 12) % 12;
  const names = isSharpKey(rootChroma) ? NOTE_NAMES : NOTE_NAMES_FLAT;
  return `${names[chroma]}${octave}`;
}

export function keySigPositions(rootChroma: number): { positions: number[]; isSharp: boolean } {
  const count = keyAccidentalCount(rootChroma);
  if (count > 0) return { positions: SHARP_STAFF_POSITIONS.slice(0, count), isSharp: true };
  if (count < 0) return { positions: FLAT_STAFF_POSITIONS.slice(0, -count), isSharp: false };
  return { positions: [], isSharp: true };
}

export function accidentalInKey(midi: number, rootChroma: number): number {
  const chroma = ((midi % 12) + 12) % 12;
  const count = keyAccidentalCount(rootChroma);
  const ksChromas = count > 0 ? SHARP_ORDER.slice(0, count) : FLAT_ORDER.slice(0, -count);
  if (count >= 0) {
    if (ksChromas.includes(chroma)) return 0;
    if (ksChromas.includes((chroma + 1) % 12)) return 3;
    if ([1, 3, 6, 8, 10].includes(chroma)) return 1;
    return 0;
  } else {
    if (ksChromas.includes(chroma)) return 0;
    if (ksChromas.includes((chroma + 11) % 12)) return 3;
    if ([1, 3, 6, 8, 10].includes(chroma)) return 2;
    return 0;
  }
}

export function midiToLabel(midi: number): string {
  const octave = Math.floor(midi / 12) - 1;
  return `${NOTE_NAMES[midi % 12]}${octave}`;
}

export function freqToMidi(hz: number): number {
  if (!Number.isFinite(hz) || hz <= 0) {
    return -1;
  }
  return Math.round(69 + 12 * Math.log2(hz / 440));
}

export function freqToCents(hz: number): number {
  const midi = freqToMidi(hz);
  if (midi < 0) {
    return 0;
  }
  const referenceHz = 440 * Math.pow(2, (midi - 69) / 12);
  return Math.round(1200 * Math.log2(hz / referenceHz));
}

export function hzToLabel(hz: number): string {
  const midi = freqToMidi(hz);
  return midi >= 0 ? midiToLabel(midi) : '\u2014';
}

export function staffPositionForMidi(midi: number, rootChroma: number = 0): number {
  const octave = Math.floor(midi / 12) - 1;
  const pitchClass = ((midi % 12) + 12) % 12;
  // Flat keys: flattened pitch classes go to their upper diatonic neighbour
  // (e.g. Bb→B's position 6, Ab→A's position 5). Sharp keys use standard mapping.
  const diatonic = isSharpKey(rootChroma)
    ? [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6][pitchClass]
    : [0, 1, 1, 2, 2, 3, 4, 4, 5, 5, 6, 6][pitchClass];
  return (octave - 4) * 7 + diatonic;
}
