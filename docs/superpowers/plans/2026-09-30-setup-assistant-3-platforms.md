# Setup Assistant, Part 3: Platform UIs, Docs and Store Forms Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the "Ask about setup" chat to the Help tab on desktop, Android and iOS, with identical behaviour and copy, plus the documentation and store-form updates the feature requires.

**Architecture:** Each platform gets a thin network client (a random install id, one HTTPS POST, JSON parsing) and a chat view. All rules live in the Rust core built in plan 1: the client passes the HTTP status and response body to `resolve_outcome_json` and renders what comes back; when the user taps Apply it calls `resolve_proposal_json` again with the *current* settings and dispatches each returned action through the platform's existing settings path. The chat transcript lives only in the view, so it is discarded when the user leaves Help.

**Tech Stack:** React + Tauri (desktop), Kotlin + Jetpack Compose (Android), Swift + SwiftUI (iOS); the Rust bridges from plan 1.

**Spec:** `docs/superpowers/specs/2026-09-30-setup-assistant-design.md`. **Depends on plan 1** (core, JNI, C FFI, Tauri commands) and is most useful after plan 2 is deployed (Task 5 needs the live proxy; Tasks 1 to 3 can be verified without it, where the offline error path is what you exercise).

## Repo rules that apply to every step

- **Never run `git commit` or `git push` on your own initiative** (AGENTS.md); commit steps are what to commit *when the user says so*, and approval does not carry over to the next commit.
- **UI Consistency Rule (AGENTS.md):** the UI change goes on all three platforms, and DESIGN.md must be updated before the work counts as done (Task 4). The Android app is the reference implementation.
- Work on branch `sage`. Keep code comments short.
- The Android emulator is running on this machine and AGENTS.md documents the adb workflow; use it for Task 2's on-device checks instead of stopping at a compile. `$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"`.
- iOS builds run on the Mac over SSH. **Sync by file copy, not git** (AGENTS.md "Remote iOS Builds over SSH"); use the full path to `ssh.exe` if bare `ssh` misbehaves.

## Global Constraints

- **Copy (identical on every platform):** title `Ask about setup`; disclosure `Describe what you want, e.g. “I want a chance to correct a wrong note”. Your question and current settings are sent to a server to get an answer.`; placeholder `Ask how to set something up`; buttons `Send`, `Try again`, `Apply`, `Not now`; status `Thinking…`; after Apply `Applied. You can review it in Settings.` (or `Already up to date.` when nothing changed); after Not now `No changes made.`; feedback `Sent as feedback, thanks.`; footer `N question(s) left today` (`1 question left today`).
- Input is limited to 500 characters; Send is disabled while a request is in flight or the text is blank; pressing the keyboard's send key does the same as Send.
- The card lists each item as `Label: from → to`, skipped items as `Skipped <key>: <reason>`, with `Apply` and `Not now`. **Nothing changes until Apply.**
- Colours follow the existing theme: user bubble in the primary colour (#3F51B5) with white text; assistant bubble in a light neutral; error bubble in a light red.
- Install id storage: desktop `localStorage` key `ear_ring_install_id`; Android `SharedPreferences` file `ear_ring_assistant`, key `install_id`; iOS `UserDefaults` key `assistantInstallId`. A random UUID, created on first use.
- Network timeouts: connect 10 s, read 30 s (Android); 30 s (iOS, desktop). Request headers: `Content-Type: application/json`, `X-Install-Id`, `X-Client: desktop|android|ios`.
- The client never parses model output or decides what an HTTP status means; it calls the Rust bridge. No platform hard-codes the proxy address (it comes from `assistant::PROXY_URL` through the bridge).
- The transcript is in-memory only (discarded when the user leaves Help); only the install id is persisted.
- Premium is passed as today's per-platform `isPremium` flag.

## Review Focus

1. Settings change by hand between a proposal and tapping Apply: Apply re-validates against current settings, so it applies only what is still different, or says `Already up to date.` (Tasks 1 and 2 have tests; check on iOS in Task 3).
2. No network, a timeout or a server error: an error bubble with `Try again`, the conversation kept, no crash (exercised in Tasks 1 to 3 against the placeholder address).
3. Leaving Help and coming back: the transcript is gone and nothing crashes or leaks state between visits (Tasks 1 to 3, manual).
4. Double-tapping Send or pressing the keyboard send key twice: one request (Send disabled while busy; Tasks 1 to 3).
5. A long reply or a card with several items on a small phone or the desktop's narrowest window: wraps and scrolls, nothing clipped (Task 5, manual).
6. The on-screen keyboard covering the input field on a phone (Tasks 2 and 3, manual).

---

## File structure

- Desktop: create `desktop/src/assistantClient.ts`, `desktop/src/assistantTauri.ts`, `desktop/src/components/AssistantChat.tsx`, `desktop/tests/assistantClient.test.ts`; modify `desktop/src/components/HelpScreen.tsx`, `desktop/src/App.tsx`.
- Android: create `AssistantClient.kt`, `ui/AssistantChat.kt`, `androidTest/.../AssistantCoreTest.kt`; modify `EarRingCore.kt`, `ExerciseViewModel.kt`, `ui/HelpScreen.kt`, `ui/EarRingApp.kt` (all under `android/app/src/main/java/com/jollygoodsw/earring/` unless noted).
- iOS: create `ios/earring/AssistantClient.swift`, `ios/earring/views/AssistantChatView.swift`; modify `EarRingCore.swift`, `ExerciseModel.swift`, `views/HelpView.swift`, `earring.xcodeproj/project.pbxproj`, `PrivacyInfo.xcprivacy`.
- Docs: modify `rust/src/help.md`, `DESIGN.md`, `CHANGELOG.md`; update store privacy forms and the privacy policy (manual).

---
### Task 1: Desktop

**Files:** see the file structure above (desktop).

**Interfaces:**
- Consumes (plan 1 Task 6): Tauri commands `cmd_assistant_endpoint`, `cmd_assistant_request`, `cmd_assistant_resolve_outcome`, `cmd_assistant_resolve_proposal`; the existing `Dispatch` from `useSettings.ts` and `SettingsAction` from `settingsStore.ts`; `ExerciseSettings` (types.ts).
- Produces: `askAssistant(core, transport, installId, history, settingsJson, isPremium): Promise<AssistantView>` (never rejects), `applyProposal(core, proposal, settingsJson, isPremium, dispatch): Promise<AssistantCard>`, `getInstallId(storage, makeId?)`, interfaces `AssistantCore` and `Transport` (so tests inject fakes), and the `AssistantChat` component.

Design note: `assistantClient.ts` imports only types, so the Node test runner can load it without Tauri; `assistantTauri.ts` holds the real Tauri bindings.

- [ ] **Step 1: Write the failing tests**

Create `desktop/tests/assistantClient.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run the tests to verify they fail**

```powershell
cd C:\work\ear_ring\desktop
node --test tests/*.test.ts
```

Expected: the new file fails to load (`Cannot find module '.../src/assistantClient.ts'`).

- [ ] **Step 3: Write the client**

Create `desktop/src/assistantClient.ts`:

```typescript
import type { SettingsAction } from './settingsStore';

// The setup assistant's network round trip. Every rule (request body, status handling, which
// proposed changes are valid) lives in the Rust core (rust/src/assistant.rs); this file only
// moves strings between Rust and the proxy, so it takes both as injected dependencies.

export interface Turn {
  role: 'user' | 'assistant';
  text: string;
}

export interface AssistantCardItem {
  key: string;
  label: string;
  from: string;
  to: string;
  action: SettingsAction;
}

export interface AssistantCard {
  items: AssistantCardItem[];
  rejected: { key: string; reason: string }[];
}

/** What the chat shows for one round trip (the core's `resolve_outcome_json`). */
export interface AssistantView {
  reply: string;
  card: AssistantCard | null;
  /** Kept so the proposal can be re-validated against current settings when Apply is tapped. */
  proposal: unknown[] | null;
  feedbackSent: boolean;
  quota: { remaining: number; resetsAt: string } | null;
  isError: boolean;
}

export interface AssistantCore {
  endpoint(): Promise<string>;
  request(historyJson: string, settingsJson: string, isPremium: boolean): Promise<string>;
  resolveOutcome(status: number, body: string, settingsJson: string, isPremium: boolean): Promise<string>;
  resolveProposal(proposalJson: string, settingsJson: string, isPremium: boolean): Promise<string>;
}

export interface Transport {
  /** Rejects if the request never reached the server. */
  post(url: string, headers: Record<string, string>, body: string): Promise<{ status: number; body: string }>;
}

/** Sends the conversation to the proxy and returns what to show. Never rejects. */
export async function askAssistant(
  core: AssistantCore,
  transport: Transport,
  installId: string,
  history: Turn[],
  settingsJson: string,
  isPremium: boolean,
): Promise<AssistantView> {
  let status = 0;
  let body = '';
  try {
    const requestBody = await core.request(JSON.stringify(history), settingsJson, isPremium);
    const url = await core.endpoint();
    const headers = { 'Content-Type': 'application/json', 'X-Install-Id': installId, 'X-Client': 'desktop' };
    ({ status, body } = await transport.post(url, headers, requestBody));
  } catch {
    status = 0; // the core reads 0 as "couldn't reach the assistant"
  }
  return JSON.parse(await core.resolveOutcome(status, body, settingsJson, isPremium)) as AssistantView;
}

/**
 * Applies a proposal: re-validates it against the settings as they are now (they may have
 * changed since it was proposed), then dispatches each resulting action in order. Returns the
 * card that was applied; it has no items if everything is already in effect.
 */
export async function applyProposal(
  core: AssistantCore,
  proposal: unknown[],
  settingsJson: string,
  isPremium: boolean,
  dispatch: (action: SettingsAction) => void,
): Promise<AssistantCard> {
  const card = JSON.parse(await core.resolveProposal(JSON.stringify(proposal), settingsJson, isPremium)) as AssistantCard;
  for (const item of card.items) dispatch(item.action);
  return card;
}

const INSTALL_ID_KEY = 'ear_ring_install_id';

/** A random id, created on first use, that lets the proxy count questions per install. */
export function getInstallId(storage: Pick<Storage, 'getItem' | 'setItem'>, makeId: () => string = () => crypto.randomUUID()): string {
  try {
    const existing = storage.getItem(INSTALL_ID_KEY);
    if (existing) return existing;
    const created = makeId();
    storage.setItem(INSTALL_ID_KEY, created);
    return created;
  } catch {
    return makeId(); // storage blocked: a per-session id still works, it just isn't remembered
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/*.test.ts`
Expected: `tests 16`, `pass 16`, `fail 0` (the 8 new tests plus the 8 existing settings-store tests).

- [ ] **Step 5: Add the Tauri bindings and the chat component**

Create `desktop/src/assistantTauri.ts`:

```typescript
import { invoke } from '@tauri-apps/api/tauri';
import { Body, fetch as tauriFetch, ResponseType } from '@tauri-apps/api/http';
import type { AssistantCore, Transport } from './assistantClient';

/** The Rust core's assistant functions, via Tauri commands. */
export const tauriCore: AssistantCore = {
  endpoint: () => invoke<string>('cmd_assistant_endpoint'),
  request: (historyJson, settingsJson, isPremium) =>
    invoke<string>('cmd_assistant_request', { history: historyJson, settings: settingsJson, isPremium }),
  resolveOutcome: (status, body, settingsJson, isPremium) =>
    invoke<string>('cmd_assistant_resolve_outcome', { status, body, settings: settingsJson, isPremium }),
  resolveProposal: (proposalJson, settingsJson, isPremium) =>
    invoke<string>('cmd_assistant_resolve_proposal', { proposal: proposalJson, settings: settingsJson, isPremium }),
};

/** POSTs through Tauri's HTTP client (bypasses webview CORS; scope set in tauri.conf.json). */
export const tauriTransport: Transport = {
  async post(url, headers, body) {
    const response = await tauriFetch<string>(url, {
      method: 'POST',
      headers,
      body: Body.text(body),
      responseType: ResponseType.Text,
      timeout: 30,
    });
    return { status: response.status, body: response.data };
  },
};
```

Create `desktop/src/components/AssistantChat.tsx`:

```tsx
import React, { useRef, useState } from 'react';
import {
  applyProposal,
  askAssistant,
  getInstallId,
  AssistantCard,
  AssistantView,
  Turn,
} from '../assistantClient';
import { tauriCore, tauriTransport } from '../assistantTauri';
import type { Dispatch } from '../useSettings';
import type { ExerciseSettings } from '../types';

interface Props {
  settings: ExerciseSettings;
  isPremium: boolean;
  onAction: Dispatch;
}

interface Entry {
  id: number;
  role: 'user' | 'assistant';
  text: string;
  card?: AssistantCard | null;
  proposal?: unknown[] | null;
  /** Card state: waiting for the user, applied, or dismissed. */
  cardState?: 'pending' | 'applied' | 'dismissed';
  appliedCount?: number;
  feedbackSent?: boolean;
  isError?: boolean;
}

const PRIMARY = '#3F51B5';

/**
 * "Ask about setup" chat at the top of Help. The transcript lives only in this component, so it
 * is discarded when the user leaves the screen. Nothing changes until Apply is tapped.
 */
export default function AssistantChat({ settings, isPremium, onAction }: Props) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [quotaLeft, setQuotaLeft] = useState<number | null>(null);
  const nextId = useRef(1);

  const settingsJson = () => JSON.stringify(settings);

  const ask = async (transcript: Entry[]) => {
    setBusy(true);
    const history: Turn[] = transcript.filter(e => !e.isError).map(e => ({ role: e.role, text: e.text }));
    const view: AssistantView = await askAssistant(
      tauriCore, tauriTransport, getInstallId(localStorage), history, settingsJson(), isPremium);
    if (view.quota) setQuotaLeft(view.quota.remaining);
    setEntries([
      ...transcript,
      {
        id: nextId.current++,
        role: 'assistant',
        text: view.reply,
        card: view.card,
        proposal: view.proposal,
        cardState: view.card ? 'pending' : undefined,
        feedbackSent: view.feedbackSent,
        isError: view.isError,
      },
    ]);
    setBusy(false);
  };

  const send = () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput('');
    void ask([...entries, { id: nextId.current++, role: 'user', text }]);
  };

  const retry = () => {
    // Drop the error line and ask again with the same conversation.
    const transcript = entries.filter(e => !e.isError);
    void ask(transcript);
  };

  const apply = async (entry: Entry) => {
    const card = await applyProposal(tauriCore, entry.proposal ?? [], settingsJson(), isPremium, onAction);
    setEntries(list => list.map(e =>
      e.id === entry.id ? { ...e, cardState: 'applied', appliedCount: card.items.length } : e));
  };

  const dismiss = (entry: Entry) =>
    setEntries(list => list.map(e => (e.id === entry.id ? { ...e, cardState: 'dismissed' } : e)));

  const lastIsError = entries.length > 0 && entries[entries.length - 1].isError;

  return (
    <div style={{ marginBottom: 24 }}>
      <h2 style={{ fontSize: 16, fontWeight: 700, color: PRIMARY, marginBottom: 8 }}>Ask about setup</h2>
      <div style={{ fontSize: 13, color: '#757575', marginBottom: 8 }}>
        Describe what you want, e.g. “I want a chance to correct a wrong note”. Your question and
        current settings are sent to a server to get an answer.
      </div>

      {entries.map(entry => (
        <div key={entry.id} style={{
          display: 'flex', justifyContent: entry.role === 'user' ? 'flex-end' : 'flex-start', marginBottom: 8,
        }}>
          <div style={{
            maxWidth: '85%', padding: '8px 12px', borderRadius: 12, fontSize: 14, lineHeight: 1.5,
            background: entry.role === 'user' ? PRIMARY : entry.isError ? '#FDECEA' : '#EEF0FA',
            color: entry.role === 'user' ? 'white' : '#212121',
          }}>
            <div>{entry.text}</div>
            {entry.card && entry.cardState === 'pending' && (
              <div style={{ marginTop: 8, padding: 8, background: 'white', borderRadius: 8 }}>
                {entry.card.items.map(item => (
                  <div key={item.key} style={{ fontSize: 14 }}>
                    <strong>{item.label}</strong>: {item.from} → {item.to}
                  </div>
                ))}
                {entry.card.rejected.map(r => (
                  <div key={r.key} style={{ fontSize: 12, color: '#757575' }}>Skipped {r.key}: {r.reason}</div>
                ))}
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button onClick={() => void apply(entry)} style={{
                    background: PRIMARY, color: 'white', border: 'none', borderRadius: 8, padding: '6px 14px',
                    fontWeight: 600, cursor: 'pointer' }}>Apply</button>
                  <button onClick={() => dismiss(entry)} style={{
                    background: 'transparent', color: PRIMARY, border: `1px solid ${PRIMARY}`, borderRadius: 8,
                    padding: '6px 14px', fontWeight: 600, cursor: 'pointer' }}>Not now</button>
                </div>
              </div>
            )}
            {entry.cardState === 'applied' && (
              <div style={{ marginTop: 6, fontSize: 13, color: '#2E7D32' }}>
                {entry.appliedCount ? 'Applied. You can review it in Settings.' : 'Already up to date.'}
              </div>
            )}
            {entry.cardState === 'dismissed' && (
              <div style={{ marginTop: 6, fontSize: 13, color: '#757575' }}>No changes made.</div>
            )}
            {entry.feedbackSent && (
              <div style={{ marginTop: 6, fontSize: 13, color: '#757575' }}>Sent as feedback, thanks.</div>
            )}
          </div>
        </div>
      ))}

      {lastIsError && !busy && (
        <button onClick={retry} style={{
          background: 'transparent', color: PRIMARY, border: `1px solid ${PRIMARY}`, borderRadius: 8,
          padding: '6px 14px', fontWeight: 600, cursor: 'pointer', marginBottom: 8 }}>Try again</button>
      )}
      {busy && <div style={{ fontSize: 13, color: '#757575', marginBottom: 8 }}>Thinking…</div>}

      <div style={{ display: 'flex', gap: 8 }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') send(); }}
          maxLength={500}
          placeholder="Ask how to set something up"
          style={{ flex: 1, padding: '8px 12px', fontSize: 14, borderRadius: 8, border: '1px solid #BDBDBD' }}
        />
        <button onClick={send} disabled={busy || !input.trim()} style={{
          background: PRIMARY, color: 'white', border: 'none', borderRadius: 8, padding: '8px 16px',
          fontWeight: 600, cursor: busy || !input.trim() ? 'default' : 'pointer',
          opacity: busy || !input.trim() ? 0.5 : 1 }}>Send</button>
      </div>
      {quotaLeft !== null && (
        <div style={{ fontSize: 12, color: '#757575', marginTop: 4 }}>
          {quotaLeft} question{quotaLeft === 1 ? '' : 's'} left today
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Show it on the Help screen**

Replace `desktop/src/components/HelpScreen.tsx` with:

```tsx
import React, { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import AssistantChat from './AssistantChat';
import type { Dispatch } from '../useSettings';
import type { ExerciseSettings } from '../types';

interface HelpSection {
  title: string;
  body: string;
}

interface Props {
  onBack: () => void;
  settings: ExerciseSettings;
  isPremium: boolean;
  onAction: Dispatch;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <h2 style={{ fontSize: 16, fontWeight: 700, color: '#3F51B5', marginBottom: 8 }}>{title}</h2>
      <div style={{ fontSize: 14, color: '#424242', lineHeight: 1.7 }}>{children}</div>
    </div>
  );
}

export default function HelpScreen({ onBack, settings, isPremium, onAction }: Props) {
  const [sections, setSections] = useState<HelpSection[]>([]);

  useEffect(() => {
    invoke<string>('cmd_help_content')
      .then(json => setSections(JSON.parse(json) as HelpSection[]))
      .catch(() => setSections([]));
  }, []);

  return (
    <div className="screen" style={{ paddingBottom: 72 }}>
      <div className="screen-header">
        <button className="btn-back" onClick={onBack}>← Back</button>
        <span className="screen-title">Help</span>
        <div style={{ width: 48 }} />
      </div>

      <AssistantChat settings={settings} isPremium={isPremium} onAction={onAction} />

      {sections.map(({ title, body }) => (
        <Section key={title} title={title}>
          {body.split('\n\n').map((para, i) => {
            const lines = para.trim().split('\n');
            const isList = lines.every(l => l.trimStart().startsWith('•'));
            if (isList) {
              return (
                <ul key={i} style={{ margin: i === 0 ? '0 0 0 18px' : '8px 0 0 18px', padding: 0 }}>
                  {lines.map((l, j) => (
                    <li key={j} style={{ marginBottom: 4 }}>{l.replace(/^\s*•\s*/, '')}</li>
                  ))}
                </ul>
              );
            }
            return <p key={i} style={{ margin: i === 0 ? 0 : '8px 0 0' }}>{para.trim()}</p>;
          })}
        </Section>
      ))}
    </div>
  );
}
```

In `desktop/src/App.tsx`, change the Help screen usage. Find:

```tsx
      {screen === 'help' && (
        <HelpScreen onBack={() => setScreen('home')} />
      )}
```

and replace it with:

```tsx
      {screen === 'help' && (
        <HelpScreen
          onBack={() => setScreen('home')}
          settings={settings}
          isPremium={isPremium}
          onAction={dispatch}
        />
      )}
```

- [ ] **Step 7: Type-check and build**

```powershell
npx tsc --noEmit
npm run build
```

Expected: `tsc` prints nothing; `npm run build` ends with `built in ...`.

- [ ] **Step 8: Look at it running**

Start the app (AGENTS.md "Debugging the Tauri Desktop App"): `just desktop-launch`. To open Help directly without clicking, temporarily change the initial screen in `desktop/src/App.tsx` (`useState<Screen>('help')`, see AGENTS.md), then **revert it**.

Expected on the Help screen, above the existing sections: the `Ask about setup` heading, the disclosure line, a text box and `Send`. Type a question and press Enter. Until plan 2 is deployed the proxy address is a placeholder, so after a moment the reply bubble reads `Can't reach the assistant right now. Check your connection and try again.` with a `Try again` button and the question still shown. That proves the offline path end to end (Tauri command, Rust core, error view). Take a screenshot with the AGENTS.md capture snippet if you want a record.

- [ ] **Step 9: Commit (only when the user says so)**

```bash
git add desktop/src/assistantClient.ts desktop/src/assistantTauri.ts desktop/src/components/AssistantChat.tsx desktop/src/components/HelpScreen.tsx desktop/src/App.tsx desktop/tests/assistantClient.test.ts
git commit -m "desktop: setup assistant chat on the Help screen"
```

---
### Task 2: Android

**Files:** see the file structure above (Android). Paths below are relative to `android/app/src/main/java/com/jollygoodsw/earring/` unless stated.

**Interfaces:**
- Consumes (plan 1 Task 6): JNI natives `nativeAssistantEndpoint`, `nativeAssistantRequest`, `nativeAssistantResolveOutcome`, `nativeAssistantResolveProposal`.
- Produces: `EarRingCore.assistantEndpoint() / assistantRequest(history, settings, isPremium) / assistantResolveOutcome(status, body, settings, isPremium) / assistantResolveProposal(proposal, settings, isPremium)`; `AssistantClient.ask(context, history, settingsJson, isPremium): AssistantView` (suspend, never throws), `AssistantClient.resolveProposal(proposal, settingsJson, isPremium): AssistantCard`, `AssistantClient.installId(context)`, `parseView`, `parseCard`; `ExerciseViewModel.settingsSnapshot(): String` and `applyAssistantActions(actions: List<JSONObject>)`; composable `AssistantChat(viewModel)`.

- [ ] **Step 1: Write the failing instrumented test**

This test runs on the emulator and exercises the real JNI bridge, the parsing, and how a confirmed proposal reaches the settings (the existing tests in that folder clear the app's own preferences the same way). Create `android/app/src/androidTest/java/com/jollygoodsw/earring/AssistantCoreTest.kt`:

```kotlin
package com.jollygoodsw.earring

import android.app.Application
import android.content.Context
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.json.JSONArray
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

/**
 * The setup assistant on Android: the JNI bridge to the Rust core, the parsing of what it
 * returns, and how a confirmed proposal reaches the settings. The rules themselves (validation,
 * status handling) are unit-tested in Rust; the network call is not exercised here.
 */
@RunWith(AndroidJUnit4::class)
class AssistantCoreTest {

    private val app: Application = ApplicationProvider.getApplicationContext()
    private val settingsPrefs get() = app.getSharedPreferences("ear_ring_settings", Context.MODE_PRIVATE)
    private val assistantPrefs get() = app.getSharedPreferences("ear_ring_assistant", Context.MODE_PRIVATE)

    @Before fun clean() { settingsPrefs.edit().clear().commit(); assistantPrefs.edit().clear().commit() }
    @After fun cleanUp() { settingsPrefs.edit().clear().commit(); assistantPrefs.edit().clear().commit() }

    private val defaults get() = EarRingCore.settingsDefaults()

    @Test
    fun endpoint_isAnHttpsAskUrl() {
        val url = EarRingCore.assistantEndpoint()
        assertTrue(url, url.startsWith("https://") && url.endsWith("/v1/ask"))
    }

    @Test
    fun request_carriesTheAndroidPlatformTheHistoryAndThePremiumFlag() {
        val history = JSONArray().put(JSONObject().put("role", "user").put("text", "hello")).toString()
        val body = JSONObject(EarRingCore.assistantRequest(history, defaults, isPremium = true))
        assertEquals("hello", body.getJSONArray("messages").getJSONObject(0).getString("text"))
        assertEquals("android", body.getJSONObject("context").getString("platform"))
        assertTrue(body.getJSONObject("context").getBoolean("premium"))
    }

    @Test
    fun outcomeZero_isAnOfflineError() {
        val view = AssistantClient.parseView(EarRingCore.assistantResolveOutcome(0, "", defaults, false))
        assertTrue(view.isError)
        assertTrue(view.reply.isNotEmpty())
        assertNull(view.card)
    }

    @Test
    fun outcome429_isAnErrorThatKeepsTheQuota() {
        val body = """{"error":"quota_exceeded","quota":{"remaining":0,"resetsAt":"2026-10-02T00:00:00Z"}}"""
        val view = AssistantClient.parseView(EarRingCore.assistantResolveOutcome(429, body, defaults, false))
        assertTrue(view.isError)
        assertEquals(0, view.remaining)
    }

    @Test
    fun outcome200_withAProposal_givesAValidatedCard() {
        val body = """{"reply":"More tries.","proposal":[{"setting":"noteRetries","value":5}],"feedbackSent":false,"quota":{"remaining":4,"resetsAt":"x"}}"""
        val view = AssistantClient.parseView(EarRingCore.assistantResolveOutcome(200, body, defaults, false))
        assertFalse(view.isError)
        assertEquals("More tries.", view.reply)
        assertEquals(4, view.remaining)
        val item = view.card!!.items.single()
        assertEquals("Retry Same Note", item.label)
        assertEquals("2", item.from)
        assertEquals("5", item.to)
    }

    @Test
    fun anUnusableProposalNeverProducesACard() {
        val body = """{"reply":"","proposal":[{"setting":"theme","value":"dark"}]}"""
        val view = AssistantClient.parseView(EarRingCore.assistantResolveOutcome(200, body, defaults, false))
        assertNull(view.card)
        assertNull(view.proposal)
    }

    @Test
    fun parseView_survivesGarbage() {
        val view = AssistantClient.parseView("not json")
        assertTrue(view.isError)
        assertTrue(view.reply.isNotEmpty())
    }

    @Test
    fun applyingACardChangesTheSettings() {
        val vm = ExerciseViewModel(app)
        val proposal = JSONArray().put(JSONObject().put("setting", "noteRetries").put("value", 5))
        val card = AssistantClient.resolveProposal(proposal, vm.settingsSnapshot(), vm.state.value.isPremium)
        vm.applyAssistantActions(card.items.map { it.action })
        assertEquals(5, vm.state.value.noteRetries)
        assertEquals(5, JSONObject(vm.settingsSnapshot()).getInt("noteRetries"))
    }

    @Test
    fun aStaleProposalIsRevalidatedAgainstTheCurrentSettings() {
        val vm = ExerciseViewModel(app)
        val proposal = JSONArray().put(JSONObject().put("setting", "noteRetries").put("value", 5))
        vm.setNoteRetries(5) // the user got there by hand before tapping Apply
        val card = AssistantClient.resolveProposal(proposal, vm.settingsSnapshot(), vm.state.value.isPremium)
        assertTrue(card.items.isEmpty())
    }

    @Test
    fun installId_isCreatedOnceAndThenKept() {
        val first = AssistantClient.installId(app)
        assertEquals(first, AssistantClient.installId(app))
        assertEquals(36, first.length)
    }
}
```

- [ ] **Step 2: Run it to verify it fails**

From `C:\work\ear_ring\android`, with the emulator running:

```powershell
.\gradlew.bat compileDebugAndroidTestKotlin
```

Expected: FAIL to compile: `Unresolved reference: assistantEndpoint` / `AssistantClient` / `settingsSnapshot`.

- [ ] **Step 3: Add the JNI declarations and wrappers**

In `EarRingCore.kt`, directly after the line `@JvmStatic external fun nativeSettingsApply(current: String, action: String, platform: Int): String` add:

```kotlin

    // Setup assistant (rust/src/assistant.rs): request building, HTTP-status handling and
    // proposal validation all live in Rust; this side only moves strings.
    @JvmStatic external fun nativeAssistantEndpoint(): String
    @JvmStatic external fun nativeAssistantRequest(history: String, settings: String, isPremium: Int, platform: Int): String
    @JvmStatic external fun nativeAssistantResolveOutcome(status: Int, body: String, settings: String, isPremium: Int, platform: Int): String
    @JvmStatic external fun nativeAssistantResolveProposal(proposal: String, settings: String, isPremium: Int, platform: Int): String
```

and at the very end of the `EarRingCore` object, after `settingsApply` (inside the object's closing brace), add:

```kotlin

    /** Where questions are POSTed (the proxy's address lives once, in Rust). */
    fun assistantEndpoint(): String = if (loaded) nativeAssistantEndpoint() else ""

    /** The proxy request body for chat [history] JSON and the current settings. */
    fun assistantRequest(history: String, settings: String, isPremium: Boolean): String =
        if (loaded) nativeAssistantRequest(history, settings, if (isPremium) 1 else 0, SETTINGS_PLATFORM) else "{}"

    /** The chat view for one round trip; [status] is the HTTP status, or 0 if nothing was received. */
    fun assistantResolveOutcome(status: Int, body: String, settings: String, isPremium: Boolean): String =
        if (loaded) nativeAssistantResolveOutcome(status, body, settings, if (isPremium) 1 else 0, SETTINGS_PLATFORM)
        else """{"reply":"The assistant isn't available right now.","card":null,"proposal":null,"feedbackSent":false,"quota":null,"isError":true}"""

    /** Re-validates a proposal against the current settings; its items' actions are what to dispatch. */
    fun assistantResolveProposal(proposal: String, settings: String, isPremium: Boolean): String =
        if (loaded) nativeAssistantResolveProposal(proposal, settings, if (isPremium) 1 else 0, SETTINGS_PLATFORM)
        else """{"items":[],"rejected":[]}"""
```

- [ ] **Step 4: Add the ViewModel hooks**

In `ExerciseViewModel.kt`, directly after `fun resetSettings() = dispatch(JSONObject().put("type", "reset"))` add:

```kotlin

    /** The settings JSON as it is now, for the setup assistant. */
    fun settingsSnapshot(): String = settingsJson

    /** Applies the assistant's confirmed actions in order, through the same path as any settings change. */
    fun applyAssistantActions(actions: List<JSONObject>) = actions.forEach { dispatch(it) }
```

- [ ] **Step 5: Add the client and the chat composable**

Create `AssistantClient.kt`:

```kotlin
package com.jollygoodsw.earring

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONException
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.util.UUID

data class AssistantTurn(val role: String, val text: String)

data class AssistantItem(val key: String, val label: String, val from: String, val to: String, val action: JSONObject)

data class AssistantCard(val items: List<AssistantItem>, val rejected: List<Pair<String, String>>)

/** What the chat shows for one round trip: the Rust core's `resolve_outcome_json`, parsed. */
data class AssistantView(
    val reply: String,
    val card: AssistantCard?,
    /** Kept so the proposal can be re-validated against current settings when Apply is tapped. */
    val proposal: JSONArray?,
    val feedbackSent: Boolean,
    val remaining: Int?,
    val isError: Boolean,
)

/**
 * The setup assistant's network round trip. The rules (request body, HTTP status handling,
 * which proposed changes are valid) live in the Rust core (rust/src/assistant.rs); this only
 * moves strings between Rust and the proxy.
 */
object AssistantClient {
    private const val PREFS = "ear_ring_assistant"
    private const val KEY_INSTALL_ID = "install_id"
    private const val CONNECT_TIMEOUT_MS = 10_000
    private const val READ_TIMEOUT_MS = 30_000
    private const val FALLBACK_ERROR = "Something went wrong. Please try again."

    /** A random id, created on first use, that lets the proxy count questions per install. */
    fun installId(context: Context): String {
        val prefs = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        prefs.getString(KEY_INSTALL_ID, null)?.let { return it }
        val created = UUID.randomUUID().toString()
        prefs.edit().putString(KEY_INSTALL_ID, created).apply()
        return created
    }

    /** Sends the conversation to the proxy and returns what to show. Never throws. */
    suspend fun ask(
        context: Context,
        history: List<AssistantTurn>,
        settingsJson: String,
        isPremium: Boolean,
    ): AssistantView = withContext(Dispatchers.IO) {
        var status = 0 // the core reads 0 as "couldn't reach the assistant"
        var body = ""
        try {
            val historyJson = JSONArray().also { array ->
                history.forEach { array.put(JSONObject().put("role", it.role).put("text", it.text)) }
            }
            val requestBody = EarRingCore.assistantRequest(historyJson.toString(), settingsJson, isPremium)
            val (code, text) = post(EarRingCore.assistantEndpoint(), installId(context), requestBody)
            status = code
            body = text
        } catch (e: IOException) {
            status = 0
        }
        parseView(EarRingCore.assistantResolveOutcome(status, body, settingsJson, isPremium))
    }

    private fun post(url: String, installId: String, body: String): Pair<Int, String> {
        val connection = URL(url).openConnection() as HttpURLConnection
        try {
            connection.requestMethod = "POST"
            connection.connectTimeout = CONNECT_TIMEOUT_MS
            connection.readTimeout = READ_TIMEOUT_MS
            connection.doOutput = true
            connection.setRequestProperty("Content-Type", "application/json")
            connection.setRequestProperty("X-Install-Id", installId)
            connection.setRequestProperty("X-Client", "android")
            connection.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
            val status = connection.responseCode
            val stream = if (status in 200..299) connection.inputStream else connection.errorStream
            val text = stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() } ?: ""
            return status to text
        } finally {
            connection.disconnect()
        }
    }

    /** Re-validates [proposal] against the settings as they are now (they may have changed
     *  since it was proposed). Its items' actions are what to dispatch, in order. */
    fun resolveProposal(proposal: JSONArray, settingsJson: String, isPremium: Boolean): AssistantCard =
        parseCard(JSONObject(EarRingCore.assistantResolveProposal(proposal.toString(), settingsJson, isPremium)))

    fun parseView(json: String): AssistantView = try {
        val o = JSONObject(json)
        AssistantView(
            reply = o.optString("reply", FALLBACK_ERROR),
            card = o.optJSONObject("card")?.let { parseCard(it) },
            proposal = o.optJSONArray("proposal"),
            feedbackSent = o.optBoolean("feedbackSent", false),
            remaining = o.optJSONObject("quota")?.optInt("remaining"),
            isError = o.optBoolean("isError", false),
        )
    } catch (e: JSONException) {
        AssistantView(FALLBACK_ERROR, null, null, false, null, isError = true)
    }

    fun parseCard(o: JSONObject): AssistantCard {
        val items = o.optJSONArray("items") ?: JSONArray()
        val rejected = o.optJSONArray("rejected") ?: JSONArray()
        return AssistantCard(
            items = (0 until items.length()).map { i ->
                val item = items.getJSONObject(i)
                AssistantItem(
                    key = item.getString("key"),
                    label = item.getString("label"),
                    from = item.getString("from"),
                    to = item.getString("to"),
                    action = item.getJSONObject("action"),
                )
            },
            rejected = (0 until rejected.length()).map { i ->
                val r = rejected.getJSONObject(i)
                r.getString("key") to r.getString("reason")
            },
        )
    }
}
```

Create `ui/AssistantChat.kt`:

```kotlin
package com.jollygoodsw.earring.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.jollygoodsw.earring.AssistantCard
import com.jollygoodsw.earring.AssistantClient
import com.jollygoodsw.earring.AssistantTurn
import com.jollygoodsw.earring.ExerciseViewModel
import kotlinx.coroutines.launch
import org.json.JSONArray

private const val MAX_INPUT_CHARS = 500

private enum class CardState { PENDING, APPLIED, DISMISSED }

private data class ChatEntry(
    val id: Int,
    val role: String,
    val text: String,
    val card: AssistantCard? = null,
    val proposal: JSONArray? = null,
    val cardState: CardState? = null,
    val appliedCount: Int = 0,
    val feedbackSent: Boolean = false,
    val isError: Boolean = false,
)

/**
 * "Ask about setup" chat at the top of Help. The transcript lives only in this composable, so it
 * is discarded when the user leaves the screen. Nothing changes until Apply is tapped.
 */
@Composable
fun AssistantChat(viewModel: ExerciseViewModel) {
    val context = LocalContext.current
    val state by viewModel.state.collectAsState()
    val scope = rememberCoroutineScope()
    var entries by remember { mutableStateOf(listOf<ChatEntry>()) }
    var input by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var remaining by remember { mutableStateOf<Int?>(null) }
    var nextId by remember { mutableStateOf(1) }

    fun ask(transcript: List<ChatEntry>) {
        busy = true
        val history = transcript.filter { !it.isError }.map { AssistantTurn(it.role, it.text) }
        val settings = viewModel.settingsSnapshot()
        val premium = state.isPremium
        scope.launch {
            val view = AssistantClient.ask(context, history, settings, premium)
            view.remaining?.let { remaining = it }
            entries = transcript + ChatEntry(
                id = nextId++,
                role = "assistant",
                text = view.reply,
                card = view.card,
                proposal = view.proposal,
                cardState = if (view.card != null) CardState.PENDING else null,
                feedbackSent = view.feedbackSent,
                isError = view.isError,
            )
            busy = false
        }
    }

    fun send() {
        val text = input.trim()
        if (text.isEmpty() || busy) return
        input = ""
        ask(entries + ChatEntry(id = nextId++, role = "user", text = text))
    }

    fun apply(entry: ChatEntry) {
        val proposal = entry.proposal ?: return
        val card = AssistantClient.resolveProposal(proposal, viewModel.settingsSnapshot(), state.isPremium)
        viewModel.applyAssistantActions(card.items.map { it.action })
        entries = entries.map {
            if (it.id == entry.id) it.copy(cardState = CardState.APPLIED, appliedCount = card.items.size) else it
        }
    }

    fun dismiss(entry: ChatEntry) {
        entries = entries.map { if (it.id == entry.id) it.copy(cardState = CardState.DISMISSED) else it }
    }

    Column(modifier = Modifier.fillMaxWidth()) {
        Text(
            "Ask about setup", fontSize = 16.sp, fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.primary,
            modifier = Modifier.padding(top = 16.dp, bottom = 8.dp),
        )
        Text(
            "Describe what you want, e.g. “I want a chance to correct a wrong note”. " +
                "Your question and current settings are sent to a server to get an answer.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(8.dp))

        entries.forEach { entry ->
            ChatBubble(entry, onApply = { apply(entry) }, onDismiss = { dismiss(entry) })
            Spacer(Modifier.height(8.dp))
        }

        if (entries.lastOrNull()?.isError == true && !busy) {
            OutlinedButton(onClick = { ask(entries.filter { !it.isError }) }) { Text("Try again") }
            Spacer(Modifier.height(8.dp))
        }
        if (busy) {
            Text("Thinking…", style = MaterialTheme.typography.bodySmall)
            Spacer(Modifier.height(8.dp))
        }

        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedTextField(
                value = input,
                onValueChange = { if (it.length <= MAX_INPUT_CHARS) input = it },
                modifier = Modifier.weight(1f),
                placeholder = { Text("Ask how to set something up") },
                singleLine = true,
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Send),
                keyboardActions = KeyboardActions(onSend = { send() }),
            )
            Button(onClick = { send() }, enabled = !busy && input.isNotBlank()) { Text("Send") }
        }
        remaining?.let {
            Text(
                "$it question${if (it == 1) "" else "s"} left today",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 4.dp),
            )
        }
    }
}

@Composable
private fun ChatBubble(entry: ChatEntry, onApply: () -> Unit, onDismiss: () -> Unit) {
    val fromUser = entry.role == "user"
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = if (fromUser) Arrangement.End else Arrangement.Start,
    ) {
        Surface(
            shape = RoundedCornerShape(12.dp),
            color = when {
                fromUser -> MaterialTheme.colorScheme.primary
                entry.isError -> MaterialTheme.colorScheme.errorContainer
                else -> MaterialTheme.colorScheme.secondaryContainer
            },
            contentColor = when {
                fromUser -> MaterialTheme.colorScheme.onPrimary
                entry.isError -> MaterialTheme.colorScheme.onErrorContainer
                else -> MaterialTheme.colorScheme.onSecondaryContainer
            },
            modifier = Modifier.widthIn(max = 320.dp),
        ) {
            Column(modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp)) {
                Text(entry.text, style = MaterialTheme.typography.bodyMedium)
                val card = entry.card
                if (card != null && entry.cardState == CardState.PENDING) {
                    Spacer(Modifier.height(8.dp))
                    Surface(shape = RoundedCornerShape(8.dp), color = MaterialTheme.colorScheme.surface) {
                        Column(modifier = Modifier.padding(8.dp)) {
                            card.items.forEach {
                                Text("${it.label}: ${it.from} → ${it.to}", style = MaterialTheme.typography.bodyMedium,
                                    color = MaterialTheme.colorScheme.onSurface)
                            }
                            card.rejected.forEach { (key, reason) ->
                                Text("Skipped $key: $reason", style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                            Spacer(Modifier.height(8.dp))
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                Button(onClick = onApply) { Text("Apply") }
                                OutlinedButton(onClick = onDismiss) { Text("Not now") }
                            }
                        }
                    }
                }
                when (entry.cardState) {
                    CardState.APPLIED -> Text(
                        if (entry.appliedCount > 0) "Applied. You can review it in Settings." else "Already up to date.",
                        style = MaterialTheme.typography.bodySmall,
                    )
                    CardState.DISMISSED -> Text("No changes made.", style = MaterialTheme.typography.bodySmall)
                    else -> {}
                }
                if (entry.feedbackSent) {
                    Text("Sent as feedback, thanks.", style = MaterialTheme.typography.bodySmall)
                }
            }
        }
    }
}
```

- [ ] **Step 6: Show it on the Help screen**

Replace `ui/HelpScreen.kt` with:

```kotlin
package com.jollygoodsw.earring.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.jollygoodsw.earring.EarRingCore
import com.jollygoodsw.earring.ExerciseViewModel
import org.json.JSONArray

@Composable
fun HelpScreen(viewModel: ExerciseViewModel) {
    val sections = remember {
        parseHelpSections(EarRingCore.helpContent())
    }
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp)
    ) {
        Spacer(Modifier.height(8.dp))

        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Spacer(Modifier.weight(1f))
            Text("Help", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            Spacer(Modifier.weight(1f))
        }

        AssistantChat(viewModel)
        HorizontalDivider(modifier = Modifier.padding(top = 16.dp))

        sections.forEach { (title, body) ->
            HelpSection(title) {
                body.split("\n\n").forEachIndexed { i, para ->
                    if (i > 0) Spacer(Modifier.height(8.dp))
                    Text(para.trim(), style = MaterialTheme.typography.bodyMedium)
                }
            }
        }
        Spacer(Modifier.height(16.dp))
    }
}

private fun parseHelpSections(json: String): List<Pair<String, String>> {
    return try {
        val arr = JSONArray(json)
        (0 until arr.length()).map { i ->
            val obj = arr.getJSONObject(i)
            Pair(obj.getString("title"), obj.getString("body"))
        }
    } catch (e: Exception) {
        emptyList()
    }
}

@Composable
private fun HelpSection(title: String, content: @Composable ColumnScope.() -> Unit) {
    Text(title, fontSize = 16.sp, fontWeight = FontWeight.Bold,
        color = MaterialTheme.colorScheme.primary,
        modifier = Modifier.padding(top = 16.dp, bottom = 8.dp))
    Column(content = content)
    HorizontalDivider(modifier = Modifier.padding(top = 16.dp))
}
```

In `ui/EarRingApp.kt`, change `HelpScreen()` to pass the ViewModel:

```kotlin
            composable(Routes.HELP) {
                HelpScreen(exerciseViewModel)
            }
```

- [ ] **Step 7: Build, then run the tests on the emulator**

```powershell
cd C:\work\ear_ring\android
.\gradlew.bat assembleDebug
.\gradlew.bat connectedDebugAndroidTest "-Pandroid.testInstrumentationRunnerArguments.class=com.jollygoodsw.earring.AssistantCoreTest"
```

Expected: `BUILD SUCCESSFUL` for the first (this also cross-compiles the Rust JNI library for both ABIs); for the second, `AssistantCoreTest` runs 10 tests, all passing (`Tests 10/10 completed`). The instrumented tests clear the app's own preferences, like the existing ones do.

If an on-device check shows old Help text after editing only `rust/src/help.md`, the Rust JNI task is stale (Gradle does not track `include_str!` files): run `.\gradlew.bat installDebug --rerun-tasks`.

- [ ] **Step 8: Look at it on the emulator**

```powershell
$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
cd C:\work\ear_ring\android
.\gradlew.bat installDebug
& $adb shell am start -n com.jollygoodsw.earring/.MainActivity
```

Wait for the splash to clear (AGENTS.md: the first debug start is slow), tap the Help tab `(972, 2274)`, then:

```powershell
& $adb shell screencap -p /sdcard/screen.png
& $adb pull /sdcard/screen.png C:\work\ear_ring\screen.png
```

Expected: the `Ask about setup` section above the existing help sections. Tap the text box, type a question, tap Send. Until plan 2 is deployed the reply is the offline error bubble with `Try again`. Check the on-screen keyboard does not hide the text box (Review Focus 6); if it does, add `Modifier.imePadding()` to the Help screen's scroll column. Re-derive any tap coordinate from `adb shell uiautomator dump` rather than eyeballing a screenshot (AGENTS.md). Delete `screen.png` afterwards.

- [ ] **Step 9: Commit (only when the user says so)**

```bash
git add android/app/src/main/java/com/jollygoodsw/earring/AssistantClient.kt android/app/src/main/java/com/jollygoodsw/earring/ui/AssistantChat.kt android/app/src/main/java/com/jollygoodsw/earring/EarRingCore.kt android/app/src/main/java/com/jollygoodsw/earring/ExerciseViewModel.kt android/app/src/main/java/com/jollygoodsw/earring/ui/HelpScreen.kt android/app/src/main/java/com/jollygoodsw/earring/ui/EarRingApp.kt android/app/src/androidTest/java/com/jollygoodsw/earring/AssistantCoreTest.kt
git commit -m "android: setup assistant chat on the Help screen"
```

---
### Task 3: iOS

**Files:** see the file structure above (iOS). Paths are relative to `ios/` unless stated.

**Interfaces:**
- Consumes (plan 1 Task 5): C functions `ear_ring_assistant_endpoint`, `ear_ring_assistant_request`, `ear_ring_assistant_resolve_outcome`, `ear_ring_assistant_resolve_proposal` (declared in `rust/include/ear_ring_core.h`, which the bridging header already imports).
- Produces: `EarRingCore.assistantEndpoint() / assistantRequest(history:settings:isPremium:) / assistantResolveOutcome(status:body:settings:isPremium:) / assistantResolveProposal(_:settings:isPremium:)`; `AssistantClient.ask(history:settingsJson:isPremium:) async -> AssistantView` (never throws), `AssistantClient.resolveProposal(_:settingsJson:isPremium:) -> AssistantCard`, `installId()`, `parseView`, `parseCard`; `ExerciseModel.assistantSettingsJson` and `applyAssistantActions(_:)`; SwiftUI `AssistantChatView`.

This code cannot be compiled on the Windows machine. Write it carefully, then build on the Mac in Step 7; expect to fix small compile errors there. The project has no XCTest target, so there is no automated test for iOS; the Rust tests from plan 1 cover the logic, and Step 8 is a manual check.

- [ ] **Step 1: Add the C wrappers to `EarRingCore`**

In `earring/EarRingCore.swift`, insert this block immediately above the line `/// Result from processing one audio buffer through the Rust pitch tracker.` (that is, after `settingsApply`, still inside `struct EarRingCore`):

```swift
    // MARK: - Setup assistant (rust/src/assistant.rs)
    // Request building, HTTP-status handling and proposal validation all live in Rust; Swift only
    // moves strings. Every C call returns a Rust-allocated string released with ear_ring_free_string.

    private static func assistantString(_ ptr: UnsafeMutablePointer<CChar>?, fallback: String) -> String {
        guard let ptr else { return fallback }
        defer { ear_ring_free_string(ptr) }
        return String(cString: ptr)
    }

    /// Where questions are POSTed (the proxy's address lives once, in Rust).
    static func assistantEndpoint() -> String {
        assistantString(ear_ring_assistant_endpoint(), fallback: "")
    }

    /// The proxy request body for chat `history` JSON and the current settings.
    static func assistantRequest(history: String, settings: String, isPremium: Bool) -> String {
        let ptr = history.withCString { historyPtr in
            settings.withCString { settingsPtr in
                ear_ring_assistant_request(historyPtr, settingsPtr, isPremium ? 1 : 0, settingsPlatform)
            }
        }
        return assistantString(ptr, fallback: "{}")
    }

    /// The chat view for one round trip; `status` is the HTTP status, or 0 if nothing was received.
    static func assistantResolveOutcome(status: Int, body: String, settings: String, isPremium: Bool) -> String {
        let ptr = body.withCString { bodyPtr in
            settings.withCString { settingsPtr in
                ear_ring_assistant_resolve_outcome(Int32(status), bodyPtr, settingsPtr, isPremium ? 1 : 0, settingsPlatform)
            }
        }
        return assistantString(
            ptr,
            fallback: #"{"reply":"The assistant isn't available right now.","card":null,"proposal":null,"feedbackSent":false,"quota":null,"isError":true}"#)
    }

    /// Re-validates a proposal against the current settings; its items' actions are what to dispatch.
    static func assistantResolveProposal(_ proposal: String, settings: String, isPremium: Bool) -> String {
        let ptr = proposal.withCString { proposalPtr in
            settings.withCString { settingsPtr in
                ear_ring_assistant_resolve_proposal(proposalPtr, settingsPtr, isPremium ? 1 : 0, settingsPlatform)
            }
        }
        return assistantString(ptr, fallback: #"{"items":[],"rejected":[]}"#)
    }
```

- [ ] **Step 2: Add the model hooks**

In `earring/ExerciseModel.swift`, insert immediately after the `private func set(_ field: String, _ value: Any)` method:

```swift

    /// The settings JSON as it is now, for the setup assistant.
    var assistantSettingsJson: String { settingsJson }

    /// Applies the assistant's confirmed actions in order, through the same path as any settings change.
    func applyAssistantActions(_ actions: [[String: Any]]) {
        actions.forEach { dispatch($0) }
    }
```

- [ ] **Step 3: Add the client and the chat view**

Create `earring/AssistantClient.swift`:

```swift
import Foundation

struct AssistantItem {
    let key: String
    let label: String
    let from: String
    let to: String
    let action: [String: Any]
}

struct AssistantCard {
    let items: [AssistantItem]
    let rejected: [(key: String, reason: String)]
}

/// What the chat shows for one round trip: the Rust core's `resolve_outcome_json`, parsed.
struct AssistantView {
    let reply: String
    let card: AssistantCard?
    /// Kept so the proposal can be re-validated against current settings when Apply is tapped.
    let proposalJson: String?
    let feedbackSent: Bool
    let remaining: Int?
    let isError: Bool
}

/// The setup assistant's network round trip. The rules (request body, HTTP status handling, which
/// proposed changes are valid) live in the Rust core; this only moves strings between Rust and
/// the proxy.
enum AssistantClient {
    private static let installIdKey = "assistantInstallId"
    private static let fallbackError = "Something went wrong. Please try again."

    /// A random id, created on first use, that lets the proxy count questions per install.
    static func installId() -> String {
        let defaults = UserDefaults.standard
        if let existing = defaults.string(forKey: installIdKey) { return existing }
        let created = UUID().uuidString.lowercased()
        defaults.set(created, forKey: installIdKey)
        return created
    }

    /// Sends the conversation to the proxy and returns what to show. Never throws.
    static func ask(history: [(role: String, text: String)], settingsJson: String, isPremium: Bool) async -> AssistantView {
        var status = 0 // the core reads 0 as "couldn't reach the assistant"
        var body = ""
        let turns = history.map { ["role": $0.role, "text": $0.text] }
        let requestBody = EarRingCore.assistantRequest(
            history: jsonString(turns) ?? "[]", settings: settingsJson, isPremium: isPremium)
        if let url = URL(string: EarRingCore.assistantEndpoint()) {
            var request = URLRequest(url: url, timeoutInterval: 30)
            request.httpMethod = "POST"
            request.httpBody = Data(requestBody.utf8)
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.setValue(installId(), forHTTPHeaderField: "X-Install-Id")
            request.setValue("ios", forHTTPHeaderField: "X-Client")
            do {
                let (data, response) = try await URLSession.shared.data(for: request)
                status = (response as? HTTPURLResponse)?.statusCode ?? 0
                body = String(data: data, encoding: .utf8) ?? ""
            } catch {
                status = 0
            }
        }
        return parseView(EarRingCore.assistantResolveOutcome(
            status: status, body: body, settings: settingsJson, isPremium: isPremium))
    }

    /// Re-validates `proposalJson` against the settings as they are now (they may have changed
    /// since it was proposed). Its items' actions are what to dispatch, in order.
    static func resolveProposal(_ proposalJson: String, settingsJson: String, isPremium: Bool) -> AssistantCard {
        parseCard(object(EarRingCore.assistantResolveProposal(proposalJson, settings: settingsJson, isPremium: isPremium)) ?? [:])
    }

    static func parseView(_ json: String) -> AssistantView {
        guard let o = object(json) else {
            return AssistantView(reply: fallbackError, card: nil, proposalJson: nil, feedbackSent: false, remaining: nil, isError: true)
        }
        return AssistantView(
            reply: o["reply"] as? String ?? fallbackError,
            card: (o["card"] as? [String: Any]).map(parseCard),
            proposalJson: (o["proposal"] as? [Any]).flatMap(jsonString),
            feedbackSent: o["feedbackSent"] as? Bool ?? false,
            remaining: (o["quota"] as? [String: Any])?["remaining"] as? Int,
            isError: o["isError"] as? Bool ?? false)
    }

    static func parseCard(_ o: [String: Any]) -> AssistantCard {
        let items: [AssistantItem] = (o["items"] as? [[String: Any]] ?? []).compactMap { item in
            guard let key = item["key"] as? String, let label = item["label"] as? String,
                  let from = item["from"] as? String, let to = item["to"] as? String,
                  let action = item["action"] as? [String: Any] else { return nil }
            return AssistantItem(key: key, label: label, from: from, to: to, action: action)
        }
        let rejected: [(key: String, reason: String)] = (o["rejected"] as? [[String: Any]] ?? []).compactMap { r in
            guard let key = r["key"] as? String, let reason = r["reason"] as? String else { return nil }
            return (key: key, reason: reason)
        }
        return AssistantCard(items: items, rejected: rejected)
    }

    private static func object(_ json: String) -> [String: Any]? {
        (try? JSONSerialization.jsonObject(with: Data(json.utf8))) as? [String: Any]
    }

    private static func jsonString(_ value: Any) -> String? {
        guard JSONSerialization.isValidJSONObject(value),
              let data = try? JSONSerialization.data(withJSONObject: value) else { return nil }
        return String(data: data, encoding: .utf8)
    }
}
```

Create `earring/views/AssistantChatView.swift`:

```swift
import SwiftUI

private struct ChatEntry: Identifiable {
    enum CardState { case pending, applied, dismissed }

    let id: Int
    let role: String
    let text: String
    var card: AssistantCard? = nil
    var proposalJson: String? = nil
    var cardState: CardState? = nil
    var appliedCount = 0
    var feedbackSent = false
    var isError = false
}

/// "Ask about setup" chat at the top of Help. The transcript lives only in this view, so it is
/// discarded when the user leaves the screen. Nothing changes until Apply is tapped.
struct AssistantChatView: View {
    @EnvironmentObject var model: ExerciseModel
    @State private var entries: [ChatEntry] = []
    @State private var input = ""
    @State private var busy = false
    @State private var remaining: Int? = nil
    @State private var nextId = 1

    private let maxInputChars = 500

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Ask about setup")
                .font(.system(size: 16, weight: .bold))
                .foregroundColor(.erPrimary)
                .padding(.top, 16)
            Text("Describe what you want, e.g. \u{201C}I want a chance to correct a wrong note\u{201D}. Your question and current settings are sent to a server to get an answer.")
                .font(.footnote)
                .foregroundColor(.secondary)

            ForEach(entries) { entry in
                bubble(entry)
            }

            if entries.last?.isError == true && !busy {
                Button("Try again") { ask(entries.filter { !$0.isError }) }
                    .buttonStyle(.bordered)
            }
            if busy {
                Text("Thinking\u{2026}").font(.footnote).foregroundColor(.secondary)
            }

            HStack(spacing: 8) {
                TextField("Ask how to set something up", text: $input)
                    .textFieldStyle(.roundedBorder)
                    .submitLabel(.send)
                    .onSubmit(send)
                    .onChange(of: input) { newValue in
                        if newValue.count > maxInputChars { input = String(newValue.prefix(maxInputChars)) }
                    }
                Button("Send", action: send)
                    .buttonStyle(.borderedProminent)
                    .disabled(busy || input.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }

            if let remaining {
                Text("\(remaining) question\(remaining == 1 ? "" : "s") left today")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
        }
    }

    // MARK: Actions

    private func takeId() -> Int {
        defer { nextId += 1 }
        return nextId
    }

    private func send() {
        let text = input.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, !busy else { return }
        input = ""
        ask(entries + [ChatEntry(id: takeId(), role: "user", text: text)])
    }

    private func ask(_ transcript: [ChatEntry]) {
        busy = true
        let history = transcript.filter { !$0.isError }.map { (role: $0.role, text: $0.text) }
        let settings = model.assistantSettingsJson
        let premium = model.isPremium
        Task { @MainActor in
            let view = await AssistantClient.ask(history: history, settingsJson: settings, isPremium: premium)
            if let left = view.remaining { remaining = left }
            entries = transcript + [ChatEntry(
                id: takeId(), role: "assistant", text: view.reply, card: view.card,
                proposalJson: view.proposalJson, cardState: view.card == nil ? nil : .pending,
                feedbackSent: view.feedbackSent, isError: view.isError)]
            busy = false
        }
    }

    private func apply(_ entry: ChatEntry) {
        guard let proposal = entry.proposalJson else { return }
        let card = AssistantClient.resolveProposal(proposal, settingsJson: model.assistantSettingsJson, isPremium: model.isPremium)
        model.applyAssistantActions(card.items.map { $0.action })
        if let i = entries.firstIndex(where: { $0.id == entry.id }) {
            entries[i].cardState = .applied
            entries[i].appliedCount = card.items.count
        }
    }

    private func dismiss(_ entry: ChatEntry) {
        if let i = entries.firstIndex(where: { $0.id == entry.id }) { entries[i].cardState = .dismissed }
    }

    // MARK: Views

    private func bubble(_ entry: ChatEntry) -> some View {
        let fromUser = entry.role == "user"
        return HStack {
            if fromUser { Spacer(minLength: 40) }
            VStack(alignment: .leading, spacing: 6) {
                Text(entry.text)
                if let card = entry.card, entry.cardState == .pending {
                    cardView(entry, card)
                }
                if entry.cardState == .applied {
                    Text(entry.appliedCount > 0 ? "Applied. You can review it in Settings." : "Already up to date.")
                        .font(.footnote)
                } else if entry.cardState == .dismissed {
                    Text("No changes made.").font(.footnote)
                }
                if entry.feedbackSent {
                    Text("Sent as feedback, thanks.").font(.footnote)
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(fromUser ? Color.erPrimary : (entry.isError ? Color.red.opacity(0.15) : Color(.secondarySystemBackground)))
            .foregroundColor(fromUser ? .white : Color(.label))
            .cornerRadius(12)
            if !fromUser { Spacer(minLength: 40) }
        }
    }

    private func cardView(_ entry: ChatEntry, _ card: AssistantCard) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            ForEach(card.items.indices, id: \.self) { i in
                Text("\(card.items[i].label): \(card.items[i].from) \u{2192} \(card.items[i].to)")
            }
            ForEach(card.rejected.indices, id: \.self) { i in
                Text("Skipped \(card.rejected[i].key): \(card.rejected[i].reason)")
                    .font(.footnote)
                    .foregroundColor(.secondary)
            }
            HStack(spacing: 8) {
                Button("Apply") { apply(entry) }.buttonStyle(.borderedProminent)
                Button("Not now") { dismiss(entry) }.buttonStyle(.bordered)
            }
        }
        .padding(8)
        .background(Color(.systemBackground))
        .foregroundColor(Color(.label))
        .cornerRadius(8)
    }
}
```

- [ ] **Step 4: Show it in the Help tab**

In `earring/views/HelpView.swift`, add the chat between the title and the help sections. Find:

```swift
                    .padding(.bottom, 8)

                ForEach(sections, id: \.title) { section in
```

and replace it with:

```swift
                    .padding(.bottom, 8)

                AssistantChatView()
                Divider().padding(.top, 16)

                ForEach(sections, id: \.title) { section in
```

(`AssistantChatView` reads `ExerciseModel` from the environment; `EarRingApp` already injects it into the whole view tree.)

- [ ] **Step 5: Add the two files to the Xcode project**

The project lists every source file by hand, so the new files are not built until they are registered. In `earring.xcodeproj/project.pbxproj` make these five edits (the ids below are unused; grep for them first to be sure):

1. In the `PBXBuildFile` section, after the `HelpView.swift in Sources` line, add:

```text
		AA20000000000150 /* AssistantClient.swift in Sources */ = {isa = PBXBuildFile; fileRef = AA10000000000150 /* AssistantClient.swift */; };
		AA20000000000160 /* AssistantChatView.swift in Sources */ = {isa = PBXBuildFile; fileRef = AA10000000000160 /* AssistantChatView.swift */; };
```

2. In the `PBXFileReference` section, after the `EarRingCore.swift` reference, add:

```text
		AA10000000000150 /* AssistantClient.swift */ = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; name = AssistantClient.swift; path = earring/AssistantClient.swift; sourceTree = "<group>"; };
```

and after the `HelpView.swift` reference add (this one lives in the `views` group, so it uses a bare `path`):

```text
		AA10000000000160 /* AssistantChatView.swift */ = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = AssistantChatView.swift; sourceTree = "<group>"; };
```

3. In the `earring` group's `children` list, after `AA1000000000002A /* EarRingCore.swift */,` add:

```text
				AA10000000000150 /* AssistantClient.swift */,
```

4. In the `views` group's `children` list (`AA3000000000001A`), after `AA10000000000110 /* HelpView.swift */,` add:

```text
				AA10000000000160 /* AssistantChatView.swift */,
```

5. In the `Sources` build phase `files` list, after `AA20000000000110 /* HelpView.swift in Sources */,` add:

```text
				AA20000000000150 /* AssistantClient.swift in Sources */,
				AA20000000000160 /* AssistantChatView.swift in Sources */,
```

- [ ] **Step 6: Declare the new data in the privacy manifest**

The chat sends the user's typed text to a server, which Apple's privacy manifest must declare. In `earring/PrivacyInfo.xcprivacy`, replace

```xml
	<key>NSPrivacyCollectedDataTypes</key>
	<array/>
```

with:

```xml
	<key>NSPrivacyCollectedDataTypes</key>
	<array>
		<dict>
			<key>NSPrivacyCollectedDataType</key>
			<string>NSPrivacyCollectedDataTypeOtherUserContent</string>
			<key>NSPrivacyCollectedDataTypeLinked</key>
			<false/>
			<key>NSPrivacyCollectedDataTypeTracking</key>
			<false/>
			<key>NSPrivacyCollectedDataTypePurposes</key>
			<array>
				<string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string>
			</array>
		</dict>
	</array>
```

Whether the random install id also needs a declaration (Apple's identifier categories) is a decision for the user; see Task 4 Step 4. Do not guess.

- [ ] **Step 7: Sync to the Mac by file copy and build**

From `C:\work\ear_ring` (AGENTS.md "Remote iOS Builds over SSH": copy, do not commit or pull):

```powershell
git ls-files -m -o --exclude-standard | Where-Object { Test-Path $_ } | Set-Content $env:TEMP\ios-sync.txt
tar -cf $env:TEMP\ios-sync.tar -T $env:TEMP\ios-sync.txt
scp $env:TEMP\ios-sync.tar mac:/tmp/ios-sync.tar
ssh mac "cd ~/work/ear_ring && tar -xf /tmp/ios-sync.tar && just ios-sim"
```

The Mac copy must already be at the same base commit as this branch; if not, ask the user, then reset it first. `git ls-files -m -o` lists every changed and new file, which includes the Rust and header changes from plan 1 that the build needs.

Expected: the build succeeds and the simulator launches the app. Fix any Swift compile errors reported (most likely small type or label mismatches), re-sync and rebuild.

- [ ] **Step 8: Look at it in the simulator**

Open the Help tab. Expected: `Ask about setup` above the help sections. Ask a question: until plan 2 is deployed you get the offline error bubble with `Try again`. Check the keyboard does not cover the text box; if it does, wrap the screen's `ScrollView` content with `.scrollDismissesKeyboard(.interactively)` and make sure the field scrolls into view. Take a screenshot on the Mac with `xcrun simctl io booted screenshot ~/ios-help.png` and copy it back if you want a record.

- [ ] **Step 9: Commit (only when the user says so)**

```bash
git add ios/earring/AssistantClient.swift ios/earring/views/AssistantChatView.swift ios/earring/EarRingCore.swift ios/earring/ExerciseModel.swift ios/earring/views/HelpView.swift ios/earring.xcodeproj/project.pbxproj ios/earring/PrivacyInfo.xcprivacy
git commit -m "ios: setup assistant chat on the Help tab"
```

---
### Task 4: Documentation, changelog and store forms

**Files:**
- Modify: `rust/src/help.md`, `DESIGN.md`, `CHANGELOG.md`
- Manual: privacy policy page, App Store Connect App Privacy, Google Play Data safety

- [ ] **Step 1: Add a Help section (shared by all three platforms)**

In `rust/src/help.md`, insert this new section directly after the `## Getting Started` section (before `## Test Types`):

```markdown
## Ask About Setup

Not sure which setting does what? Type what you want at the top of this screen, for example “I want a chance to correct a wrong note”, and the assistant will answer or suggest a change. Nothing changes until you tap Apply, and you can always review it in Settings.

Your question and current settings are sent to a server to get an answer. No audio or practice history is sent. You get a limited number of questions each day, and the assistant can pass feature requests on to the developer.
```

Verify with `cargo test -p ear_ring_core` (all pass). On Android remember the stale-JNI note in Task 2 Step 7 before trusting an on-device check of this text.

- [ ] **Step 2: Update DESIGN.md**

In `DESIGN.md`, in `### Help Screen`, directly after the paragraph that begins `**help.md is the single source of truth for help text.**` (it ends at the next blank line), add the following. It contains its own code block, so the snippet is fenced with four backticks here:

````markdown
#### Setup Assistant (top of the Help screen)

A chat above the help sections, identical on all three platforms (Android `ui/AssistantChat.kt`,
iOS `views/AssistantChatView.swift`, desktop `components/AssistantChat.tsx`).

```
Ask about setup                           (16 sp bold, primary colour)
Describe what you want, e.g. “I want a chance to correct a wrong note”. Your question and
current settings are sent to a server to get an answer.        (footnote, secondary colour)
                          [ I want a chance to correct a wrong note ]   user bubble, right, primary
[ Give yourself more tries.                        ]   assistant bubble, left, light neutral
[ ┌ Retry Same Note: 2 → 5      ┐                  ]   confirm card (only while pending)
[ └ [Apply]  [Not now]          ┘                  ]
[ Ask how to set something up                 ] [Send]   input (max 500 characters) + Send
3 questions left today                            (caption)
```

- Nothing changes until **Apply**. Apply re-validates the proposal against the *current*
  settings in the Rust core and dispatches each returned action through the normal settings
  path, so a setting changed by hand in the meantime is not overwritten; if nothing is left to
  change the bubble says `Already up to date.`
- After Apply: `Applied. You can review it in Settings.`; after Not now: `No changes made.`;
  when the reply passed feedback on: `Sent as feedback, thanks.`
- Errors (offline, daily limit reached, server problem) appear as a light-red bubble with the
  core's wording and a `Try again` button; the conversation is kept.
- The transcript is in memory only and is discarded when the user leaves the Help screen.
- Premium comes from the existing per-platform `isPremium` flag; the assistant tells free users
  that premium-only options (the Voice instruments) are premium features instead of proposing them.
- Everything except rendering lives in `rust/src/assistant.rs`: the request body, what an HTTP
  status means, which proposed changes are valid, and the error wording. The proxy address is
  `assistant::PROXY_URL`. Design: `docs/superpowers/specs/2026-09-30-setup-assistant-design.md`.
````

Also in `DESIGN.md`'s `## Data Persistence` section, add under the persistence rules:

```markdown
- The setup assistant keeps one random install id (a UUID, created on first use) so the proxy
  can count questions per install. Android: `SharedPreferences` file `ear_ring_assistant`, key
  `install_id`. iOS: `UserDefaults` key `assistantInstallId`. Desktop: `localStorage` key
  `ear_ring_install_id`. Chat transcripts are never stored.
```

- [ ] **Step 3: Add a changelog entry**

In `CHANGELOG.md`, under `## [Unreleased]` → `### Added`, add:

```markdown
- **Ask about setup** — a chat at the top of the Help tab on all three platforms. Describe
  what you want ("I want a chance to correct a wrong note") and the assistant answers, or
  suggests a settings change you confirm with Apply. Feature requests are passed on to the
  developer. Questions and current settings are sent to a server; no audio or practice
  history is. A few questions per day are free.
```

- [ ] **Step 4: Privacy policy and store forms (manual, needs the user)**

Do not guess answers here; present these to the user and let them decide and enter them.

1. **Privacy policy page** (the URL already set in App Store Connect): add a paragraph saying the optional "Ask about setup" chat sends the text the user types, their current app settings and a random per-install identifier (used only to limit questions per day) to Ear Ring's server and on to an AI language-model provider chosen by the developer, to generate an answer; that no audio, location, contacts or practice history is sent; that feedback the user asks to pass on is stored and emailed to the developer; and how long that is kept (the proxy keeps daily counters for two days and feedback until the developer deletes it).
2. **App Store Connect, App Privacy:** add "User Content: Other User Content", collected, *not* linked to the user's identity, *not* used for tracking, purpose "App Functionality". **Decision for the user:** whether the random install id counts as an identifier ("Device ID" or "User ID") under Apple's definitions; it is an app-generated random value that resets on reinstall and is used only for rate limiting, but Apple's wording is broad, so the conservative answer is to declare it. Keep `PrivacyInfo.xcprivacy` (Task 3 Step 6) consistent with whatever is decided.
3. **Google Play Console, Data safety:** add user-generated content ("Other user-generated content" or "App activity") as collected, for app functionality, and decide whether the install id is declared under "Device or other IDs". Data forwarded to a language-model provider acting on the developer's behalf is normally treated as a service provider rather than "shared"; confirm against Google's current guidance.
4. **Whenever the model provider changes** (plan 2 makes that a config change), re-read the policy wording: it should keep naming "an AI language-model provider", not a specific vendor, so it stays true.

- [ ] **Step 5: Commit (only when the user says so)**

```bash
git add rust/src/help.md DESIGN.md CHANGELOG.md
git commit -m "docs: setup assistant in Help text, DESIGN.md and changelog"
```

---
### Task 5: End-to-end check on all three platforms

Needs plan 2 deployed and `PROXY_URL` set (plan 2 Task 10 Step 7), so the apps reach the live service. Spends a few cents of model calls. Do this with the user watching, on the emulator, the iOS simulator and the desktop app.

- [ ] **Step 1: The headline scenario, on each platform**

Ask: `I want a chance to correct a wrong note`.

Expected: a short reply plus a card `Retry Same Note: 2 → 5` (or similar; the exact value is the model's choice, but it must be `Retry Same Note`, and never a setting the screen cannot show). Tap `Apply`: the bubble says `Applied. You can review it in Settings.`, and the Settings tab's `Retry Same Note` chip row now shows the new value on that platform. Ask again: the assistant should not propose the value that is already set.

- [ ] **Step 2: Answers that are not settings**

- `I keep rushing the notes, any tips?` should give advice, and may propose a slower `Tempo (BPM)`.
- `Switch me to soprano voice` (free user) should say it is a premium feature and propose nothing.
- `I would like to use different colors` should say it was passed on; the bubble shows `Sent as feedback, thanks.` and the item appears in the next digest email (or trigger it, see plan 2 Task 10 Step 5).
- `What is the weather like today?` should decline in a sentence.

- [ ] **Step 3: Failure behaviour**

Turn on airplane mode (or block the network) and ask something: a red bubble appears with `Try again`, the question stays on screen, and turning the network back on then tapping `Try again` succeeds without retyping. Exhaust the daily quota (ask six times, or temporarily set `FREE_DAILY_LIMIT = "1"` in the proxy): the sixth answer is the daily-limit message, the footer shows `0 questions left today`, and Settings still works.

- [ ] **Step 4: Stale card**

Get a card for Retry Same Note, but before tapping Apply go to Settings and set Retry Same Note to that value by hand, then come back to Help (the transcript is gone, which is expected) and repeat: ask, change the setting by hand in another way, then Apply immediately on platforms where the chat is still open (desktop keeps it open in the sidebar layout). Expected: `Already up to date.`, and no other setting is touched.

- [ ] **Step 5: Layout on the smallest screens**

On the emulator and the narrowest desktop window, ask for several changes at once (`make it easier for a beginner`). Expected: the card wraps, nothing is clipped, the input stays reachable with the keyboard open, and the Help screen scrolls.

- [ ] **Step 6: Record the result**

Note any example that needed prompt changes in `assistant-proxy/src/prompt.ts` (and redeploy) in the commit message that follows, and update `DESIGN.md` if the layout changed from what Task 4 describes.

---

## Self-review (completed by the plan author)

- **Spec coverage:** chat on the Help tab, multi-turn, transcript discarded on leaving (all tasks); propose then confirm with Apply (Tasks 1 to 3); text-only, settings and feedback outcomes (rendered from the core's view: reply, card, `feedbackSent`); error UX for offline, quota and server (core's error view, Tasks 1 to 3, tested in Task 5); premium awareness (passed `isPremium`, core validates); stale proposals (Apply re-validates; tests in Tasks 1 and 2); per-platform persistence of the install id only (Global Constraints, DESIGN.md); disclosure line and privacy updates (Task 1 to 3 copy, Task 4); DESIGN.md, help text and changelog (Task 4); UI Consistency Rule (all three platforms in one plan, identical copy).
- **Verification honesty:** desktop client logic is covered by Node tests and type-checked; Android Kotlin compiles and its instrumented test runs on the emulator; the iOS Swift cannot be compiled on this machine and is verified only by the Mac build in Task 3 Step 7 and the manual checks. Plan 1 verifies the Rust side, including the JNI cross-compile.
- **Placeholders:** none in code. The proxy address is the placeholder `PROXY_URL` from plan 1 until plan 2 Task 10 Step 7.
- **Type consistency:** `AssistantView` / `AssistantCard` / `AssistantItem` mirror the core's `resolve_outcome_json` / `resolve_proposal_json` output on all three platforms (`reply`, `card.items[].{key,label,from,to,action}`, `card.rejected[].{key,reason}`, `proposal`, `feedbackSent`, `quota.remaining`, `isError`); `EarRingCore.assistant*` wrappers match the JNI and C signatures from plan 1; `settingsSnapshot` / `assistantSettingsJson` are the read hooks and `applyAssistantActions` the write hook on Android and iOS.
