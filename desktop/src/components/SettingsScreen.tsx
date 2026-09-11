import React, { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { ExerciseSettings } from '../types';
import { TooltipIcon } from './Tooltip';

interface Props {
  settings: ExerciseSettings;
  onUpdateSettings: React.Dispatch<React.SetStateAction<ExerciseSettings>>;
  onResetSettings: () => void;
  onBack: () => void;
}

const BPM_OPTIONS = [60, 80, 100, 120, 140];
const RETRY_OPTIONS = [1, 2, 3, 5, 8, 10];
const NOTE_RETRY_OPTIONS = [0, 1, 2, 3, 4, 5];
const WRONG_PAUSE_OPTIONS = [{ label: '1s', value: 1000 }, { label: '2s', value: 2000 }, { label: '3s', value: 3000 }, { label: '5s', value: 5000 }];
const INTRO_SOUND_OPTIONS = ['Root Note', 'Chord', 'Arpeggio', 'Scale', 'None'];

/** Collapsible section — starts collapsed; click the header to toggle. Each section
 *  groups several related settings under one heading, so no collapsed-value summary
 *  is shown (a summary can't stay short once a section holds more than one or two
 *  settings). */
function CollapsibleSection({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderBottom: '1px solid #eee' }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'none', border: 'none', padding: '10px 0', cursor: 'pointer', fontSize: 14, fontWeight: 700, color: '#757575', textTransform: 'uppercase', letterSpacing: 1 }}
      >
        {title}
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

      <CollapsibleSection title="Instrument & Playback">
        <span className="section-label" style={{ marginTop: 0 }}>Instrument<TooltipIcon tooltipKey="instrument" /></span>
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
        <span className="section-label">Tempo (BPM)<TooltipIcon tooltipKey="tempo" /></span>
        <div className="chip-row">
          {BPM_OPTIONS.map(bpm => (
            <button key={bpm} type="button"
              className={`chip ${settings.tempoBpm === bpm ? 'chip-selected' : ''}`}
              onClick={() => set('tempoBpm', bpm)}>{bpm}</button>
          ))}
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Sound & Display">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 0 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={settings.playPassFailSounds}
              onChange={e => set('playPassFailSounds', e.target.checked)}
              style={{ width: 18, height: 18, cursor: 'pointer' }}
            />
            <span className="section-label" style={{ margin: 0 }}>Play Pass/Fail Sounds</span>
          </label>
          <TooltipIcon tooltipKey="play_pass_fail_sounds" />
        </div>
        <p style={{ fontSize: 12, color: '#757575', marginTop: 4, marginBottom: 0 }}>A chime when a test is passed, a different tone when it fails</p>

        <span className="section-label">Intro Sound<TooltipIcon tooltipKey="intro_sound" /></span>
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

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={settings.showTestNotes}
              onChange={e => set('showTestNotes', e.target.checked)}
              style={{ width: 18, height: 18, cursor: 'pointer' }}
            />
            <span className="section-label" style={{ margin: 0 }}>Display Test Notes</span>
          </label>
          <TooltipIcon tooltipKey="display_test_notes" />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={settings.keySignatureMode === 1}
              onChange={e => set('keySignatureMode', e.target.checked ? 1 : 0)}
              style={{ width: 18, height: 18, cursor: 'pointer' }}
            />
            <span className="section-label" style={{ margin: 0 }}>Use Key Signature</span>
          </label>
          <TooltipIcon tooltipKey="use_key_signature" />
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Exercise & Timing">
        {/* Explanatory captions removed under each label here — redundant now that
            every label has a tooltip icon (issue #11). Pause Before Playing keeps its
            live ms readout since the range input itself shows no value of its own. */}
        <span className="section-label" style={{ marginTop: 0 }}>Max Retries<TooltipIcon tooltipKey="max_retries" /></span>
        <div className="chip-row" style={{ marginTop: 6 }}>
          {RETRY_OPTIONS.map(n => (
            <button key={n} type="button"
              className={`chip ${settings.maxRetries === n ? 'chip-selected' : ''}`}
              onClick={() => set('maxRetries', n)}>{n}</button>
          ))}
        </div>

        <span className="section-label">Retry Same Note<TooltipIcon tooltipKey="retry_same_note" /></span>
        <div className="chip-row" style={{ marginTop: 6 }}>
          {NOTE_RETRY_OPTIONS.map(n => (
            <button key={n} type="button"
              className={`chip ${settings.noteRetries === n ? 'chip-selected' : ''}`}
              onClick={() => set('noteRetries', n)}>{n}</button>
          ))}
        </div>

        <span className="section-label">Pause Before Playing<TooltipIcon tooltipKey="pause_before_playing" /></span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 6 }}>
          <input type="range" min={400} max={2000} step={100}
            value={settings.postChordGapMs}
            onChange={e => set('postChordGapMs', parseInt(e.target.value))}
            style={{ flex: 1 }} />
          <span style={{ minWidth: 48, fontSize: 13, color: '#212121' }}>{settings.postChordGapMs}ms</span>
        </div>

        <span className="section-label">Wrong Note Pause<TooltipIcon tooltipKey="wrong_note_pause" /></span>
        <div className="chip-row" style={{ marginTop: 6 }}>
          {WRONG_PAUSE_OPTIONS.map(opt => (
            <button key={opt.value} type="button"
              className={`chip ${settings.wrongNotePauseMs === opt.value ? 'chip-selected' : ''}`}
              onClick={() => set('wrongNotePauseMs', opt.value)}>{opt.label}</button>
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
