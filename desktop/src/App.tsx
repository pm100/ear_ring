import React, { useState, useCallback, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { Screen, ExerciseSettings, ExerciseState } from './types';
import HomeScreen from './components/HomeScreen';
import ExerciseScreen from './components/ExerciseScreen';
import SetupScreen from './components/SetupScreen';
import ResultsScreen from './components/ResultsScreen';
import ProgressScreen from './components/ProgressScreen';

const defaultSettings: ExerciseSettings = (() => {
  const rootNote = 0;  // C
  // One octave from rootNote closest to middle C (MIDI 60)
  let rangeStart = 60;
  for (let oct = 2; oct <= 6; oct++) {
    const c = (oct + 1) * 12 + rootNote;
    if (Math.abs(c - 60) < Math.abs(rangeStart - 60)) rangeStart = c;
  }
  return {
    rootNote,
    rangeStart,
    rangeEnd: rangeStart + 11,
    scaleId: 0,
    sequenceLength: 4,
    tempoBpm: 100,
    showTestNotes: false,
    keySignatureMode: 0,
  };
})();

/** Return the MIDI range (one octave) for a given pitch class closest to middle C. */
function defaultRangeForKey(rootNote: number): [number, number] {
  let best = 60 + rootNote;
  for (let oct = 2; oct <= 6; oct++) {
    const candidate = (oct + 1) * 12 + rootNote;
    if (Math.abs(candidate - 60) < Math.abs(best - 60)) best = candidate;
  }
  return [best, best + 11];
}

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

const SETTINGS_KEY = 'ear_ring_settings';

function loadSettings(): ExerciseSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { ...defaultSettings, ...JSON.parse(raw) };
  } catch {}
  return defaultSettings;
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const [settings, setSettings] = useState<ExerciseSettings>(loadSettings);
  const [exercise, setExercise] = useState<ExerciseState>({ ...defaultExercise, ...loadSettings() });

  useEffect(() => {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch {}
  }, [settings]);

  const startExercise = useCallback(async (rootNote: number, rangeStart: number, rangeEnd: number, scaleId: number, sequenceLength: number, tempoBpm: number, showTestNotes: boolean, keySignatureMode: number) => {
    const seed = Date.now();
    try {
      const sequence = await invoke<number[]>('cmd_generate_sequence', {
        rootChroma: rootNote,
        scaleId,
        length: sequenceLength,
        rangeStart,
        rangeEnd,
        seed,
      });
      setExercise({
        rootNote,
        rangeStart,
        rangeEnd,
        scaleId,
        sequenceLength,
        tempoBpm,
        showTestNotes,
        keySignatureMode,
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
        <SetupScreen onBack={() => setScreen('home')} rangeStart={settings.rangeStart} rangeEnd={settings.rangeEnd} rootChroma={settings.rootNote} keySignatureMode={settings.keySignatureMode} />
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
