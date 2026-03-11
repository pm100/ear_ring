export type Screen = 'home' | 'exercise' | 'setup' | 'results' | 'progress';
export type ExerciseStatus = 'idle' | 'playing' | 'listening' | 'done';

export interface DetectedNote {
  midi: number;
  cents: number;
  correct: boolean;
}

export interface ExerciseState {
  rootNote: number;   // 0-11
  octave: number;     // 3-5
  scaleId: number;    // 0-7
  sequenceLength: number; // 2-8
  sequence: number[]; // MIDI values
  detected: DetectedNote[];
  status: ExerciseStatus;
  currentNoteIndex: number;
  highlightIndex: number;
}

export interface SessionRecord {
  date: string;
  scale: string;
  root: string;
  score: number;
  length: number;
}
