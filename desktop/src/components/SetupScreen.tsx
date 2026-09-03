import React, { useState, useCallback, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import PitchMeter from './PitchMeter';
import MusicStaff from './MusicStaff';
import { useAudioCapture, TrackerFrame } from '../hooks/useAudioCapture';
import { preferredMidiLabel } from '../music';

interface InstrumentInfo { id: number; name: string; semitones: number; }

// Semitones to add to root chroma to get the implied major key (the major key sharing
// the scale's pitch classes) — mirrors ScaleType::implied_major_offset in music_theory.rs.
// null = no shift (a major scale is its own implied major key).
const IMPLIED_MAJOR_OFFSETS: (number | null)[] = [null, 3, 10, 5, 1];

function effectiveKeyChroma(rootChroma: number, scaleId: number): number {
  const offset = IMPLIED_MAJOR_OFFSETS[scaleId];
  if (offset === null || offset === undefined) return rootChroma;
  return (rootChroma + offset) % 12;
}

interface Props {
  onBack: () => void;
  rangeStart: number;
  rangeEnd: number;
  rootChroma?: number;
  scaleId?: number;
  keySignatureMode?: number;
  silenceThreshold?: number;
  framesToConfirm?: number;
  warmupFrames?: number;
  instrumentIndex?: number;
}


export default function SetupScreen({ onBack, rangeStart, rangeEnd, rootChroma = 0, scaleId = 0, keySignatureMode = 0, silenceThreshold = 0.003, framesToConfirm = 3, warmupFrames = 4, instrumentIndex = 0 }: Props) {
  const [hz, setHz] = useState(0);
  const [currentMidi, setCurrentMidi] = useState<number>(-1);
  const [currentHz, setCurrentHz] = useState<number>(0);
  const [noteHistory, setNoteHistory] = useState<number[]>([]);
  const { start, stop, destroy } = useAudioCapture();

  const NOTE_STEP = 44;

  const handleFrame = useCallback(async (frame: TrackerFrame) => {
    setHz(frame.liveHz);
    if (frame.confirmedMidi >= 0) {
      const midi = frame.confirmedMidi;
      // Text/Hz always reflect the truth. The staff, though, stays confined to
      // the configured exercise range — it's read as "where am I in my range",
      // not "what can the mic hear".
      setCurrentMidi(midi);
      setCurrentHz(frame.liveHz);
      if (midi >= rangeStart && midi <= rangeEnd) {
        setNoteHistory(prev => {
          const next = [...prev, midi];
          if (next.length > 8) next.shift();
          return next;
        });
      }
    } else if (frame.liveMidi < 0) {
      // Silent frame: clear the live display only (history remains)
      setCurrentMidi(-1);
    }
  }, [rangeStart, rangeEnd]);

  // Load instrument transposition semitones and apply instrument-specific tracker params.
  const [transpSemitones, setTranspSemitones] = useState(0);
  useEffect(() => {
    invoke<string>('cmd_instrument_list')
      .then(json => {
        const list = JSON.parse(json) as InstrumentInfo[];
        setTranspSemitones(list[instrumentIndex]?.semitones ?? 0);
        void invoke('cmd_tracker_apply_instrument', { instrumentIndex });
      })
      .catch(() => {});
  }, [instrumentIndex]);

  // Configure tracker on entry, then auto-start.  Full cleanup on unmount.
  useEffect(() => {
    void invoke('cmd_tracker_set_params', { silenceThreshold, requiredFrames: framesToConfirm });
    void invoke('cmd_tracker_reset_with_warmup', { warmupFrames });
    start(handleFrame);
    return () => {
      stop();
      void invoke('cmd_tracker_reset');
      destroy();
    };
  }, [start, stop, destroy, handleFrame]);

  const transpMidi = (midi: number) => Math.max(0, Math.min(127, midi + transpSemitones));
  // Staff notation shows written pitch, like a transposing instrument's part.
  const displayMidi = currentMidi >= 0 ? transpMidi(currentMidi) : -1;
  const displayHistory = noteHistory.map(transpMidi);
  const instrKeyTranspose = ((transpSemitones % 12) + 12) % 12;
  const effChroma = (effectiveKeyChroma(rootChroma, scaleId) + instrKeyTranspose) % 12;
  // The big text readout always states the actual (concert) pitch, regardless of
  // instrument transposition — unlike the staff above, it's not notation to read/play.
  const noteLabel = currentMidi >= 0 ? preferredMidiLabel(currentMidi, effectiveKeyChroma(rootChroma, scaleId)) : '—';
  // The actual measured frequency (not recomputed from currentMidi) so it can
  // reveal a mislabeled note instead of just parroting back whatever label was chosen.
  const noteHz = currentMidi >= 0 ? currentHz : null;

  return (
    <div className="screen">
      <div className="screen-header">
        <button className="btn-back" onClick={onBack}>{'\u2190'} Back</button>
        <span className="screen-title">Mic Setup</span>
      </div>

      <p className="setup-instruction">Play a note to test your microphone.</p>

      <div className="listening-indicator">
        <span className="listening-ear">👂</span>
        <span className="listening-label">Listening…</span>
      </div>

      <MusicStaff
        notes={displayHistory.map((midi, index) => ({
          midi,
          state: index === displayHistory.length - 1 ? 'active' : 'expected',
        }))}
        fixedSpacing={NOTE_STEP}
        rootChroma={effChroma}
        keySignatureMode={keySignatureMode}
      />

      <div className="setup-note-display">
        <div className={`setup-note-name${displayMidi >= 0 ? ' detected' : ''}`}
             style={{ fontSize: noteLabel.length >= 3 ? '56px' : '72px' }}>
          {noteLabel}
        </div>
        {noteHz !== null && (
          <div className="setup-note-hz">{noteHz.toFixed(1)} Hz</div>
        )}
      </div>

      <div className="pitch-meter-circle">
        <PitchMeter hz={hz} />
      </div>
    </div>
  );
}

