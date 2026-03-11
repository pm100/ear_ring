import React, { useState, useCallback, useRef, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { ExerciseState, DetectedNote } from '../types';
import MusicStaff from './MusicStaff';
import PitchMeter from './PitchMeter';
import { useAudioCapture } from '../hooks/useAudioCapture';
import { useAudioPlayback } from '../hooks/useAudioPlayback';

interface Props {
  exercise: ExerciseState;
  onUpdateExercise: (updates: Partial<ExerciseState>) => void;
  onFinish: (detected: DetectedNote[]) => void;
  onBack: () => void;
}

const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const SCALE_NAMES = ['Major','Natural Minor','Harmonic Minor','Pentatonic Major','Pentatonic Minor','Dorian','Mixolydian','Blues'];

function midiToLabel(midi: number): string {
  const octave = Math.floor(midi / 12) - 1;
  return `${NOTE_NAMES[midi % 12]}${octave}`;
}

export default function ExerciseScreen({ exercise, onUpdateExercise, onFinish, onBack }: Props) {
  const [liveHz, setLiveHz] = useState(0);
  const [status, setStatus] = useState<'idle' | 'playing' | 'listening' | 'done'>('idle');
  const [currentNoteIndex, setCurrentNoteIndex] = useState(0);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const [detected, setDetected] = useState<DetectedNote[]>([]);

  const stableCountRef = useRef(0);
  const stablePitchClassRef = useRef(-1);
  const lastConfirmedMsRef = useRef(0);
  const currentNoteIndexRef = useRef(0);
  const detectedRef = useRef<DetectedNote[]>([]);

  const { start: startCapture, stop: stopCapture } = useAudioCapture();
  const { playSequence, cancelPlayback } = useAudioPlayback();

  useEffect(() => {
    currentNoteIndexRef.current = currentNoteIndex;
  }, [currentNoteIndex]);

  useEffect(() => {
    detectedRef.current = detected;
  }, [detected]);

  const handlePlaySequence = useCallback(async () => {
    setStatus('playing');
    setHighlightIndex(0);
    await playSequence(
      exercise.sequence,
      (i) => setHighlightIndex(i),
      () => {
        setHighlightIndex(-1);
        setStatus('idle');
      }
    );
  }, [exercise.sequence, playSequence]);

  const handleHzDetected = useCallback(async (hz: number) => {
    setLiveHz(hz);
    if (hz <= 0) return;

    const midiResult = await invoke<number>('cmd_freq_to_midi', { hz });
    const centsResult = await invoke<number>('cmd_freq_to_cents', { hz });
    if (midiResult < 0) return;

    const pitchClass = midiResult % 12;
    const now = Date.now();
    const idx = currentNoteIndexRef.current;

    if (pitchClass === stablePitchClassRef.current) {
      stableCountRef.current++;
    } else {
      stableCountRef.current = 1;
      stablePitchClassRef.current = pitchClass;
    }

    if (stableCountRef.current >= 2 && (now - lastConfirmedMsRef.current) >= 450) {
      lastConfirmedMsRef.current = now;
      stableCountRef.current = 0;

      const expected = exercise.sequence[idx];
      const expectedPitchClass = expected % 12;
      const correct = pitchClass === expectedPitchClass;

      const newDetected = [...detectedRef.current, { midi: midiResult, cents: centsResult, correct }];
      setDetected(newDetected);
      detectedRef.current = newDetected;

      if (correct) {
        const nextIdx = idx + 1;
        if (nextIdx >= exercise.sequence.length) {
          stopCapture();
          setStatus('done');
          onFinish(newDetected);
        } else {
          setCurrentNoteIndex(nextIdx);
          currentNoteIndexRef.current = nextIdx;
        }
      } else {
        stopCapture();
        setStatus('done');
        onFinish(newDetected);
      }
    }
  }, [exercise.sequence, stopCapture, onFinish]);

  const handleStartListening = useCallback(() => {
    setStatus('listening');
    stableCountRef.current = 0;
    stablePitchClassRef.current = -1;
    lastConfirmedMsRef.current = 0;
    setCurrentNoteIndex(0);
    currentNoteIndexRef.current = 0;
    setDetected([]);
    detectedRef.current = [];
    startCapture(handleHzDetected);
  }, [startCapture, handleHzDetected]);

  const handleStopListening = useCallback(() => {
    stopCapture();
    setStatus('idle');
    setLiveHz(0);
  }, [stopCapture]);

  const statusText = () => {
    switch (status) {
      case 'idle': return 'Press Play to hear the sequence';
      case 'playing': return 'Listen carefully\u2026';
      case 'listening': {
        const noteLabel = exercise.sequence[currentNoteIndex] !== undefined
          ? midiToLabel(exercise.sequence[currentNoteIndex])
          : '';
        return `Sing note ${currentNoteIndex + 1} of ${exercise.sequence.length}: ${noteLabel}`;
      }
      case 'done': return 'Calculating score\u2026';
    }
  };

  const noteSymbol = (i: number) => {
    if (i < detected.length) return detected[i].correct ? '\u2713' : '\u2717';
    if (i === currentNoteIndex && status === 'listening') return '\u2192';
    return '\u25cb';
  };

  const noteTrackerClass = (i: number) => {
    if (i < detected.length) return detected[i].correct ? 'note-tracker-item tracker-correct' : 'note-tracker-item tracker-incorrect';
    if (i === currentNoteIndex && status === 'listening') return 'note-tracker-item tracker-active';
    return 'note-tracker-item';
  };

  const rootLabel = `${NOTE_NAMES[exercise.rootNote]}${exercise.octave}`;
  const scaleLabel = SCALE_NAMES[exercise.scaleId];

  return (
    <div className="screen">
      <div className="screen-header">
        <button className="btn-back" onClick={onBack}>{'\u2190'} Back</button>
        <span className="screen-title">{rootLabel} {scaleLabel}</span>
      </div>

      <MusicStaff
        sequence={exercise.sequence}
        currentNoteIndex={currentNoteIndex}
        highlightIndex={highlightIndex}
        detected={detected}
        status={status}
      />

      <div className="status-text">{statusText()}</div>

      <div className="pitch-meter-circle">
        <PitchMeter hz={liveHz} />
      </div>

      <div>
        {status === 'idle' && (
          <>
            <button className="btn-primary" onClick={handlePlaySequence}>{'\u25b6'} Play Sequence</button>
            <button className="btn-outlined" onClick={handleStartListening}>{'\uD83C\uDF99'} Start Listening</button>
          </>
        )}
        {status === 'playing' && (
          <button className="btn-outlined" onClick={() => { cancelPlayback(); setStatus('idle'); setHighlightIndex(-1); }}>
            {'\u23f9'} Stop Playback
          </button>
        )}
        {status === 'listening' && (
          <button className="btn-danger" onClick={handleStopListening}>{'\u23f9'} Stop Listening</button>
        )}
        {status === 'done' && (
          <div className="spinner" />
        )}
      </div>

      {exercise.sequence.length > 0 && (
        <div>
          <div className="note-tracker-label">Notes:</div>
          <div className="note-tracker">
            {exercise.sequence.map((midi, i) => (
              <div key={i} className={noteTrackerClass(i)}>
                <div className="tracker-symbol">{noteSymbol(i)}</div>
                <div className="tracker-note">{midiToLabel(midi)}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
