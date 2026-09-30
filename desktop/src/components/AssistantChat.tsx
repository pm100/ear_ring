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
          style={{ flex: 1, minWidth: 0, padding: '8px 12px', fontSize: 14, borderRadius: 8, border: '1px solid #BDBDBD' }}
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
