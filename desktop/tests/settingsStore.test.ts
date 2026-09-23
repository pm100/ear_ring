import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSettingsStore } from '../src/settingsStore.ts';
import type { SettingsAction, SettingsBackend } from '../src/settingsStore.ts';

// The store is the desktop's only settings logic: it serializes calls into the Rust settings
// model (which owns every rule), persists what Rust returns, and publishes it. These tests use
// a fake backend, so they check ordering / persistence / error handling, not settings rules.

const json = (fields: Record<string, unknown> = {}) => JSON.stringify({ tempoBpm: 100, n: 0, ...fields });
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function memoryStorage(initial: string | null = null) {
  const state = { value: initial, saves: [] as string[], failSaves: false };
  return {
    state,
    load: () => state.value,
    save: (j: string) => {
      if (state.failSaves) throw new Error('storage unavailable');
      state.value = j;
      state.saves.push(j);
    },
  };
}

/** A backend whose apply() bumps `n`, so tests can see which result each call was built on. */
function countingBackend(delays: number[] = []) {
  const calls: { current: string; action: SettingsAction }[] = [];
  const backend: SettingsBackend = {
    normalize: async (stored) => stored ?? json(),
    apply: async (current, action) => {
      const index = calls.length;
      calls.push({ current, action: JSON.parse(action) });
      await sleep(delays[index] ?? 0);
      return json({ ...JSON.parse(current), n: JSON.parse(current).n + 1 });
    },
  };
  return { backend, calls };
}

test('init normalizes the stored value through the backend, persists it and returns it', async () => {
  const seen: (string | null)[] = [];
  const storage = memoryStorage('{"old":1}');
  const store = createSettingsStore(
    { normalize: async (stored) => { seen.push(stored); return json({ tempoBpm: 120 }); }, apply: async (c) => c },
    storage,
  );

  const settings = await store.init();

  assert.deepEqual(seen, ['{"old":1}']);
  assert.equal(settings.tempoBpm, 120);
  assert.equal(storage.state.value, json({ tempoBpm: 120 }), 'the normalized value is written back');
  assert.equal(store.get()?.tempoBpm, 120);
});

test('init passes null to the backend when nothing is stored', async () => {
  const seen: (string | null)[] = [];
  const store = createSettingsStore(
    { normalize: async (stored) => { seen.push(stored); return json(); }, apply: async (c) => c },
    memoryStorage(null),
  );
  await store.init();
  assert.deepEqual(seen, [null]);
});

test('get is null until init has finished', async () => {
  const store = createSettingsStore(countingBackend().backend, memoryStorage());
  assert.equal(store.get(), null);
  await store.init();
  assert.notEqual(store.get(), null);
});

test('dispatch applies the action to the current settings, then persists and publishes the result', async () => {
  const { backend, calls } = countingBackend();
  const storage = memoryStorage();
  const store = createSettingsStore(backend, storage);
  await store.init();
  const published: number[] = [];
  store.subscribe(s => published.push((s as unknown as { n: number }).n));

  await store.dispatch({ type: 'set', values: { tempoBpm: 140 } });

  assert.deepEqual(calls[0].action, { type: 'set', values: { tempoBpm: 140 } });
  assert.equal(calls[0].current, json(), 'applied to the normalized settings');
  assert.equal(storage.state.value, json({ n: 1 }));
  assert.deepEqual(published, [1]);
  assert.equal((store.get() as unknown as { n: number }).n, 1);
});

test('dispatches apply strictly in call order, each on the previous result, even if the backend answers out of order', async () => {
  const { backend, calls } = countingBackend([40, 0, 10]); // the first call is the slowest
  const store = createSettingsStore(backend, memoryStorage());
  await store.init();
  const published: number[] = [];
  store.subscribe(s => published.push((s as unknown as { n: number }).n));

  const a: SettingsAction = { type: 'set', values: { tempoBpm: 110 } };
  const b: SettingsAction = { type: 'set', values: { tempoBpm: 120 } };
  const c: SettingsAction = { type: 'set', values: { tempoBpm: 130 } };
  await Promise.all([store.dispatch(a), store.dispatch(b), store.dispatch(c)]);

  assert.deepEqual(calls.map(call => call.action), [a, b, c]);
  assert.deepEqual(calls.map(call => JSON.parse(call.current).n), [0, 1, 2], 'each call builds on the previous result');
  assert.deepEqual(published, [1, 2, 3]);
});

test('a failing backend call leaves settings unchanged and does not block later dispatches', async () => {
  let failNext = true;
  const errors: unknown[] = [];
  const store = createSettingsStore(
    {
      normalize: async () => json(),
      apply: async (current) => {
        if (failNext) { failNext = false; throw new Error('ipc down'); }
        return json({ ...JSON.parse(current), n: JSON.parse(current).n + 1 });
      },
    },
    memoryStorage(),
    e => errors.push(e),
  );
  await store.init();
  const published: unknown[] = [];
  store.subscribe(s => published.push(s));

  await store.dispatch({ type: 'reset' });  // fails; the returned promise must still settle
  assert.equal(errors.length, 1);
  assert.equal(published.length, 0, 'nothing published for the failed call');
  assert.equal((store.get() as unknown as { n: number }).n, 0);

  await store.dispatch({ type: 'reset' });  // the chain recovered
  assert.equal((store.get() as unknown as { n: number }).n, 1);
});

test('a storage failure is reported but the in-memory settings are still published', async () => {
  const errors: unknown[] = [];
  const storage = memoryStorage();
  const store = createSettingsStore(countingBackend().backend, storage, e => errors.push(e));
  await store.init();
  storage.state.failSaves = true;

  await store.dispatch({ type: 'reset' });

  assert.equal(errors.length, 1);
  assert.equal((store.get() as unknown as { n: number }).n, 1);
});

test('subscribe returns an unsubscribe function', async () => {
  const store = createSettingsStore(countingBackend().backend, memoryStorage());
  await store.init();
  let calls = 0;
  const unsubscribe = store.subscribe(() => { calls++; });
  await store.dispatch({ type: 'reset' });
  unsubscribe();
  await store.dispatch({ type: 'reset' });
  assert.equal(calls, 1);
});
