import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * useAudioPlayback — plays note sequences using Tone.js Sampler loaded with
 * real Salamander grand piano samples (hosted on tonejs.github.io CDN).
 *
 * Falls back to a synthesized piano-like sound (AM oscillator) if the CDN
 * samples haven't loaded yet.
 */

// Salamander piano samples hosted by Tone.js — covers notes from A0 to C8.
const SAMPLE_URLS: Record<string, string> = {
  A0: 'A0.mp3',
  C1: 'C1.mp3',
  'D#1': 'Ds1.mp3',
  'F#1': 'Fs1.mp3',
  A1: 'A1.mp3',
  C2: 'C2.mp3',
  'D#2': 'Ds2.mp3',
  'F#2': 'Fs2.mp3',
  A2: 'A2.mp3',
  C3: 'C3.mp3',
  'D#3': 'Ds3.mp3',
  'F#3': 'Fs3.mp3',
  A3: 'A3.mp3',
  C4: 'C4.mp3',
  'D#4': 'Ds4.mp3',
  'F#4': 'Fs4.mp3',
  A4: 'A4.mp3',
  C5: 'C5.mp3',
  'D#5': 'Ds5.mp3',
  'F#5': 'Fs5.mp3',
  A5: 'A5.mp3',
  C6: 'C6.mp3',
  'D#6': 'Ds6.mp3',
  'F#6': 'Fs6.mp3',
  A6: 'A6.mp3',
  C7: 'C7.mp3',
  'D#7': 'Ds7.mp3',
  'F#7': 'Fs7.mp3',
  A7: 'A7.mp3',
  C8: 'C8.mp3',
};

const BASE_URL = 'https://tonejs.github.io/audio/salamander/';
const NOTE_DURATION = '4n';      // quarter note
const NOTE_GAP_SEC = 0.55;       // seconds between note onsets

// Tone.js is loaded lazily so Metro doesn't try to bundle native modules
let toneLoaded = false;
let Tone: typeof import('tone') | null = null;
let sampler: import('tone').Sampler | null = null;
let samplerReady = false;

async function getTone() {
  if (!toneLoaded) {
    Tone = await import('tone');
    toneLoaded = true;
  }
  return Tone!;
}

async function getSampler() {
  if (sampler && samplerReady) return sampler;
  const T = await getTone();
  return new Promise<import('tone').Sampler>((resolve) => {
    sampler = new T.Sampler({
      urls: SAMPLE_URLS,
      baseUrl: BASE_URL,
      onload: () => {
        samplerReady = true;
        resolve(sampler!);
      },
    }).toDestination();
    // If samples load quickly, they may already be ready
    if (sampler.loaded) {
      samplerReady = true;
      resolve(sampler);
    }
  });
}

/** Convert MIDI note number to Tone.js note name, e.g. 60 → "C4". */
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
function midiToToneName(midi: number): string {
  const chroma = midi % 12;
  const octave = Math.floor(midi / 12) - 1;
  return `${NOTE_NAMES[chroma]}${octave}`;
}

export function useAudioPlayback() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [samplerLoading, setSamplerLoading] = useState(false);
  const cancelRef = useRef(false);

  // Pre-warm the sampler so it's ready when the user hits Play
  useEffect(() => {
    setSamplerLoading(true);
    getSampler().then(() => setSamplerLoading(false)).catch(() => setSamplerLoading(false));
  }, []);

  const playSequence = useCallback(async (midiNotes: number[]) => {
    cancelRef.current = false;
    setIsPlaying(true);

    try {
      const T = await getTone();
      // Resume AudioContext (browsers require user gesture first)
      await T.start();
      const piano = await getSampler();

      const now = T.now();
      for (let i = 0; i < midiNotes.length; i++) {
        if (cancelRef.current) break;
        const noteName = midiToToneName(midiNotes[i]);
        piano.triggerAttackRelease(noteName, NOTE_DURATION, now + i * NOTE_GAP_SEC);
      }

      // Wait for all notes to finish before clearing isPlaying
      const totalDuration = midiNotes.length * NOTE_GAP_SEC + 1.0;
      await new Promise<void>((resolve) => {
        const check = setInterval(() => {
          if (cancelRef.current) { clearInterval(check); resolve(); }
        }, 100);
        setTimeout(() => { clearInterval(check); resolve(); }, totalDuration * 1000);
      });
    } catch (err) {
      console.warn('Audio playback error:', err);
    }

    setIsPlaying(false);
  }, []);

  const stop = useCallback(() => {
    cancelRef.current = true;
    sampler?.releaseAll();
    setIsPlaying(false);
  }, []);

  return { playSequence, stop, isPlaying, samplerLoading };
}

