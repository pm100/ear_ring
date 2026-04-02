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
const STABILITY_OPTIONS = [2, 3, 4, 5];
const WARMUP_OPTIONS = [0, 1, 2, 3, 4, 5, 6];
const WRONG_PAUSE_OPTIONS = [{ label: '1s', value: 1000 }, { label: '2s', value: 2000 }, { label: '3s', value: 3000 }, { label: '5s', value: 5000 }];

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 style={{ fontSize: 14, fontWeight: 700, color: '#757575', textTransform: 'uppercase', letterSpacing: 1, margin: '20px 0 8px' }}>{children}</h2>;
}

interface InstrumentInfo { id: number; name: string; semitones: number; rangeStart: number; rangeEnd: number; }

export default function SettingsScreen({ settings, onUpdateSettings, onResetSettings, onBack }: Props) {
  const set = <K extends keyof ExerciseSettings>(key: K, value: ExerciseSettings[K]) =>
    onUpdateSettings(prev => ({ ...prev, [key]: value }));

  const [instruments, setInstruments] = useState<InstrumentInfo[]>([]);
  useEffect(() => {
    invoke<string>('cmd_instrument_list')
      .then(json => setInstruments(JSON.parse(json) as InstrumentInfo[]))
      .catch(() => setInstruments([{ id: 0, name: 'Piano', semitones: 0, rangeStart: 60, rangeEnd: 72 }]));
  }, []);

  return (
    <div className="screen" style={{ paddingBottom: 72 }}>
      <div className="screen-header">
        <button className="btn-back" onClick={onBack}>← Back</button>
        <span className="screen-title">Settings</span>
        <div style={{ width: 48 }} />
      </div>

      <SectionTitle>Instrument</SectionTitle>
      <span className="section-label" style={{ marginTop: 0 }}>Instrument</span>
      <select
        value={settings.instrumentIndex}
        onChange={e => {
          const idx = parseInt(e.target.value);
          const inst = instruments[idx];
          onUpdateSettings(prev => ({
            ...prev,
            instrumentIndex: idx,
            ...(inst ? { rangeStart: inst.rangeStart, rangeEnd: inst.rangeEnd } : {}),
          }));
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

      <SectionTitle>Exercise</SectionTitle>
      <span className="section-label" style={{ marginTop: 0 }}>Max Retries</span>
      <p style={{ fontSize: 12, color: '#757575', marginBottom: 6 }}>Attempts per test before moving on</p>
      <div className="chip-row">
        {RETRY_OPTIONS.map(n => (
          <button key={n} type="button"
            className={`chip ${settings.maxRetries === n ? 'chip-selected' : ''}`}
            onClick={() => set('maxRetries', n)}>{n}</button>
        ))}
      </div>

      <SectionTitle>Pitch Detection</SectionTitle>
      <span className="section-label" style={{ marginTop: 0 }}>Mic Sensitivity (silence threshold)</span>
      <p style={{ fontSize: 12, color: '#757575', marginBottom: 6 }}>Lower = picks up quieter sounds</p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <input type="range" min={0.001} max={0.010} step={0.001}
          value={settings.silenceThreshold}
          onChange={e => set('silenceThreshold', parseFloat(e.target.value))}
          style={{ flex: 1 }} />
        <span style={{ minWidth: 40, fontSize: 13, color: '#212121' }}>{settings.silenceThreshold.toFixed(3)}</span>
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

      <SectionTitle>Timing</SectionTitle>
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

      <div style={{ marginTop: 32, paddingBottom: 16 }}>
        <ResetButton onReset={onResetSettings} />
      </div>
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
