import React from 'react';
import { ExerciseSettings } from '../types';

interface Props {
  settings: ExerciseSettings;
  onUpdateSettings: React.Dispatch<React.SetStateAction<ExerciseSettings>>;
  onStart: (rootNote: number, octave: number, scaleId: number, sequenceLength: number, tempoBpm: number, showTestNotes: boolean) => void;
  onSetup: () => void;
  onProgress: () => void;
}

const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const SCALE_NAMES = ['Major','Natural Minor','Harmonic Minor','Pentatonic Major','Pentatonic Minor','Dorian','Mixolydian','Blues'];
const BPM_OPTIONS = [60, 80, 100, 120, 140];

function HomeScreen({ settings, onUpdateSettings, onStart, onSetup, onProgress }: Props) {
  const handleStart = () => {
    onStart(settings.rootNote, settings.octave, settings.scaleId, settings.sequenceLength, settings.tempoBpm, settings.showTestNotes);
  };

  return (
    <div className="screen">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 4 }}>
        <img src="/icon.png" alt="Ear Ring" style={{ width: 48, height: 48, borderRadius: 10 }} />
        <h1 className="app-title" style={{ margin: 0 }}>Ear Ring</h1>
      </div>
      <p className="app-subtitle">Ear Training</p>

      <span className="section-label">Root Note</span>
      <div className="chip-row">
        {NOTE_NAMES.map((name, i) => (
          <button
            key={i}
            type="button"
            className={`chip ${settings.rootNote === i ? 'chip-selected' : ''}`}
            onClick={() => onUpdateSettings(prev => ({ ...prev, rootNote: i }))}
          >
            {name}
          </button>
        ))}
      </div>

      <span className="section-label">Octave</span>
      <div className="chip-row">
        {[3, 4, 5].map(oct => (
          <button
            key={oct}
            type="button"
            className={`chip ${settings.octave === oct ? 'chip-selected' : ''}`}
            onClick={() => onUpdateSettings(prev => ({ ...prev, octave: oct }))}
          >
            {oct}
          </button>
        ))}
      </div>

      <span className="section-label">Scale</span>
      <div className="chip-row">
        {SCALE_NAMES.map((name, i) => (
          <button
            key={i}
            type="button"
            className={`chip ${settings.scaleId === i ? 'chip-selected' : ''}`}
            onClick={() => onUpdateSettings(prev => ({ ...prev, scaleId: i }))}
          >
            {name}
          </button>
        ))}
      </div>

      <span className="section-label">Sequence Length</span>
      <div className="chip-row">
        {[2, 3, 4, 5, 6, 7, 8].map(len => (
          <button
            key={len}
            type="button"
            className={`chip ${settings.sequenceLength === len ? 'chip-selected' : ''}`}
            onClick={() => onUpdateSettings(prev => ({ ...prev, sequenceLength: len }))}
          >
            {len}
          </button>
        ))}
      </div>

      <span className="section-label">Tempo (BPM)</span>
      <div className="chip-row">
        {BPM_OPTIONS.map(bpm => (
          <button
            key={bpm}
            type="button"
            className={`chip ${settings.tempoBpm === bpm ? 'chip-selected' : ''}`}
            onClick={() => onUpdateSettings(prev => ({ ...prev, tempoBpm: bpm }))}
          >
            {bpm}
          </button>
        ))}
      </div>

      <span className="section-label">Display Test Notes</span>
      <div className="chip-row">
        {[false, true].map(show => (
          <button
            key={show ? 'show' : 'hide'}
            type="button"
            className={`chip ${settings.showTestNotes === show ? 'chip-selected' : ''}`}
            onClick={() => onUpdateSettings(prev => ({ ...prev, showTestNotes: show }))}
          >
            {show ? 'Show' : 'Hide'}
          </button>
        ))}
      </div>

      <div style={{ marginTop: 32 }}>
        <button className="btn-primary" onClick={handleStart}>▶ Start Exercise</button>
        <button className="btn-outlined" onClick={onSetup}>🎙 Mic Setup</button>
        <button className="btn-outlined" onClick={onProgress}>📊 Progress</button>
      </div>
    </div>
  );
}

export default React.memo(HomeScreen);
