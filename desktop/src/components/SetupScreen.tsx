import React, { useState, useCallback, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import PitchMeter from './PitchMeter';
import MusicStaff from './MusicStaff';
import { useAudioCapture } from '../hooks/useAudioCapture';
import { freqToMidi, preferredMidiLabel } from '../music';

interface InstrumentInfo { id: number; name: string; semitones: number; }

interface Props {
  onBack: () => void;
  rangeStart: number;
  rangeEnd: number;
  rootChroma?: number;
  keySignatureMode?: number;
  silenceThreshold?: number;
  framesToConfirm?: number;
  warmupFrames?: number;
  instrumentIndex?: number;
}


export default function SetupScreen({ onBack, rangeStart, rangeEnd, rootChroma = 0, keySignatureMode = 0, silenceThreshold, framesToConfirm, warmupFrames = 4, instrumentIndex = 0 }: Props) {
  const [hz, setHz] = useState(0);
  const [currentMidi, setCurrentMidi] = useState<number>(-1);
  const [noteHistory, setNoteHistory] = useState<number[]>([]);
  const frameNotesRef = useRef<number[]>([]);
  const lastConfirmedMidiRef = useRef<number>(-1);
  const warmupCountRef = useRef<number>(warmupFrames);
  const { start, stop } = useAudioCapture();

  const NOTE_STEP = 44;
  const midiMin = rangeStart;
  const midiMax = rangeEnd;

  const handleHz = useCallback(async (detectedHz: number) => {
    setHz(detectedHz);
    if (detectedHz <= 0) {
      frameNotesRef.current = [];
      lastConfirmedMidiRef.current = -1;
      warmupCountRef.current = 0;
      return;
    }
    if (warmupCountRef.current > 0) {
      warmupCountRef.current--;
      return;
    }
    if (detectedHz > 0) {
      const midi = freqToMidi(detectedHz);
      if (midi >= 0) {
        const pitchClass = midi % 12;
        frameNotesRef.current.push(pitchClass);
        if (frameNotesRef.current.length > (framesToConfirm ?? 3)) frameNotesRef.current.shift();
        const last = frameNotesRef.current;
        if (last.length === (framesToConfirm ?? 3) && last[0] === last[1] && last[1] === last[2]) {
          if (midi < midiMin || midi > midiMax) return;
          setCurrentMidi(midi);
          // Only suppress re-confirm for a *sustained* note (same midi, no silence).
          // lastConfirmedMidiRef resets to -1 on silence so replaying the same
          // note after a break always appends again.
          if (midi !== lastConfirmedMidiRef.current) {
            lastConfirmedMidiRef.current = midi;
            setNoteHistory(prev => {
              const next = [...prev, midi];
              if (next.length > 8) next.shift();
              return next;
            });
          }
        }
      }
    }
  }, [midiMin, midiMax]);

  // Load instrument transposition semitones once
  const [transpSemitones, setTranspSemitones] = useState(0);
  useEffect(() => {
    invoke<string>('cmd_instrument_list')
      .then(json => {
        const list = JSON.parse(json) as InstrumentInfo[];
        setTranspSemitones(list[instrumentIndex]?.semitones ?? 0);
      })
      .catch(() => {});
  }, [instrumentIndex]);

  // Auto-start on entry, auto-stop on unmount
  useEffect(() => {
    start(handleHz, silenceThreshold);
    return () => stop();
  }, [start, stop, handleHz]);

  const transpMidi = (midi: number) => Math.max(0, Math.min(127, midi + transpSemitones));
  const displayMidi = currentMidi >= 0 ? transpMidi(currentMidi) : -1;
  const displayHistory = noteHistory.map(transpMidi);
  const noteLabel = displayMidi >= 0 ? preferredMidiLabel(displayMidi, rootChroma) : '—';
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
        rootChroma={rootChroma}
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

