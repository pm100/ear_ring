export type Screen = 'home' | 'exercise' | 'setup' | 'results' | 'progress' | 'settings' | 'help' | 'vetter';
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
  /** Duration in beats (1.0=quarter, 0.5=eighth, 2.0=half, etc.). Undefined → quarter. */
  duration?: number;
}

export interface ExerciseSettings {
  rootNote: number;
  rangeStart: number;
  rangeEnd: number;
  scaleId: number;
  sequenceLength: number;
  tempoBpm: number;
  showTestNotes: boolean;
  keySignatureMode: number;  // 0=inline accidentals, 1=key signature
  maxRetries: number;         // default 5
  silenceThreshold: number;   // default 0.003
  framesToConfirm: number;    // default 3
  warmupFrames: number;       // default 4
  postChordGapMs: number;     // default 800
  wrongNotePauseMs: number;   // default 3000
  instrumentIndex: number;    // default 0 (Piano)
  testType: number;           // 0=Random, 1=Melody, 2=DiatonicTriads(stub)
}

export interface ExerciseState {
  rootNote: number;
  rangeStart: number;
  rangeEnd: number;
  scaleId: number;
  sequenceLength: number;
  tempoBpm: number;
  showTestNotes: boolean;
  keySignatureMode: number;
  maxRetries: number;
  silenceThreshold: number;
  framesToConfirm: number;
  warmupFrames: number;
  postChordGapMs: number;
  wrongNotePauseMs: number;
  instrumentIndex: number;
  testType: number;           // 0=Random, 1=Melody, 2=DiatonicTriads(stub)
  sequence: number[];// MIDI values
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
