import React, { useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { Screen, ExerciseState, SessionRecord } from './types';
import HomeScreen from './components/HomeScreen';
import ExerciseScreen from './components/ExerciseScreen';
import SetupScreen from './components/SetupScreen';
import ResultsScreen from './components/ResultsScreen';
import ProgressScreen from './components/ProgressScreen';

const SCALE_NAMES = ['Major', 'Natural Minor', 'Harmonic Minor', 'Pentatonic Major', 'Pentatonic Minor', 'Dorian', 'Mixolydian', 'Blues'];
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

const defaultExercise: ExerciseState = {
  rootNote: 0,
  octave: 4,
  scaleId: 0,
  sequenceLength: 4,
  sequence: [],
  detected: [],
  status: 'idle',
  currentNoteIndex: 0,
  highlightIndex: -1,
};

export default function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const [exercise, setExercise] = useState<ExerciseState>(defaultExercise);

  const startExercise = useCallback(async (rootNote: number, octave: number, scaleId: number, sequenceLength: number) => {
    // MIDI formula: C4=60, so midi = (octave+1)*12 + rootNote
    const midi = (octave + 1) * 12 + rootNote;
    const seed = BigInt(Date.now());
    try {
      const sequence = await invoke<number[]>('cmd_generate_sequence', {
        rootMidi: midi,
        scaleId,
        length: sequenceLength,
        seed,
      });
      setExercise({
        rootNote,
        octave,
        scaleId,
        sequenceLength,
        sequence,
        detected: [],
        status: 'idle',
        currentNoteIndex: 0,
        highlightIndex: -1,
      });
      setScreen('exercise');
    } catch (e) {
      console.error('generate_sequence failed', e);
    }
  }, []);

  const finishExercise = useCallback((detected: ExerciseState['detected']) => {
    setExercise(prev => ({ ...prev, detected, status: 'done' }));
    const correct = detected.filter(d => d.correct).length;
    const score = detected.length > 0 ? Math.round((correct / detected.length) * 100) : 0;
    const record: SessionRecord = {
      date: new Date().toISOString(),
      scale: SCALE_NAMES[exercise.scaleId] || 'Major',
      root: NOTE_NAMES[exercise.rootNote] || 'C',
      score,
      length: exercise.sequenceLength,
    };
    const existing: SessionRecord[] = JSON.parse(localStorage.getItem('ear_ring_sessions') || '[]');
    existing.unshift(record);
    localStorage.setItem('ear_ring_sessions', JSON.stringify(existing.slice(0, 100)));
    setScreen('results');
  }, [exercise.scaleId, exercise.rootNote, exercise.sequenceLength]);

  const updateExercise = useCallback((updates: Partial<ExerciseState>) => {
    setExercise(prev => ({ ...prev, ...updates }));
  }, []);

  return (
    <div className="app-container">
      {screen === 'home' && (
        <HomeScreen
          exercise={exercise}
          onUpdateExercise={updateExercise}
          onStart={startExercise}
          onSetup={() => setScreen('setup')}
          onProgress={() => setScreen('progress')}
        />
      )}
      {screen === 'exercise' && (
        <ExerciseScreen
          exercise={exercise}
          onUpdateExercise={updateExercise}
          onFinish={finishExercise}
          onBack={() => setScreen('home')}
        />
      )}
      {screen === 'setup' && (
        <SetupScreen onBack={() => setScreen('home')} />
      )}
      {screen === 'results' && (
        <ResultsScreen
          exercise={exercise}
          onTryAgain={() => setScreen('exercise')}
          onNewExercise={() => setScreen('home')}
          onProgress={() => setScreen('progress')}
        />
      )}
      {screen === 'progress' && (
        <ProgressScreen onBack={() => setScreen('home')} />
      )}
    </div>
  );
}
