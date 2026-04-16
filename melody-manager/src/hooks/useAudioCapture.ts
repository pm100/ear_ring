import { useRef, useCallback, useState } from 'react';
import { invoke } from '@tauri-apps/api/tauri';

const SILENCE_RMS = 0.003;
const STABILITY_FRAMES = 3;

export interface CapturedNote {
  midi: number;
  label: string;
  startMs: number;   // performance.now() when confirmed
  durationMs: number; // set when next note confirmed or recording stops
}

export type CaptureState = 'idle' | 'recording' | 'stopped';

const NOTE_NAMES = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];

function freqToMidi(hz: number): number {
  return Math.round(69 + 12 * Math.log2(hz / 440));
}

function midiToLabel(midi: number): string {
  const pc = ((midi % 12) + 12) % 12;
  return NOTE_NAMES[pc] + String(Math.floor(midi / 12) - 1);
}

export function useAudioCapture() {
  const [captureState, setCaptureState] = useState<CaptureState>('idle');
  const [liveLabel, setLiveLabel] = useState<string | null>(null);
  const [notes, setNotes] = useState<CapturedNote[]>([]);

  const contextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const samplesRef = useRef<Float32Array>(new Float32Array(4096));
  const sampleRateRef = useRef(44100);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isRecordingRef = useRef(false);

  // Stability tracking — all hot-path state lives in refs
  const stableCountRef = useRef(0);
  const lastPcRef = useRef<number | null>(null);      // most recently seen pitch class
  const confirmedPcRef = useRef<number | null>(null); // last confirmed pitch class
  const notesRef = useRef<CapturedNote[]>([]);

  const start = useCallback(async () => {
    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      contextRef.current = new AudioContext();
      sampleRateRef.current = contextRef.current.sampleRate;

      const source = contextRef.current.createMediaStreamSource(streamRef.current);
      // ScriptProcessorNode is deprecated but reliable on Tauri/WebView2
      const processor = contextRef.current.createScriptProcessor(4096, 1, 1);
      processor.onaudioprocess = (e: AudioProcessingEvent) => {
        samplesRef.current = new Float32Array(e.inputBuffer.getChannelData(0));
      };
      source.connect(processor);
      processor.connect(contextRef.current.destination);
      processorRef.current = processor;

      // Reset all state
      stableCountRef.current = 0;
      lastPcRef.current = null;
      confirmedPcRef.current = null;
      notesRef.current = [];
      isRecordingRef.current = true;
      setNotes([]);
      setLiveLabel(null);
      setCaptureState('recording');

      // Poll Rust detect_pitch every 100 ms
      intervalRef.current = setInterval(async () => {
        if (!isRecordingRef.current) return;
        const samples = samplesRef.current;

        // Silence gate
        let rms = 0;
        for (let i = 0; i < samples.length; i++) rms += samples[i] * samples[i];
        rms = Math.sqrt(rms / samples.length);
        if (rms < SILENCE_RMS) {
          stableCountRef.current = 0;
          lastPcRef.current = null;
          confirmedPcRef.current = null;
          setLiveLabel(null);
          return;
        }

        let freq: number | null;
        try {
          freq = await invoke<number | null>('cmd_detect_pitch', {
            samples: Array.from(samples),
            sampleRate: Math.round(sampleRateRef.current),
          });
        } catch {
          return;
        }
        if (!isRecordingRef.current || freq == null) return;

        const midi = freqToMidi(freq);
        const pc = ((midi % 12) + 12) % 12;
        setLiveLabel(midiToLabel(midi));

        if (pc === lastPcRef.current) {
          stableCountRef.current++;
          if (stableCountRef.current >= STABILITY_FRAMES && pc !== confirmedPcRef.current) {
            // Confirm new note
            const now = performance.now();
            // Close previous note's duration
            if (notesRef.current.length > 0) {
              const prev = notesRef.current[notesRef.current.length - 1];
              if (prev.durationMs === 0) prev.durationMs = now - prev.startMs;
            }
            const note: CapturedNote = { midi, label: midiToLabel(midi), startMs: now, durationMs: 0 };
            notesRef.current = [...notesRef.current, note];
            setNotes([...notesRef.current]);
            confirmedPcRef.current = pc;
          }
        } else {
          // Pitch class changed — reset stability; allow the same pitch class again
          stableCountRef.current = 1;
          lastPcRef.current = pc;
          confirmedPcRef.current = null;
        }
      }, 100);
    } catch (e) {
      console.error('Mic access failed:', e);
    }
  }, []);

  const stop = useCallback(() => {
    isRecordingRef.current = false;
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    // Close last note
    if (notesRef.current.length > 0) {
      const last = notesRef.current[notesRef.current.length - 1];
      if (last.durationMs === 0) {
        last.durationMs = performance.now() - last.startMs;
        setNotes([...notesRef.current]);
      }
    }
    processorRef.current?.disconnect();
    streamRef.current?.getTracks().forEach(t => t.stop());
    if (contextRef.current && contextRef.current.state !== 'closed') contextRef.current.close();
    setLiveLabel(null);
    setCaptureState('stopped');
  }, []);

  const resetCapture = useCallback(() => {
    setCaptureState('idle');
    setNotes([]);
    setLiveLabel(null);
    notesRef.current = [];
    stableCountRef.current = 0;
    lastPcRef.current = null;
    confirmedPcRef.current = null;
  }, []);

  return { captureState, liveLabel, notes, start, stop, resetCapture };
}
