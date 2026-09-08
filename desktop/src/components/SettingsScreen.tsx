import React, { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { ExerciseSettings } from '../types';

interface Props {
  settings: ExerciseSettings;
  onUpdateSettings: React.Dispatch<React.SetStateAction<ExerciseSettings>>;
  onResetSettings: () => void;
  onBack: () => void;
}

const BPM_OPTIONS = [60, 80, 100, 120, 140];
const RETRY_OPTIONS = [1, 2, 3, 5, 8, 10];
const NOTE_RETRY_OPTIONS = [0, 1, 2, 3, 4, 5];
const STABILITY_OPTIONS = [2, 3, 4, 5];
const WARMUP_OPTIONS = [0, 1, 2, 3, 4, 5, 6];
const WRONG_PAUSE_OPTIONS = [{ label: '1s', value: 1000 }, { label: '2s', value: 2000 }, { label: '3s', value: 3000 }, { label: '5s', value: 5000 }];
const INTRO_SOUND_OPTIONS = ['Root Note', 'Chord', 'Arpeggio', 'Scale', 'None'];

function GroupHeader({ children }: { children: React.ReactNode }) {
  return <h2 style={{ fontSize: 13, fontWeight: 700, color: '#212121', textTransform: 'uppercase', letterSpacing: 1.5, margin: '24px 0 4px', borderBottom: '2px solid #e0e0e0', paddingBottom: 4 }}>{children}</h2>;
}

/** Collapsible section — starts collapsed; click the header to toggle. Shows a muted
 *  value summary next to the title while collapsed, when `summary` is given. */
function CollapsibleSection({ title, summary, children }: { title: string; summary?: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderBottom: '1px solid #eee' }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'none', border: 'none', padding: '10px 0', cursor: 'pointer' }}
      >
        <span style={{ fontSize: 14, fontWeight: 700, color: '#757575', textTransform: 'uppercase', letterSpacing: 1 }}>
          {title}
          {!open && summary && (
            <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: '#9e9e9e' }}> · {summary}</span>
          )}
        </span>
        <span style={{ fontSize: 12, color: '#9e9e9e', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>▶</span>
      </button>
      {open && (
        <div style={{ paddingBottom: 12, paddingLeft: 12, marginLeft: 12, borderLeft: '2px solid #e0e0e0' }}>
          {children}
        </div>
      )}
    </div>
  );
}

interface InstrumentInfo { id: number; name: string; semitones: number; rangeStart: number; rangeEnd: number; }

function defaultRangeForKey(rootNote: number): [number, number] {
  let best = 60 + rootNote;
  for (let oct = 2; oct <= 6; oct++) {
    const c = (oct + 1) * 12 + rootNote;
    if (Math.abs(c - 60) < Math.abs(best - 60)) best = c;
  }
  return [best, best + 12];
}

export default function SettingsScreen({ settings, onUpdateSettings, onResetSettings, onBack }: Props) {
  const set = <K extends keyof ExerciseSettings>(key: K, value: ExerciseSettings[K]) =>
    onUpdateSettings(prev => ({ ...prev, [key]: value }));

  const [instruments, setInstruments] = useState<InstrumentInfo[]>([]);
  useEffect(() => {
    invoke<string>('cmd_instrument_list')
      .then(json => setInstruments(JSON.parse(json) as InstrumentInfo[]))
      .catch(() => setInstruments([{ id: 0, name: 'Piano', semitones: 0, rangeStart: 60, rangeEnd: 72 }]));
  }, []);

  const [gitHash, setGitHash] = useState('unknown');
  useEffect(() => {
    invoke<string>('cmd_git_hash').then(setGitHash).catch(() => {});
  }, []);

  return (
    <div className="screen" style={{ paddingBottom: 72 }}>
      <div className="screen-header">
        <button className="btn-back" onClick={onBack}>← Back</button>
        <span className="screen-title">Settings</span>
        <div style={{ width: 48 }} />
      </div>

      <GroupHeader>User</GroupHeader>

      <CollapsibleSection
        title="Instrument"
        summary={`${instruments.find(i => i.id === settings.instrumentIndex)?.name ?? 'Piano'}, ${settings.tempoBpm} BPM`}
      >
        <span className="section-label" style={{ marginTop: 0 }}>Instrument</span>
        <select
          value={settings.instrumentIndex}
          onChange={e => {
            const idx = parseInt(e.target.value);
            const inst = instruments[idx];
            onUpdateSettings(prev => {
              const [rangeStart, rangeEnd] = defaultRangeForKey(prev.rootNote);
              return { ...prev, instrumentIndex: idx, rangeStart, rangeEnd };
            });
          }}
          style={{ width: '100%', padding: '8px 12px', fontSize: 14, borderRadius: 4, border: '1px solid #bdbdbd', marginBottom: 4 }}
        >
          {instruments.map(inst => (
            <option key={inst.id} value={inst.id}>{inst.name}</option>
          ))}
        </select>
        <span className="section-label" style={{ marginTop: 0 }}>Tempo (BPM)</span>
        <div className="chip-row">
          {BPM_OPTIONS.map(bpm => (
            <button key={bpm} type="button"
              className={`chip ${settings.tempoBpm === bpm ? 'chip-selected' : ''}`}
              onClick={() => set('tempoBpm', bpm)}>{bpm}</button>
          ))}
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Sound" summary={`${INTRO_SOUND_OPTIONS[settings.introSoundMode]} intro, chime ${settings.playPassFailSounds ? 'on' : 'off'}`}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginTop: 0 }}>
          <input
            type="checkbox"
            checked={settings.playPassFailSounds}
            onChange={e => set('playPassFailSounds', e.target.checked)}
            style={{ width: 18, height: 18, cursor: 'pointer' }}
          />
          <span className="section-label" style={{ margin: 0 }}>Play Pass/Fail Sounds</span>
        </label>
        <p style={{ fontSize: 12, color: '#757575', marginTop: 4, marginBottom: 0 }}>A chime when a test is passed, a different tone when it fails</p>

        <span className="section-label">Intro Sound</span>
        <p style={{ fontSize: 12, color: '#757575', marginBottom: 6 }}>What plays before each test</p>
        <select
          value={settings.introSoundMode}
          onChange={e => set('introSoundMode', parseInt(e.target.value))}
          style={{ width: '100%', padding: '8px 12px', fontSize: 14, borderRadius: 4, border: '1px solid #bdbdbd' }}
        >
          {INTRO_SOUND_OPTIONS.map((label, idx) => (
            <option key={label} value={idx}>{label}</option>
          ))}
        </select>
      </CollapsibleSection>

      <CollapsibleSection
        title="Display"
        summary={
          [settings.showTestNotes && 'Test notes shown', settings.keySignatureMode === 1 && 'Key signature']
            .filter(Boolean)
            .join(', ') || 'Off'
        }
      >
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginTop: 0 }}>
          <input
            type="checkbox"
            checked={settings.showTestNotes}
            onChange={e => set('showTestNotes', e.target.checked)}
            style={{ width: 18, height: 18, cursor: 'pointer' }}
          />
          <span className="section-label" style={{ margin: 0 }}>Display Test Notes</span>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={settings.keySignatureMode === 1}
            onChange={e => set('keySignatureMode', e.target.checked ? 1 : 0)}
            style={{ width: 18, height: 18, cursor: 'pointer' }}
          />
          <span className="section-label" style={{ margin: 0 }}>Use Key Signature</span>
        </label>
      </CollapsibleSection>

      <CollapsibleSection title="Exercise" summary={`${settings.maxRetries} retries, ${settings.noteRetries} same-note`}>
        <span className="section-label" style={{ marginTop: 0 }}>Max Retries</span>
        <p style={{ fontSize: 12, color: '#757575', marginBottom: 6 }}>Attempts per test before moving on</p>
        <div className="chip-row">
          {RETRY_OPTIONS.map(n => (
            <button key={n} type="button"
              className={`chip ${settings.maxRetries === n ? 'chip-selected' : ''}`}
              onClick={() => set('maxRetries', n)}>{n}</button>
          ))}
        </div>

        <span className="section-label">Retry Same Note</span>
        <p style={{ fontSize: 12, color: '#757575', marginBottom: 6 }}>Tries allowed on a wrong note before the whole test restarts — each retry costs a few points (0 = off)</p>
        <div className="chip-row">
          {NOTE_RETRY_OPTIONS.map(n => (
            <button key={n} type="button"
              className={`chip ${settings.noteRetries === n ? 'chip-selected' : ''}`}
              onClick={() => set('noteRetries', n)}>{n}</button>
          ))}
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        title="Timing"
        summary={`${settings.postChordGapMs}ms gap, ${WRONG_PAUSE_OPTIONS.find(o => o.value === settings.wrongNotePauseMs)?.label ?? '3s'} pause`}
      >
        <span className="section-label" style={{ marginTop: 0 }}>Pause Before Singing</span>
        <p style={{ fontSize: 12, color: '#757575', marginBottom: 6 }}>Gap between chord and test sequence (ms)</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <input type="range" min={400} max={2000} step={100}
            value={settings.postChordGapMs}
            onChange={e => set('postChordGapMs', parseInt(e.target.value))}
            style={{ flex: 1 }} />
          <span style={{ minWidth: 48, fontSize: 13, color: '#212121' }}>{settings.postChordGapMs}ms</span>
        </div>

        <span className="section-label">Wrong Note Pause</span>
        <p style={{ fontSize: 12, color: '#757575', marginBottom: 6 }}>How long to display a wrong note before replaying</p>
        <div className="chip-row">
          {WRONG_PAUSE_OPTIONS.map(opt => (
            <button key={opt.value} type="button"
              className={`chip ${settings.wrongNotePauseMs === opt.value ? 'chip-selected' : ''}`}
              onClick={() => set('wrongNotePauseMs', opt.value)}>{opt.label}</button>
          ))}
        </div>
      </CollapsibleSection>

      <GroupHeader>Advanced</GroupHeader>

      <CollapsibleSection title="Pitch Detection" summary={`Sensitivity ${Math.round((0.011 - settings.silenceThreshold) / 0.001)}/10`}>
        <span className="section-label" style={{ marginTop: 0 }}>Mic Sensitivity</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <input type="range" min={1} max={10} step={1}
            value={Math.round((0.011 - settings.silenceThreshold) / 0.001)}
            onChange={e => set('silenceThreshold', parseFloat((0.011 - parseInt(e.target.value) * 0.001).toFixed(3)))}
            style={{ flex: 1 }} />
          <span style={{ minWidth: 40, fontSize: 13, color: '#212121' }}>{Math.round((0.011 - settings.silenceThreshold) / 0.001)} / 10</span>
        </div>

        <span className="section-label">Note Stability (frames to confirm)</span>
        <p style={{ fontSize: 12, color: '#757575', marginBottom: 6 }}>Consecutive stable frames before confirming a note</p>
        <div className="chip-row">
          {STABILITY_OPTIONS.map(n => (
            <button key={n} type="button"
              className={`chip ${settings.framesToConfirm === n ? 'chip-selected' : ''}`}
              onClick={() => set('framesToConfirm', n)}>{n}</button>
          ))}
        </div>

        <span className="section-label">Mic Warmup Frames</span>
        <p style={{ fontSize: 12, color: '#757575', marginBottom: 6 }}>Frames discarded when mic opens (both Exercise and Mic Setup)</p>
        <div className="chip-row">
          {WARMUP_OPTIONS.map(n => (
            <button key={n} type="button"
              className={`chip ${settings.warmupFrames === n ? 'chip-selected' : ''}`}
              onClick={() => set('warmupFrames', n)}>{n}</button>
          ))}
        </div>
      </CollapsibleSection>

      <div style={{ marginTop: 32, paddingBottom: 16 }}>
        <ResetButton onReset={onResetSettings} />
      </div>
      <p style={{ textAlign: 'center', fontSize: 11, color: '#9e9e9e', marginTop: 0, paddingBottom: 16 }}>Build {gitHash}</p>
    </div>
  );
}

function ResetButton({ onReset }: { onReset: () => void }) {
  const [confirming, setConfirming] = React.useState(false);
  if (confirming) {
    return (
      <div style={{ border: '1px solid #f44336', borderRadius: 8, padding: 16 }}>
        <p style={{ margin: '0 0 12px', fontSize: 14, color: '#212121' }}>
          Reset all settings to defaults? Your progress history will not be affected.
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={() => { onReset(); setConfirming(false); }}
            style={{ flex: 1, padding: '8px 0', background: '#f44336', color: '#fff', border: 'none', borderRadius: 6, fontSize: 14, cursor: 'pointer' }}>
            Reset
          </button>
          <button type="button" onClick={() => setConfirming(false)}
            style={{ flex: 1, padding: '8px 0', background: '#e0e0e0', color: '#212121', border: 'none', borderRadius: 6, fontSize: 14, cursor: 'pointer' }}>
            Cancel
          </button>
        </div>
      </div>
    );
  }
  return (
    <button type="button" onClick={() => setConfirming(true)}
      style={{ width: '100%', padding: '12px 0', background: '#ffebee', color: '#c62828', border: '1px solid #ef9a9a', borderRadius: 8, fontSize: 14, cursor: 'pointer' }}>
      Reset to Defaults
    </button>
  );
}
