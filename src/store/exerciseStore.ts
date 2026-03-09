import { create } from 'zustand';
import { SCALES } from '../utils/musicTheory';

export type ExerciseStatus = 'idle' | 'playing' | 'listening' | 'done';

export interface DetectedNote {
  midi: number;
  cents: number;
}

interface ExerciseState {
  rootMidi: number;           // e.g. 60 = C4
  scaleId: number;            // index into SCALES
  sequenceLength: number;     // 2–8
  maxTries: number;           // tries per note before moving on
  sequence: number[];         // expected MIDI notes
  detected: DetectedNote[];   // notes collected from mic
  status: ExerciseStatus;
  seed: number;

  setRoot: (midi: number) => void;
  setScaleId: (id: number) => void;
  setSequenceLength: (len: number) => void;
  setMaxTries: (n: number) => void;
  setSequence: (seq: number[]) => void;
  setStatus: (s: ExerciseStatus) => void;
  addDetected: (note: DetectedNote) => void;
  resetDetected: () => void;
  newSeed: () => void;
}

export const useExerciseStore = create<ExerciseState>((set) => ({
  rootMidi: 60,   // C4
  scaleId: 0,     // Major
  sequenceLength: 4,
  maxTries: 3,
  sequence: [],
  detected: [],
  status: 'idle',
  seed: Math.floor(Math.random() * 2 ** 32),

  setRoot: (midi) => set({ rootMidi: midi }),
  setScaleId: (id) => set({ scaleId: id }),
  setSequenceLength: (len) => set({ sequenceLength: len }),
  setMaxTries: (n) => set({ maxTries: n }),
  setSequence: (seq) => set({ sequence: seq }),
  setStatus: (status) => set({ status }),
  addDetected: (note) => set((s) => ({ detected: [...s.detected, note] })),
  resetDetected: () => set({ detected: [] }),
  newSeed: () => set({ seed: Math.floor(Math.random() * 2 ** 32) }),
}));

export { SCALES };
