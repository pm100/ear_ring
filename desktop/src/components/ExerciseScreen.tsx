import React, { useState, useCallback, useRef, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { ExerciseState, DetectedNote, StaffDisplayNote, StaffNoteState, TestRecord } from '../types';
import MusicStaff from './MusicStaff';
import PitchMeter from './PitchMeter';
import { useAudioCapture, TrackerFrame } from '../hooks/useAudioCapture';
import { useAudioPlayback } from '../hooks/useAudioPlayback';
import { freqToCents, midiToLabel, preferredMidiLabel, NOTE_NAMES } from '../music';

interface Props {
  exercise: ExerciseState;
  onStop: () => void;
}

const SCALE_NAMES = ['Major','Natural Minor','Dorian','Mixolydian'];
const IMPLIED_MAJOR_OFFSETS = [0, 3, 10, 5]; // indexed by scaleId

function effectiveKeyChroma(rootNote: number, scaleId: number): number {
  return (rootNote + (IMPLIED_MAJOR_OFFSETS[scaleId] ?? 0)) % 12;
}

function averageScore(cumulativeScorePercent: number, testsCompleted: number): number {
  return testsCompleted === 0 ? 0 : Math.floor(cumulativeScorePercent / testsCompleted);
}

function appendSessionRecord(exercise: ExerciseState, score: number) {
  const existing = JSON.parse(localStorage.getItem('ear_ring_sessions') || '[]');
  existing.unshift({
    date: new Date().toISOString(),
    scale: SCALE_NAMES[exercise.scaleId],
    root: NOTE_NAMES[exercise.rootNote],
    score,
    length: exercise.sequenceLength,
    testsCompleted: exercise.testsCompleted,
  });
  localStorage.setItem('ear_ring_sessions', JSON.stringify(existing.slice(0, 200)));
}

function appendTestRecord(record: TestRecord) {
  const existing = JSON.parse(localStorage.getItem('ear_ring_tests') || '[]');
  existing.unshift(record);
  localStorage.setItem('ear_ring_tests', JSON.stringify(existing.slice(0, 500)));
}

export default function ExerciseScreen({ exercise, onStop }: Props) {
  const [liveHz, setLiveHz] = useState(0);
  const [status, setStatus] = useState(exercise.status);
  const [currentNoteIndex, setCurrentNoteIndex] = useState(0);
  const [currentAttempt, setCurrentAttempt] = useState(1);
  const [testsCompleted, setTestsCompleted] = useState(0);
  const [cumulativeScorePercent, setCumulativeScorePercent] = useState(0);
  const [sequence, setSequence] = useState<number[]>(exercise.sequence);
  const [detected, setDetected] = useState<DetectedNote[]>([]);
  const [displayedNotes, setDisplayedNotes] = useState<DetectedNote[]>([]);
  const [sessionSaved, setSessionSaved] = useState(false);
  const [melodyDurations, setMelodyDurations] = useState<number[]>([]);
  const [melodyTitle, setMelodyTitle] = useState('');
  const noteStep = 44;

  const currentNoteIndexRef = useRef(0);
  const detectedRef = useRef<DetectedNote[]>([]);
  const currentAttemptRef = useRef(1);
  const sequenceRef = useRef<number[]>(exercise.sequence);
  const sessionRunningRef = useRef(true);
  const timersRef = useRef<number[]>([]);
  const handleFrameRef = useRef<(frame: TrackerFrame) => void>(() => {});
  const melodyDeckRef = useRef<number[]>([]);
  const melodyDeckCursorRef = useRef(0);
  const melodyDurationsRef = useRef<number[]>([]);
  const melodyTimingsRef = useRef<[number, number][]>([]);
  const rangeRef = useRef({ start: exercise.rangeStart, end: exercise.rangeEnd });
  // Generation counter: incremented on each effect mount AND each cleanup.
  // Lets startFreshTest detect it was launched by a stale effect run (e.g. React StrictMode double-invoke).
  const startFreshGenRef = useRef(0);

  const { start: startCapture, stop: stopCapture, destroy: destroyCapture } = useAudioCapture();
  const { playChord, playSequence, cancelPlayback } = useAudioPlayback();

  useEffect(() => { currentNoteIndexRef.current = currentNoteIndex; }, [currentNoteIndex]);
  useEffect(() => { detectedRef.current = detected; }, [detected]);
  useEffect(() => { currentAttemptRef.current = currentAttempt; }, [currentAttempt]);
  useEffect(() => { sequenceRef.current = sequence; }, [sequence]);

  // Load transposition semitones and apply instrument-specific tracker params.
  const [transpSemitones, setTranspSemitones] = useState(0);
  useEffect(() => {
    const instrIdx = exercise.instrumentIndex ?? 0;
    invoke<string>('cmd_instrument_list')
      .then(json => {
        const list = JSON.parse(json) as { id: number; semitones: number }[];
        setTranspSemitones(list[instrIdx]?.semitones ?? 0);
        void invoke('cmd_tracker_apply_instrument', { instrumentIndex: instrIdx });
      })
      .catch(() => {});
  }, [exercise.instrumentIndex]);
  const transpMidi = (midi: number) => Math.max(0, Math.min(127, midi + transpSemitones));

  const schedule = useCallback((callback: () => void, ms: number) => {
    const id = window.setTimeout(callback, ms);
    timersRef.current.push(id);
  }, []);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach(window.clearTimeout);
    timersRef.current = [];
  }, []);

  const fetchIntroTriad = useCallback(() => {
    const rootMidi = exercise.rangeStart - ((exercise.rangeStart - exercise.rootNote + 12) % 12);
    return invoke<number[]>('cmd_intro_chord', {
      rootMidi,
      scaleId: exercise.scaleId,
    });
  }, [exercise.rangeStart, exercise.rootNote, exercise.scaleId]);

  const generateFreshSequence = useCallback(async (): Promise<{ sequence: number[], durations?: number[], newRangeStart?: number, newRangeEnd?: number, title?: string }> => {
    if (exercise.testType === 1) {
      // Melody mode with shuffle deck
      if (melodyDeckRef.current.length === 0 || melodyDeckCursorRef.current >= melodyDeckRef.current.length) {
        const newDeck = await invoke<number[]>('cmd_shuffle_melody_indices', { seed: Date.now() });
        melodyDeckRef.current = newDeck;
        melodyDeckCursorRef.current = 0;
      }
      const idx = melodyDeckRef.current[melodyDeckCursorRef.current];
      melodyDeckCursorRef.current += 1;
      const result = await invoke<{ midi_notes: number[], durations: number[], title: string } | null>('cmd_pick_melody_by_index', {
        index: idx,
        rootChroma: exercise.rootNote,
      });
      if (!result || result.midi_notes.length === 0) {
        // Fallback to random
        const seq = await invoke<number[]>('cmd_generate_sequence', {
          rootChroma: exercise.rootNote, scaleId: exercise.scaleId, length: exercise.sequenceLength,
          rangeStart: exercise.rangeStart, rangeEnd: exercise.rangeEnd, seed: Date.now(),
        });
        return { sequence: seq };
      }
      const minMidi = Math.min(...result.midi_notes) - 6;
      const maxMidi = Math.max(...result.midi_notes) + 6;
      melodyDurationsRef.current = result.durations;
      setMelodyDurations(result.durations);
      // Pre-compute articulation timings (one IPC call per test)
      const timings = await invoke<[number, number][]>('cmd_sequence_timings', {
        bpm: exercise.tempoBpm,
        durations: result.durations,
      });
      melodyTimingsRef.current = timings;
      return {
        sequence: result.midi_notes,
        durations: result.durations,
        newRangeStart: Math.max(21, minMidi),
        newRangeEnd: Math.min(108, maxMidi),
        title: result.title,
      };
    } else {
      melodyDurationsRef.current = [];
      melodyTimingsRef.current = [];
      setMelodyDurations([]);
      const seq = await invoke<number[]>('cmd_generate_sequence', {
        rootChroma: exercise.rootNote,
        scaleId: exercise.scaleId,
        length: exercise.sequenceLength,
        rangeStart: exercise.rangeStart,
        rangeEnd: exercise.rangeEnd,
        seed: Date.now(),
      });
      return { sequence: seq };
    }
  }, [exercise.testType, exercise.rootNote, exercise.scaleId, exercise.sequenceLength, exercise.rangeStart, exercise.rangeEnd]);

  const playPromptForSequence = useCallback(async (nextSequence: number[], durations?: number[], timings?: [number, number][]) => {
    setStatus('playing');
    setDetected([]);
    detectedRef.current = [];
    setDisplayedNotes([]);
    setCurrentNoteIndex(0);
    currentNoteIndexRef.current = 0;
    setLiveHz(0);
    await invoke('cmd_tracker_reset');
    await playChord(await fetchIntroTriad());
    if (!sessionRunningRef.current) return;
    await new Promise(resolve => {
      window.setTimeout(resolve, exercise.postChordGapMs);
    });
    if (!sessionRunningRef.current) return;
    await playSequence(
      nextSequence,
      () => {},
      () => {
        if (!sessionRunningRef.current) return;
        window.setTimeout(() => {
          if (!sessionRunningRef.current) return;
          cancelPlayback();
          setStatus('listening');
          void invoke('cmd_tracker_reset_with_warmup', { warmupFrames: exercise.warmupFrames });
          startCapture(handleFrameRef.current);
        }, 700);
      },
      exercise.tempoBpm,
      durations,
      timings
    );
  }, [exercise.tempoBpm, exercise.postChordGapMs, exercise.warmupFrames, fetchIntroTriad, playChord, playSequence, startCapture]);

  const startFreshTest = useCallback(async () => {
    // Capture the generation at call time. If the main effect is re-run (e.g. React StrictMode
    // double-invoke), the generation will have changed by the time we resume from the async work,
    // and we can bail out before starting audio playback.
    const myGen = startFreshGenRef.current;
    const result = await generateFreshSequence();
    if (startFreshGenRef.current !== myGen || !sessionRunningRef.current) return;
    setSequence(result.sequence);
    sequenceRef.current = result.sequence;
    if (result.newRangeStart !== undefined && result.newRangeEnd !== undefined) {
      rangeRef.current = { start: result.newRangeStart, end: result.newRangeEnd };
    }
    if (result.title !== undefined) setMelodyTitle(result.title);
    setCurrentAttempt(1);
    currentAttemptRef.current = 1;
    await playPromptForSequence(result.sequence, result.durations, melodyTimingsRef.current);
  }, [generateFreshSequence, playPromptForSequence]);

  const retryCurrentTest = useCallback(async (nextAttempt: number) => {
    setCurrentAttempt(nextAttempt);
    currentAttemptRef.current = nextAttempt;
    await playPromptForSequence(sequenceRef.current, melodyDurationsRef.current.length > 0 ? melodyDurationsRef.current : undefined, melodyTimingsRef.current.length > 0 ? melodyTimingsRef.current : undefined);
  }, [playPromptForSequence]);

  const completeTest = useCallback((passed: boolean, attemptNotes: DetectedNote[], attemptsUsed: number) => {
    void invoke<number>('cmd_test_score', {
      maxAttempts: exercise.maxRetries,
      attemptsUsed,
      passed,
    }).then(testScore => {
      appendTestRecord({
        date: new Date().toISOString(),
        scale: SCALE_NAMES[exercise.scaleId],
        root: NOTE_NAMES[exercise.rootNote],
        score: testScore,
        length: exercise.sequenceLength,
        attemptsUsed,
        maxAttempts: exercise.maxRetries,
        passed,
        expectedNotes: sequenceRef.current.map(midiToLabel),
        detectedNotes: attemptNotes.map(note => midiToLabel(note.midi)),
      });
      setTestsCompleted(prev => prev + 1);
      setCumulativeScorePercent(prev => prev + testScore);
      setStatus('retry_delay');
      schedule(() => {
        if (sessionRunningRef.current) {
          void startFreshTest();
        }
      }, exercise.wrongNotePauseMs);
    });
  }, [exercise.scaleId, exercise.rootNote, exercise.sequenceLength, exercise.maxRetries, exercise.wrongNotePauseMs, schedule, startFreshTest]);

  // The audio frame handler — confirmed MIDI comes from the Rust tracker.
  handleFrameRef.current = async (frame: TrackerFrame) => {
    setLiveHz(frame.liveHz);
    if (!sessionRunningRef.current) return;
    if (frame.confirmedMidi < 0) return;

    const midi = frame.confirmedMidi;
    if (midi < rangeRef.current.start - 6 || midi > rangeRef.current.end + 6) return;

    const idx = currentNoteIndexRef.current;
    const expected = sequenceRef.current[idx];
    // Derive cents from liveHz for the is_correct_note check
    const centsResult = frame.liveHz > 0 ? freqToCents(frame.liveHz) : 0;
    const correct = await invoke<boolean>('cmd_is_correct_note', {
      detectedMidi: midi,
      cents: centsResult,
      expectedMidi: expected,
    });
    const newDetected = [...detectedRef.current, { midi, cents: centsResult, correct }];
    setDetected(newDetected);
    setDisplayedNotes(newDetected);
    detectedRef.current = newDetected;

    if (correct) {
      const nextIdx = idx + 1;
      if (nextIdx >= sequenceRef.current.length) {
        stopCapture();
        setStatus('retry_delay');
        completeTest(true, newDetected, currentAttemptRef.current);
      } else {
        setCurrentNoteIndex(nextIdx);
        currentNoteIndexRef.current = nextIdx;
      }
    } else {
      stopCapture();
      setStatus('retry_delay');
      if (currentAttemptRef.current >= exercise.maxRetries) {
        completeTest(false, newDetected, currentAttemptRef.current);
      } else {
        schedule(() => {
          if (sessionRunningRef.current) {
            void retryCurrentTest(currentAttemptRef.current + 1);
          }
        }, exercise.wrongNotePauseMs);
      }
    }
  };

  const stopSession = useCallback(() => {
    if (!sessionSaved && testsCompleted > 0) {
      appendSessionRecord(
        { ...exercise, testsCompleted, cumulativeScorePercent } as ExerciseState,
        averageScore(cumulativeScorePercent, testsCompleted)
      );
      setSessionSaved(true);
    }
    sessionRunningRef.current = false;
    clearTimers();
    destroyCapture();
    cancelPlayback();
    void invoke('cmd_tracker_reset');
    onStop();
  }, [cancelPlayback, clearTimers, cumulativeScorePercent, destroyCapture, exercise, onStop, sessionSaved, testsCompleted]);

  useEffect(() => {
    void invoke('cmd_tracker_set_params', {
      silenceThreshold: exercise.silenceThreshold,
      requiredFrames: exercise.framesToConfirm,
    });
    sessionRunningRef.current = true;
    startFreshGenRef.current++; // new generation: invalidates any prior startFreshTest invocation
    if (exercise.sequence.length === 0) {
      // Melody mode starts with empty sequence — generate first test
      void startFreshTest();
    } else {
      void playPromptForSequence(sequenceRef.current);
    }
    return () => {
      startFreshGenRef.current++; // invalidate any in-flight startFreshTest before cleanup
      sessionRunningRef.current = false;
      clearTimers();
      destroyCapture();
      cancelPlayback();
      void invoke('cmd_tracker_reset');
    };
  }, [cancelPlayback, clearTimers, destroyCapture, playPromptForSequence, startFreshTest]);

  const statusText = () => {
    switch (status) {
      case 'playing': return 'Listen carefully…';
      case 'listening': return `Play note ${currentNoteIndex + 1} of ${sequence.length}`;
      case 'retry_delay':
        return detected[detected.length - 1]?.correct === false && currentAttempt < exercise.maxRetries
          ? 'Wrong note. Replaying the same test…'
          : 'Starting the next test…';
      case 'stopped': return 'Testing stopped';
    }
  };

  const rootLabel = `${NOTE_NAMES[exercise.rootNote]}  ${preferredMidiLabel(exercise.rangeStart, effectiveKeyChroma(exercise.rootNote, exercise.scaleId))}–${preferredMidiLabel(exercise.rangeEnd, effectiveKeyChroma(exercise.rootNote, exercise.scaleId))}`;
  const scaleLabel = SCALE_NAMES[exercise.scaleId];
  const score = averageScore(cumulativeScorePercent, testsCompleted);
  const staffNotes: StaffDisplayNote[] = exercise.showTestNotes
    ? sequence.map((expectedMidi, index) => {
        const attemptNote = displayedNotes[index];
        const dur = melodyDurations[index];
        if (!attemptNote) {
          return { midi: transpMidi(expectedMidi), state: 'expected' as StaffNoteState, duration: dur };
        }
        return attemptNote.correct
          ? { midi: transpMidi(expectedMidi), state: 'correct' as StaffNoteState, duration: dur }
          : { midi: transpMidi(attemptNote.midi), state: 'incorrect' as StaffNoteState };
      })
    : displayedNotes.map((note, index) => ({
        midi: transpMidi(note.midi),
        state: (note.correct ? 'correct' : 'incorrect') as StaffNoteState,
        duration: note.correct ? melodyDurations[index] : undefined,
      }));

  return (
    <div className="screen">
      <div className="screen-header">
        <button className="btn-back" onClick={stopSession}>{'\u2190'} Back</button>
        <span className="screen-title">{rootLabel} {scaleLabel}</span>
      </div>

      <div className="listening-indicator" style={{ marginBottom: 8, visibility: status === 'listening' ? 'visible' : 'hidden' }}>
        <span className="listening-ear">👂</span>
        <span className="listening-label" style={{ marginLeft: 8 }}>Listening…</span>
      </div>

      {melodyTitle && (
        <div className="melody-title">♫ {melodyTitle}</div>
      )}

      <MusicStaff
        notes={staffNotes}
        fixedSpacing={noteStep}
        rootChroma={effectiveKeyChroma(exercise.rootNote, exercise.scaleId)}
        keySignatureMode={exercise.keySignatureMode}
      />

      <div className="status-text">{statusText()}</div>
      <div className="exercise-meta">Attempt {currentAttempt} of {exercise.maxRetries} • Tests {testsCompleted} • Score {score}%</div>

      <div className="pitch-meter-circle">
        <PitchMeter hz={liveHz} />
      </div>

      <button className="btn-danger" onClick={stopSession}>{'\u23f9'} Stop Testing</button>

      {detected.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <div className="note-tracker-label">Current attempt</div>
          <div className="note-tracker">
            {detected.map((note, i) => (
              <div key={i} className={`note-tracker-item ${note.correct ? 'tracker-correct' : 'tracker-incorrect'}`}>
                <div className="tracker-note">{preferredMidiLabel(transpMidi(note.midi), effectiveKeyChroma(exercise.rootNote, exercise.scaleId))}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

