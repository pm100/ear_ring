import { useRef, useCallback } from 'react';

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

export function useAudioPlayback() {
  const contextRef = useRef<AudioContext | null>(null);
  const bufferCache = useRef<Map<number, AudioBuffer>>(new Map());
  const cancelRef = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const getContext = useCallback(() => {
    if (!contextRef.current || contextRef.current.state === 'closed') {
      contextRef.current = new AudioContext();
    }
    return contextRef.current;
  }, []);

  const loadSample = useCallback(async (midi: number): Promise<AudioBuffer | null> => {
    const sampleMidi = nearestSample(midi);
    if (bufferCache.current.has(sampleMidi)) {
      return bufferCache.current.get(sampleMidi)!;
    }
    const name = SAMPLE_NAMES[sampleMidi];
    const url = `https://tonejs.github.io/audio/salamander/${name}.mp3`;
    try {
      const response = await fetch(url);
      const arrayBuffer = await response.arrayBuffer();
      const ctx = getContext();
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
    source.connect(ctx.destination);
    source.start();
  }, [loadSample, getContext]);

  const cancelPlayback = useCallback(() => {
    cancelRef.current = true;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  }, []);

  const playSequence = useCallback(async (
    midis: number[],
    onEach: (index: number) => void,
    onDone: () => void
  ) => {
    cancelRef.current = false;
    await Promise.all(midis.map(m => loadSample(m)));

    let i = 0;
    const playNext = async () => {
      if (cancelRef.current || i >= midis.length) {
        if (!cancelRef.current) onDone();
        return;
      }
      onEach(i);
      await playNote(midis[i]);
      i++;
      timeoutRef.current = setTimeout(playNext, 600);
    };
    await playNext();
  }, [loadSample, playNote]);

  return { playNote, playSequence, cancelPlayback };
}
