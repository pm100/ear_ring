import React from 'react';
import { ExerciseSettings } from '../types';

interface Props {
  settings: ExerciseSettings;
  onUpdateSettings: React.Dispatch<React.SetStateAction<ExerciseSettings>>;
  onBack: () => void;
}

const BPM_OPTIONS = [60, 80, 100, 120, 140];
const RETRY_OPTIONS = [1, 2, 3, 5, 8, 10];
const STABILITY_OPTIONS = [2, 3, 4, 5];
const WRONG_PAUSE_OPTIONS = [{ label: '1s', value: 1000 }, { label: '2s', value: 2000 }, { label: '3s', value: 3000 }, { label: '5s', value: 5000 }];

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 style={{ fontSize: 14, fontWeight: 700, color: '#757575', textTransform: 'uppercase', letterSpacing: 1, margin: '20px 0 8px' }}>{children}</h2>;
}

export default function SettingsScreen({ settings, onUpdateSettings, onBack }: Props) {
  const set = <K extends keyof ExerciseSettings>(key: K, value: ExerciseSettings[K]) =>
    onUpdateSettings(prev => ({ ...prev, [key]: value }));

  return (
    <div className="screen" style={{ paddingBottom: 72 }}>
      <div className="screen-header">
        <button className="btn-back" onClick={onBack}>← Back</button>
        <span className="screen-title">Settings</span>
        <div style={{ width: 48 }} />
      </div>

      <SectionTitle>Playback</SectionTitle>
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
    </div>
  );
}
