import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useAudioCapture, CapturedNote } from '../hooks/useAudioCapture';
import { RawMelody } from '../types';

// ── Quantization helpers ────────────────────────────────────────────────────

const SNAP_BEATS = [0.25, 0.5, 0.75, 1.0, 1.5, 2.0, 3.0, 4.0];
const NOTE_NAMES = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];

function snapToNearest(raw: number): number {
  let best = SNAP_BEATS[0];
  let bestDist = Math.abs(raw - best);
  for (const v of SNAP_BEATS) {
    const d = Math.abs(raw - v);
    if (d < bestDist) { bestDist = d; best = v; }
  }
  return best;
}

function autoDetectBpm(notes: CapturedNote[]): number {
  if (notes.length < 2) return 100;
  const iois = notes.slice(0, -1).map(n => n.durationMs).filter(d => d > 80);
  if (iois.length === 0) return 100;
  const sorted = [...iois].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const raw = Math.round(60000 / median);
  // Snap to nearest common BPM value
  const common = [40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160, 180, 200];
  let best = common[0];
  for (const b of common) if (Math.abs(b - raw) < Math.abs(best - raw)) best = b;
  return best;
}

function autoDetectRoot(notes: CapturedNote[]): number {
  if (notes.length === 0) return 0;
  const counts = new Array(12).fill(0);
  for (const n of notes) counts[((n.midi % 12) + 12) % 12]++;
  let best = 0;
  for (let i = 1; i < 12; i++) if (counts[i] > counts[best]) best = i;
  return best;
}

interface QuantizedNote {
  midi: number;
  label: string;
  beats: number;
}

function quantize(notes: CapturedNote[], bpm: number): QuantizedNote[] {
  const beatMs = 60000 / bpm;
  return notes.map(n => {
    const raw = n.durationMs / beatMs;
    return { midi: n.midi, label: n.label, beats: Math.max(0.25, snapToNearest(raw)) };
  });
}

function toRawNotes(quantized: QuantizedNote[], rootChroma: number) {
  const avgMidi = quantized.reduce((s, n) => s + n.midi, 0) / quantized.length;
  let rootMidi = 60 + rootChroma;
  while (rootMidi + 12 <= avgMidi - 3) rootMidi += 12;
  while (rootMidi - 12 >= avgMidi + 3) rootMidi -= 12;
  return quantized.map(n => ({ semitones: n.midi - rootMidi, duration: n.beats }));
}

// ── Component ───────────────────────────────────────────────────────────────

interface Props {
  onImport: (melody: RawMelody) => void;
}

export default function RecordTab({ onImport }: Props) {
  const { captureState, liveLabel, notes, start, stop, resetCapture } = useAudioCapture();

  const [bpm, setBpm] = useState(100);
  const [rootChroma, setRootChroma] = useState(0);
  const [titleInput, setTitleInput] = useState('');
  const [bpmReady, setBpmReady] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef(0);

  // Start elapsed-time timer while recording
  useEffect(() => {
    if (captureState === 'recording') {
      startTimeRef.current = performance.now();
      timerRef.current = setInterval(() => {
        setElapsedSec(Math.floor((performance.now() - startTimeRef.current) / 1000));
      }, 500);
    } else {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      if (captureState === 'idle') setElapsedSec(0);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [captureState]);

  // Auto-detect BPM and root once recording stops
  const prevStateRef = useRef(captureState);
  useEffect(() => {
    if (prevStateRef.current === 'recording' && captureState === 'stopped') {
      setRootChroma(autoDetectRoot(notes));
      if (!bpmReady && notes.length >= 2) {
        setBpm(autoDetectBpm(notes));
        setBpmReady(true);
      }
    }
    prevStateRef.current = captureState;
  }, [captureState, notes, bpmReady]);

  const quantized = useMemo(() => quantize(notes, bpm), [notes, bpm]);

  const handleImport = useCallback(() => {
    if (quantized.length === 0) return;
    const raw = toRawNotes(quantized, rootChroma);
    onImport({
      index: -1,
      title: titleInput.trim() || 'Recorded melody',
      notes: raw,
      source: 'record',
    });
  }, [quantized, rootChroma, titleInput, onImport]);

  const handleReRecord = useCallback(() => {
    resetCapture();
    setBpmReady(false);
    setTitleInput('');
  }, [resetCapture]);

  const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {captureState === 'idle' && (
        <>
          <p style={{ margin: 0, fontSize: 13, color: '#555', lineHeight: 1.5 }}>
            Play a melody on your instrument. The app will listen via your microphone
            and detect the notes and approximate durations, then let you adjust
            the BPM and root key before importing.
          </p>
          <button onClick={start} style={{
            padding: '12px 0', background: '#E53935', color: '#fff',
            border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 15, cursor: 'pointer',
          }}>
            🎤 Start Recording
          </button>
        </>
      )}

      {captureState === 'recording' && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{
              width: 10, height: 10, borderRadius: '50%', background: '#E53935',
              display: 'inline-block', flexShrink: 0,
            }} />
            <span style={{ fontWeight: 700, color: '#E53935', fontSize: 14 }}>
              Recording — {fmtTime(elapsedSec)}
            </span>
            <button onClick={stop} style={{
              marginLeft: 'auto', padding: '6px 18px', background: '#444', color: '#fff',
              border: 'none', borderRadius: 6, fontWeight: 600, cursor: 'pointer', fontSize: 13,
            }}>
              ■ Stop
            </button>
          </div>

          {/* Live pitch */}
          <div style={{
            fontSize: 52, fontWeight: 700, textAlign: 'center', minHeight: 60,
            color: liveLabel ? '#1976D2' : '#ddd', letterSpacing: 2,
          }}>
            {liveLabel ?? '—'}
          </div>

          {/* Detected notes so far */}
          {notes.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {notes.map((n, i) => (
                <span key={i} style={{
                  background: '#E3F2FD', border: '1px solid #90CAF9',
                  borderRadius: 4, padding: '2px 8px', fontSize: 13, fontWeight: 600,
                }}>
                  {n.label}
                </span>
              ))}
            </div>
          )}
        </>
      )}

      {captureState === 'stopped' && notes.length === 0 && (
        <>
          <p style={{ color: '#E53935', fontSize: 13, margin: 0 }}>
            No notes were detected. Make sure your microphone is working and
            play louder / closer.
          </p>
          <button onClick={handleReRecord} style={{
            padding: '8px 0', background: '#EEE', border: 'none',
            borderRadius: 6, fontWeight: 600, cursor: 'pointer', fontSize: 13,
          }}>
            🔄 Try Again
          </button>
        </>
      )}

      {captureState === 'stopped' && notes.length > 0 && (
        <>
          {/* BPM + Root controls */}
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ flex: '0 0 auto' }}>
              <div style={{ fontSize: 12, color: '#666', marginBottom: 4, fontWeight: 600 }}>Root key</div>
              <select value={rootChroma} onChange={e => setRootChroma(Number(e.target.value))} style={{
                padding: '5px 10px', borderRadius: 5, border: '1px solid #ddd', fontSize: 13,
              }}>
                {NOTE_NAMES.map((n, i) => <option key={i} value={i}>{n}</option>)}
              </select>
            </div>
            <div style={{ flex: 1, minWidth: 160 }}>
              <div style={{ fontSize: 12, color: '#666', marginBottom: 4, fontWeight: 600 }}>
                BPM: <strong style={{ color: '#1976D2' }}>{bpm}</strong>
              </div>
              <input type="range" min={40} max={200} step={1} value={bpm}
                onChange={e => setBpm(Number(e.target.value))}
                style={{ width: '100%' }} />
            </div>
          </div>

          {/* Quantized note preview */}
          <div>
            <div style={{ fontSize: 12, color: '#666', marginBottom: 6, fontWeight: 600 }}>
              Notes ({quantized.length}) — durations snapped to nearest beat value at {bpm} BPM
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {quantized.map((n, i) => (
                <div key={i} style={{
                  background: '#F5F5F5', border: '1px solid #E0E0E0',
                  borderRadius: 6, padding: '4px 10px', textAlign: 'center', minWidth: 44,
                }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{n.label}</div>
                  <div style={{ color: '#888', fontSize: 11 }}>
                    {n.beats === 1 ? '♩' : n.beats === 0.5 ? '♪' : `${n.beats}♩`}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Title + action buttons */}
          <input type="text" placeholder="Title (optional)"
            value={titleInput} onChange={e => setTitleInput(e.target.value)}
            style={{
              padding: '7px 10px', border: '1px solid #ddd',
              borderRadius: 6, fontSize: 13, boxSizing: 'border-box',
            }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleReRecord} style={{
              flex: 1, padding: '8px 0', background: '#EEE', border: 'none',
              borderRadius: 6, fontWeight: 600, cursor: 'pointer', fontSize: 13,
            }}>
              🔄 Re-record
            </button>
            <button onClick={handleImport} style={{
              flex: 2, padding: '10px 0', background: '#4CAF50', color: '#fff',
              border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 14, cursor: 'pointer',
            }}>
              Import
            </button>
          </div>
        </>
      )}
    </div>
  );
}
