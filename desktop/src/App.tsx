import React, { useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { Screen, ExerciseSettings, ExerciseState } from './types';
import HomeScreen from './components/HomeScreen';
import ExerciseScreen from './components/ExerciseScreen';
import SetupScreen from './components/SetupScreen';
import ResultsScreen from './components/ResultsScreen';
import ProgressScreen from './components/ProgressScreen';

const defaultSettings: ExerciseSettings = {
  rootNote: 0,
  octave: 4,
  scaleId: 0,
  sequenceLength: 4,
  tempoBpm: 100,
  showTestNotes: false,
};

const defaultExercise: ExerciseState = {
  ...defaultSettings,
  sequence: [],
  detected: [],
  status: 'stopped',
  currentNoteIndex: 0,
  highlightIndex: -1,
  currentAttempt: 1,
  maxAttempts: 5,
  testsCompleted: 0,
  cumulativeScorePercent: 0,
  sessionRunning: false,
};

export default function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const [settings, setSettings] = useState<ExerciseSettings>(defaultSettings);
  const [exercise, setExercise] = useState<ExerciseState>(defaultExercise);

  const startExercise = useCallback(async (rootNote: number, octave: number, scaleId: number, sequenceLength: number, tempoBpm: number, showTestNotes: boolean) => {
    const midi = (octave + 1) * 12 + rootNote;
    const seed = Date.now();
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
        tempoBpm,
        showTestNotes,
        sequence,
        detected: [],
        status: 'playing',
        currentNoteIndex: 0,
        highlightIndex: -1,
        currentAttempt: 1,
        maxAttempts: 5,
        testsCompleted: 0,
        cumulativeScorePercent: 0,
        sessionRunning: true,
      });
      setScreen('exercise');
    } catch (e) {
      console.error('generate_sequence failed', e);
    }
  }, []);

  const stopExercise = useCallback(() => {
    setExercise(prev => ({
      ...prev,
      sequence: [],
      detected: [],
      status: 'stopped',
      currentNoteIndex: 0,
      currentAttempt: 1,
      testsCompleted: 0,
      cumulativeScorePercent: 0,
      sessionRunning: false,
    }));
    setScreen('home');
  }, []);

  return (
    <div className="app-container">
      {screen === 'home' && (
        <HomeScreen
          settings={settings}
          onUpdateSettings={setSettings}
          onStart={startExercise}
          onSetup={() => setScreen('setup')}
          onProgress={() => setScreen('progress')}
        />
      )}
      {screen === 'exercise' && (
        <ExerciseScreen
          exercise={exercise}
          onStop={stopExercise}
        />
      )}
      {screen === 'setup' && (
        <SetupScreen onBack={() => setScreen('home')} octave={settings.octave} />
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
