import React, { useState, useCallback, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import PitchMeter from './PitchMeter';
import MusicStaff from './MusicStaff';
import { useAudioCapture, TrackerFrame } from '../hooks/useAudioCapture';
import { ExerciseSettings } from '../types';
import { TooltipIcon } from './Tooltip';

const STABILITY_OPTIONS = [2, 3, 4, 5];
const WARMUP_OPTIONS = [0, 1, 2, 3, 4, 5, 6];

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
  onUpdateSettings: React.Dispatch<React.SetStateAction<ExerciseSettings>>;
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

export default function SetupScreen({ onBack, onUpdateSettings, rangeStart, rangeEnd, rootChroma = 0, scaleId = 0, keySignatureMode = 0, silenceThreshold = 0.003, framesToConfirm = 3, warmupFrames = 4, instrumentIndex = 0 }: Props) {
  const set = <K extends keyof ExerciseSettings>(key: K, value: ExerciseSettings[K]) =>
    onUpdateSettings(prev => ({ ...prev, [key]: value }));

  const [hz, setHz] = useState(0);
  const [noteHistory, setNoteHistory] = useState<number[]>([]);
  const { start, stop, destroy } = useAudioCapture();

  const NOTE_STEP = 44;

  const handleFrame = useCallback(async (frame: TrackerFrame) => {
    setHz(frame.liveHz);
    if (frame.confirmedMidi >= 0) {
      const midi = frame.confirmedMidi;
      if (midi >= rangeStart && midi <= rangeEnd) {
        setNoteHistory(prev => {
          const next = [...prev, midi];
          if (next.length > 8) next.shift();
          return next;
        });
      }
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
  const displayHistory = noteHistory.map(transpMidi);
  const instrKeyTranspose = ((transpSemitones % 12) + 12) % 12;
  const effChroma = (effectiveKeyChroma(rootChroma, scaleId) + instrKeyTranspose) % 12;

  return (
    <div className="screen">
      <div className="screen-header">
        <button className="btn-back" onClick={onBack}>{'←'} Back</button>
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

      {/* The pitch meter alone carries "what's being detected right now" below the
          staff — the large note-name/Hz text that used to sit here was removed to
          make room for the always-visible Pitch Detection controls, without this
          screen needing to scroll. */}
      <div className="pitch-meter-circle">
        <PitchMeter hz={hz} />
      </div>

      <div style={{ marginTop: 16 }}>
        <span className="section-label" style={{ marginTop: 0 }}>Mic Sensitivity<TooltipIcon tooltipKey="mic_sensitivity" /></span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <input type="range" min={1} max={10} step={1}
            value={Math.round((0.011 - silenceThreshold) / 0.001)}
            onChange={e => set('silenceThreshold', parseFloat((0.011 - parseInt(e.target.value) * 0.001).toFixed(3)))}
            style={{ flex: 1 }} />
          <span style={{ minWidth: 40, fontSize: 13, color: '#212121' }}>{Math.round((0.011 - silenceThreshold) / 0.001)} / 10</span>
        </div>

        <span className="section-label">Note Stability (frames to confirm)<TooltipIcon tooltipKey="note_stability" /></span>
        <div className="chip-row">
          {STABILITY_OPTIONS.map(n => (
            <button key={n} type="button"
              className={`chip ${framesToConfirm === n ? 'chip-selected' : ''}`}
              onClick={() => set('framesToConfirm', n)}>{n}</button>
          ))}
        </div>

        <span className="section-label">Mic Warmup Frames<TooltipIcon tooltipKey="mic_warmup_frames" /></span>
        <div className="chip-row">
          {WARMUP_OPTIONS.map(n => (
            <button key={n} type="button"
              className={`chip ${warmupFrames === n ? 'chip-selected' : ''}`}
              onClick={() => set('warmupFrames', n)}>{n}</button>
          ))}
        </div>
      </div>
    </div>
  );
}
