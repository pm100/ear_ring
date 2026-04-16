export interface RawNote {
  semitones: number;  // offset from tonic: 0=root, 7=fifth, 12=octave up
  duration: number;   // beats: 1.0=quarter, 0.5=eighth, 2.0=half, 1.5=dotted quarter
}

export interface RawMelody {
  index: number;      // position in source library (undefined for imported)
  title: string;
  notes: RawNote[];
  source: 'library' | 'import' | 'record';
}

export interface SearchResult {
  id: number;
  name: string;
  tune_type: string;
  source: string;
  abc?: string;
}

export type Decision = 'keep' | 'discard' | 'later';

export interface StaffDisplayNote {
  midi: number;
  state: 'expected' | 'correct' | 'incorrect' | 'active';
  duration?: number;
}
