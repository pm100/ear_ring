import React from 'react';
import { ExerciseState } from '../types';

interface Props {
  exercise: ExerciseState;
  onTryAgain: () => void;
  onNewExercise: () => void;
  onProgress: () => void;
}

const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const SCALE_NAMES = ['Major','Natural Minor','Harmonic Minor','Dorian','Mixolydian'];

function scoreEmoji(score: number): string {
  if (score === 100) return '\uD83C\uDFC6';
  if (score >= 80) return '\uD83C\uDF89';
  if (score >= 50) return '\uD83D\uDC4D';
  return '\uD83D\uDCAA';
}

function scoreColor(score: number): string {
  if (score >= 80) return '#4CAF50';
  if (score >= 50) return '#FF9800';
  return '#F44336';
}

function midiToLabel(midi: number): string {
  const octave = Math.floor(midi / 12) - 1;
  return `${NOTE_NAMES[midi % 12]}${octave}`;
}

export default function ResultsScreen({ exercise, onTryAgain, onNewExercise, onProgress }: Props) {
  const { sequence, detected } = exercise;
  const correct = detected.filter(d => d.correct).length;
  const total = sequence.length;
  const score = total > 0 ? Math.round((correct / total) * 100) : 0;

  const rootLabel = `${NOTE_NAMES[exercise.rootNote]} ${midiToLabel(exercise.rangeStart)}–${midiToLabel(exercise.rangeEnd)}`;
  const scaleLabel = SCALE_NAMES[exercise.scaleId];

  return (
    <div className="screen">
      <div className="score-display">
        <span className="score-emoji">{scoreEmoji(score)}</span>
        <span className="score-percent" style={{ color: scoreColor(score) }}>{score}%</span>
        <div className="score-label">Score</div>
        <div className="score-meta">{rootLabel}  {scaleLabel}</div>
      </div>

      <hr className="results-divider" />

      <div className="results-note-title">Note by Note</div>

      {sequence.map((midi, i) => {
        const det = detected[i];
        const expectedLabel = midiToLabel(midi);
        const sungLabel = det ? midiToLabel(det.midi) : '\u2014';
        let symbol = '\u2014';
        let symbolClass = 'result-symbol result-symbol-pending';
        if (det) {
          symbol = det.correct ? '\u2713' : '\u2717';
          symbolClass = det.correct ? 'result-symbol result-symbol-correct' : 'result-symbol result-symbol-incorrect';
        }
        return (
          <div key={i} className="result-row">
            <span className="result-index">{i + 1}.</span>
            <span className="result-expected">Expected: {expectedLabel}</span>
            <span className="result-detected">Played: {sungLabel}</span>
            <span className={symbolClass}>{symbol}</span>
          </div>
        );
      })}

      <div style={{ marginTop: 28 }}>
        <button className="btn-primary" onClick={onTryAgain}>{'\uD83D\uDD04'} Try Again</button>
        <button className="btn-outlined" onClick={onNewExercise}>{'\uD83C\uDFE0'} New Exercise</button>
        <button className="btn-outlined" onClick={onProgress}>{'\uD83D\uDCCA'} View Progress</button>
      </div>
    </div>
  );
}
