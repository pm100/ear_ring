import React, { useState, useCallback, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import PitchMeter from './PitchMeter';
import MusicStaff from './MusicStaff';
import { useAudioCapture } from '../hooks/useAudioCapture';

interface Props {
  onBack: () => void;
  octave: number;
}

const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];

export default function SetupScreen({ onBack, octave }: Props) {
  const [hz, setHz] = useState(0);
  const [noteName, setNoteName] = useState('');
  const [currentMidi, setCurrentMidi] = useState<number>(-1);
  const [noteHistory, setNoteHistory] = useState<number[]>([]);
  const [listening, setListening] = useState(false);
  const frameNotesRef = React.useRef<number[]>([]);
  const lastAddedMidiRef = React.useRef<number>(-1);
  const { start, stop } = useAudioCapture();

  const NOTE_STEP = 44;
  const midiMin = (octave + 1) * 12;
  const midiMax = midiMin + 23;

  const handleHz = useCallback(async (detectedHz: number) => {
    setHz(detectedHz);
    if (detectedHz > 0) {
      const midi = await invoke<number>('cmd_freq_to_midi', { hz: detectedHz });
      if (midi >= 0) {
        const pitchClass = midi % 12;
        frameNotesRef.current.push(pitchClass);
        if (frameNotesRef.current.length > 3) frameNotesRef.current.shift();
        const last = frameNotesRef.current;
        if (last.length === 3 && last[0] === last[1] && last[1] === last[2]) {
          const noteOctave = Math.floor(midi / 12) - 1;
          if (midi < midiMin || midi > midiMax) return;
          setNoteName(`${NOTE_NAMES[pitchClass]}${noteOctave}`);
          setCurrentMidi(midi);
          // Add to rolling history when note changes
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
      setNoteName('');
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
    setNoteName('');
    setCurrentMidi(-1);
    setNoteHistory([]);
    lastAddedMidiRef.current = -1;
    frameNotesRef.current = [];
  }, [stop]);

  useEffect(() => {
    return () => stop();
  }, [stop]);

  const active = hz > 0 && currentMidi >= 0;
  const staffSequence = currentMidi >= 0 ? [currentMidi] : [];

  return (
    <div className="screen">
      <div className="screen-header">
        <button className="btn-back" onClick={onBack}>{'\u2190'} Back</button>
        <span className="screen-title">Mic Setup</span>
      </div>

      <p className="setup-instruction">Sing or play a note to test your microphone.</p>

      <MusicStaff
        sequence={noteHistory}
        currentNoteIndex={noteHistory.length - 1}
        highlightIndex={noteHistory.length - 1}
        detected={[]}
        status={noteHistory.length > 0 ? 'listening' : 'idle'}
        fixedSpacing={NOTE_STEP}
      />

      <div
        className="setup-note-name"
        style={{ color: active ? 'var(--primary)' : 'var(--muted)' }}
      >
        {noteName}
      </div>

      <div className="setup-hz">
        {hz > 0 ? `${hz.toFixed(1)} Hz` : ''}
      </div>

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
