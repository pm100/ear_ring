import { useRef, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/tauri';

export function useAudioCapture() {
  const streamRef = useRef<MediaStream | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const callbackRef = useRef<((hz: number) => void) | null>(null);

  const start = useCallback(async (onHz: (hz: number) => void) => {
    try {
      callbackRef.current = onHz;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const context = new AudioContext({ sampleRate: 44100 });
      contextRef.current = context;

      const source = context.createMediaStreamSource(stream);
      sourceRef.current = source;

      const processor = context.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = async (event) => {
        const channelData = event.inputBuffer.getChannelData(0);
        const samples = Array.from(channelData);
        try {
          const hz = await invoke<number>('cmd_detect_pitch', {
            samples,
            sampleRate: 44100,
          });
          if (callbackRef.current) {
            callbackRef.current(hz);
          }
        } catch (_e) {
          // ignore
        }
      };

      source.connect(processor);
      processor.connect(context.destination);
    } catch (e) {
      console.error('useAudioCapture start error', e);
    }
  }, []);

  const stop = useCallback(() => {
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

  return { start, stop };
}
