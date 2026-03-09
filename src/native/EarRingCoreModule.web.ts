/**
 * Web platform implementation of EarRingCoreModule.
 *
 * Implements all functions in pure JavaScript, mirroring the Rust core logic.
 * This avoids WASM loading complexity with Metro bundler and works immediately
 * in the browser. The Rust/WASM build remains available for future native use.
 */

import type { NoteResult } from './EarRingCoreModule';

// ── Music theory (mirrors rust/src/music_theory.rs) ──────────────────────────

/** Convert MIDI note number to frequency in Hz (A4 = 440 Hz, MIDI 69). */
function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** Convert frequency to nearest MIDI note + cents deviation. */
export function freqToNote(hz: number): NoteResult | null {
  if (hz <= 0) return null;
  const midiF = 69 + 12 * Math.log2(hz / 440);
  if (midiF < 0 || midiF > 127) return null;
  const midi = Math.round(midiF);
  const cents = Math.round((midiF - midi) * 100);
  return { midi, cents };
}

/** Diatonic step offset (C=0, D=1, E=2, F=3, G=4, A=5, B=6) per chroma. */
const DIATONIC = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6];

/** Get staff position: diatonic steps above middle C (C4 = 0). */
export function staffPosition(midi: number): number {
  const chroma = midi % 12;
  const octave = Math.floor(midi / 12) - 1;
  return (octave - 4) * 7 + DIATONIC[chroma];
}

const SCALE_INTERVALS: Record<number, number[]> = {
  0: [0, 2, 4, 5, 7, 9, 11],      // Major
  1: [0, 2, 3, 5, 7, 8, 10],      // Natural Minor
  2: [0, 2, 3, 5, 7, 8, 11],      // Harmonic Minor
  3: [0, 2, 4, 7, 9],             // Pentatonic Major
  4: [0, 3, 5, 7, 10],            // Pentatonic Minor
  5: [0, 2, 3, 5, 7, 9, 10],      // Dorian
  6: [0, 2, 4, 5, 7, 9, 10],      // Mixolydian
  7: [0, 3, 5, 6, 7, 10],         // Blues
};

/** LCG random number generator (matches Rust implementation). */
function lcgNext(seed: bigint): bigint {
  return (seed * 6364136223846793005n + 1442695040888963407n) & 0xFFFFFFFFFFFFFFFFn;
}

/** Generate a sequence of MIDI note numbers from the given scale. */
export function generateSequence(
  rootMidi: number,
  scaleId: number,
  length: number,
  seed: number
): number[] {
  const intervals = SCALE_INTERVALS[scaleId] ?? SCALE_INTERVALS[0];
  const notes = intervals.map((i) => rootMidi + i);
  const n = BigInt(notes.length);
  let rng = BigInt(seed);
  const result: number[] = [];
  for (let i = 0; i < length; i++) {
    rng = lcgNext(rng);
    const idx = Number((rng >> 33n) % n);
    result.push(notes[idx]);
  }
  return result;
}

// ── Pitch detection (YIN algorithm — mirrors rust/src/pitch_detection.rs) ────

const YIN_THRESHOLD = 0.25;

/** Detect fundamental frequency via YIN algorithm. */
export function detectPitch(samples: Float32Array, sampleRate: number): number {
  const n = samples.length;
  if (n < 2) return -1;
  const maxLag = Math.min(Math.floor(sampleRate / 20), Math.floor(n / 2));
  const minLag = Math.max(Math.floor(sampleRate / 1200), 2);
  if (maxLag <= minLag) return -1;

  // Difference function
  const diff = new Float32Array(maxLag + 1);
  for (let tau = 1; tau <= maxLag; tau++) {
    let sum = 0;
    for (let j = 0; j < n - tau; j++) {
      const delta = samples[j] - samples[j + tau];
      sum += delta * delta;
    }
    diff[tau] = sum;
  }

  // CMNDF
  const cmndf = new Float32Array(maxLag + 1);
  cmndf[0] = 1;
  let running = 0;
  for (let tau = 1; tau <= maxLag; tau++) {
    running += diff[tau];
    cmndf[tau] = running < 1e-10 ? 1 : (diff[tau] * tau) / running;
  }

  // Find first dip below threshold
  let tauOpt = -1;
  for (let tau = minLag; tau <= maxLag; tau++) {
    if (cmndf[tau] < YIN_THRESHOLD) {
      while (tau + 1 <= maxLag && cmndf[tau + 1] < cmndf[tau]) tau++;
      tauOpt = tau;
      break;
    }
  }
  if (tauOpt === -1) {
    // Fallback: global minimum
    let minVal = Infinity;
    for (let tau = minLag; tau <= maxLag; tau++) {
      if (cmndf[tau] < minVal) { minVal = cmndf[tau]; tauOpt = tau; }
    }
  }
  if (tauOpt <= 0 || cmndf[tauOpt] > 0.5) return -1;

  // Parabolic interpolation
  if (tauOpt > 0 && tauOpt < maxLag) {
    const y0 = cmndf[tauOpt - 1], y1 = cmndf[tauOpt], y2 = cmndf[tauOpt + 1];
    const denom = 2 * (2 * y1 - y2 - y0);
    if (Math.abs(denom) > 1e-10) {
      tauOpt = tauOpt + (y2 - y0) / denom;
    }
  }

  return sampleRate / tauOpt;
}
