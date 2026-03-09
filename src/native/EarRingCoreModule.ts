/**
 * EarRingCoreModule — React Native interface to the Rust ear_ring_core library.
 *
 * On iOS/Android this calls the native Turbo Module which wraps the compiled
 * Rust C FFI.  On Web the .web.ts platform-specific file is loaded instead.
 *
 * If the native module is unavailable (e.g. Rust JNI not yet built), falls
 * back to the pure-JS implementation so the app stays functional.
 */

import { NativeModules } from 'react-native';
import * as JSImpl from './EarRingCoreModule.web';

const { EarRingCore } = NativeModules;

if (!EarRingCore) {
  console.warn(
    'EarRingCore native module not found — falling back to JS implementation. ' +
    'Build the Rust JNI/XCFramework to enable native pitch detection.'
  );
}

export interface NoteResult {
  midi: number;
  cents: number;
}

/** Detect the fundamental pitch in a block of f32 PCM samples. Returns Hz or -1. */
export function detectPitch(samples: Float32Array, sampleRate: number): number {
  if (!EarRingCore) return JSImpl.detectPitch(samples, sampleRate);
  return EarRingCore.detectPitch(Array.from(samples), sampleRate);
}

/** Convert a frequency (Hz) to the nearest MIDI note + cents deviation. */
export function freqToNote(hz: number): NoteResult | null {
  if (!EarRingCore) return JSImpl.freqToNote(hz);
  return EarRingCore.freqToNote(hz);
}

/** Get the staff position for a MIDI note (0 = C4, +7 = C5, -1 = B3, etc.). */
export function staffPosition(midi: number): number {
  if (!EarRingCore) return JSImpl.staffPosition(midi);
  return EarRingCore.staffPosition(midi);
}

/**
 * Generate a random sequence of MIDI note numbers from a given scale.
 * @param rootMidi  Root note MIDI number (e.g. 60 = C4)
 * @param scaleId   0=Major 1=NatMinor 2=HarmMinor 3=PentMaj 4=PentMin 5=Dorian 6=Mixolydian 7=Blues
 * @param length    Number of notes (2–8)
 * @param seed      Random seed for reproducibility
 */
export function generateSequence(
  rootMidi: number,
  scaleId: number,
  length: number,
  seed: number
): number[] {
  if (!EarRingCore) return JSImpl.generateSequence(rootMidi, scaleId, length, seed);
  return EarRingCore.generateSequence(rootMidi, scaleId, length, seed);
}
