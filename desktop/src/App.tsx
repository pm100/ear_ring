import React, { useState, useCallback, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { Screen, ExerciseSettings, ExerciseState } from './types';
import HomeScreen from './components/HomeScreen';
import ExerciseScreen from './components/ExerciseScreen';
import SetupScreen from './components/SetupScreen';
import ProgressScreen from './components/ProgressScreen';
import SettingsScreen from './components/SettingsScreen';
import HelpScreen from './components/HelpScreen';
import Sidebar from './components/Sidebar';
import { useSettings, Dispatch } from './useSettings';

/** Exercise state before any exercise has run: the live settings plus empty runtime fields. */
function initialExercise(settings: ExerciseSettings): ExerciseState {
  return {
    ...settings,
    sequence: [],
    detected: [],
    status: 'stopped',
    currentNoteIndex: 0,
    highlightIndex: -1,
    currentAttempt: 1,
    maxAttempts: settings.maxRetries,
    noteRetryCount: 0,
    testsCompleted: 0,
    cumulativeScorePercent: 0,
    sessionRunning: false,
    sessionId: 0,
  };
}

// App state, not a setting: kept out of the Rust settings model so a settings reset never touches it.
const HAS_LAUNCHED_KEY = 'ear_ring_has_launched';
// Ad-free / paid entitlement. Not a user "setting" — deliberately kept out of the Rust
// settings blob (and outside a settings reset's reach), same as iOS/Android's separate
// isPremium storage. Until real billing/gifting lands, only the DEBUG-only toggle in
// SettingsScreen sets this true.
const IS_PREMIUM_KEY = 'ear_ring_is_premium';

function getInitialScreen(): Screen {
  if (!localStorage.getItem(HAS_LAUNCHED_KEY)) {
    localStorage.setItem(HAS_LAUNCHED_KEY, '1');
    return 'help';
  }
  return 'home';
}

const TAB_SCREENS: Screen[] = ['home', 'setup', 'progress', 'settings', 'help'];

export default function App() {
  const { settings, dispatch } = useSettings();
  // Rust normalizes whatever was stored first (a few ms); there is nothing to show before that.
  if (!settings) return null;
  return <AppContent settings={settings} dispatch={dispatch} />;
}

function AppContent({ settings, dispatch }: { settings: ExerciseSettings; dispatch: Dispatch }) {
  const [screen, setScreen] = useState<Screen>(getInitialScreen);
  const [exercise, setExercise] = useState<ExerciseState>(() => initialExercise(settings));
  const [isPremium, setIsPremiumState] = useState(() => localStorage.getItem(IS_PREMIUM_KEY) === '1');
  const setIsPremium = useCallback((value: boolean) => {
    localStorage.setItem(IS_PREMIUM_KEY, value ? '1' : '0');
    setIsPremiumState(value);
  }, []);

  // If the current instrument is premium-gated (Voice) and isPremium is false — e.g. it was
  // selected before a debug/gift/purchase change revoked premium — snaps back to Piano
  // rather than leaving Settings' picker pointed at something it no longer offers.
  useEffect(() => {
    if (isPremium) return;
    invoke<string>('cmd_instrument_list').then(json => {
      const inst = (JSON.parse(json) as { id: number; premium: boolean }[])
        .find(i => i.id === settings.instrumentIndex);
      if (inst?.premium) dispatch({ type: 'setInstrument', value: 0 });
    }).catch(() => {});
  }, [isPremium, settings.instrumentIndex, dispatch]);

  // Reset leaves the first-launch flag alone: it's app state, not a setting, and clearing it
  // on reset is what sent the next-tapped tab to Help on Android.
  const resetSettings = useCallback(() => dispatch({ type: 'reset' }), [dispatch]);

  const clearProgress = useCallback(() => {
    localStorage.removeItem('ear_ring_sessions');
    localStorage.removeItem('ear_ring_tests');
  }, []);

  const startExercise = useCallback(async (rootNote: number, rangeStart: number, rangeEnd: number, scaleId: number, sequenceLength: number, tempoBpm: number, showTestNotes: boolean, keySignatureMode: number, testType = 0) => {
    const baseExercise = {
      rootNote,
      rangeStart,
      rangeEnd,
      scaleId,
      sequenceLength,
      tempoBpm,
      showTestNotes,
      keySignatureMode,
      introSoundMode: settings.introSoundMode,
      testType,
      maxRetries: settings.maxRetries,
      noteRetries: settings.noteRetries,
      silenceThreshold: settings.silenceThreshold,
      framesToConfirm: settings.framesToConfirm,
      warmupFrames: settings.warmupFrames,
      graceFrames: settings.graceFrames,
      octaveCorrection: settings.octaveCorrection,
      yinThreshold: settings.yinThreshold,
      pitchToleranceCents: settings.pitchToleranceCents,
      postChordGapMs: settings.postChordGapMs,
      wrongNotePauseMs: settings.wrongNotePauseMs,
      instrumentIndex: settings.instrumentIndex,
      playPassFailSounds: settings.playPassFailSounds,
      detected: [] as ExerciseState['detected'],
      status: 'playing' as const,
      currentNoteIndex: 0,
      highlightIndex: -1,
      currentAttempt: 1,
      maxAttempts: settings.maxRetries,
      noteRetryCount: 0,
      testsCompleted: 0,
      cumulativeScorePercent: 0,
      sessionRunning: true,
      sessionId: Date.now(),
    };
    if (testType === 1 || testType === 2) {
      // Melody mode and diatonic mode: let ExerciseScreen generate each sequence
      setExercise({
        ...baseExercise,
        sequence: [],
      });
      setScreen('exercise');
    } else {
      const seed = Date.now();
      try {
        const sequence = await invoke<number[]>('cmd_generate_sequence', {
          rootChroma: rootNote,
          scaleId,
          length: sequenceLength,
          rangeStart,
          rangeEnd,
          seed,
          // Avoid repeating the previous test's opening note, whatever mode it came from.
          avoidFirstMidi: exercise.sequence[0] ?? null,
        });
        setExercise({
          ...baseExercise,
          sequence,
        });
        setScreen('exercise');
      } catch (e) {
        console.error('generate_sequence failed', e);
      }
    }
  }, [settings, exercise.sequence]);

  const stopExercise = useCallback(() => {
    setExercise(prev => ({
      ...prev,
      sequence: [],
      detected: [],
      status: 'stopped',
      currentNoteIndex: 0,
      currentAttempt: 1,
      noteRetryCount: 0,
      testsCompleted: 0,
      cumulativeScorePercent: 0,
      sessionRunning: false,
    }));
    setScreen('home');
  }, []);

  const showNav = TAB_SCREENS.includes(screen);

  return (
    <div className="app-container">
      {showNav && (
        <Sidebar currentScreen={screen} onNavigate={setScreen} />
      )}
      <div className="main-content">
      {screen === 'home' && (
        <HomeScreen
          settings={settings}
          onAction={dispatch}
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
          onAction={dispatch}
          rangeStart={settings.rangeStart}
          rangeEnd={settings.rangeEnd}
          rootChroma={settings.rootNote}
          scaleId={settings.scaleId}
          keySignatureMode={settings.keySignatureMode}
          silenceThreshold={settings.silenceThreshold}
          framesToConfirm={settings.framesToConfirm}
          warmupFrames={settings.warmupFrames}
          instrumentIndex={settings.instrumentIndex}
          graceFrames={settings.graceFrames}
          octaveCorrection={settings.octaveCorrection}
          yinThreshold={settings.yinThreshold}
          pitchToleranceCents={settings.pitchToleranceCents}
          useTunerMeter={settings.useTunerMeter}
        />
      )}
      {screen === 'progress' && (
        <ProgressScreen
          onBack={() => setScreen('home')}
          onClearProgress={clearProgress}
          onStartExercise={() => setScreen('home')}
        />
      )}
      {screen === 'settings' && (
        <SettingsScreen
          settings={settings}
          onAction={dispatch}
          onResetSettings={resetSettings}
          onBack={() => setScreen('home')}
          isPremium={isPremium}
          onSetPremium={setIsPremium}
        />
      )}
      {screen === 'help' && (
        <HelpScreen
          onBack={() => setScreen('home')}
          settings={settings}
          isPremium={isPremium}
          onAction={dispatch}
        />
      )}
      </div>
    </div>
  );
}
