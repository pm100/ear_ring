import type { ExerciseSettings } from './types';

export type SettingsAction =
  | { type: 'set'; values: Partial<ExerciseSettings> }
  | { type: 'setRootNote'; value: number }
  | { type: 'setRange'; start: number; end: number }
  | { type: 'setInstrument'; value: number }
  | { type: 'setTestType'; value: number }
  | { type: 'reset' };

export interface SettingsBackend {
  normalize(stored: string | null): Promise<string>;
  apply(current: string, action: string): Promise<string>;
}

export interface SettingsStorage {
  load(): string | null;
  save(json: string): void;
}

export interface SettingsStore {
  init(): Promise<ExerciseSettings>;
  dispatch(action: SettingsAction): Promise<void>;
  get(): ExerciseSettings | null;
  subscribe(listener: (settings: ExerciseSettings) => void): () => void;
}

/**
 * Holds the app's settings. Every rule (defaults, clamping, instrument snapping, ...) lives in
 * the Rust core; this only serializes calls into it, persists the JSON it returns, and tells
 * subscribers. Tauri calls are async, so dispatches are chained: each is applied to the
 * previous result, in call order, no matter when the backend answers.
 */
export function createSettingsStore(
  backend: SettingsBackend,
  storage: SettingsStorage,
  onError: (error: unknown) => void = console.error,
): SettingsStore {
  let json = '';
  let current: ExerciseSettings | null = null;
  let chain: Promise<void> = Promise.resolve();
  const listeners = new Set<(settings: ExerciseSettings) => void>();

  // localStorage can be unavailable or full; the in-memory settings must survive that.
  const persist = (value: string) => {
    try {
      storage.save(value);
    } catch (error) {
      onError(error);
    }
  };

  return {
    async init() {
      json = await backend.normalize(storage.load());
      current = JSON.parse(json) as ExerciseSettings;
      persist(json); // writes back the normalized form, so old blobs upgrade in place
      return current;
    },

    dispatch(action) {
      chain = chain.then(async () => {
        try {
          const next = await backend.apply(json, JSON.stringify(action));
          const parsed = JSON.parse(next) as ExerciseSettings;
          json = next;
          current = parsed;
          persist(next);
          listeners.forEach(listener => listener(parsed));
        } catch (error) {
          onError(error); // this dispatch is dropped; later ones still run
        }
      });
      return chain;
    },

    get: () => current,

    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}
