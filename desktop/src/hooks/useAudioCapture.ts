import { useRef, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/tauri';

export interface TrackerFrame {
  liveHz: number;
  liveMidi: number;
  confirmedMidi: number; // -1 means absent
}

export function useAudioCapture() {
  const streamRef = useRef<MediaStream | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const callbackRef = useRef<((frame: TrackerFrame) => void) | null>(null);
  const activeRef = useRef(false);
  const detectInFlightRef = useRef(false);
  // Queue the latest buffer when detection is in-flight instead of dropping it.
  // This prevents missed notes under CPU load.
  const pendingBufferRef = useRef<Float32Array | null>(null);

  const processBuffer = async (samples: Float32Array) => {
    try {
      const [liveHz, liveMidi, confirmedMidi] = await invoke<[number, number, number]>('cmd_tracker_process', {
        samples: Array.from(samples),
        sampleRate: 44100,
      });
      if (activeRef.current && callbackRef.current) {
        callbackRef.current({ liveHz, liveMidi, confirmedMidi });
      }
    } catch (_e) {
      // ignore
    }
    // Process any buffer that arrived while we were busy
    const queued = pendingBufferRef.current;
    pendingBufferRef.current = null;
    if (queued && activeRef.current) {
      await processBuffer(queued);
    }
  };

  // Create the AudioContext, MediaStream, and ScriptProcessor once.
  // Subsequent start/stop cycles reuse them to avoid expensive hardware
  // release/reacquire that causes transient noise and detection glitches.
  const ensureAudioPipeline = async () => {
    if (contextRef.current && contextRef.current.state !== 'closed' && streamRef.current) {
      if (contextRef.current.state === 'suspended') {
        await contextRef.current.resume();
      }
      return;
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        noiseSuppression: false,
        echoCancellation: false,
        autoGainControl: false,
        sampleRate: 44100,
        channelCount: 1,
      }
    });
    streamRef.current = stream;

    const context = new AudioContext({ sampleRate: 44100 });
    contextRef.current = context;

    const source = context.createMediaStreamSource(stream);
    sourceRef.current = source;

    const processor = context.createScriptProcessor(4096, 1, 1);
    processorRef.current = processor;

    processor.onaudioprocess = async (event) => {
      if (!activeRef.current) {
        return;
      }
      const channelData = event.inputBuffer.getChannelData(0);
      if (detectInFlightRef.current) {
        // Queue this buffer instead of dropping it
        pendingBufferRef.current = new Float32Array(channelData);
        return;
      }
      detectInFlightRef.current = true;
      try {
        await processBuffer(new Float32Array(channelData));
      } finally {
        detectInFlightRef.current = false;
      }
    };

    source.connect(processor);
    processor.connect(context.destination);
  };

  const start = useCallback(async (onFrame: (frame: TrackerFrame) => void) => {
    try {
      callbackRef.current = onFrame;
      detectInFlightRef.current = false;
      await ensureAudioPipeline();
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
    pendingBufferRef.current = null;
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
