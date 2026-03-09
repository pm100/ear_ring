import React, { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import MusicStaff, { NoteColor } from '../src/components/MusicStaff';
import PitchMeter from '../src/components/PitchMeter';
import { usePitchDetection, PitchResult } from '../src/hooks/usePitchDetection';
import { staffPosition, freqToNote } from '../src/native/CoreBridge';
import { midiLabel } from '../src/utils/musicTheory';

const MAX_NOTES = 8;

// Notes to use for simulation testing (note name → frequency in Hz)
const TEST_NOTES: { label: string; hz: number }[] = [
  { label: 'C4',  hz: 261.63 },
  { label: 'E4',  hz: 329.63 },
  { label: 'G4',  hz: 392.00 },
  { label: 'A4',  hz: 440.00 },
  { label: 'C5',  hz: 523.25 },
];

interface SetupNote {
  staffStep: number;
  color: NoteColor;
  label: string;
  accidental?: 'sharp' | 'flat';
}

export default function SetupScreen() {
  const [notes, setNotes] = useState<SetupNote[]>([]);
  const [lastLabel, setLastLabel] = useState<string | null>(null);
  const [simulating, setSimulating] = useState(false);

  const onNote = useCallback((result: PitchResult) => {
    const step = staffPosition(result.midi);
    const label = midiLabel(result.midi);
    const chroma = result.midi % 12;
    const isChromatic = [1, 3, 6, 8, 10].includes(chroma);
    const accidental = isChromatic ? 'sharp' as const : undefined;
    setLastLabel(label);
    setNotes((prev) => {
      const next = [...prev, { staffStep: step, color: 'white' as NoteColor, label, accidental }];
      // keep only the most recent MAX_NOTES
      return next.length > MAX_NOTES ? next.slice(next.length - MAX_NOTES) : next;
    });
  }, []);

  const pitchDetection = usePitchDetection(onNote);

  async function handleSimulate(hz: number, label: string) {
    if (simulating) return;
    setSimulating(true);
    await pitchDetection.simulatePitch(hz, 2000);
    setSimulating(false);
  }

  async function handleListen() {
    await pitchDetection.startListening();
  }

  function handleStop() {
    pitchDetection.stopListening();
  }

  function handleClear() {
    setNotes([]);
    setLastLabel(null);
  }

  const hz = pitchDetection.currentHz;
  const nr = hz > 0 ? freqToNote(hz) : null;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.description}>
        Play notes on your instrument. Detected notes appear on the staff below.
      </Text>

      {/* Staff — always shown, starts empty */}
      <View style={styles.staffWrap}>
        <MusicStaff notes={notes} width={340} />
        {notes.length === 0 && (
          <Text style={styles.emptyHint}>No notes detected yet</Text>
        )}
      </View>

      {/* Last detected note name */}
      {lastLabel && (
        <Text style={styles.lastNote}>{lastLabel}</Text>
      )}

      {/* Live pitch meter while listening */}
      {pitchDetection.isListening && (
        <View style={styles.meterRow}>
          <PitchMeter hz={hz} midi={nr?.midi ?? -1} cents={nr?.cents ?? 0} />
          <Text style={styles.listenLabel}>Listening…</Text>
        </View>
      )}

      {/* Controls */}
      {!pitchDetection.isListening ? (
        <TouchableOpacity style={[styles.btn, styles.btnListen]} onPress={handleListen}>
          <Text style={styles.btnText}>🎤  Start Listening</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity style={[styles.btn, styles.btnStop]} onPress={handleStop}>
          <Text style={styles.btnText}>⏹  Stop</Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity style={[styles.btn, styles.btnClear]} onPress={handleClear}>
        <Text style={styles.btnTextDim}>✕  Clear Staff</Text>
      </TouchableOpacity>

      {/* ── Simulation test section ─────────────────────────────────── */}
      <View style={styles.simSection}>
        <Text style={styles.simTitle}>🧪 Simulate note (for testing)</Text>
        <View style={styles.simRow}>
          {TEST_NOTES.map((n) => (
            <TouchableOpacity
              key={n.label}
              style={[styles.simBtn, simulating && styles.btnDisabled]}
              onPress={() => handleSimulate(n.hz, n.label)}
              disabled={simulating}
            >
              <Text style={styles.simBtnText}>{n.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        {simulating && <Text style={styles.simHint}>Simulating… (2 s)</Text>}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, gap: 16, alignItems: 'center' },
  description: {
    color: '#94a3b8',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  staffWrap: { width: '100%' },
  emptyHint: {
    color: '#475569',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 6,
  },
  lastNote: {
    color: '#e2e8f0',
    fontSize: 32,
    fontWeight: '700',
    letterSpacing: 2,
  },
  meterRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  listenLabel: { color: '#94a3b8', fontSize: 14 },
  btn: {
    width: '100%',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  btnListen: { backgroundColor: '#0ea5e9' },
  btnStop: { backgroundColor: '#ef4444' },
  btnClear: {
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
  },
  btnText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  btnTextDim: { color: '#94a3b8', fontSize: 16 },
  simSection: { width: '100%', gap: 10, marginTop: 4 },
  simTitle: { color: '#64748b', fontSize: 13, textAlign: 'center' },
  simRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, flexWrap: 'wrap' },
  simBtn: {
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#475569',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  simBtnText: { color: '#94a3b8', fontSize: 15, fontWeight: '600' },
  btnDisabled: { opacity: 0.4 },
  simHint: { color: '#6366f1', fontSize: 13, textAlign: 'center' },
});
