import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { createSettingsStore, SettingsAction, SettingsBackend, SettingsStorage } from './settingsStore';
import { ExerciseSettings } from './types';

// localStorage key from before settings moved into the Rust core. Rust reads the old blob
// as-is (missing/legacy fields are repaired), so existing users keep their settings.
const SETTINGS_KEY = 'ear_ring_settings';

const backend: SettingsBackend = {
  normalize: (stored) => invoke<string>('cmd_settings_normalize', { input: stored ?? '' }),
  apply: (current, action) => invoke<string>('cmd_settings_apply', { current, action }),
};

const storage: SettingsStorage = {
  load: () => {
    try { return localStorage.getItem(SETTINGS_KEY); } catch { return null; }
  },
  save: (json) => localStorage.setItem(SETTINGS_KEY, json),
};

const store = createSettingsStore(backend, storage);
let initialising: Promise<ExerciseSettings> | null = null;

/** Sends one action to the Rust settings model; the new settings arrive via [useSettings]. */
export type Dispatch = (action: SettingsAction) => void;
const dispatch: Dispatch = (action) => { void store.dispatch(action); };

/**
 * The app's settings, or null for the few milliseconds while Rust normalizes what was stored.
 * All rules live in Rust (rust/src/settings.rs); change settings only through `dispatch`.
 */
export function useSettings(): { settings: ExerciseSettings | null; dispatch: Dispatch } {
  const [settings, setSettings] = useState<ExerciseSettings | null>(store.get());

  useEffect(() => {
    let active = true;
    initialising ??= store.init();
    initialising.then(loaded => { if (active) setSettings(loaded); }).catch(console.error);
    const unsubscribe = store.subscribe(next => { if (active) setSettings(next); });
    return () => { active = false; unsubscribe(); };
  }, []);

  return { settings, dispatch };
}
