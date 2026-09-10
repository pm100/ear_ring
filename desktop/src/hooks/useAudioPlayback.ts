import { useRef, useCallback } from 'react';
import { getCachedSample, putCachedSample } from '../sampleCache';

const SAMPLE_MIDIS = [21,24,27,30,33,36,39,42,45,48,51,54,57,60,63,66,69,72,75,78,81,84,87,90,93,96,99,102,105,108];
const SAMPLE_NAMES: Record<number, string> = {
  21:'A0', 24:'C1', 27:'Ds1', 30:'Fs1', 33:'A1', 36:'C2', 39:'Ds2', 42:'Fs2',
  45:'A2', 48:'C3', 51:'Ds3', 54:'Fs3', 57:'A3', 60:'C4', 63:'Ds4', 66:'Fs4',
  69:'A4', 72:'C5', 75:'Ds5', 78:'Fs5', 81:'A5', 84:'C6', 87:'Ds6', 90:'Fs6',
  93:'A6', 96:'C7', 99:'Ds7', 102:'Fs7', 105:'A7', 108:'C8'
};

function nearestSample(midi: number): number {
  let best = SAMPLE_MIDIS[0];
  let bestDist = Math.abs(midi - best);
  for (const m of SAMPLE_MIDIS) {
    const d = Math.abs(midi - m);
    if (d < bestDist) { bestDist = d; best = m; }
  }
  return best;
}

// The Salamander piano samples play back at whatever level they were recorded/normalized
// at, with no headroom applied — reported as too quiet by testers. This boosts everything
// (notes and the pass/fail chime alike) by a fixed amount post-mix, via a single shared
// gain stage, rather than per-source — that way a chord's several simultaneous notes get
// boosted exactly like a single note, not stacked on top of each other. ~+6dB.
const NOTE_GAIN_BOOST = 2.0;

export function useAudioPlayback() {
  const contextRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const bufferCache = useRef<Map<number, AudioBuffer>>(new Map());
  const cancelRef = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);

  const getContext = useCallback(() => {
    if (!contextRef.current || contextRef.current.state === 'closed') {
      contextRef.current = new AudioContext();
      masterGainRef.current = null; // stale gain node from a closed context
    }
    return contextRef.current;
  }, []);

  // All playback (notes and chime) connects here instead of straight to ctx.destination.
  const getMasterGain = useCallback((ctx: AudioContext) => {
    if (!masterGainRef.current) {
      const gain = ctx.createGain();
      gain.gain.value = NOTE_GAIN_BOOST;
      gain.connect(ctx.destination);
      masterGainRef.current = gain;
    }
    return masterGainRef.current;
  }, []);

  const loadSample = useCallback(async (midi: number): Promise<AudioBuffer | null> => {
    const sampleMidi = nearestSample(midi);
    if (bufferCache.current.has(sampleMidi)) {
      return bufferCache.current.get(sampleMidi)!;
    }
    const name = SAMPLE_NAMES[sampleMidi];
    try {
      const ctx = getContext();

      // Persistent cache (IndexedDB) survives app restarts, unlike the in-memory
      // Map above which only survives this session (issue #29).
      const cached = await getCachedSample(name);
      if (cached) {
        const audioBuffer = await ctx.decodeAudioData(cached);
        bufferCache.current.set(sampleMidi, audioBuffer);
        return audioBuffer;
      }

      const url = `https://tonejs.github.io/audio/salamander/${name}.mp3`;
      const response = await fetch(url);
      const arrayBuffer = await response.arrayBuffer();
      // Persist before decoding — decodeAudioData transfers/detaches the buffer
      // it's given, so the cache write must happen on the still-intact bytes.
      await putCachedSample(name, arrayBuffer.slice(0));
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
      bufferCache.current.set(sampleMidi, audioBuffer);
      return audioBuffer;
    } catch (e) {
      console.error('Failed to load sample', name, e);
      return null;
    }
  }, [getContext]);

  const playNote = useCallback(async (midi: number) => {
    const sampleMidi = nearestSample(midi);
    const buffer = await loadSample(midi);
    if (!buffer) return;
    const ctx = getContext();
    if (ctx.state === 'suspended') await ctx.resume();
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = Math.pow(2, (midi - sampleMidi) / 12);
    source.connect(getMasterGain(ctx));
    activeSourcesRef.current.push(source);
    source.onended = () => {
      activeSourcesRef.current = activeSourcesRef.current.filter(s => s !== source);
    };
    source.start();
  }, [loadSample, getContext, getMasterGain]);

  const playChord = useCallback(async (midis: number[], holdMs = 600) => {
    // Clear any residual notes from a previous test (they've had time to decay)
    // and cancel any pending sequence timeout before starting fresh.
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    activeSourcesRef.current.forEach(source => {
      try { source.stop(); } catch { /* already stopped */ }
    });
    activeSourcesRef.current = [];
    cancelRef.current = false;
    const ctx = getContext();
    if (ctx.state === 'suspended') await ctx.resume();
    const loaded = await Promise.all(midis.map(async midi => {
      const sampleMidi = nearestSample(midi);
      const buffer = await loadSample(midi);
      return buffer ? { midi, sampleMidi, buffer } : null;
    }));
    if (cancelRef.current) return;
    loaded.filter((item): item is NonNullable<typeof item> => item !== null).forEach(item => {
      const source = ctx.createBufferSource();
      source.buffer = item.buffer;
      source.playbackRate.value = Math.pow(2, (item.midi - item.sampleMidi) / 12);
      source.connect(getMasterGain(ctx));
      activeSourcesRef.current.push(source);
      source.onended = () => {
        activeSourcesRef.current = activeSourcesRef.current.filter(s => s !== source);
      };
      source.start();
    });
    await new Promise(resolve => {
      timeoutRef.current = setTimeout(resolve, holdMs);
    });
  }, [getContext, loadSample, getMasterGain]);

  // Short synthesized tones for test pass/fail feedback — plain oscillators, not the
  // sampled piano, so they play instantly with no network/sample-load dependency.
  // note: MIDI number, startSec: offset from now, durationSec: how long it rings.
  const playChime = useCallback((notes: { note: number; startSec: number; durationSec: number }[]) => {
    const ctx = getContext();
    if (ctx.state === 'suspended') void ctx.resume();
    const now = ctx.currentTime;
    notes.forEach(({ note, startSec, durationSec }) => {
      const freq = 440 * Math.pow(2, (note - 69) / 12);
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      osc.connect(gain);
      gain.connect(getMasterGain(ctx));
      const t0 = now + startSec;
      const t1 = t0 + durationSec;
      // Quick linear fade in/out avoids the click a hard on/off edge would cause.
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(0.35, t0 + 0.015);
      gain.gain.linearRampToValueAtTime(0, t1);
      osc.start(t0);
      osc.stop(t1 + 0.02);
    });
  }, [getContext, getMasterGain]);

  // Bright ascending major arpeggio (C6 E6 G6) — a test passed.
  const playPassSound = useCallback(() => {
    playChime([
      { note: 84, startSec: 0.00, durationSec: 0.11 },
      { note: 88, startSec: 0.09, durationSec: 0.11 },
      { note: 91, startSec: 0.18, durationSec: 0.16 },
    ]);
  }, [playChime]);

  // Soft descending major third (A4 F4) — a test failed. Lower register and a falling
  // contour make it easy to tell apart from the pass chime by ear alone.
  const playFailSound = useCallback(() => {
    playChime([
      { note: 69, startSec: 0.00, durationSec: 0.14 },
      { note: 65, startSec: 0.12, durationSec: 0.22 },
    ]);
  }, [playChime]);

  const cancelPlayback = useCallback(() => {
    cancelRef.current = true;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    activeSourcesRef.current.forEach(source => {
      try {
        source.stop();
      } catch {
        // source may already be stopped
      }
    });
    activeSourcesRef.current = [];
  }, []);

  const playSequence = useCallback(async (
    midis: number[],
    onEach: (index: number) => void,
    onDone: () => void,
    bpm = 100,
    durations?: number[],
    timings?: [number, number][]   // [[hold_ms, step_ms], ...] from cmd_sequence_timings
  ) => {
    cancelRef.current = false;
    await Promise.all(midis.map(m => loadSample(m)));

    const ctx = getContext();
    if (ctx.state === 'suspended') await ctx.resume();

    let i = 0;
    const playNext = async () => {
      if (cancelRef.current || i >= midis.length) {
        if (!cancelRef.current) onDone();
        return;
      }
      const beatDuration = durations?.[i] ?? 1.0;
      let stepMs: number;
      let holdMs: number;
      if (timings && timings[i]) {
        [holdMs, stepMs] = timings[i];
      } else {
        stepMs = Math.max(150, Math.round(60000 / Math.max(1, bpm) * beatDuration));
        holdMs = Math.round(stepMs * 0.88);
      }
      onEach(i);

      const sampleMidi = nearestSample(midis[i]);
      const buffer = bufferCache.current.get(sampleMidi);
      if (buffer && !cancelRef.current) {
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.playbackRate.value = Math.pow(2, (midis[i] - sampleMidi) / 12);
        source.connect(getMasterGain(ctx));
        activeSourcesRef.current.push(source);
        source.onended = () => {
          activeSourcesRef.current = activeSourcesRef.current.filter(s => s !== source);
        };
        source.start();
        // Cut off at hold_ms using the Web Audio clock for sample-accurate articulation
        source.stop(ctx.currentTime + holdMs / 1000);
      }
      i++;
      timeoutRef.current = setTimeout(playNext, stepMs);
    };
    await playNext();
  }, [loadSample, getContext, getMasterGain]);

  return { playNote, playChord, playSequence, playPassSound, playFailSound, cancelPlayback };
}
