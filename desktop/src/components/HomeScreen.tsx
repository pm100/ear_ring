import React from 'react';
import { ExerciseState } from '../types';

interface Props {
  exercise: ExerciseState;
  onUpdateExercise: (updates: Partial<ExerciseState>) => void;
  onStart: (rootNote: number, octave: number, scaleId: number, sequenceLength: number) => void;
  onSetup: () => void;
  onProgress: () => void;
}

const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const SCALE_NAMES = ['Major','Natural Minor','Harmonic Minor','Pentatonic Major','Pentatonic Minor','Dorian','Mixolydian','Blues'];

export default function HomeScreen({ exercise, onUpdateExercise, onStart, onSetup, onProgress }: Props) {
  const handleStart = () => {
    onStart(exercise.rootNote, exercise.octave, exercise.scaleId, exercise.sequenceLength);
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
            className={`chip ${exercise.rootNote === i ? 'chip-selected' : ''}`}
            onClick={() => onUpdateExercise({ rootNote: i })}
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
            className={`chip ${exercise.octave === oct ? 'chip-selected' : ''}`}
            onClick={() => onUpdateExercise({ octave: oct })}
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
            className={`chip ${exercise.scaleId === i ? 'chip-selected' : ''}`}
            onClick={() => onUpdateExercise({ scaleId: i })}
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
            className={`chip ${exercise.sequenceLength === len ? 'chip-selected' : ''}`}
            onClick={() => onUpdateExercise({ sequenceLength: len })}
          >
            {len}
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
