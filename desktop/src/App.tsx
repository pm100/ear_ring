import React, { useState, useCallback, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { Screen, ExerciseSettings, ExerciseState } from './types';
import HomeScreen from './components/HomeScreen';
import ExerciseScreen from './components/ExerciseScreen';
import SetupScreen from './components/SetupScreen';
import ResultsScreen from './components/ResultsScreen';
import ProgressScreen from './components/ProgressScreen';
import SettingsScreen from './components/SettingsScreen';
import HelpScreen from './components/HelpScreen';
import BottomNavBar from './components/BottomNavBar';

const defaultSettings: ExerciseSettings = (() => {
  const rootNote = 0;
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
    maxRetries: 5,
    silenceThreshold: 0.003,
    framesToConfirm: 3,
    postChordGapMs: 800,
    wrongNotePauseMs: 3000,
    instrumentIndex: 0,
  };
})();

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
  maxAttempts: defaultSettings.maxRetries,
  testsCompleted: 0,
  cumulativeScorePercent: 0,
  sessionRunning: false,
};

const SETTINGS_KEY = 'ear_ring_settings';
const HAS_LAUNCHED_KEY = 'ear_ring_has_launched';

function loadSettings(): ExerciseSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { ...defaultSettings, ...JSON.parse(raw) };
  } catch {}
  return defaultSettings;
}

function getInitialScreen(): Screen {
  if (!localStorage.getItem(HAS_LAUNCHED_KEY)) {
    localStorage.setItem(HAS_LAUNCHED_KEY, '1');
    return 'help';
  }
  return 'home';
}

const TAB_SCREENS: Screen[] = ['home', 'setup', 'progress', 'settings', 'help'];

export default function App() {
  const [screen, setScreen] = useState<Screen>(getInitialScreen);
  const [settings, setSettings] = useState<ExerciseSettings>(loadSettings);
  const [exercise, setExercise] = useState<ExerciseState>({ ...defaultExercise, ...loadSettings() });

  useEffect(() => {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch {}
  }, [settings]);

  const resetSettings = useCallback(() => {
    setSettings(defaultSettings);
    localStorage.removeItem(HAS_LAUNCHED_KEY);
  }, []);

  const clearProgress = useCallback(() => {
    localStorage.removeItem('ear_ring_sessions');
    localStorage.removeItem('ear_ring_tests');
  }, []);

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
        maxRetries: settings.maxRetries,
        silenceThreshold: settings.silenceThreshold,
        framesToConfirm: settings.framesToConfirm,
        postChordGapMs: settings.postChordGapMs,
        wrongNotePauseMs: settings.wrongNotePauseMs,
        instrumentIndex: settings.instrumentIndex,
        sequence,
        detected: [],
        status: 'playing',
        currentNoteIndex: 0,
        highlightIndex: -1,
        currentAttempt: 1,
        maxAttempts: settings.maxRetries,
        testsCompleted: 0,
        cumulativeScorePercent: 0,
        sessionRunning: true,
      });
      setScreen('exercise');
    } catch (e) {
      console.error('generate_sequence failed', e);
    }
  }, [settings]);

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

  const showNav = TAB_SCREENS.includes(screen);

  return (
    <div className="app-container">
      {screen === 'home' && (
        <HomeScreen
          settings={settings}
          onUpdateSettings={setSettings}
          onStart={startExercise}
        />
      )}
      {screen === 'exercise' && (
        <ExerciseScreen
          exercise={exercise}
          onStop={stopExercise}
        />
      )}
      {screen === 'setup' && (
        <SetupScreen
          onBack={() => setScreen('home')}
          rangeStart={settings.rangeStart}
          rangeEnd={settings.rangeEnd}
          rootChroma={settings.rootNote}
          keySignatureMode={settings.keySignatureMode}
          silenceThreshold={settings.silenceThreshold}
          framesToConfirm={settings.framesToConfirm}
          instrumentIndex={settings.instrumentIndex}
        />
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
        <ProgressScreen onBack={() => setScreen('home')} onClearProgress={clearProgress} />
      )}
      {screen === 'settings' && (
        <SettingsScreen
          settings={settings}
          onUpdateSettings={setSettings}
          onResetSettings={resetSettings}
          onBack={() => setScreen('home')}
        />
      )}
      {screen === 'help' && (
        <HelpScreen onBack={() => setScreen('home')} />
      )}
      {showNav && (
        <BottomNavBar currentScreen={screen} onNavigate={setScreen} />
      )}
    </div>
  );
}
