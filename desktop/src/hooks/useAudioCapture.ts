import { useRef, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/tauri';

export function useAudioCapture() {
  const streamRef = useRef<MediaStream | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const callbackRef = useRef<((hz: number) => void) | null>(null);
  const activeRef = useRef(false);
  const detectInFlightRef = useRef(false);
  const silenceThresholdRef = useRef(0.003);

  // Create the AudioContext, MediaStream, and ScriptProcessor once.
  // Subsequent start/stop cycles reuse them to avoid expensive hardware
  // release/reacquire that causes transient noise and detection glitches.
  const ensureAudioPipeline = async (silenceThreshold: number) => {
    silenceThresholdRef.current = silenceThreshold;

    if (contextRef.current && contextRef.current.state !== 'closed' && streamRef.current) {
      if (contextRef.current.state === 'suspended') {
        await contextRef.current.resume();
      }
      return;
    }

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;

    const context = new AudioContext({ sampleRate: 44100 });
    contextRef.current = context;

    const source = context.createMediaStreamSource(stream);
    sourceRef.current = source;

    const processor = context.createScriptProcessor(4096, 1, 1);
    processorRef.current = processor;

    processor.onaudioprocess = async (event) => {
      if (!activeRef.current || detectInFlightRef.current) {
        return;
      }
      const channelData = event.inputBuffer.getChannelData(0);
      const samples = Array.from(channelData);
      detectInFlightRef.current = true;
      try {
        const hz = await invoke<number>('cmd_detect_pitch', {
          samples,
          sampleRate: 44100,
          silenceThreshold: silenceThresholdRef.current,
        });
        if (activeRef.current && callbackRef.current) {
          callbackRef.current(hz);
        }
      } catch (_e) {
        // ignore
      } finally {
        detectInFlightRef.current = false;
      }
    };

    source.connect(processor);
    processor.connect(context.destination);
  };

  const start = useCallback(async (onHz: (hz: number) => void, silenceThreshold?: number) => {
    try {
      callbackRef.current = onHz;
      detectInFlightRef.current = false;
      await ensureAudioPipeline(silenceThreshold ?? 0.003);
      activeRef.current = true;
    } catch (e) {
      console.error('useAudioCapture start error', e);
    }
  }, []);

  // Pause detection without releasing hardware. The ScriptProcessor callback
  // still fires but returns immediately when activeRef is false.
  const stop = useCallback(() => {
    activeRef.current = false;
    detectInFlightRef.current = false;
    callbackRef.current = null;
  }, []);

  // Fully release all audio resources. Call on component unmount.
  const destroy = useCallback(() => {
    activeRef.current = false;
    detectInFlightRef.current = false;
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
    if (contextRef.current) {
      contextRef.current.close();
      contextRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    callbackRef.current = null;
  }, []);

  return { start, stop, destroy };
}
