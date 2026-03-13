export type Screen = 'home' | 'exercise' | 'setup' | 'results' | 'progress';
export type ExerciseStatus = 'playing' | 'listening' | 'retry_delay' | 'stopped';
export type StaffNoteState = 'expected' | 'correct' | 'incorrect' | 'active';

export interface DetectedNote {
  midi: number;
  cents: number;
  correct: boolean;
}

export interface StaffDisplayNote {
  midi: number;
  state: StaffNoteState;
}

export interface ExerciseSettings {
  rootNote: number;
  octave: number;
  scaleId: number;
  sequenceLength: number;
  tempoBpm: number;
  showTestNotes: boolean;
}

export interface ExerciseState {
  rootNote: number;
  octave: number;
  scaleId: number;
  sequenceLength: number;
  tempoBpm: number;
  showTestNotes: boolean;
  sequence: number[]; // MIDI values
  detected: DetectedNote[];
  status: ExerciseStatus;
  currentNoteIndex: number;
  highlightIndex: number;
  currentAttempt: number;
  maxAttempts: number;
  testsCompleted: number;
  cumulativeScorePercent: number;
  sessionRunning: boolean;
}

export interface SessionRecord {
  date: string;
  scale: string;
  root: string;
  score: number;
  length: number;
  testsCompleted?: number;
}

export interface TestRecord {
  date: string;
  scale: string;
  root: string;
  score: number;
  length: number;
  attemptsUsed: number;
  maxAttempts: number;
  passed: boolean;
  expectedNotes: string[];
  detectedNotes: string[];
}
