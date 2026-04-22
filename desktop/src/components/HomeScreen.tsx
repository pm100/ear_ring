import React, { useRef, useCallback, useEffect } from 'react';
import { ExerciseSettings } from '../types';

interface Props {
  settings: ExerciseSettings;
  onUpdateSettings: React.Dispatch<React.SetStateAction<ExerciseSettings>>;
  onStart: (rootNote: number, rangeStart: number, rangeEnd: number, scaleId: number, sequenceLength: number, tempoBpm: number, showTestNotes: boolean, keySignatureMode: number, testType: number) => void;
}

const NOTE_NAMES = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
const SCALE_NAMES = ['Major','Natural Minor','Dorian','Mixolydian'];
// Semitones to add to root chroma to get implied major key; null = no parenthetical (Major).
const IMPLIED_MAJOR_OFFSETS: (number | null)[] = [null, 3, 10, 5];

function scaleLabel(rootNote: number, scaleId: number): string {
  const base = SCALE_NAMES[scaleId];
  if (!base) return '?';
  const offset = IMPLIED_MAJOR_OFFSETS[scaleId];
  if (offset === null || offset === undefined) return base;
  const keyName = NOTE_NAMES[(rootNote + offset) % 12];
  return `${base} (${keyName})`;
}

const PIANO_MIDI_MIN = 36;
const PIANO_MIDI_MAX = 84;
const WHITE_KEY_CLASSES = new Set([0, 2, 4, 5, 7, 9, 11]);
const DIATONIC_STEP = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6];
const WHITE_KEY_W = 22;
const BLACK_KEY_W = 14;
const WHITE_KEY_H = 80;
const BLACK_KEY_H = 52;
const HANDLE_R = 9;
const HANDLE_AREA = 22;

function isWhite(midi: number) { return WHITE_KEY_CLASSES.has(midi % 12); }
function whiteIndex(midi: number) {
  const oct = Math.floor((midi - PIANO_MIDI_MIN) / 12);
  return oct * 7 + DIATONIC_STEP[midi % 12];
}
function totalWhiteKeys() {
  let n = 0;
  for (let m = PIANO_MIDI_MIN; m <= PIANO_MIDI_MAX; m++) if (isWhite(m)) n++;
  return n;
}
function keyX(midi: number): number {
  if (isWhite(midi)) return whiteIndex(midi) * WHITE_KEY_W + WHITE_KEY_W / 2;
  return whiteIndex(midi - 1) * WHITE_KEY_W + WHITE_KEY_W - BLACK_KEY_W / 2;
}
function midiLabel(midi: number): string {
  if (!Number.isFinite(midi)) return '–';
  const oct = Math.floor(midi / 12) - 1;
  return `${NOTE_NAMES[midi % 12]}${oct}`;
}
function defaultRangeForKey(rootNote: number): [number, number] {
  const rn = Number.isFinite(rootNote) ? rootNote : 0;
  let best = 60 + rn;
  for (let oct = 2; oct <= 6; oct++) {
    const c = (oct + 1) * 12 + rn;
    if (Math.abs(c - 60) < Math.abs(best - 60)) best = c;
  }
  return [best, best + 12];
}

/** Return valid range, falling back to defaults if values are missing or NaN. */
function safeRange(rs: number | undefined, re: number | undefined): [number, number] {
  const start = Number.isFinite(rs) ? rs! : 60;
  const end   = Number.isFinite(re) ? re! : 71;
  return [start, end];
}

// ─── Piano keyboard component ─────────────────────────────────────────────────
function PianoRangePicker({ rangeStart: rangeStartProp, rangeEnd: rangeEndProp, onChange }: {
  rangeStart: number;
  rangeEnd: number;
  onChange: (s: number, e: number) => void;
}) {
  const [rangeStart, rangeEnd] = safeRange(rangeStartProp, rangeEndProp);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const totalW = totalWhiteKeys() * WHITE_KEY_W;
  const totalH = HANDLE_AREA + WHITE_KEY_H;
  const dragging = useRef<null | 0 | 1>(null);
  const primary = '#3F51B5';

  const xToMidi = useCallback((x: number, yInKeys: number): number => {
    if (yInKeys >= 0 && yInKeys < BLACK_KEY_H) {
      for (let m = PIANO_MIDI_MIN; m <= PIANO_MIDI_MAX; m++) {
        if (!isWhite(m)) {
          const cx = whiteIndex(m - 1) * WHITE_KEY_W + WHITE_KEY_W - BLACK_KEY_W / 2;
          if (x >= cx - BLACK_KEY_W / 2 && x < cx + BLACK_KEY_W / 2) return m;
        }
      }
    }
    const idx = Math.max(0, Math.min(totalWhiteKeys() - 1, Math.floor(x / WHITE_KEY_W)));
    for (let m = PIANO_MIDI_MIN; m <= PIANO_MIDI_MAX; m++) {
      if (isWhite(m) && whiteIndex(m) === idx) return m;
    }
    return rangeStart;
  }, [rangeStart]);

  // Draw
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, totalW, totalH);
    const keyTop = HANDLE_AREA;

    // White keys
    for (let m = PIANO_MIDI_MIN; m <= PIANO_MIDI_MAX; m++) {
      if (!isWhite(m)) continue;
      const left = whiteIndex(m) * WHITE_KEY_W;
      const inRange = m >= rangeStart && m <= rangeEnd;
      ctx.fillStyle = inRange ? '#C5CAE9' : '#fff';   // solid light-indigo for range
      ctx.fillRect(left, keyTop, WHITE_KEY_W - 1, WHITE_KEY_H);
      ctx.strokeStyle = inRange ? '#7986CB' : '#888';
      ctx.lineWidth = 1;
      ctx.strokeRect(left, keyTop, WHITE_KEY_W - 1, WHITE_KEY_H);
    }
    // Black keys
    for (let m = PIANO_MIDI_MIN; m <= PIANO_MIDI_MAX; m++) {
      if (isWhite(m)) continue;
      const cx = whiteIndex(m - 1) * WHITE_KEY_W + WHITE_KEY_W - BLACK_KEY_W / 2;
      const inRange = m >= rangeStart && m <= rangeEnd;
      ctx.fillStyle = inRange ? '#3F51B5' : '#222';   // full primary for in-range black keys
      ctx.fillRect(cx - BLACK_KEY_W / 2, keyTop, BLACK_KEY_W, BLACK_KEY_H);
    }
    // C key labels
    ctx.font = '9px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    for (let m = PIANO_MIDI_MIN; m <= PIANO_MIDI_MAX; m += 12) {
      const oct = Math.floor(m / 12) - 1;
      const left = whiteIndex(m) * WHITE_KEY_W;
      ctx.fillStyle = (m >= rangeStart && m <= rangeEnd) ? '#3F51B5' : '#777';
      ctx.fillText(`C${oct}`, left + WHITE_KEY_W / 2, keyTop + WHITE_KEY_H - 3);
    }
    // Handles
    const hy = HANDLE_AREA / 2;
    const sx = keyX(rangeStart);
    const ex = keyX(rangeEnd);
    ctx.strokeStyle = primary;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(sx, hy); ctx.lineTo(ex, hy); ctx.stroke();
    ctx.fillStyle = primary;
    ctx.beginPath(); ctx.arc(sx, hy, HANDLE_R, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(ex, hy, HANDLE_R, 0, Math.PI * 2); ctx.fill();
  }, [rangeStart, rangeEnd, totalW, totalH]);

  const getPos = (e: React.MouseEvent) => {
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const onMouseDown = (e: React.MouseEvent) => {
    const { x, y } = getPos(e);
    const hy = HANDLE_AREA / 2;
    const dS = Math.hypot(x - keyX(rangeStart), y - hy);
    const dE = Math.hypot(x - keyX(rangeEnd), y - hy);
    if (dS <= HANDLE_R * 2.5) dragging.current = 0;
    else if (dE <= HANDLE_R * 2.5) dragging.current = 1;
    else {
      // Tap
      const yInKeys = y - HANDLE_AREA;
      const tapped = xToMidi(x, yInKeys);
      const span = rangeEnd - rangeStart;
      const ns = Math.max(PIANO_MIDI_MIN, Math.min(PIANO_MIDI_MAX - span, tapped));
      onChange(ns, ns + span);
    }
  };
  const onMouseMove = (e: React.MouseEvent) => {
    if (dragging.current === null) return;
    const { x } = getPos(e);
    const m = xToMidi(x, BLACK_KEY_H / 2);
    if (dragging.current === 0) onChange(Math.max(PIANO_MIDI_MIN, Math.min(rangeEnd - 12, m)), rangeEnd);
    else onChange(rangeStart, Math.max(rangeStart + 12, Math.min(PIANO_MIDI_MAX, m)));
  };
  const onMouseUp = () => { dragging.current = null; };

  // Center scroll on initial render.
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const cx = (keyX(rangeStart) + keyX(rangeEnd)) / 2;
    el.scrollLeft = Math.max(0, cx - el.clientWidth / 2);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div ref={scrollContainerRef} style={{ overflowX: 'auto', width: '100%' }}>
      <canvas
        ref={canvasRef}
        width={totalW}
        height={totalH}
        style={{ display: 'block', cursor: 'pointer' }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
      />
    </div>
  );
}

const TEST_TYPE_OPTIONS = [
  { value: 0, label: 'Random Notes' },
  { value: 2, label: 'Diatonic Arpeggios (ascend)' },
  { value: 3, label: 'Diatonic Arpeggios (desc)' },
];

function HomeScreen({ settings, onUpdateSettings, onStart }: Props) {
  const isMelodyMode = settings.testType === 1;
  const isDiatonicMode = settings.testType === 2 || settings.testType === 3;

  const handleTestTypeChange = (newType: number) => {
    onUpdateSettings(prev => {
      const newSeqLen = newType === 2 && prev.sequenceLength !== 3 && prev.sequenceLength !== 4 ? 3 : prev.sequenceLength;
      return { ...prev, testType: newType, sequenceLength: newSeqLen };
    });
  };

  const handleStart = () => {
    onStart(settings.rootNote, settings.rangeStart, settings.rangeEnd, settings.scaleId, settings.sequenceLength, settings.tempoBpm, settings.showTestNotes, settings.keySignatureMode, settings.testType);
  };

  return (
    <div className="screen">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 4 }}>
        <img src="/icon.png" alt="Ear Ring" style={{ width: 48, height: 48, borderRadius: 10 }} />
        <h1 className="app-title" style={{ margin: 0 }}>Ear Ring</h1>
      </div>
      <p className="app-subtitle">Ear Training</p>

      <span className="section-label">Test Type</span>
      <select
        value={settings.testType}
        onChange={e => handleTestTypeChange(Number(e.target.value))}
        style={{ width: '100%', padding: '8px 12px', fontSize: 15, borderRadius: 8, border: '1px solid #ccc', marginBottom: 16 }}
      >
        {TEST_TYPE_OPTIONS.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>

      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ flex: 1 }}>
          <span className="section-label">Key</span>
          <select
            value={settings.rootNote}
            onChange={e => {
              const i = Number(e.target.value);
              const [rs, re] = defaultRangeForKey(i);
              onUpdateSettings(prev => ({ ...prev, rootNote: i, rangeStart: rs, rangeEnd: re }));
            }}
            style={{ width: '100%', padding: '8px 12px', fontSize: 15, borderRadius: 8, border: '1px solid #ccc', marginBottom: 4 }}
          >
            {NOTE_NAMES.map((name, i) => (
              <option key={i} value={i}>{name}</option>
            ))}
          </select>
        </div>
        <div style={{ flex: 1, opacity: isMelodyMode ? 0.38 : 1 }}>
          <span className="section-label">Scale</span>
          <select
            value={settings.scaleId}
            disabled={isMelodyMode}
            onChange={e => onUpdateSettings(prev => ({ ...prev, scaleId: Number(e.target.value) }))}
            style={{ width: '100%', padding: '8px 12px', fontSize: 15, borderRadius: 8, border: '1px solid #ccc', marginBottom: 4 }}
          >
            {SCALE_NAMES.map((_, i) => (
              <option key={i} value={i}>{scaleLabel(settings.rootNote, i)}</option>
            ))}
          </select>
        </div>
      </div>

      <span className="section-label">Range ({midiLabel(safeRange(settings.rangeStart, settings.rangeEnd)[0])} – {midiLabel(safeRange(settings.rangeStart, settings.rangeEnd)[1])})</span>
      <PianoRangePicker
        rangeStart={settings.rangeStart}
        rangeEnd={settings.rangeEnd}
        onChange={isMelodyMode ? () => {} : (s, e) => onUpdateSettings(prev => ({ ...prev, rangeStart: s, rangeEnd: e }))}
      />

      <div>
        <span className="section-label">Sequence Length</span>
        <div className="chip-row">
          {[2, 3, 4, 5, 6, 7, 8].map(len => {
            const chipEnabled = isMelodyMode ? false : isDiatonicMode ? (len === 3 || len === 4) : true;
            return (
              <button
                key={len}
                type="button"
                disabled={!chipEnabled}
                className={`chip ${settings.sequenceLength === len && chipEnabled ? 'chip-selected' : ''}`}
                style={{ opacity: chipEnabled ? 1 : 0.38 }}
                onClick={() => chipEnabled && onUpdateSettings(prev => ({ ...prev, sequenceLength: len }))}
              >
                {len}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 24, alignItems: 'center', marginTop: 16, flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={settings.showTestNotes}
            onChange={e => onUpdateSettings(prev => ({ ...prev, showTestNotes: e.target.checked }))}
            style={{ width: 18, height: 18, cursor: 'pointer' }}
          />
          <span className="section-label" style={{ margin: 0 }}>Display Test Notes</span>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={settings.keySignatureMode === 1}
            onChange={e => onUpdateSettings(prev => ({ ...prev, keySignatureMode: e.target.checked ? 1 : 0 }))}
            style={{ width: 18, height: 18, cursor: 'pointer' }}
          />
          <span className="section-label" style={{ margin: 0 }}>Use Key Signature</span>
        </label>
      </div>

      <div style={{ marginTop: 32 }}>
        <button className="btn-primary" onClick={handleStart}>▶ Start Exercise</button>
      </div>
    </div>
  );
}

export default React.memo(HomeScreen);
