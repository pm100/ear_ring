export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export function midiToLabel(midi: number): string {
  const octave = Math.floor(midi / 12) - 1;
  return `${NOTE_NAMES[midi % 12]}${octave}`;
}

export function freqToMidi(hz: number): number {
  if (!Number.isFinite(hz) || hz <= 0) {
    return -1;
  }
  return Math.round(69 + 12 * Math.log2(hz / 440));
}

export function freqToCents(hz: number): number {
  const midi = freqToMidi(hz);
  if (midi < 0) {
    return 0;
  }
  const referenceHz = 440 * Math.pow(2, (midi - 69) / 12);
  return Math.round(1200 * Math.log2(hz / referenceHz));
}

export function hzToLabel(hz: number): string {
  const midi = freqToMidi(hz);
  return midi >= 0 ? midiToLabel(midi) : '\u2014';
}

export function staffPositionForMidi(midi: number): number {
  const octave = Math.floor(midi / 12) - 1;
  const pitchClass = ((midi % 12) + 12) % 12;
  const diatonic = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6][pitchClass];
  return (octave - 4) * 7 + diatonic;
}
