// @ts-ignore
import ABCJS from 'abcjs';
import { RawNote } from '../types';

// ── Note name constants ───────────────────────────────────────────────────────
// Use flat names for display but sharp (^) in ABC for simplicity
const ABC_NOTE = ['C','^C','D','^D','E','F','^F','G','^G','A','^A','B'];

// ── ABC → notes ──────────────────────────────────────────────────────────────

function abcPitchToMidi(pitch: number): number {
  const DIATONIC_TO_SEMITONE = [0, 2, 4, 5, 7, 9, 11];
  const octave = Math.floor(pitch / 7);
  const step = ((pitch % 7) + 7) % 7;
  return 60 + octave * 12 + DIATONIC_TO_SEMITONE[step];
}

function applyAccidental(baseMidi: number, accidental: string | undefined): number {
  if (!accidental) return baseMidi;
  if (accidental === 'sharp') return baseMidi + 1;
  if (accidental === 'flat') return baseMidi - 1;
  if (accidental === 'dblsharp') return baseMidi + 2;
  if (accidental === 'dblflat') return baseMidi - 2;
  return baseMidi;
}

export function parseAbcKeyChroma(keyStr: string): number {
  const s = keyStr.trim();
  const noteMap: Record<string, number> = {
    'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3,
    'E': 4, 'F': 5, 'F#': 6, 'Gb': 6, 'G': 7, 'G#': 8,
    'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10, 'B': 11,
  };
  const match = s.match(/^([A-G][#b]?)/);
  if (!match) return 0;
  return noteMap[match[1]] ?? 0;
}

/** Parse ABC notation into RawNote[] (semitone offsets from nearest root near MIDI 60). */
export function parseAbcToNotes(abcString: string): RawNote[] | null {
  try {
    const tuneBook = ABCJS.parseOnly(abcString, { print: false }) as any[];
    if (!tuneBook || tuneBook.length === 0) return null;
    const tune = tuneBook[0];

    let rootChroma = 0;
    if (tune.lines?.[0]?.staff?.[0]?.key?.root !== undefined) {
      const keyRoot = tune.lines[0].staff[0].key.root;
      const acc = tune.lines[0].staff[0].key.acc || '';
      rootChroma = parseAbcKeyChroma(keyRoot + acc);
    }

    const notes: Array<{ midi: number; duration: number }> = [];
    for (const line of (tune.lines || [])) {
      for (const staff of (line.staff || [])) {
        for (const voice of (staff.voices || [])) {
          for (const el of voice) {
            if (el.el_type !== 'note') continue;
            if (!el.pitches || el.pitches.length === 0) continue;
            const p = el.pitches[0];
            let midi = abcPitchToMidi(p.pitch);
            midi = applyAccidental(midi, p.accidental);
            const beats = (el.duration || 0.25) * 4;
            if (beats > 0) notes.push({ midi, duration: beats });
          }
        }
        break;
      }
    }
    if (notes.length === 0) return null;

    let rootMidi = 60 + rootChroma;
    const avgMidi = notes.reduce((s, n) => s + n.midi, 0) / notes.length;
    while (rootMidi + 12 <= avgMidi - 3) rootMidi += 12;
    while (rootMidi - 12 >= avgMidi + 3) rootMidi -= 12;

    return notes.map(n => ({
      semitones: n.midi - rootMidi,
      duration: Math.round(n.duration * 8) / 8,
    }));
  } catch (e) {
    console.error('ABC parse error:', e);
    return null;
  }
}

// ── Notes → ABC ──────────────────────────────────────────────────────────────

/** Format a beat duration as an ABC duration suffix (L:1/4 base). */
function fmtDur(beats: number): string {
  const n = Math.round(beats * 8);
  if (n === 8)  return '';       // quarter — no suffix
  if (n === 16) return '2';
  if (n === 32) return '4';
  if (n === 4)  return '/2';
  if (n === 2)  return '/4';
  if (n === 1)  return '/8';
  if (n === 12) return '3/2';    // dotted quarter
  if (n === 6)  return '3/4';    // dotted eighth
  if (n === 24) return '3';      // dotted half
  const gcd = (a: number, b: number): number => b === 0 ? a : gcd(b, a % b);
  const g = gcd(n, 8);
  const num = n / g;
  const den = 8 / g;
  return den === 1 ? `${num}` : `${num}/${den}`;
}

/**
 * Convert RawNote[] to an ABC string.
 * semitones are offsets from C4 (rootMidi=60), octaveShift is applied.
 * Key is always K:C (no key signature — all accidentals inline).
 */
export function rawNotesToAbc(notes: RawNote[], title: string, octaveShift = 0): string {
  const noteStrs = notes.map(n => {
    const midi = Math.max(21, Math.min(108, 60 + n.semitones + octaveShift * 12));
    const pc = ((midi % 12) + 12) % 12;
    const baseName = ABC_NOTE[pc]; // e.g. "C", "^C", "D"
    const letterOnly = baseName.replace('^', '');
    const sharp = baseName.startsWith('^');
    const midiOct = Math.floor(midi / 12) - 1; // 4 for MIDI 60-71

    let letter: string;
    let octMark: string;
    if (midiOct <= 3) {
      letter = letterOnly.toUpperCase();
      octMark = ','.repeat(4 - midiOct);
    } else if (midiOct === 4) {
      letter = letterOnly.toUpperCase();
      octMark = '';
    } else if (midiOct === 5) {
      letter = letterOnly.toLowerCase();
      octMark = '';
    } else {
      letter = letterOnly.toLowerCase();
      octMark = "'".repeat(midiOct - 5);
    }

    const acc = sharp ? '^' : '';
    return `${acc}${letter}${octMark}${fmtDur(n.duration)}`;
  });

  // Group into bars of 4 beats
  const bars: string[] = [];
  let bar: string[] = [];
  let barBeats = 0;
  for (let i = 0; i < notes.length; i++) {
    bar.push(noteStrs[i]);
    barBeats += notes[i].duration;
    if (barBeats >= 4) {
      bars.push(bar.join(' '));
      bar = [];
      barBeats = 0;
    }
  }
  if (bar.length > 0) bars.push(bar.join(' '));

  const bodyLine = bars.join(' | ') + (bars.length > 0 ? ' |]' : '');

  return [
    `X:1`,
    `T:${title}`,
    `M:4/4`,
    `L:1/4`,
    `K:C`,
    bodyLine,
  ].join('\n');
}
