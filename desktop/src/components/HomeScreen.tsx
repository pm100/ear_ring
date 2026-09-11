import React, { useRef, useCallback, useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { ExerciseSettings } from '../types';
import { TooltipIcon } from './Tooltip';

interface Props {
  settings: ExerciseSettings;
  onUpdateSettings: React.Dispatch<React.SetStateAction<ExerciseSettings>>;
  onStart: (rootNote: number, rangeStart: number, rangeEnd: number, scaleId: number, sequenceLength: number, tempoBpm: number, showTestNotes: boolean, keySignatureMode: number, testType: number) => void;
}

const NOTE_NAMES = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
// Locrian (id 4) stays in this array for indexing symmetry with the Rust core, but is
// excluded from SELECTABLE_SCALE_IDS below — not offered as a scale choice in the UI.
const SCALE_NAMES = ['Major', 'Natural Minor', 'Dorian', 'Mixolydian', 'Locrian'];
// Semitones to add to root chroma to get implied major key; null = no parenthetical (Major).
const IMPLIED_MAJOR_OFFSETS: (number | null)[] = [null, 3, 10, 5, 1];
// Scale ids offered in the picker. Locrian (4) is deliberately dropped for now.
const SELECTABLE_SCALE_IDS = [0, 1, 2, 3];

function scaleLabel(rootNote: number, scaleId: number): string {
  const base = SCALE_NAMES[scaleId];
  if (!base) return '?';
  const offset = IMPLIED_MAJOR_OFFSETS[scaleId];
  if (offset === null || offset === undefined) return base;
  const keyName = NOTE_NAMES[(rootNote + offset) % 12];
  return `${base} (of ${keyName})`;
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
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    for (let m = PIANO_MIDI_MIN; m <= PIANO_MIDI_MAX; m += 12) {
      const oct = Math.floor(m / 12) - 1;
      const left = whiteIndex(m) * WHITE_KEY_W;
      ctx.fillStyle = (m >= rangeStart && m <= rangeEnd) ? '#3F51B5' : '#555';
      ctx.fillText(`C${oct}`, left + WHITE_KEY_W / 2, keyTop + WHITE_KEY_H - 4);
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

  // The canvas is drawn in its normal (horizontal) orientation, then rotated 90deg via
  // CSS to display sideways (see the returned JSX) — the drawing/hit-testing math above
  // and below is entirely in that original, pre-rotation local space. A raw DOM
  // getBoundingClientRect() reflects the POST-rotation box, so mouse coordinates read off
  // it have to be mapped back: for rotate(90deg), original (x,y) <-> rotated-box (bx,by)
  // via x = by, y = totalH - bx (the inverse of the forward mapping x'=totalH-y, y'=x).
  const getPos = (e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const bx = e.clientX - rect.left;
    const by = e.clientY - rect.top;
    return { x: by, y: totalH - bx };
  };

  const onMouseDown = (e: React.MouseEvent) => {
    const { x, y } = getPos(e);
    const hy = HANDLE_AREA / 2;
    const dS = Math.hypot(x - keyX(rangeStart), y - hy);
    const dE = Math.hypot(x - keyX(rangeEnd), y - hy);
    if (dS <= HANDLE_R * 2.5) dragging.current = 0;
    else if (dE <= HANDLE_R * 2.5) dragging.current = 1;
    else {
      // Tap away from either handle: move whichever endpoint (start or end) is nearer to
      // the tapped key directly there, instead of requiring a precise drag on a small
      // handle — a single click sets start or end.
      const yInKeys = y - HANDLE_AREA;
      const tapped = xToMidi(x, yInKeys);
      if (Math.abs(tapped - rangeStart) <= Math.abs(tapped - rangeEnd)) {
        onChange(Math.max(PIANO_MIDI_MIN, Math.min(rangeEnd - 12, tapped)), rangeEnd);
      } else {
        onChange(rangeStart, Math.max(rangeStart + 12, Math.min(PIANO_MIDI_MAX, tapped)));
      }
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

  // Center scroll on initial render. Rotated display: a key's position along the
  // original x-axis (keyX) maps directly to vertical position in the rotated,
  // scrollable box — see getPos's comment for the rotation math.
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const cy = (keyX(rangeStart) + keyX(rangeEnd)) / 2;
    el.scrollTop = Math.max(0, cy - el.clientHeight / 2);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Outer box is sized to the POST-rotation (swapped) dimensions; the canvas keeps its
  // original totalW x totalH size and is centered + rotated 90deg to exactly fill it,
  // showing the keyboard sideways (low notes at top) so its long axis fits the popup's
  // vertical space instead of needing wide horizontal scrolling.
  return (
    <div ref={scrollContainerRef} style={{ width: totalH, height: 'auto', maxHeight: '100%', overflowY: 'auto', overflowX: 'hidden', margin: '0 auto' }}>
      <div style={{ position: 'relative', width: totalH, height: totalW }}>
        <canvas
          ref={canvasRef}
          width={totalW}
          height={totalH}
          style={{
            position: 'absolute', top: '50%', left: '50%',
            transform: 'translate(-50%, -50%) rotate(90deg)',
            cursor: 'pointer',
          }}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
        />
      </div>
    </div>
  );
}

// ─── Typed start/end note entry, alongside the piano keyboard ─────────────────
function RangeTextInputs({ rangeStart, rangeEnd, onChange, disabled }: {
  rangeStart: number;
  rangeEnd: number;
  onChange: (s: number, e: number) => void;
  disabled: boolean;
}) {
  const [startText, setStartText] = useState(midiLabel(rangeStart));
  const [endText, setEndText] = useState(midiLabel(rangeEnd));
  useEffect(() => setStartText(midiLabel(rangeStart)), [rangeStart]);
  useEffect(() => setEndText(midiLabel(rangeEnd)), [rangeEnd]);

  const commitStart = async () => {
    const midi = await invoke<number | null>('cmd_label_to_midi', { label: startText }).catch(() => null);
    if (midi !== null && midi >= PIANO_MIDI_MIN && midi <= PIANO_MIDI_MAX && rangeEnd - midi >= 12) {
      onChange(midi, rangeEnd);
    } else {
      setStartText(midiLabel(rangeStart)); // invalid — revert to last valid value
    }
  };
  const commitEnd = async () => {
    const midi = await invoke<number | null>('cmd_label_to_midi', { label: endText }).catch(() => null);
    if (midi !== null && midi >= PIANO_MIDI_MIN && midi <= PIANO_MIDI_MAX && midi - rangeStart >= 12) {
      onChange(rangeStart, midi);
    } else {
      setEndText(midiLabel(rangeEnd)); // invalid — revert to last valid value
    }
  };
  const inputStyle: React.CSSProperties = { width: 70, padding: '6px 8px', fontSize: 14, borderRadius: 6, border: '1px solid #ccc', textAlign: 'center' };

  // "Start"/"End" labels removed — the "to" between the two fields already makes
  // which is which implicit.
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <input
        value={startText}
        disabled={disabled}
        onChange={e => setStartText(e.target.value)}
        onBlur={commitStart}
        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        style={inputStyle}
      />
      <span style={{ color: '#757575' }}>to</span>
      <input
        value={endText}
        disabled={disabled}
        onChange={e => setEndText(e.target.value)}
        onBlur={commitEnd}
        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        style={inputStyle}
      />
    </div>
  );
}

// ─── Full-screen overlay for the range picker — the keyboard needs all the room it can
// get to be tappable, so this fills the viewport rather than sizing to content. ─────────
function FullScreenModal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: '#fff', zIndex: 1000,
        display: 'flex', flexDirection: 'column',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderBottom: '1px solid #eee', flexShrink: 0 }}>
        <span style={{ fontSize: 17, fontWeight: 600 }}>{title}</span>
        <button
          type="button"
          onClick={onClose}
          style={{ background: 'none', border: 'none', padding: 0, color: '#3F51B5', fontSize: 16, fontWeight: 600, cursor: 'pointer' }}
        >
          Done
        </button>
      </div>
      <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', padding: 16 }}>
        {children}
      </div>
    </div>
  );
}

const TEST_TYPE_OPTIONS = [
  { value: 0, label: 'Random Notes' },
  { value: 2, label: 'Diatonic Arpeggios' },
];

function HomeScreen({ settings, onUpdateSettings, onStart }: Props) {
  const isMelodyMode = settings.testType === 1;
  const isDiatonicMode = settings.testType === 2;

  // Semitone offset for key display (written vs concert pitch), mod 12.
  // Transposed Guitar has +12 which collapses to 0 — no annotation shown for it.
  const [showRangePicker, setShowRangePicker] = useState(false);

  const [instrKeyTranspose, setInstrKeyTranspose] = useState(0);
  useEffect(() => {
    invoke<string>('cmd_instrument_list')
      .then(json => {
        const list = JSON.parse(json) as { semitones: number }[];
        const sem = list[settings.instrumentIndex]?.semitones ?? 0;
        setInstrKeyTranspose(((sem % 12) + 12) % 12);
      })
      .catch(() => setInstrKeyTranspose(0));
  }, [settings.instrumentIndex]);

  // Scale labels in written pitch for the selected instrument
  const [scaleLabels, setScaleLabels] = useState<string[]>(['Major', 'Natural Minor', 'Dorian', 'Mixolydian', 'Locrian']);
  useEffect(() => {
    Promise.all(SELECTABLE_SCALE_IDS.map(i =>
      invoke<string>('cmd_written_scale_label', {
        concertRootChroma: settings.rootNote,
        scaleId: i,
        instrumentIndex: settings.instrumentIndex,
      })
    )).then(setScaleLabels).catch(() => {});
  }, [settings.rootNote, settings.instrumentIndex]);

  const handleTestTypeChange = (newType: number) => {
    onUpdateSettings(prev => {
      // 4-note (7th chord) arpeggios are suppressed for now — always 3 in diatonic mode.
      const newSeqLen = newType === 2 ? 3 : prev.sequenceLength;
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

      <span className="section-label">Test Type<TooltipIcon tooltipKey="test_type" /></span>
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
          <span className="section-label">Key<TooltipIcon tooltipKey="key" /></span>
          <select
            value={settings.rootNote}
            onChange={e => {
              const concertChroma = Number(e.target.value);
              const [rs, re] = defaultRangeForKey(concertChroma);
              onUpdateSettings(prev => ({ ...prev, rootNote: concertChroma, rangeStart: rs, rangeEnd: re }));
            }}
            style={{ width: '100%', padding: '8px 12px', fontSize: 15, borderRadius: 8, border: '1px solid #ccc', marginBottom: 4 }}
          >
            {Array.from({ length: 12 }, (_, wc) => {
              const concertChroma = (wc - instrKeyTranspose + 12) % 12;
              const label = instrKeyTranspose !== 0
                ? `${NOTE_NAMES[wc]} (concert ${NOTE_NAMES[concertChroma]})`
                : NOTE_NAMES[wc];
              return <option key={wc} value={concertChroma}>{label}</option>;
            })}
          </select>
        </div>
        <div style={{ flex: 1, opacity: isMelodyMode ? 0.38 : 1 }}>
          <span className="section-label">Scale<TooltipIcon tooltipKey="scale" /></span>
          <select
            value={settings.scaleId}
            disabled={isMelodyMode}
            onChange={e => onUpdateSettings(prev => ({ ...prev, scaleId: Number(e.target.value) }))}
            style={{ width: '100%', padding: '8px 12px', fontSize: 15, borderRadius: 8, border: '1px solid #ccc', marginBottom: 4 }}
          >
            {SELECTABLE_SCALE_IDS.map(i => (
              <option key={i} value={i}>{scaleLabels[i] ?? '?'}</option>
            ))}
          </select>
        </div>
      </div>

      <span className="section-label">Range<TooltipIcon tooltipKey="range" /></span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <RangeTextInputs
          rangeStart={settings.rangeStart}
          rangeEnd={settings.rangeEnd}
          disabled={isMelodyMode}
          onChange={isMelodyMode ? () => {} : (s, e) => onUpdateSettings(prev => ({ ...prev, rangeStart: s, rangeEnd: e }))}
        />
        <button
          type="button"
          onClick={() => setShowRangePicker(true)}
          title="Pick range on a keyboard"
          aria-label="Pick range on a keyboard"
          style={{ fontSize: 22, lineHeight: 1, padding: '6px 10px', borderRadius: 6, border: '1px solid #ccc', background: '#fff', cursor: 'pointer' }}
        >
          🎹
        </button>
      </div>
      {showRangePicker && (
        <FullScreenModal title="Note Range" onClose={() => setShowRangePicker(false)}>
          <PianoRangePicker
            rangeStart={settings.rangeStart}
            rangeEnd={settings.rangeEnd}
            onChange={isMelodyMode ? () => {} : (s, e) => onUpdateSettings(prev => ({ ...prev, rangeStart: s, rangeEnd: e }))}
          />
        </FullScreenModal>
      )}

      <div>
        <span className="section-label">Sequence Length<TooltipIcon tooltipKey="sequence_length" /></span>
        <div className="chip-row">
          {[1, 2, 3, 4, 5, 6, 7, 8].map(len => {
            // Fully locked at 3 in diatonic mode (4-note/7th-chord arpeggios are
            // suppressed for now), not just narrowed to 3-4.
            const chipEnabled = isMelodyMode || isDiatonicMode ? false : true;
            return (
              <button
                key={len}
                type="button"
                disabled={!chipEnabled}
                // selected shows regardless of chipEnabled — a locked row should still
                // show its current value highlighted, not gray it out too.
                className={`chip ${settings.sequenceLength === len ? 'chip-selected' : ''}`}
                style={{ opacity: chipEnabled ? 1 : 0.38 }}
                onClick={() => chipEnabled && onUpdateSettings(prev => ({ ...prev, sequenceLength: len }))}
              >
                {len}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ marginTop: 32 }}>
        <button className="btn-primary" onClick={handleStart}>▶ Start Exercise</button>
      </div>
    </div>
  );
}

export default React.memo(HomeScreen);
