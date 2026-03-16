import React, { useState, useCallback, useEffect } from 'react';
import PitchMeter from './PitchMeter';
import MusicStaff from './MusicStaff';
import { useAudioCapture } from '../hooks/useAudioCapture';
import { freqToMidi } from '../music';

interface Props {
  onBack: () => void;
  rangeStart: number;
  rangeEnd: number;
}


export default function SetupScreen({ onBack, rangeStart, rangeEnd }: Props) {
  const [hz, setHz] = useState(0);
  const [currentMidi, setCurrentMidi] = useState<number>(-1);
  const [noteHistory, setNoteHistory] = useState<number[]>([]);
  const [listening, setListening] = useState(false);
  const frameNotesRef = React.useRef<number[]>([]);
  const lastAddedMidiRef = React.useRef<number>(-1);
  const { start, stop } = useAudioCapture();

  const NOTE_STEP = 44;
  const midiMin = rangeStart;
  const midiMax = rangeEnd;

  const handleHz = useCallback(async (detectedHz: number) => {
    setHz(detectedHz);
    if (detectedHz > 0) {
      const midi = freqToMidi(detectedHz);
      if (midi >= 0) {
        const pitchClass = midi % 12;
        frameNotesRef.current.push(pitchClass);
        if (frameNotesRef.current.length > 3) frameNotesRef.current.shift();
        const last = frameNotesRef.current;
        if (last.length === 3 && last[0] === last[1] && last[1] === last[2]) {
          if (midi < midiMin || midi > midiMax) return;
          setCurrentMidi(midi);
          if (midi !== lastAddedMidiRef.current) {
            setNoteHistory(prev => {
              const next = [...prev, midi];
              if (next.length > 8) next.shift();
              return next;
            });
            lastAddedMidiRef.current = midi;
          }
        }
      }
    } else {
      frameNotesRef.current = [];
      setCurrentMidi(-1);
    }
  }, []);

  const startListening = useCallback(() => {
    setListening(true);
    start(handleHz);
  }, [start, handleHz]);

  const stopListening = useCallback(() => {
    stop();
    setListening(false);
    setHz(0);
    setCurrentMidi(-1);
    setNoteHistory([]);
    lastAddedMidiRef.current = -1;
    frameNotesRef.current = [];
  }, [stop]);

  useEffect(() => {
    return () => stop();
  }, [stop]);

  return (
    <div className="screen">
      <div className="screen-header">
        <button className="btn-back" onClick={onBack}>{'\u2190'} Back</button>
        <span className="screen-title">Mic Setup</span>
      </div>

      <p className="setup-instruction">Sing or play a note to test your microphone.</p>

      <MusicStaff
        notes={noteHistory.map((midi, index) => ({
          midi,
          state: index === noteHistory.length - 1 ? 'active' : 'expected',
        }))}
        fixedSpacing={NOTE_STEP}
      />

      <div className="pitch-meter-circle">
        <PitchMeter hz={hz} />
      </div>

      {listening ? (
        <button className="btn-danger" onClick={stopListening}>{'\u23f9'} Stop</button>
      ) : (
        <button className="btn-primary" onClick={startListening}>{'\uD83C\uDF99'} Start Listening</button>
      )}
    </div>
  );
}
