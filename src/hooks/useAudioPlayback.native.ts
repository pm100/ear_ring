import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import type { AudioPlayer } from 'expo-audio';
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * useAudioPlayback — native (Android/iOS) implementation using expo-audio.
 *
 * Streams Salamander piano samples from the CDN via createAudioPlayer.
 * Pitch-shifts playback rate (2^(Δsemitones/12)) with shouldCorrectPitch=false
 * so the pitch changes along with the speed.
 *
 * Metro resolves this file over useAudioPlayback.ts on native builds.
 */

const BASE_URL = 'https://tonejs.github.io/audio/salamander/';
const NOTE_GAP_MS = 600;

// Available samples and their MIDI numbers
const SAMPLES: [string, number][] = [
  ['A0', 21], ['C1', 24], ['Ds1', 27], ['Fs1', 30],
  ['A1', 33], ['C2', 36], ['Ds2', 39], ['Fs2', 42],
  ['A2', 45], ['C3', 48], ['Ds3', 51], ['Fs3', 54],
  ['A3', 57], ['C4', 60], ['Ds4', 63], ['Fs4', 66],
  ['A4', 69], ['C5', 72], ['Ds5', 75], ['Fs5', 78],
  ['A5', 81], ['C6', 84], ['Ds6', 87], ['Fs6', 90],
  ['A6', 93], ['C7', 96], ['Ds7', 99], ['Fs7', 102],
  ['A7', 105], ['C8', 108],
];

function nearestSample(midi: number): { url: string; semitones: number } {
  let best = SAMPLES[0];
  let bestDist = Infinity;
  for (const s of SAMPLES) {
    const d = Math.abs(s[1] - midi);
    if (d < bestDist) { bestDist = d; best = s; }
  }
  return { url: `${BASE_URL}${best[0]}.mp3`, semitones: midi - best[1] };
}

// Module-level cache — players survive re-renders
const playerCache = new Map<number, AudioPlayer>();

async function getPlayer(midi: number): Promise<AudioPlayer> {
  const cached = playerCache.get(midi);
  if (cached) {
    await cached.seekTo(0);
    return cached;
  }
  const { url, semitones } = nearestSample(midi);
  const player = createAudioPlayer({ uri: url });
  // Disable pitch correction so rate change = pitch change (2^(Δsemitones/12))
  player.shouldCorrectPitch = false;
  if (semitones !== 0) {
    player.setPlaybackRate(Math.pow(2, semitones / 12));
  }
  // Wait up to 8s for the audio to load
  if (!player.isLoaded) {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Audio load timeout')), 8000);
      const sub = player.addListener('playbackStatusUpdate', (status) => {
        if (status.isLoaded) {
          clearTimeout(timeout);
          sub.remove();
          resolve();
        }
      });
    });
  }
  playerCache.set(midi, player);
  return player;
}

export function useAudioPlayback() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [samplerLoading, setSamplerLoading] = useState(false);
  const cancelRef = useRef(false);

  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: false }).catch(() => {});
  }, []);

  const playSequence = useCallback(async (midiNotes: number[]) => {
    if (midiNotes.length === 0) return;
    cancelRef.current = false;
    setIsPlaying(true);
    setSamplerLoading(true);

    try {
      // Preload all notes in parallel before playback starts
      const players = await Promise.all(midiNotes.map(getPlayer));
      setSamplerLoading(false);

      for (let i = 0; i < players.length; i++) {
        if (cancelRef.current) break;
        await players[i].seekTo(0);
        players[i].play();

        if (i < players.length - 1) {
          // Interruptible gap
          await new Promise<void>((resolve) => {
            const t = setTimeout(resolve, NOTE_GAP_MS);
            const iv = setInterval(() => {
              if (cancelRef.current) { clearTimeout(t); clearInterval(iv); resolve(); }
            }, 50);
            setTimeout(() => clearInterval(iv), NOTE_GAP_MS + 100);
          });
        }
      }
      // Let last note ring
      if (!cancelRef.current) {
        await new Promise<void>((r) => setTimeout(r, 1000));
      }
    } catch (err) {
      console.warn('Native audio playback error:', err);
      setSamplerLoading(false);
    }

    setIsPlaying(false);
  }, []);

  const stop = useCallback(() => {
    cancelRef.current = true;
    setIsPlaying(false);
  }, []);

  return { playSequence, stop, isPlaying, samplerLoading };
}
