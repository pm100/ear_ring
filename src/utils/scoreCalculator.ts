import { isCorrect } from './musicTheory';

export interface NoteComparison {
  expected: number;   // MIDI
  detected: number;   // MIDI (-1 = not detected)
  cents: number;
  correct: boolean;
}

/**
 * Compare two sequences of MIDI notes and return per-note results.
 */
export function compareSequences(
  expected: number[],
  detected: Array<{ midi: number; cents: number }>
): NoteComparison[] {
  return expected.map((exp, i) => {
    const det = detected[i] ?? { midi: -1, cents: 0 };
    const correct = det.midi !== -1 && isCorrect(det.midi, exp, det.cents);
    return { expected: exp, detected: det.midi, cents: det.cents, correct };
  });
}

/**
 * Compute a 0–100 score from a list of comparisons.
 */
export function computeScore(comparisons: NoteComparison[]): number {
  if (comparisons.length === 0) return 0;
  const correct = comparisons.filter((c) => c.correct).length;
  return Math.round((correct / comparisons.length) * 100);
}
