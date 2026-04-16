import React, { useState, useEffect, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import MusicStaff from './MusicStaff';
import ImportDialog from './ImportDialog';
import { useAudioPlayback } from '../hooks/useAudioPlayback';
import { RawMelody, RawNote, Decision, StaffDisplayNote } from '../types';
import { rawNotesToAbc, parseAbcToNotes } from '../utils/abc';

const DECISIONS_KEY = 'mm_decisions';
const OCTAVE_SHIFTS_KEY = 'mm_octave_shifts';
const INDEX_KEY = 'mm_index';
const MM_BPM = 80;
const ROOT_CHROMA = 0; // always display in C

function semitoneToMidi(semitones: number, octaveShift: number): number {
  // Place relative to C4=60 (tonic), then apply octave shift.
  // This mirrors melody_to_midi_by_index logic: find octave nearest MIDI 60.
  const base = 60 + semitones + octaveShift * 12;
  return Math.max(21, Math.min(108, base));
}

function rawToStaffNotes(notes: RawNote[], octaveShift: number): StaffDisplayNote[] {
  return notes.map(n => ({
    midi: semitoneToMidi(n.semitones, octaveShift),
    state: 'expected' as const,
    duration: n.duration,
  }));
}

function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
}

function saveJson(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

interface Props {}

export default function MelodyManagerApp(_: Props) {
  const [total, setTotal] = useState(0);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [melodies, setMelodies] = useState<Map<number, RawMelody>>(new Map());
  const [allTitles, setAllTitles] = useState<string[]>([]);
  const [decisions, setDecisions] = useState<Record<string, Decision>>(() => loadJson(DECISIONS_KEY, {}));
  const [octaveShifts, setOctaveShifts] = useState<Record<string, number>>(() => loadJson(OCTAVE_SHIFTS_KEY, {}));
  const [searchText, setSearchText] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [importedMelodies, setImportedMelodies] = useState<RawMelody[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [showAbcEditor, setShowAbcEditor] = useState(false);
  const [abcText, setAbcText] = useState('');
  const [abcError, setAbcError] = useState('');
  const playGenRef = useRef(0);
  const { playSequence, cancelPlayback } = useAudioPlayback();

  // ── Init: fetch total + all titles from Rust core ────────────────────────────
  useEffect(() => {
    invoke<string[]>('cmd_melody_titles').then(titles => {
      setAllTitles(titles);
      setTotal(titles.length);
      const saved = loadJson<number>(INDEX_KEY, 0);
      setCurrentIndex(Math.max(0, Math.min(saved, titles.length - 1)));
    }).catch(console.error);
  }, []);

  // ── Persist state ────────────────────────────────────────────────────────────
  useEffect(() => { saveJson(DECISIONS_KEY, decisions); }, [decisions]);
  useEffect(() => { saveJson(OCTAVE_SHIFTS_KEY, octaveShifts); }, [octaveShifts]);
  useEffect(() => { saveJson(INDEX_KEY, currentIndex); }, [currentIndex]);

  // ── Load melody on demand ─────────────────────────────────────────────────────
  const getMelody = useCallback(async (index: number): Promise<RawMelody | null> => {
    // Check if it's an imported melody (index >= total)
    const importOffset = index - total;
    if (importOffset >= 0 && importOffset < importedMelodies.length) {
      return importedMelodies[importOffset];
    }
    if (melodies.has(index)) return melodies.get(index)!;
    try {
      const result = await invoke<{ title: string; notes: Array<{ semitones: number; duration: number }> } | null>(
        'cmd_melody_raw', { index }
      );
      if (!result) return null;
      const melody: RawMelody = {
        index,
        title: result.title,
        notes: result.notes.map(n => ({ semitones: n.semitones, duration: n.duration })),
        source: 'library',
      };
      setMelodies(prev => new Map(prev).set(index, melody));
      return melody;
    } catch { return null; }
  }, [melodies, importedMelodies, total]);

  const [currentMelody, setCurrentMelody] = useState<RawMelody | null>(null);

  useEffect(() => {
    let cancelled = false;
    setCurrentMelody(null);
    getMelody(currentIndex).then(m => { if (!cancelled) setCurrentMelody(m); });
    return () => { cancelled = true; };
  }, [currentIndex, getMelody]);

  // ── Playback ─────────────────────────────────────────────────────────────────
  const playMelody = useCallback((melody: RawMelody, octaveShift: number) => {
    cancelPlayback();
    const gen = ++playGenRef.current;
    const myGen = gen;
    const staffNotes = rawToStaffNotes(melody.notes, octaveShift);
    const midiNotes = staffNotes.map(n => n.midi);
    const durations = melody.notes.map(n => n.duration);
    setIsPlaying(true);
    playSequence(
      midiNotes,
      () => {},
      () => { if (playGenRef.current === myGen) setIsPlaying(false); },
      MM_BPM,
      durations,
    );
  }, [cancelPlayback, playSequence]);

  useEffect(() => {
    if (!currentMelody) return;
    const octaveShift = octaveShifts[String(currentIndex)] ?? 0;
    playMelody(currentMelody, octaveShift);
    // Only auto-play when melody changes (not on octave shift changes)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentMelody]);

  const currentOctaveShift = octaveShifts[String(currentIndex)] ?? 0;
  const currentDecision = decisions[String(currentIndex)];
  const staffNotes: StaffDisplayNote[] = currentMelody
    ? rawToStaffNotes(currentMelody.notes, currentOctaveShift)
    : [];

  // ── Helpers ──────────────────────────────────────────────────────────────────
  const allMelodyCount = total + importedMelodies.length;

  const setDecision = useCallback((verdict: Decision) => {
    setDecisions(prev => ({ ...prev, [String(currentIndex)]: verdict }));
  }, [currentIndex]);

  const shiftOctave = useCallback((delta: number) => {
    const cur = octaveShifts[String(currentIndex)] ?? 0;
    const next = Math.max(-3, Math.min(3, cur + delta));
    setOctaveShifts(prev => ({ ...prev, [String(currentIndex)]: next }));
  }, [currentIndex, octaveShifts]);

  const resetOctave = useCallback(() => {
    setOctaveShifts(prev => {
      const updated = { ...prev };
      delete updated[String(currentIndex)];
      return updated;
    });
  }, [currentIndex]);

  /** Replace the notes (and optionally title) of the currently displayed melody in-place. */
  const updateCurrentMelody = useCallback((newNotes: RawNote[], newTitle?: string) => {
    if (!currentMelody) return;
    const updated: RawMelody = {
      ...currentMelody,
      notes: newNotes,
      title: newTitle ?? currentMelody.title,
    };
    setCurrentMelody(updated);
    if (currentIndex >= total) {
      setImportedMelodies(prev => {
        const arr = [...prev];
        arr[currentIndex - total] = { ...updated, index: currentIndex };
        return arr;
      });
    } else {
      setMelodies(prev => new Map(prev).set(currentIndex, updated));
    }
  }, [currentMelody, currentIndex, total]);

  /** Open the ABC editor for the current melody. */
  const openAbcEditor = useCallback(() => {
    if (!currentMelody) return;
    const abc = rawNotesToAbc(currentMelody.notes, currentMelody.title, currentOctaveShift);
    setAbcText(abc);
    setAbcError('');
    setShowAbcEditor(true);
  }, [currentMelody, currentOctaveShift]);

  const applyAbcEdit = useCallback(() => {
    const titleMatch = abcText.match(/^T:\s*(.+)$/m);
    const newTitle = titleMatch ? titleMatch[1].trim() : currentMelody?.title ?? 'Edited tune';
    const notes = parseAbcToNotes(abcText);
    if (!notes || notes.length === 0) {
      setAbcError('Could not parse ABC — check syntax and try again.');
      return;
    }
    updateCurrentMelody(notes, newTitle);
    setShowAbcEditor(false);
    setAbcError('');
  }, [abcText, currentMelody, updateCurrentMelody]);

  const navigate = useCallback((newIndex: number) => {
    cancelPlayback();
    setIsPlaying(false);
    playGenRef.current++;
    setShowAbcEditor(false);
    setCurrentIndex(Math.max(0, Math.min(allMelodyCount - 1, newIndex)));
  }, [cancelPlayback, allMelodyCount]);

  // ── Filtered list for left panel ─────────────────────────────────────────────
  const filteredIndices = React.useMemo(() => {
    if (!searchText.trim()) return Array.from({ length: allMelodyCount }, (_, i) => i);
    const lower = searchText.toLowerCase();
    return Array.from({ length: allMelodyCount }, (_, i) => i).filter(i => {
      if (i >= total) {
        return importedMelodies[i - total]?.title.toLowerCase().includes(lower) ?? true;
      }
      const title = melodies.get(i)?.title ?? allTitles[i] ?? '';
      return title.toLowerCase().includes(lower);
    });
  }, [searchText, allMelodyCount, melodies, importedMelodies, total, allTitles]);

  // ── Import handler ────────────────────────────────────────────────────────────
  const handleImport = useCallback((melody: RawMelody) => {
    setImportedMelodies(prev => {
      const updated = [...prev, { ...melody, index: total + prev.length }];
      return updated;
    });
    setShowImport(false);
    // Navigate to the newly imported melody
    setTimeout(() => setCurrentIndex(total + importedMelodies.length), 50);
  }, [total, importedMelodies.length]);

  // ── Export ────────────────────────────────────────────────────────────────────
  const handleExport = useCallback(async () => {
    // Count what will happen
    const discardIndices: number[] = [];
    const unloadedIndices: number[] = [];
    for (let i = 0; i < total; i++) {
      if (decisions[String(i)] === 'discard') { discardIndices.push(i); continue; }
      if (!melodies.has(i)) unloadedIndices.push(i);
    }

    const discardCount2 = discardIndices.length;
    const keepTotal = allMelodyCount - discardCount2;
    const msg = [
      `Export will write ${keepTotal} tune(s) to melodies.txt.`,
      discardCount2 > 0 ? `  • ${discardCount2} discarded tune(s) will be permanently removed.` : '',
      unloadedIndices.length > 0 ? `  • ${unloadedIndices.length} unviewed tune(s) will be fetched and included.` : '',
      '',
      'Proceed?',
    ].filter(Boolean).join('\n');

    if (!window.confirm(msg)) return;

    setSaveMessage('⏳ Saving…');

    const lines: string[] = [];
    // Build a local map of all non-discarded tunes, loading any missing ones
    const loaded = new Map(melodies);
    for (let i = 0; i < allMelodyCount; i++) {
      if (decisions[String(i)] === 'discard') continue;
      let m: RawMelody | null | undefined = i >= total ? importedMelodies[i - total] : loaded.get(i);
      if (!m && i < total) {
        m = await getMelody(i);
        if (m) loaded.set(i, m);
      }
      if (!m) continue;
      const shift = (octaveShifts[String(i)] ?? 0) * 12;
      const noteLine = m.notes.map(n => `${n.semitones + shift}:${n.duration}`).join(', ');
      lines.push(m.title);
      lines.push(noteLine);
    }
    const content = lines.join('\n') + '\n';
    try {
      const saved = await invoke<string>('cmd_save_file', {
        content,
        path: '../../rust/src/melodies.txt',
      });
      setSaveMessage(`✅ Saved ${lines.length / 2} tune(s) to ${saved}`);
      setTimeout(() => setSaveMessage(''), 4000);
    } catch (e) {
      setSaveMessage(`❌ Save failed: ${e}`);
      setTimeout(() => setSaveMessage(''), 5000);
    }
  }, [allMelodyCount, decisions, melodies, importedMelodies, octaveShifts, total, getMelody]);

  // ── Stats ─────────────────────────────────────────────────────────────────────
  const keepCount = Object.values(decisions).filter(d => d === 'keep').length;
  const discardCount = Object.values(decisions).filter(d => d === 'discard').length;

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: 'system-ui, sans-serif', background: '#f5f5f5' }}>
      {/* Left panel: tune list */}
      <div style={{
        width: 300, borderRight: '1px solid #ddd', background: '#fff',
        display: 'flex', flexDirection: 'column', flexShrink: 0,
      }}>
        <div style={{ padding: '12px 12px 8px', borderBottom: '1px solid #eee' }}>
          <div style={{ fontWeight: 700, fontSize: 16, color: '#1976D2', marginBottom: 8 }}>
            🎵 Melody Manager
          </div>
          <input
            type="text"
            placeholder="Search by name…"
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            style={{
              width: '100%', padding: '6px 10px', border: '1px solid #ddd',
              borderRadius: 6, fontSize: 13, boxSizing: 'border-box',
            }}
          />
          <div style={{ fontSize: 11, color: '#999', marginTop: 4 }}>
            {allMelodyCount} tunes &nbsp;·&nbsp;
            <span style={{ color: '#4CAF50' }}>{keepCount} keep</span>&nbsp;·&nbsp;
            <span style={{ color: '#f44336' }}>{discardCount} discard</span>
          </div>
        </div>

        <div style={{ overflowY: 'auto', flex: 1 }}>
          {filteredIndices.map(i => {
            const m = i >= total ? importedMelodies[i - total] : melodies.get(i);
            const dec = decisions[String(i)];
            return (
              <div
                key={i}
                onClick={() => navigate(i)}
                style={{
                  padding: '7px 12px', cursor: 'pointer', fontSize: 13,
                  display: 'flex', alignItems: 'center', gap: 8,
                  background: i === currentIndex ? '#E3F2FD' : 'transparent',
                  borderLeft: i === currentIndex ? '3px solid #1976D2' : '3px solid transparent',
                  color: dec === 'discard' ? '#aaa' : '#222',
                }}
              >
                <span style={{
                  width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
                  background: dec === 'keep' ? '#4CAF50' : dec === 'discard' ? '#f44336' : '#ccc',
                }} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {i >= total
                    ? importedMelodies[i - total]?.title ?? `Tune ${i + 1}`
                    : (m?.title ?? allTitles[i] ?? `Tune ${i + 1}`)}
                  {i >= total && <span style={{ fontSize: 10, color: '#888', marginLeft: 4 }}>imported</span>}
                </span>
                {(octaveShifts[String(i)] ?? 0) !== 0 && (
                  <span style={{ fontSize: 10, color: '#FF9800', marginLeft: 'auto', flexShrink: 0 }}>
                    {(octaveShifts[String(i)] ?? 0) > 0 ? '▲' : '▼'}{Math.abs(octaveShifts[String(i)] ?? 0)}oct
                  </span>
                )}
              </div>
            );
          })}
        </div>

        <div style={{ padding: 8, borderTop: '1px solid #eee', display: 'flex', gap: 6 }}>
          <button onClick={() => setShowImport(true)} style={btnStyle('primary')}>
            + Add tune…
          </button>
          <button onClick={handleExport} style={{ ...btnStyle('keep'), flex: 1 }}>
            💾 Export
          </button>
        </div>
        {saveMessage && (
          <div style={{ padding: '4px 8px 8px', fontSize: 11, color: saveMessage.startsWith('✅') ? '#388E3C' : '#c62828', wordBreak: 'break-all' }}>
            {saveMessage}
          </div>
        )}
      </div>

      {/* Right panel: staff + actions */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 20, overflowY: 'auto' }}>
        {/* Title bar */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 22, fontWeight: 700, color: '#1976D2' }}>
            ♫ {currentMelody?.title ?? '…'}
          </span>
          {currentMelody?.source === 'import' && (
            <span style={{ fontSize: 12, color: '#888' }}>imported from TheSession.org</span>
          )}
          <span style={{ marginLeft: 'auto', fontSize: 13, color: '#999' }}>
            {currentIndex + 1} / {allMelodyCount}
          </span>
        </div>

        {/* Decision badge */}
        {currentDecision && (
          <div style={{ marginBottom: 8, fontSize: 12, color: decisionColor(currentDecision) }}>
            {decisionEmoji(currentDecision)} Currently marked: {currentDecision}
          </div>
        )}

        {/* Staff */}
        <div style={{
          background: '#fff', border: '1px solid #e0e0e0', borderRadius: 8,
          padding: '4px 8px', marginBottom: 16,
        }}>
          {currentMelody
            ? <MusicStaff notes={staffNotes} fixedSpacing={36} rootChroma={ROOT_CHROMA} keySignatureMode={0} />
            : <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#bbb' }}>Loading…</div>
          }
        </div>

        {/* Octave shift display */}
        {currentOctaveShift !== 0 && (
          <div style={{ fontSize: 12, color: '#FF9800', marginBottom: 8 }}>
            Octave shift: {currentOctaveShift > 0 ? '+' : ''}{currentOctaveShift}
          </div>
        )}

        {/* Playback row */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
          <button
            onClick={() => currentMelody && playMelody(currentMelody, currentOctaveShift)}
            disabled={!currentMelody || isPlaying}
            style={btnStyle('primary')}
          >
            {isPlaying ? '⏸ Playing…' : '▶ Play'}
          </button>
          <button
            onClick={() => { cancelPlayback(); setIsPlaying(false); }}
            disabled={!isPlaying}
            style={btnStyle('secondary')}
          >
            ⏹ Stop
          </button>
        </div>

        {/* Decision + octave actions */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          <button onClick={() => setDecision('keep')} style={{ ...btnStyle('keep'), minWidth: 90 }}>
            ✅ Keep
          </button>
          <button onClick={() => setDecision('discard')} style={{ ...btnStyle('discard'), minWidth: 90 }}>
            🗑 Discard
          </button>
          <button onClick={() => setDecision('later')} style={{ ...btnStyle('later'), minWidth: 90 }}>
            🕐 Later
          </button>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
          <button onClick={() => shiftOctave(1)} disabled={!currentMelody} style={btnStyle('secondary')}>
            ▲ Oct+1
          </button>
          <button onClick={() => shiftOctave(-1)} disabled={!currentMelody} style={btnStyle('secondary')}>
            ▼ Oct-1
          </button>
          <button onClick={resetOctave} disabled={currentOctaveShift === 0} style={btnStyle('secondary')}>
            ↺ Reset Octave
          </button>
          <button onClick={openAbcEditor} disabled={!currentMelody} style={{ ...btnStyle('secondary'), marginLeft: 'auto' }}>
            ✏ Edit ABC
          </button>
        </div>

        {/* Inline ABC editor */}
        {showAbcEditor && (
          <div style={{
            background: '#FAFAFA', border: '1px solid #E0E0E0', borderRadius: 8,
            padding: 14, marginBottom: 16,
          }}>
            <div style={{ fontSize: 12, color: '#555', marginBottom: 6, fontWeight: 600 }}>
              ABC notation — edit and click Apply
              <span style={{ fontWeight: 400, marginLeft: 8, color: '#888' }}>
                (K:C, L:1/4 — uppercase=oct4, lowercase=oct5, ^ sharp, _ flat, /2 half-dur, 2 double-dur)
              </span>
            </div>
            <textarea
              value={abcText}
              onChange={e => { setAbcText(e.target.value); setAbcError(''); }}
              spellCheck={false}
              style={{
                width: '100%', minHeight: 120, padding: '8px 10px', fontFamily: 'monospace',
                fontSize: 13, border: '1px solid #ccc', borderRadius: 6, boxSizing: 'border-box',
                resize: 'vertical', background: '#fff',
              }}
            />
            {abcError && (
              <div style={{ color: '#E53935', fontSize: 12, marginTop: 4 }}>{abcError}</div>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button onClick={applyAbcEdit} style={btnStyle('primary')}>
                ✓ Apply
              </button>
              <button onClick={() => { setShowAbcEditor(false); setAbcError(''); }} style={btnStyle('secondary')}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Navigation */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => navigate(currentIndex - 1)}
            disabled={currentIndex === 0}
            style={{ ...btnStyle('secondary'), flex: 1 }}
          >
            ◀ Prev
          </button>
          <button
            onClick={() => navigate(currentIndex + 1)}
            disabled={currentIndex >= allMelodyCount - 1}
            style={{ ...btnStyle('secondary'), flex: 1 }}
          >
            Next ▶
          </button>
        </div>

        {/* Mini dot grid */}
        <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', marginTop: 20 }}>
          {Array.from({ length: total }, (_, i) => {
            const d = decisions[String(i)];
            return (
              <button
                key={i}
                onClick={() => navigate(i)}
                title={melodies.get(i)?.title ?? `Tune ${i + 1}`}
                style={{
                  width: 18, height: 18, border: 'none', borderRadius: 3,
                  cursor: 'pointer', fontSize: 8, padding: 0,
                  background: i === currentIndex ? '#1976D2' : d === 'keep' ? '#388E3C' : d === 'discard' ? '#C62828' : d === 'later' ? '#E65100' : '#e0e0e0',
                  color: (i === currentIndex || d) ? '#fff' : '#555',
                  fontWeight: i === currentIndex ? 700 : 400,
                }}
              >
                {i + 1}
              </button>
            );
          })}
          {importedMelodies.map((m, i) => {
            const idx = total + i;
            const d = decisions[String(idx)];
            return (
              <button
                key={idx}
                onClick={() => navigate(idx)}
                title={`[imported] ${m.title}`}
                style={{
                  width: 18, height: 18, border: '1px solid #FF9800', borderRadius: 3,
                  cursor: 'pointer', fontSize: 8, padding: 0,
                  background: idx === currentIndex ? '#FF9800' : d === 'keep' ? '#388E3C' : d === 'discard' ? '#C62828' : '#FFF8E1',
                  color: idx === currentIndex ? '#fff' : '#555',
                }}
              >
                +
              </button>
            );
          })}
        </div>
      </div>

      {/* Import dialog */}
      {showImport && (
        <ImportDialog
          onImport={handleImport}
          onClose={() => setShowImport(false)}
        />
      )}
    </div>
  );
}

function decisionColor(d: Decision) {
  return d === 'keep' ? '#4CAF50' : d === 'discard' ? '#f44336' : '#FF9800';
}

function decisionEmoji(d: Decision) {
  return d === 'keep' ? '✅' : d === 'discard' ? '🗑' : '🕐';
}

type BtnVariant = 'primary' | 'secondary' | 'keep' | 'discard' | 'later';

function btnStyle(variant: BtnVariant): React.CSSProperties {
  const base: React.CSSProperties = {
    padding: '8px 14px', borderRadius: 6, border: 'none', cursor: 'pointer',
    fontSize: 13, fontWeight: 600, transition: 'opacity 0.15s', whiteSpace: 'nowrap',
  };
  switch (variant) {
    case 'primary':  return { ...base, background: '#1976D2', color: '#fff' };
    case 'secondary': return { ...base, background: '#e0e0e0', color: '#333' };
    case 'keep':    return { ...base, background: '#4CAF50', color: '#fff' };
    case 'discard': return { ...base, background: '#f44336', color: '#fff' };
    case 'later':   return { ...base, background: '#FF9800', color: '#fff' };
  }
}
