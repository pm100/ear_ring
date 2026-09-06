import React, { useState, useCallback, useRef, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { ExerciseState, DetectedNote, StaffDisplayNote, StaffNoteState, TestRecord } from '../types';
import MusicStaff from './MusicStaff';
import PitchMeter from './PitchMeter';
import { useAudioCapture, TrackerFrame } from '../hooks/useAudioCapture';
import { useAudioPlayback } from '../hooks/useAudioPlayback';
import { freqToCents, midiToLabel, preferredMidiLabel, preferredNoteName, NOTE_NAMES } from '../music';

interface Props {
  exercise: ExerciseState;
  onStop: () => void;
}

const SCALE_NAMES = ['Major','Natural Minor','Dorian','Mixolydian','Locrian'];
// Semitones to add to root chroma to get the implied major key (the major key sharing
// the scale's pitch classes) — mirrors ScaleType::implied_major_offset in music_theory.rs.
// null = no shift (a major scale is its own implied major key).
const IMPLIED_MAJOR_OFFSETS: (number | null)[] = [null, 3, 10, 5, 1];

function effectiveKeyChroma(rootNote: number, scaleId: number): number {
  const offset = IMPLIED_MAJOR_OFFSETS[scaleId];
  if (offset === null || offset === undefined) return rootNote;
  return (rootNote + offset) % 12;
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
    sessionId: exercise.sessionId,
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
  const { playChord, playSequence, playPassSound, playFailSound, cancelPlayback } = useAudioPlayback();

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

  const fetchIntroTriad = useCallback(async () => {
    const rootMidi = await invoke<number>('cmd_effective_intro_root_midi', {
      rootChroma: exercise.rootNote,
      scaleId: exercise.scaleId,
      rangeStart: exercise.rangeStart,
    });
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
          avoidFirstMidi: sequenceRef.current[0] ?? null,
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
    } else if (exercise.testType === 2) {
      // Diatonic arpeggio mode — direction (ascending/descending) is randomized
      // per test rather than a user choice (issue #5), and consecutive tests
      // must not open on the same note, mirroring the guard in random mode
      // below. Each retry draws a fresh seed so the chord label (recomputed
      // separately from the same seed) stays in sync with what's actually played.
      // Also retry if the voicing came up short: root position is used throughout
      // (no inversions yet — see roadmap.md), and Rust rejects (returns empty)
      // rather than clamp a note to the range boundary, which could substitute a
      // wrong pitch that isn't a real chord tone. A different scale degree usually
      // fits the range cleanly.
      melodyDurationsRef.current = [];
      melodyTimingsRef.current = [];
      setMelodyDurations([]);
      const centerMidi = Math.floor((exercise.rangeStart + exercise.rangeEnd) / 2);
      const avoidFirstMidi = sequenceRef.current[0] ?? null;
      let orderedSeq: number[] = [];
      let seed = Date.now();
      for (let attempt = 0; attempt < 8; attempt++) {
        seed = Date.now() + attempt;
        const seq = await invoke<number[]>('cmd_generate_diatonic_chord', {
          rootChroma: exercise.rootNote,
          scaleId: 0,
          noteCount: exercise.sequenceLength,
          rangeStart: exercise.rangeStart,
          rangeEnd: exercise.rangeEnd,
          seed,
        });
        orderedSeq = Math.random() < 0.5 ? [...seq].reverse() : seq;
        if (orderedSeq.length === exercise.sequenceLength && (orderedSeq[0] ?? null) !== avoidFirstMidi) break;
      }
      const label = await invoke<string>('cmd_written_diatonic_chord_label', {
        concertRootChroma: exercise.rootNote,
        scaleId: 0,
        noteCount: exercise.sequenceLength,
        centerMidi,
        seed,
        instrumentIndex: exercise.instrumentIndex ?? 0,
      });
      return { sequence: orderedSeq, title: label };
    } else {
      melodyDurationsRef.current = [];
      melodyTimingsRef.current = [];
      setMelodyDurations([]);
      // Avoid repeating the previous test's opening note, whatever mode it came from.
      const seq = await invoke<number[]>('cmd_generate_sequence', {
        rootChroma: exercise.rootNote,
        scaleId: exercise.scaleId,
        length: exercise.sequenceLength,
        rangeStart: exercise.rangeStart,
        rangeEnd: exercise.rangeEnd,
        seed: Date.now(),
        avoidFirstMidi: sequenceRef.current[0] ?? null,
      });
      return { sequence: seq };
    }
  }, [exercise.testType, exercise.rootNote, exercise.scaleId, exercise.sequenceLength, exercise.rangeStart, exercise.rangeEnd]);

  const playPromptForSequence = useCallback(async (nextSequence: number[], durations: number[] | undefined, timings: [number, number][] | undefined, myGen: number) => {
    // A previous session's scheduled continuation (completeTest's/retryCurrentTest's timer) can
    // still be mid-flight when a new session starts — sessionRunningRef alone can't tell them
    // apart, since it's true again as soon as the new session begins. Re-check the generation
    // (not just sessionRunningRef) at every resume point below so a stale call from an old
    // session can never play audio or advance state for the new one.
    const isCurrent = () => sessionRunningRef.current && startFreshGenRef.current === myGen;
    setStatus('playing');
    setDetected([]);
    detectedRef.current = [];
    setDisplayedNotes([]);
    setCurrentNoteIndex(0);
    currentNoteIndexRef.current = 0;
    setLiveHz(0);
    await invoke('cmd_tracker_reset');
    await playChord(await fetchIntroTriad());
    if (!isCurrent()) return;
    await new Promise(resolve => {
      window.setTimeout(resolve, exercise.postChordGapMs);
    });
    if (!isCurrent()) return;
    await playSequence(
      nextSequence,
      () => {},
      () => {
        if (!isCurrent()) return;
        window.setTimeout(() => {
          if (!isCurrent()) return;
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
    else setMelodyTitle('');
    setCurrentAttempt(1);
    currentAttemptRef.current = 1;
    await playPromptForSequence(result.sequence, result.durations, melodyTimingsRef.current, myGen);
  }, [generateFreshSequence, playPromptForSequence]);

  const retryCurrentTest = useCallback(async (nextAttempt: number) => {
    const myGen = startFreshGenRef.current;
    setCurrentAttempt(nextAttempt);
    currentAttemptRef.current = nextAttempt;
    await playPromptForSequence(sequenceRef.current, melodyDurationsRef.current.length > 0 ? melodyDurationsRef.current : undefined, melodyTimingsRef.current.length > 0 ? melodyTimingsRef.current : undefined, myGen);
  }, [playPromptForSequence]);

  // Manually replay the current test's prompt on demand (issue #7) — reuses
  // retryCurrentTest's reset-and-replay behavior (via playPromptForSequence) but passes
  // the SAME attempt number instead of +1, so it doesn't consume one of maxRetries.
  // Only offered while status is 'listening': that's the only state where no other
  // playPromptForSequence call is already in flight for this generation, so there's no
  // risk of two overlapping prompts firing at once.
  const repeatCurrentTest = useCallback(() => {
    if (status !== 'listening') return;
    stopCapture();
    void retryCurrentTest(currentAttemptRef.current);
  }, [status, stopCapture, retryCurrentTest]);

  const completeTest = useCallback((passed: boolean, attemptNotes: DetectedNote[], attemptsUsed: number) => {
    const myGen = startFreshGenRef.current;
    if (exercise.playPassFailSounds) {
      if (passed) playPassSound(); else playFailSound();
    }
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
        sessionId: exercise.sessionId,
      });
      setTestsCompleted(prev => prev + 1);
      setCumulativeScorePercent(prev => prev + testScore);
      setStatus('retry_delay');
      schedule(() => {
        if (sessionRunningRef.current && startFreshGenRef.current === myGen) {
          void startFreshTest();
        }
      }, exercise.wrongNotePauseMs);
    });
  }, [exercise.scaleId, exercise.rootNote, exercise.sequenceLength, exercise.maxRetries, exercise.wrongNotePauseMs, exercise.sessionId, exercise.playPassFailSounds, playPassSound, playFailSound, schedule, startFreshTest]);

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
        const myGen = startFreshGenRef.current;
        schedule(() => {
          if (sessionRunningRef.current && startFreshGenRef.current === myGen) {
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
      void playPromptForSequence(sequenceRef.current, undefined, undefined, startFreshGenRef.current);
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

  const exerciseKeyChroma = effectiveKeyChroma(exercise.rootNote, exercise.scaleId);
  const rootLabel = `${preferredNoteName(exercise.rootNote, exerciseKeyChroma)}  ${preferredMidiLabel(exercise.rangeStart, exerciseKeyChroma)}–${preferredMidiLabel(exercise.rangeEnd, exerciseKeyChroma)}`;
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

      {melodyTitle && exercise.showTestNotes && (
        <div className="melody-title">♫ {melodyTitle}</div>
      )}

      <MusicStaff
        notes={staffNotes}
        fixedSpacing={noteStep}
        rootChroma={(effectiveKeyChroma(exercise.rootNote, exercise.scaleId) + ((transpSemitones % 12) + 12) % 12) % 12}
        keySignatureMode={exercise.keySignatureMode}
      />

      <div className="status-text">{statusText()}</div>
      <div className="exercise-meta">Attempt {currentAttempt} of {exercise.maxRetries} • Tests {testsCompleted} • Score {score}%</div>

      <div className="pitch-meter-circle">
        <PitchMeter hz={liveHz} />
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <button
          onClick={repeatCurrentTest}
          disabled={status !== 'listening'}
          style={{
            flex: 1, height: 52, fontSize: 17, fontWeight: 600, borderRadius: 8, marginTop: 8,
            background: 'none', border: '1.5px solid var(--primary)', color: 'var(--primary)',
            cursor: status !== 'listening' ? 'default' : 'pointer', opacity: status !== 'listening' ? 0.38 : 1,
          }}
        >
          {'\u21bb'} Repeat
        </button>
        <button className="btn-danger" onClick={stopSession} style={{ flex: 1 }}>{'\u23f9'} Stop Testing</button>
      </div>

      {detected.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <div className="note-tracker-label">Current attempt</div>
          <div className="note-tracker">
            {detected.map((note, i) => (
              <div key={i} className={`note-tracker-item ${note.correct ? 'tracker-correct' : 'tracker-incorrect'}`}>
                <div className="tracker-note">{preferredMidiLabel(note.midi, effectiveKeyChroma(exercise.rootNote, exercise.scaleId))}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

