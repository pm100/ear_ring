export type Screen = 'home' | 'exercise' | 'setup' | 'progress' | 'settings' | 'help';
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
  introSoundMode: number;    // 0=root note, 1=chord (default), 2=arpeggiated chord, 3=scale, 4=none
  maxRetries: number;         // default 5
  /** Issue #9 "note correction": consecutive wrong tries allowed at the same note
   *  position before the whole test restarts. 0 = always restart (old behavior). */
  noteRetries: number;        // default 2
  silenceThreshold: number;   // default 0.003
  framesToConfirm: number;    // default 3
  warmupFrames: number;       // default 4
  graceFrames: number;        // default 3 (Piano) — previously hidden per-instrument constant
  octaveCorrection: boolean;  // default false (Piano) — previously hidden per-instrument constant
  yinThreshold: number;       // default 0.15 — previously hidden global constant
  /** Saved Auto-Calibrate results per instrument index. Falls back to the
   *  INSTRUMENTS table's defaults (grace/octave) and the flat fields above
   *  (sliders) when an instrument has never been calibrated. */
  calibrationParamsByInstrument: Record<number, {
    silenceThreshold: number;
    framesToConfirm: number;
    warmupFrames: number;
    graceFrames: number;
    octaveCorrection: boolean;
    yinThreshold: number;
  }>;
  postChordGapMs: number;     // default 800
  wrongNotePauseMs: number;   // default 3000
  instrumentIndex: number;    // default 0 (Piano)
  testType: number;           // 0=Random, 1=Melody, 2=DiatonicTriads(stub)
  playPassFailSounds: boolean; // default true — chime on test pass/fail
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
  introSoundMode: number;
  maxRetries: number;
  noteRetries: number;
  silenceThreshold: number;
  framesToConfirm: number;
  warmupFrames: number;
  /** Detection params carried into the exercise. Resolved at startExercise() from
   *  this instrument's saved Auto-Calibrate result when it has one, otherwise the
   *  flat settings values — ExerciseScreen pushes them to the tracker after
   *  cmd_tracker_apply_instrument so calibrated values aren't lost to the
   *  instrument table's defaults. */
  graceFrames: number;
  octaveCorrection: boolean;
  yinThreshold: number;
  postChordGapMs: number;
  wrongNotePauseMs: number;
  instrumentIndex: number;
  testType: number;           // 0=Random, 1=Melody, 2=DiatonicTriads(stub)
  playPassFailSounds: boolean;
  sequence: number[];// MIDI values
  detected: DetectedNote[];
  status: ExerciseStatus;
  currentNoteIndex: number;
  highlightIndex: number;
  currentAttempt: number;
  maxAttempts: number;
  /** Consecutive wrong tries at the current note position — not persisted; reset on a
   *  correct note or whenever the sequence restarts (issue #9 "note correction"). */
  noteRetryCount: number;
  testsCompleted: number;
  cumulativeScorePercent: number;
  sessionRunning: boolean;
  /** Set once per startExercise() call — correlates persisted TestRecords to their SessionRecord. */
  sessionId: number;
}

export interface SessionRecord {
  date: string;
  scale: string;
  root: string;
  score: number;
  length: number;
  testsCompleted?: number;
  /** Correlates to TestRecord.sessionId. Optional — older, already-persisted records
   *  predate this field and just show no drill-down detail. */
  sessionId?: number;
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
  /** Correlates to SessionRecord.sessionId — which session this test belongs to. */
  sessionId?: number;
}
