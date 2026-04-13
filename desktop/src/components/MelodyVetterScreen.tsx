import React, { useState, useEffect, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import MusicStaff from './MusicStaff';
import { useAudioPlayback } from '../hooks/useAudioPlayback';
import { StaffDisplayNote } from '../types';

interface MelodyInfo {
  title: string;
  midi_notes: number[];
  durations: number[];
}

type Decision = 'keep' | 'discard' | 'later';

const DECISIONS_KEY = 'melody_vetter_decisions';
const INDEX_KEY = 'melody_vetter_index';
const TOTAL = 57; // melody_count()
const VET_BPM = 80;
const ROOT_CHROMA = 0; // C

function loadDecisions(): Record<string, Decision> {
  try {
    const raw = localStorage.getItem(DECISIONS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveDecisions(d: Record<string, Decision>) {
  try { localStorage.setItem(DECISIONS_KEY, JSON.stringify(d)); } catch {}
}

function loadIndex(): number {
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    const n = raw !== null ? parseInt(raw, 10) : 0;
    return isNaN(n) ? 0 : Math.min(n, TOTAL - 1);
  } catch { return 0; }
}

interface Props {
  onBack: () => void;
}

export default function MelodyVetterScreen({ onBack }: Props) {
  const [currentIndex, setCurrentIndex] = useState<number>(loadIndex);
  const [decisions, setDecisions] = useState<Record<string, Decision>>(loadDecisions);
  const [melody, setMelody] = useState<MelodyInfo | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [autoPlay, setAutoPlay] = useState(true);
  const [copied, setCopied] = useState(false);
  const { playSequence, cancelPlayback } = useAudioPlayback();
  const playGenRef = useRef(0);

  // Persist index
  useEffect(() => {
    try { localStorage.setItem(INDEX_KEY, String(currentIndex)); } catch {}
  }, [currentIndex]);

  // Load melody when index changes
  useEffect(() => {
    let cancelled = false;
    setMelody(null);
    setIsPlaying(false);
    invoke<MelodyInfo | null>('cmd_pick_melody_by_index', { index: currentIndex, rootChroma: ROOT_CHROMA })
      .then(result => { if (!cancelled) setMelody(result); })
      .catch(console.error);
    return () => { cancelled = true; };
  }, [currentIndex]);

  // Auto-play when melody loads (only if autoPlay flag is set)
  useEffect(() => {
    if (!melody || !autoPlay) return;
    const gen = ++playGenRef.current;
    const myGen = gen;
    cancelPlayback();
    setIsPlaying(true);
    playSequence(
      melody.midi_notes,
      () => {},
      () => { if (playGenRef.current === myGen) setIsPlaying(false); },
      VET_BPM,
      melody.durations,
    );
    return () => { cancelPlayback(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [melody]);

  const replay = useCallback(() => {
    if (!melody) return;
    const gen = ++playGenRef.current;
    const myGen = gen;
    cancelPlayback();
    setIsPlaying(true);
    playSequence(
      melody.midi_notes,
      () => {},
      () => { if (playGenRef.current === myGen) setIsPlaying(false); },
      VET_BPM,
      melody.durations,
    );
  }, [melody, playSequence, cancelPlayback]);

  const navigate = useCallback((newIndex: number, shouldAutoPlay: boolean) => {
    cancelPlayback();
    setIsPlaying(false);
    playGenRef.current++;
    setAutoPlay(shouldAutoPlay);
    setCurrentIndex(Math.max(0, Math.min(TOTAL - 1, newIndex)));
  }, [cancelPlayback]);

  const decide = useCallback((verdict: Decision) => {
    const updated = { ...decisions, [String(currentIndex)]: verdict };
    setDecisions(updated);
    saveDecisions(updated);
    // Find next undecided tune
    let next = currentIndex + 1;
    while (next < TOTAL && updated[String(next)] !== undefined) next++;
    if (next >= TOTAL) {
      // All tunes reviewed — show summary
      setShowSummary(true);
    } else {
      navigate(next, true);
    }
  }, [currentIndex, decisions, navigate]);

  const reviewedCount = Object.keys(decisions).length;
  const keepList = Object.entries(decisions).filter(([,v]) => v === 'keep').map(([k]) => parseInt(k)).sort((a,b)=>a-b);
  const discardList = Object.entries(decisions).filter(([,v]) => v === 'discard').map(([k]) => parseInt(k)).sort((a,b)=>a-b);
  const laterList = Object.entries(decisions).filter(([,v]) => v === 'later').map(([k]) => parseInt(k)).sort((a,b)=>a-b);

  const staffNotes: StaffDisplayNote[] = melody
    ? melody.midi_notes.map((midi, i) => ({ midi, state: 'expected', duration: melody.durations[i] }))
    : [];

  const currentDecision = decisions[String(currentIndex)];

  if (showSummary) {
    return <SummaryView
      total={TOTAL}
      keepList={keepList}
      discardList={discardList}
      laterList={laterList}
      onBack={() => setShowSummary(false)}
      onReset={() => {
        const empty = {};
        setDecisions(empty);
        saveDecisions(empty);
        setShowSummary(false);
        navigate(0, true);
      }}
      copied={copied}
      onCopy={() => {
        const text = discardList.join(', ');
        navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
      }}
    />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', padding: '16px', boxSizing: 'border-box', overflowY: 'auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
        <button onClick={onBack} style={btnStyle('secondary')}>← Back</button>
        <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, flex: 1 }}>Melody Library Vetter</h1>
        <button onClick={() => setShowSummary(true)} style={btnStyle('secondary')}>Summary</button>
      </div>

      {/* Progress */}
      <div style={{ fontSize: 13, color: '#888', marginBottom: 4 }}>
        Tune {currentIndex + 1} of {TOTAL} &nbsp;·&nbsp;
        {reviewedCount} reviewed &nbsp;(
        <span style={{ color: '#4CAF50' }}>{keepList.length} keep</span>,&nbsp;
        <span style={{ color: '#f44336' }}>{discardList.length} discard</span>,&nbsp;
        <span style={{ color: '#FF9800' }}>{laterList.length} later</span>)
      </div>
      <div style={{ height: 4, background: '#eee', borderRadius: 2, marginBottom: 16 }}>
        <div style={{ height: '100%', width: `${(reviewedCount / TOTAL) * 100}%`, background: '#2196F3', borderRadius: 2, transition: 'width 0.3s' }} />
      </div>

      {/* Title + Play */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#1976D2' }}>
            ♫ {melody?.title ?? '…'}
          </div>
          {currentDecision && (
            <div style={{ fontSize: 12, color: decisionColor(currentDecision), marginTop: 2 }}>
              {decisionEmoji(currentDecision)} Previously marked: {currentDecision}
            </div>
          )}
        </div>
        <button
          onClick={replay}
          disabled={!melody}
          style={{ ...btnStyle('primary'), minWidth: 100 }}
        >
          {isPlaying ? '⏸ Playing…' : '▶ Play Again'}
        </button>
      </div>

      {/* Staff */}
      <div style={{ background: '#fafafa', border: '1px solid #e0e0e0', borderRadius: 8, padding: '4px 8px', marginBottom: 16 }}>
        {melody
          ? <MusicStaff notes={staffNotes} fixedSpacing={30} rootChroma={ROOT_CHROMA} keySignatureMode={0} />
          : <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#bbb' }}>Loading…</div>
        }
      </div>

      {/* Decision buttons */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button
          onClick={() => navigate(currentIndex - 1, false)}
          disabled={currentIndex === 0}
          style={{ ...btnStyle('secondary'), flex: 1 }}
        >◀ Prev</button>
        <button
          onClick={() => decide('keep')}
          disabled={!melody}
          style={{ ...btnStyle('keep'), flex: 2 }}
        >✅ Keep</button>
        <button
          onClick={() => decide('discard')}
          disabled={!melody}
          style={{ ...btnStyle('discard'), flex: 2 }}
        >🗑 Discard</button>
        <button
          onClick={() => decide('later')}
          disabled={!melody}
          style={{ ...btnStyle('later'), flex: 2 }}
        >🕐 Later</button>
        <button
          onClick={() => navigate(currentIndex + 1, true)}
          disabled={currentIndex >= TOTAL - 1}
          style={{ ...btnStyle('secondary'), flex: 1 }}
        >Next ▶</button>
      </div>

      {/* Mini index jump */}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {Array.from({ length: TOTAL }, (_, i) => {
          const d = decisions[String(i)];
          return (
            <button
              key={i}
              onClick={() => navigate(i, true)}
              title={`Tune ${i + 1}`}
              style={{
                width: 20, height: 20, border: 'none', borderRadius: 3, cursor: 'pointer', fontSize: 9,
                background: i === currentIndex ? '#1976D2' : d === 'keep' ? '#C8E6C9' : d === 'discard' ? '#FFCDD2' : d === 'later' ? '#FFE0B2' : '#e0e0e0',
                color: i === currentIndex ? '#fff' : '#333',
                fontWeight: i === currentIndex ? 700 : 400,
              }}
            >{i + 1}</button>
          );
        })}
      </div>
    </div>
  );
}

interface SummaryProps {
  total: number;
  keepList: number[];
  discardList: number[];
  laterList: number[];
  onBack: () => void;
  onReset: () => void;
  copied: boolean;
  onCopy: () => void;
}

// We need titles for the summary. Since we can't easily async-load all 57 in the summary view,
// we'll just show indices. The user can cross-reference with the vetting screen.
function SummaryView({ total, keepList, discardList, laterList, onBack, onReset, copied, onCopy }: SummaryProps) {
  return (
    <div style={{ padding: 16, overflowY: 'auto', height: '100vh', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <button onClick={onBack} style={btnStyle('secondary')}>← Back to Vetting</button>
        <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, flex: 1 }}>Vetting Summary</h1>
        <button onClick={onReset} style={{ ...btnStyle('discard'), fontSize: 12 }}>🔄 Reset All</button>
      </div>

      <p style={{ color: '#888', fontSize: 13 }}>
        {keepList.length + discardList.length + laterList.length} of {total} reviewed.
      </p>

      <SummarySection title={`✅ Keep (${keepList.length})`} indices={keepList} color="#4CAF50" />
      <SummarySection title={`🗑 Discard (${discardList.length})`} indices={discardList} color="#f44336" />
      <SummarySection title={`🕐 Decide Later (${laterList.length})`} indices={laterList} color="#FF9800" />

      {discardList.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: '#555' }}>Indices to remove from MELODY_LIBRARY</h3>
          <p style={{ fontSize: 12, color: '#888', margin: '4px 0 8px' }}>
            These are 0-based array indices. Remove the corresponding lines from
            <code style={{ background: '#f5f5f5', padding: '1px 4px', borderRadius: 3 }}>rust/src/music_theory.rs</code>.
          </p>
          <div style={{
            background: '#1e1e1e', color: '#d4d4d4', fontFamily: 'monospace', fontSize: 13,
            padding: 12, borderRadius: 6, marginBottom: 8, whiteSpace: 'pre-wrap', wordBreak: 'break-all'
          }}>
            {discardList.join(', ')}
          </div>
          <button onClick={onCopy} style={btnStyle('primary')}>
            {copied ? '✅ Copied!' : '📋 Copy indices'}
          </button>
        </div>
      )}
    </div>
  );
}

function SummarySection({ title, indices, color }: { title: string; indices: number[]; color: string }) {
  if (indices.length === 0) return (
    <div style={{ marginBottom: 12 }}>
      <h3 style={{ fontSize: 14, fontWeight: 700, color }}>{title}</h3>
      <p style={{ color: '#bbb', fontSize: 12, marginTop: 2 }}>None</p>
    </div>
  );
  return (
    <div style={{ marginBottom: 16 }}>
      <h3 style={{ fontSize: 14, fontWeight: 700, color }}>{title}</h3>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
        {indices.map(i => (
          <span key={i} style={{ background: '#f5f5f5', border: `1px solid ${color}33`, borderRadius: 4, padding: '2px 6px', fontSize: 12 }}>
            [{i}]
          </span>
        ))}
      </div>
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
    fontSize: 13, fontWeight: 600, transition: 'opacity 0.15s',
  };
  switch (variant) {
    case 'primary':  return { ...base, background: '#1976D2', color: '#fff' };
    case 'secondary': return { ...base, background: '#e0e0e0', color: '#333' };
    case 'keep':    return { ...base, background: '#4CAF50', color: '#fff' };
    case 'discard': return { ...base, background: '#f44336', color: '#fff' };
    case 'later':   return { ...base, background: '#FF9800', color: '#fff' };
  }
}
