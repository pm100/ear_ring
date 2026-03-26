import React, { useState, useCallback, useRef, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { ExerciseState, DetectedNote, StaffDisplayNote, TestRecord } from '../types';
import MusicStaff from './MusicStaff';
import PitchMeter from './PitchMeter';
import { useAudioCapture } from '../hooks/useAudioCapture';
import { useAudioPlayback } from '../hooks/useAudioPlayback';
import { freqToCents, freqToMidi, midiToLabel, preferredMidiLabel, NOTE_NAMES } from '../music';

interface Props {
  exercise: ExerciseState;
  onStop: () => void;
}

const SCALE_NAMES = ['Major','Natural Minor','Harmonic Minor','Dorian','Mixolydian'];
const MAX_ATTEMPTS = 5;

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
  const noteStep = 44;

  const stableCountRef = useRef(0);
  const stablePitchClassRef = useRef(-1);
  const pitchConsumedRef = useRef(false);
  const currentNoteIndexRef = useRef(0);
  const detectedRef = useRef<DetectedNote[]>([]);
  const currentAttemptRef = useRef(1);
  const sequenceRef = useRef<number[]>(exercise.sequence);
  const sessionRunningRef = useRef(true);
  const timersRef = useRef<number[]>([]);
  const handleHzDetectedRef = useRef<(hz: number) => void>(() => {});

  const { start: startCapture, stop: stopCapture } = useAudioCapture();
  const { playChord, playSequence, cancelPlayback } = useAudioPlayback();

  useEffect(() => { currentNoteIndexRef.current = currentNoteIndex; }, [currentNoteIndex]);
  useEffect(() => { detectedRef.current = detected; }, [detected]);
  useEffect(() => { currentAttemptRef.current = currentAttempt; }, [currentAttempt]);
  useEffect(() => { sequenceRef.current = sequence; }, [sequence]);

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

  const generateFreshSequence = useCallback(async () => {
    return invoke<number[]>('cmd_generate_sequence', {
      rootChroma: exercise.rootNote,
      scaleId: exercise.scaleId,
      length: exercise.sequenceLength,
      rangeStart: exercise.rangeStart,
      rangeEnd: exercise.rangeEnd,
      seed: Date.now(),
    });
  }, [exercise.rangeStart, exercise.rangeEnd, exercise.rootNote, exercise.scaleId, exercise.sequenceLength]);

  const playPromptForSequence = useCallback(async (nextSequence: number[]) => {
    setStatus('playing');
    setDetected([]);
    detectedRef.current = [];
    setDisplayedNotes([]);
    setCurrentNoteIndex(0);
    currentNoteIndexRef.current = 0;
    setLiveHz(0);
    stableCountRef.current = 0;
    stablePitchClassRef.current = -1;
    pitchConsumedRef.current = false;
    await playChord(await fetchIntroTriad());
    if (!sessionRunningRef.current) return;
    await new Promise(resolve => {
      window.setTimeout(resolve, 800);
    });
    if (!sessionRunningRef.current) return;
    await playSequence(
      nextSequence,
      () => {},
      () => {
        if (!sessionRunningRef.current) return;
        // Let notes ring through a short settling gap before opening the mic,
        // matching the Android/iOS POST_SEQUENCE_GAP behaviour.
        window.setTimeout(() => {
          if (!sessionRunningRef.current) return;
          cancelPlayback();
          setStatus('listening');
          startCapture(handleHzDetectedRef.current);
        }, 700);
      },
      exercise.tempoBpm
    );
  }, [exercise.tempoBpm, fetchIntroTriad, playChord, playSequence, startCapture]);

  const startFreshTest = useCallback(async () => {
    const nextSequence = await generateFreshSequence();
    if (!sessionRunningRef.current) return;
    setSequence(nextSequence);
    sequenceRef.current = nextSequence;
    setCurrentAttempt(1);
    currentAttemptRef.current = 1;
    await playPromptForSequence(nextSequence);
  }, [generateFreshSequence, playPromptForSequence]);

  const retryCurrentTest = useCallback(async (nextAttempt: number) => {
    setCurrentAttempt(nextAttempt);
    currentAttemptRef.current = nextAttempt;
    await playPromptForSequence(sequenceRef.current);
  }, [playPromptForSequence]);

  const completeTest = useCallback((passed: boolean, attemptNotes: DetectedNote[], attemptsUsed: number) => {
    void invoke<number>('cmd_test_score', {
      maxAttempts: MAX_ATTEMPTS,
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
        maxAttempts: MAX_ATTEMPTS,
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
      }, 3000);
    });
  }, [exercise.scaleId, exercise.rootNote, exercise.sequenceLength, schedule, startFreshTest]);

  handleHzDetectedRef.current = async (hz: number) => {
    setLiveHz(hz);
    if (hz <= 0 || !sessionRunningRef.current) {
      stableCountRef.current = 0;
      stablePitchClassRef.current = -1;
      pitchConsumedRef.current = false;
      return;
    }

     const midiResult = freqToMidi(hz);
     const centsResult = freqToCents(hz);
      if (midiResult < 0) {
        stableCountRef.current = 0;
        stablePitchClassRef.current = -1;
        pitchConsumedRef.current = false;
        return;
      }

     const pitchClass = midiResult % 12;
     const idx = currentNoteIndexRef.current;

     if (pitchClass === stablePitchClassRef.current) {
       stableCountRef.current++;
     } else {
       stableCountRef.current = 1;
       stablePitchClassRef.current = pitchClass;
       pitchConsumedRef.current = false;
     }

     if (!pitchConsumedRef.current && stableCountRef.current >= 3) {
       pitchConsumedRef.current = true;
       const expected = sequenceRef.current[idx];
       const correct = await invoke<boolean>('cmd_is_correct_note', {
         detectedMidi: midiResult,
        cents: centsResult,
        expectedMidi: expected,
      });
      const newDetected = [...detectedRef.current, { midi: midiResult, cents: centsResult, correct }];
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
        if (currentAttemptRef.current >= MAX_ATTEMPTS) {
          completeTest(false, newDetected, currentAttemptRef.current);
        } else {
          schedule(() => {
            if (sessionRunningRef.current) {
              void retryCurrentTest(currentAttemptRef.current + 1);
            }
          }, 3000);
        }
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
    stopCapture();
    cancelPlayback();
    onStop();
  }, [cancelPlayback, clearTimers, cumulativeScorePercent, exercise, onStop, sessionSaved, stopCapture, testsCompleted]);

  useEffect(() => {
    sessionRunningRef.current = true;
    void playPromptForSequence(sequenceRef.current);
    return () => {
      sessionRunningRef.current = false;
      clearTimers();
      stopCapture();
      cancelPlayback();
    };
  }, [cancelPlayback, clearTimers, playPromptForSequence, stopCapture]);

  const statusText = () => {
    switch (status) {
      case 'playing': return 'Listen carefully…';
      case 'listening': return `Sing note ${currentNoteIndex + 1} of ${sequence.length}`;
      case 'retry_delay':
        return detected[detected.length - 1]?.correct === false && currentAttempt < MAX_ATTEMPTS
          ? 'Wrong note. Replaying the same test…'
          : 'Starting the next test…';
      case 'stopped': return 'Testing stopped';
    }
  };

  const rootLabel = `${NOTE_NAMES[exercise.rootNote]}  ${preferredMidiLabel(exercise.rangeStart, exercise.rootNote)}–${preferredMidiLabel(exercise.rangeEnd, exercise.rootNote)}`;
  const scaleLabel = SCALE_NAMES[exercise.scaleId];
  const score = averageScore(cumulativeScorePercent, testsCompleted);
  const staffNotes: StaffDisplayNote[] = exercise.showTestNotes
    ? sequence.map((expectedMidi, index) => {
        const attemptNote = displayedNotes[index];
        if (!attemptNote) {
          return { midi: expectedMidi, state: 'expected' };
        }
        return attemptNote.correct
          ? { midi: expectedMidi, state: 'correct' }
          : { midi: attemptNote.midi, state: 'incorrect' };
      })
    : displayedNotes.map(note => ({
        midi: note.midi,
        state: note.correct ? 'correct' : 'incorrect',
      }));

  return (
    <div className="screen">
      <div className="screen-header">
        <button className="btn-back" onClick={stopSession}>{'\u2190'} Back</button>
        <span className="screen-title">{rootLabel} {scaleLabel}</span>
      </div>

      <MusicStaff
        notes={staffNotes}
        fixedSpacing={noteStep}
        rootChroma={exercise.rootNote}
        keySignatureMode={exercise.keySignatureMode}
      />

      <div className="status-text">{statusText()}</div>
      <div className="exercise-meta">Attempt {currentAttempt} of {MAX_ATTEMPTS} • Tests {testsCompleted} • Score {score}%</div>

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
                <div className="tracker-note">{preferredMidiLabel(note.midi, exercise.rootNote)}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
