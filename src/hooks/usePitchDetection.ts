import { useCallback, useEffect, useRef, useState } from 'react';
import { NativeEventEmitter, NativeModules, PermissionsAndroid, Platform } from 'react-native';

export interface PitchResult {
  hz: number;
  midi: number;
  cents: number;
  confidence: 'high' | 'low';
}

const BUFFER_SIZE = 4096;
const STABILITY_MS = 450;    // how long a pitch must be stable before firing onNote
const SILENCE_RMS = 0.003;
const SILENCE_HOLD_MS = 250; // how long silence must last to end the current note
// How many consecutive audio frames a *different* pitch must persist before we
// reset the stability timer.  One frame ≈ 4096/44100 ≈ 93 ms on Android.
// Setting this to 2 means a brief single-frame glitch/harmonic won't derail detection.
const GLITCH_FRAMES = 2;

async function getCoreModule() {
  if (Platform.OS === 'web') {
    return import('../native/CoreBridge.web');
  }
  return import('../native/CoreBridge');
}

/** Decode a base64-encoded little-endian Float32 buffer. */
function decodeFloat32Base64(b64: string, count: number): Float32Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Float32Array(bytes.buffer, 0, count);
}

// RMS level below which we treat the buffer as silence
const SILENCE_RMS_THRESH = SILENCE_RMS;

export function usePitchDetection(onNote: (result: PitchResult) => void) {
  const [isListening, setIsListening] = useState(false);
  const [currentHz, setCurrentHz] = useState(0);
  const stopRef = useRef<(() => void) | null>(null);
  const onNoteRef = useRef(onNote);
  useEffect(() => { onNoteRef.current = onNote; }, [onNote]);

  const startListening = useCallback(async () => {
    setIsListening(true);
    const core = await getCoreModule();

    // ── Shared pitch processing state ──────────────────────────────────────
    let lastMidi = -1;       // MIDI of the note currently being tracked
    let stableStart = 0;     // timestamp when lastMidi first became stable
    let reported = false;    // true once onNote has fired for lastMidi
    let silenceStart = 0;    // timestamp when silence began (0 = not silent)
    let potentialMidi = -1;  // candidate next note seen while reported=true
    let potentialStart = 0;  // timestamp when potentialMidi was first seen
    // Glitch filtering: track how many consecutive frames show a *different* pitch
    // before we commit to treating it as a real pitch change.
    let otherMidi = -1;      // the different pitch we're seeing
    let otherFrames = 0;     // consecutive frames of otherMidi

    function processSamples(buf: Float32Array, sampleRate: number) {
      let rms = 0;
      for (let i = 0; i < buf.length; i++) rms += buf[i] * buf[i];
      rms = Math.sqrt(rms / buf.length);

      // ── Silence ─────────────────────────────────────────────────────────
      if (rms < SILENCE_RMS_THRESH) {
        setCurrentHz(0);
        if (silenceStart === 0) silenceStart = Date.now();
        if (Date.now() - silenceStart >= SILENCE_HOLD_MS) {
          // Sustained silence → note ended; ready for a new note
          reported = false;
          lastMidi = -1;
          potentialMidi = -1;
          otherMidi = -1;
          otherFrames = 0;
        }
        return;
      }

      // Sound detected → reset silence timer
      silenceStart = 0;

      const hz = core.detectPitch(buf, sampleRate);
      setCurrentHz(hz > 0 ? hz : 0);
      if (hz <= 0) return;

      const noteResult = core.freqToNote(hz);
      if (!noteResult) return;
      const { midi, cents } = noteResult;

      if (!reported) {
        // ── Waiting for first stable note ──────────────────────────────────
        if (midi === lastMidi) {
          // Still on the same pitch — clear any glitch tracking
          otherMidi = -1;
          otherFrames = 0;
        } else {
          // Different pitch detected; apply glitch filter before resetting
          if (midi === otherMidi) {
            otherFrames++;
          } else {
            otherMidi = midi;
            otherFrames = 1;
          }
          if (otherFrames >= GLITCH_FRAMES) {
            // Sustained different pitch → treat as real note change
            lastMidi = midi;
            stableStart = Date.now();
            otherMidi = -1;
            otherFrames = 0;
          }
        }
        if (lastMidi === midi && Date.now() - stableStart >= STABILITY_MS) {
          reported = true;
          potentialMidi = -1;
          onNoteRef.current({ hz, midi, cents, confidence: Math.abs(cents) <= 30 ? 'high' : 'low' });
        }
      } else {
        // ── Note already reported; watch for a genuinely new stable pitch ──
        if (midi === lastMidi) {
          // Still on the same note — reset any candidate we were tracking
          potentialMidi = -1;
          otherMidi = -1;
          otherFrames = 0;
        } else {
          // Different MIDI: apply glitch filter before starting stability timer
          if (midi === otherMidi) {
            otherFrames++;
          } else {
            otherMidi = midi;
            otherFrames = 1;
          }
          if (otherFrames >= GLITCH_FRAMES) {
            // Committed to a new pitch — start tracking it as potential next note
            if (midi !== potentialMidi) {
              potentialMidi = midi;
              potentialStart = Date.now();
            } else if (Date.now() - potentialStart >= STABILITY_MS) {
              // New pitch is stable — accept it as the next note
              reported = false;
              lastMidi = midi;
              stableStart = potentialStart;
              potentialMidi = -1;
              otherMidi = -1;
              otherFrames = 0;
              // reported=false → will fire onNote on next call after stableStart check
            }
          }
        }
      }
    }

    // ── Web: Web Audio API ─────────────────────────────────────────────────
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.AudioContext) {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      } catch (err) {
        console.error('Microphone permission denied or unavailable:', err);
        setIsListening(false);
        return;
      }
      const ctx = new window.AudioContext();
      const actualRate = ctx.sampleRate;
      const source = ctx.createMediaStreamSource(stream);
      const processor = ctx.createScriptProcessor(BUFFER_SIZE, 1, 1);
      source.connect(processor);
      const gainNode = ctx.createGain();
      gainNode.gain.value = 0;
      processor.connect(gainNode);
      gainNode.connect(ctx.destination);
      processor.onaudioprocess = (e: AudioProcessingEvent) => {
        processSamples(e.inputBuffer.getChannelData(0), actualRate);
      };
      stopRef.current = () => {
        processor.disconnect();
        gainNode.disconnect();
        source.disconnect();
        stream.getTracks().forEach((t: MediaStreamTrack) => t.stop());
        ctx.close();
      };

    // ── Android: AudioCapture native module ────────────────────────────────
    } else if (Platform.OS === 'android') {
      const SAMPLE_RATE = 44100;
      const AudioCapture = NativeModules.AudioCapture;
      if (!AudioCapture) {
        console.error('AudioCapture native module not found');
        setIsListening(false);
        return;
      }
      // Request RECORD_AUDIO permission at runtime
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
        {
          title: 'Microphone Permission',
          message: 'Ear Ring needs your microphone to detect the notes you play.',
          buttonPositive: 'Allow',
        }
      );
      if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
        console.error('RECORD_AUDIO permission denied');
        setIsListening(false);
        return;
      }
      const emitter = new NativeEventEmitter(AudioCapture);
      const subscription = emitter.addListener(
        'onAudioData',
        ({ data, sampleRate, count }: { data: string; sampleRate: number; count: number }) => {
          const samples = decodeFloat32Base64(data, count);
          processSamples(samples, sampleRate);
        }
      );
      await AudioCapture.startRecording(SAMPLE_RATE, BUFFER_SIZE);
      stopRef.current = async () => {
        subscription.remove();
        await AudioCapture.stopRecording();
      };

    // ── iOS / other: stub ──────────────────────────────────────────────────
    } else {
      console.warn('Pitch detection not implemented on this platform.');
      stopRef.current = () => {};
    }
  }, []);

  const stopListening = useCallback(() => {
    const stop = stopRef.current;
    stopRef.current = null;
    if (stop) Promise.resolve(stop()).catch(() => {});
    setIsListening(false);
    setCurrentHz(0);
  }, []);

  useEffect(() => {
    return () => { stopRef.current?.(); };
  }, []);

  // ── Simulate a pitch for testing (feeds synthetic sine wave through the
  //    same detection pipeline without needing a physical microphone) ────────
  const simulatePitch = useCallback(async (freq: number, durationMs = 2000) => {
    const core = await getCoreModule();
    const SAMPLE_RATE = 44100;

    // Own copy of the state machine (same logic as processSamples above)
    let lastMidi = -1;
    let stableStart = 0;
    let reported = false;
    let silenceStart = 0;
    let potentialMidi = -1;
    let potentialStart = 0;
    let otherMidi = -1;
    let otherFrames = 0;

    function processSim(buf: Float32Array) {
      let rms = 0;
      for (let i = 0; i < buf.length; i++) rms += buf[i] * buf[i];
      rms = Math.sqrt(rms / buf.length);
      if (rms < SILENCE_RMS_THRESH) { silenceStart = silenceStart || Date.now(); return; }
      silenceStart = 0;
      const hz = core.detectPitch(buf, SAMPLE_RATE);
      setCurrentHz(hz > 0 ? hz : 0);
      if (hz <= 0) return;
      const noteResult = core.freqToNote(hz);
      if (!noteResult) return;
      const { midi, cents } = noteResult;
      if (!reported) {
        if (midi === lastMidi) { otherMidi = -1; otherFrames = 0; }
        else {
          midi === otherMidi ? otherFrames++ : (otherMidi = midi, otherFrames = 1);
          if (otherFrames >= GLITCH_FRAMES) { lastMidi = midi; stableStart = Date.now(); otherMidi = -1; otherFrames = 0; }
        }
        if (lastMidi === midi && Date.now() - stableStart >= STABILITY_MS) {
          reported = true;
          onNoteRef.current({ hz, midi, cents, confidence: Math.abs(cents) <= 30 ? 'high' : 'low' });
        }
      }
    }

    const totalFrames = Math.ceil((durationMs / 1000) * SAMPLE_RATE / BUFFER_SIZE);
    let frame = 0;
    const intervalMs = (BUFFER_SIZE / SAMPLE_RATE) * 1000; // real-time pace ≈ 93ms
    const timer = setInterval(() => {
      if (frame >= totalFrames) { clearInterval(timer); setCurrentHz(0); return; }
      const buf = new Float32Array(BUFFER_SIZE);
      const t0 = frame * BUFFER_SIZE;
      for (let i = 0; i < BUFFER_SIZE; i++) {
        buf[i] = 0.5 * Math.sin(2 * Math.PI * freq * (t0 + i) / SAMPLE_RATE);
      }
      processSim(buf);
      frame++;
    }, intervalMs);
  }, []);

  return { startListening, stopListening, simulatePitch, isListening, currentHz };
}
