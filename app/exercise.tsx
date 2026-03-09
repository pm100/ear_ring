import * as Haptics from 'expo-haptics';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import MusicStaff, { NoteColor } from '../src/components/MusicStaff';
import PitchMeter from '../src/components/PitchMeter';
import { useAudioPlayback } from '../src/hooks/useAudioPlayback';
import { usePitchDetection, PitchResult } from '../src/hooks/usePitchDetection';
import { useExerciseStore } from '../src/store/exerciseStore';
import { SCALES, midiLabel, isCorrect, getKeySignature } from '../src/utils/musicTheory';
import { staffPosition, generateSequence, freqToNote } from '../src/native/CoreBridge';

function triggerHaptic(correct: boolean) {
  if (Platform.OS === 'web') return;
  if (correct) {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  } else {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

type Phase = 'idle' | 'listening' | 'pausing';

interface StaffSlot {
  staffStep: number;
  color: NoteColor;
  accidental?: 'sharp' | 'flat';
}

function makeSlot(midi: number, color: NoteColor, keySigType: 'sharp' | 'flat' | 'none'): StaffSlot {
  const chroma = midi % 12;
  const isChromatic = [1, 3, 6, 8, 10].includes(chroma);
  return {
    staffStep: staffPosition(midi),
    color,
    accidental: isChromatic ? (keySigType === 'flat' ? 'flat' : 'sharp') : undefined,
  };
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ExerciseScreen() {
  const store = useExerciseStore();
  const { playSequence, isPlaying, samplerLoading } = useAudioPlayback();

  // ── Display state ────────────────────────────────────────────────────────
  const [sequence, setSequence] = useState<number[]>([]);
  const [phase, setPhase] = useState<Phase>('idle');
  const [currentIdx, setCurrentIdx] = useState(0);
  const [confirmedNotes, setConfirmedNotes] = useState<StaffSlot[]>([]);
  const [currentDetected, setCurrentDetected] = useState<StaffSlot | null>(null);

  // ── Refs: mutable game state safe to read from async callbacks ───────────
  const seqRef = useRef<number[]>([]);
  const idxRef = useRef(0);
  const phaseRef = useRef<Phase>('idle');
  const keySigTypeRef = useRef<'sharp' | 'flat' | 'none'>('none');

  // ── Initialise (or re-initialise) a new sequence ─────────────────────────
  const initSequence = useCallback((seq: number[]) => {
    const keySigType = getKeySignature(store.rootMidi, store.scaleId).type;
    seqRef.current = seq;
    idxRef.current = 0;
    phaseRef.current = 'idle';
    keySigTypeRef.current = keySigType;
    setSequence(seq);
    setCurrentIdx(0);
    setConfirmedNotes([]);
    setCurrentDetected(null);
    setPhase('idle');
  }, [store.rootMidi, store.scaleId]);

  // Build first sequence on mount
  useEffect(() => {
    const seq = generateSequence(store.rootMidi, store.scaleId, store.sequenceLength, store.seed);
    store.setSequence(seq);
    store.resetDetected();
    initSequence(seq);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Start a brand-new exercise (new seed) ────────────────────────────────
  const startFresh = useCallback(async () => {
    const newSeed = Math.floor(Math.random() * 2 ** 32);
    const seq = generateSequence(store.rootMidi, store.scaleId, store.sequenceLength, newSeed);
    store.setSequence(seq);
    store.resetDetected();
    initSequence(seq);
    await playSequence(seq);
    phaseRef.current = 'listening';
    setPhase('listening');
  }, [store.rootMidi, store.scaleId, store.sequenceLength, initSequence, playSequence]);

  // Stable ref so timeouts always call the latest version
  const startFreshRef = useRef(startFresh);
  useEffect(() => { startFreshRef.current = startFresh; }, [startFresh]);

  // ── Restart the same sequence (on mistake) ────────────────────────────────
  const restartSame = useCallback(async () => {
    idxRef.current = 0;
    phaseRef.current = 'idle';
    setCurrentIdx(0);
    setConfirmedNotes([]);
    setCurrentDetected(null);
    setPhase('idle');
    await playSequence(seqRef.current);
    phaseRef.current = 'listening';
    setPhase('listening');
  }, [playSequence]);

  const restartSameRef = useRef(restartSame);
  useEffect(() => { restartSameRef.current = restartSame; }, [restartSame]);

  // ── Note handler ─────────────────────────────────────────────────────────
  const onNote = useCallback((result: PitchResult) => {
    if (phaseRef.current !== 'listening') return;
    const idx = idxRef.current;
    if (idx >= seqRef.current.length) return;

    phaseRef.current = 'pausing';
    setPhase('pausing');

    const expected = seqRef.current[idx];
    const correct = isCorrect(result.midi, expected, result.cents);
    const slot = makeSlot(result.midi, correct ? 'green' : 'red', keySigTypeRef.current);

    store.addDetected({ midi: result.midi, cents: result.cents });
    triggerHaptic(correct);
    setCurrentDetected(slot);

    if (correct) {
      const nextIdx = idx + 1;
      if (nextIdx < seqRef.current.length) {
        // Advance to next note after a brief green flash
        setTimeout(() => {
          setConfirmedNotes((prev) => [...prev, slot]);
          idxRef.current = nextIdx;
          setCurrentIdx(nextIdx);
          setCurrentDetected(null);
          phaseRef.current = 'listening';
          setPhase('listening');
        }, 500);
      } else {
        // All correct → celebrate briefly then start a fresh sequence
        setTimeout(() => {
          setConfirmedNotes((prev) => [...prev, slot]);
          setCurrentDetected(null);
          phaseRef.current = 'idle';
          setPhase('idle');
          setTimeout(() => startFreshRef.current(), 700);
        }, 500);
      }
    } else {
      // Wrong → show red, tell the user, replay same sequence after delay
      setTimeout(() => restartSameRef.current(), 2000);
    }
  }, [store]); // eslint-disable-line react-hooks/exhaustive-deps

  const pitchDetection = usePitchDetection(onNote);

  // ── Manual controls ──────────────────────────────────────────────────────
  async function handlePlay() {
    if (isPlaying) return;
    await playSequence(sequence);
  }

  async function handleListen() {
    store.resetDetected();
    idxRef.current = 0;
    phaseRef.current = 'listening';
    setCurrentIdx(0);
    setConfirmedNotes([]);
    setCurrentDetected(null);
    setPhase('listening');
    await pitchDetection.startListening();
  }

  function handleStop() {
    pitchDetection.stopListening();
    phaseRef.current = 'idle';
    setPhase('idle');
    setCurrentDetected(null);
  }

  // ── Derived display values ───────────────────────────────────────────────
  const isActive = phase === 'listening' || phase === 'pausing';
  const staffNotes: StaffSlot[] = [...confirmedNotes, ...(currentDetected ? [currentDetected] : [])];
  const keySig = getKeySignature(store.rootMidi, store.scaleId);
  const scaleName = SCALES[store.scaleId]?.name ?? '';
  const rootLabel = midiLabel(store.rootMidi);

  // Feedback label shown during pausing phase
  const feedbackLabel =
    phase === 'pausing'
      ? currentDetected?.color === 'green'
        ? '✓ Correct!'
        : '✗ Wrong! Restarting…'
      : `Note ${currentIdx + 1} / ${sequence.length}`;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.subtitle}>
        {rootLabel} {scaleName} · {sequence.length} notes
      </Text>

      {/* Music staff — starts empty, fills as notes are detected */}
      <View style={styles.staffWrap}>
        <MusicStaff notes={staffNotes} width={340} keySignature={keySig} />
      </View>

      {/* Status row: only shown while active */}
      {isActive && (
        <Text
          style={[
            styles.feedbackLabel,
            phase === 'pausing' && currentDetected?.color === 'green' && styles.feedbackGreen,
            phase === 'pausing' && currentDetected?.color === 'red' && styles.feedbackRed,
          ]}
        >
          {feedbackLabel}
        </Text>
      )}

      {/* Live pitch meter */}
      {isActive && (() => {
        const hz = pitchDetection.currentHz;
        const nr = hz > 0 ? freqToNote(hz) : null;
        return (
          <View style={styles.meterRow}>
            <PitchMeter hz={hz} midi={nr?.midi ?? -1} cents={nr?.cents ?? 0} />
          </View>
        );
      })()}

      {/* Action buttons */}
      <TouchableOpacity
        style={[styles.btn, styles.btnPlay, (isPlaying || samplerLoading) && styles.btnDisabled]}
        onPress={handlePlay}
        disabled={isPlaying || samplerLoading}
      >
        <Text style={styles.btnText}>
          {samplerLoading ? '⏳ Loading piano…' : isPlaying ? '♪ Playing…' : '▶  Play Sequence'}
        </Text>
      </TouchableOpacity>

      {!isActive ? (
        <TouchableOpacity style={[styles.btn, styles.btnListen]} onPress={handleListen}>
          <Text style={styles.btnText}>🎤  Start Listening</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity style={[styles.btn, styles.btnStop]} onPress={handleStop}>
          <Text style={styles.btnText}>⏹  Stop</Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity style={styles.replayBtn} onPress={handlePlay} disabled={isPlaying || samplerLoading}>
        <Text style={styles.replayBtnText}>↺  Replay sequence</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, gap: 16, alignItems: 'center' },
  subtitle: { color: '#94a3b8', fontSize: 14 },
  staffWrap: { width: '100%' },
  feedbackLabel: {
    fontSize: 18,
    fontWeight: '600',
    color: '#94a3b8',
  },
  feedbackGreen: { color: '#4ade80' },
  feedbackRed: { color: '#f87171' },
  meterRow: { flexDirection: 'row', alignItems: 'center' },
  btn: {
    width: '100%',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  btnPlay: { backgroundColor: '#6366f1' },
  btnListen: { backgroundColor: '#0ea5e9' },
  btnStop: { backgroundColor: '#ef4444' },
  btnDisabled: { opacity: 0.5 },
  btnText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  replayBtn: { paddingVertical: 10 },
  replayBtnText: { color: '#94a3b8', fontSize: 14 },
});