import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyProposal, askAssistant, getInstallId } from '../src/assistantClient.ts';
import type { AssistantCore, Transport } from '../src/assistantClient.ts';

// The client only moves strings between the Rust core and the proxy, so these tests use fakes
// for both and check the wiring: what is sent, how failures map to status 0, and the order in
// which a proposal's actions are dispatched. The rules themselves are tested in Rust.

function fakeCore(overrides: Partial<AssistantCore> = {}) {
  const calls: string[] = [];
  const core: AssistantCore = {
    endpoint: async () => 'https://proxy.test/v1/ask',
    request: async (history, settings, premium) => {
      calls.push(`request:${history}|${settings}|${premium}`);
      return '{"built":"body"}';
    },
    resolveOutcome: async (status, body, settings, premium) => {
      calls.push(`outcome:${status}|${body}|${premium}`);
      return JSON.stringify({ reply: `status ${status}`, card: null, proposal: null, feedbackSent: false, quota: null, isError: status !== 200 });
    },
    resolveProposal: async () => JSON.stringify({
      items: [
        { key: 'a', label: 'A', from: '1', to: '2', action: { type: 'set', values: { maxRetries: 8 } } },
        { key: 'b', label: 'B', from: '3', to: '4', action: { type: 'setRootNote', value: 7 } },
      ],
      rejected: [],
    }),
    ...overrides,
  };
  return { core, calls };
}

function fakeTransport(result: { status: number; body: string } | Error) {
  const posts: { url: string; headers: Record<string, string>; body: string }[] = [];
  const transport: Transport = {
    post: async (url, headers, body) => {
      posts.push({ url, headers, body });
      if (result instanceof Error) throw result;
      return result;
    },
  };
  return { transport, posts };
}

test('askAssistant posts the core-built body with the install id and hands the response back to the core', async () => {
  const { core, calls } = fakeCore();
  const { transport, posts } = fakeTransport({ status: 200, body: '{"reply":"hi"}' });
  const view = await askAssistant(core, transport, 'install-1', [{ role: 'user', text: 'hello' }], '{"s":1}', true);

  assert.equal(posts.length, 1);
  assert.equal(posts[0].url, 'https://proxy.test/v1/ask');
  assert.equal(posts[0].body, '{"built":"body"}');
  assert.equal(posts[0].headers['X-Install-Id'], 'install-1');
  assert.equal(posts[0].headers['X-Client'], 'desktop');
  assert.deepEqual(calls, [
    'request:[{"role":"user","text":"hello"}]|{"s":1}|true',
    'outcome:200|{"reply":"hi"}|true',
  ]);
  assert.equal(view.reply, 'status 200');
});

test('a network failure is reported to the core as status 0 and never rejects', async () => {
  const { core, calls } = fakeCore();
  const { transport } = fakeTransport(new Error('offline'));
  const view = await askAssistant(core, transport, 'id', [], '{}', false);
  assert.equal(calls[calls.length - 1], 'outcome:0||false');
  assert.equal(view.isError, true);
});

test('a non-200 status and its body are passed through for the core to interpret', async () => {
  const { core, calls } = fakeCore();
  const { transport } = fakeTransport({ status: 429, body: '{"error":"quota_exceeded"}' });
  await askAssistant(core, transport, 'id', [], '{}', false);
  assert.equal(calls[calls.length - 1], 'outcome:429|{"error":"quota_exceeded"}|false');
});

test('a failure inside the core is treated as offline rather than thrown', async () => {
  const { core } = fakeCore({ request: async () => { throw new Error('bridge down'); } });
  const { transport, posts } = fakeTransport({ status: 200, body: '{}' });
  const view = await askAssistant(core, transport, 'id', [], '{}', false);
  assert.equal(posts.length, 0);
  assert.equal(view.reply, 'status 0');
});

test('applyProposal dispatches each action from the freshly re-validated card, in order', async () => {
  const { core } = fakeCore();
  const dispatched: unknown[] = [];
  const card = await applyProposal(core, [{ setting: 'x', value: 1 }], '{}', false, a => dispatched.push(a));
  assert.deepEqual(dispatched, [
    { type: 'set', values: { maxRetries: 8 } },
    { type: 'setRootNote', value: 7 },
  ]);
  assert.equal(card.items.length, 2);
});

test('applyProposal dispatches nothing when everything is already in effect', async () => {
  const { core } = fakeCore({ resolveProposal: async () => '{"items":[],"rejected":[{"key":"a","reason":"already set to that"}]}' });
  const dispatched: unknown[] = [];
  const card = await applyProposal(core, [], '{}', false, a => dispatched.push(a));
  assert.equal(dispatched.length, 0);
  assert.equal(card.items.length, 0);
});

test('getInstallId creates an id once and then keeps returning it', () => {
  const store = new Map<string, string>();
  const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
  let n = 0;
  const makeId = () => `id-${++n}`;
  assert.equal(getInstallId(storage, makeId), 'id-1');
  assert.equal(getInstallId(storage, makeId), 'id-1');
  assert.equal(n, 1);
});

test('getInstallId still returns an id when storage is blocked', () => {
  const blocked = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } };
  assert.equal(getInstallId(blocked, () => 'fallback'), 'fallback');
});
