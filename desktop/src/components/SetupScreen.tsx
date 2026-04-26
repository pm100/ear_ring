import React, { useState, useCallback, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import PitchMeter from './PitchMeter';
import MusicStaff from './MusicStaff';
import { useAudioCapture, TrackerFrame } from '../hooks/useAudioCapture';
import { preferredMidiLabel } from '../music';

interface InstrumentInfo { id: number; name: string; semitones: number; }

function effectiveKeyChroma(rootChroma: number, _scaleId: number): number {
  return rootChroma;
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
  const [noteHistory, setNoteHistory] = useState<number[]>([]);
  const { start, stop, destroy } = useAudioCapture();

  const NOTE_STEP = 44;
  const midiMin = rangeStart;
  const midiMax = rangeEnd;

  const handleFrame = useCallback(async (frame: TrackerFrame) => {
    setHz(frame.liveHz);
    if (frame.confirmedMidi >= 0) {
      const midi = frame.confirmedMidi;
      if (midi >= midiMin && midi <= midiMax) {
        setCurrentMidi(midi);
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
  }, [midiMin, midiMax]);

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
  const displayMidi = currentMidi >= 0 ? transpMidi(currentMidi) : -1;
  const displayHistory = noteHistory.map(transpMidi);
  const instrKeyTranspose = ((transpSemitones % 12) + 12) % 12;
  const effChroma = (effectiveKeyChroma(rootChroma, scaleId) + instrKeyTranspose) % 12;
  const noteLabel = displayMidi >= 0 ? preferredMidiLabel(displayMidi, effChroma) : '—';
  const noteHz = currentMidi >= 0 ? (440 * Math.pow(2, (currentMidi - 69) / 12)) : null;

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

