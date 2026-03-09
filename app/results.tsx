import { router } from 'expo-router';
import React, { useEffect } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import MusicStaff, { NoteColor } from '../src/components/MusicStaff';
import { useExerciseStore } from '../src/store/exerciseStore';
import { useProgressStore } from '../src/store/progressStore';
import { compareSequences, computeScore } from '../src/utils/scoreCalculator';
import { SCALES, midiLabel } from '../src/utils/musicTheory';
import { staffPosition } from '../src/native/CoreBridge';

export default function ResultsScreen() {
  const store = useExerciseStore();
  const progress = useProgressStore();

  const comparisons = compareSequences(store.sequence, store.detected);
  const score = computeScore(comparisons);
  const scaleName = SCALES[store.scaleId]?.name ?? '';
  const rootLabel = midiLabel(store.rootMidi);

  // Save session on mount
  useEffect(() => {
    progress.addSession({
      id: `${Date.now()}`,
      date: new Date().toISOString(),
      scaleName,
      rootLabel,
      score,
      length: store.sequenceLength,
    });
  }, []);

  const staffNotes = comparisons.map((c) => ({
    staffStep: staffPosition(c.expected),
    color: (c.correct ? 'green' : 'red') as NoteColor,
  }));

  const emoji = score === 100 ? '🏆' : score >= 80 ? '🎉' : score >= 50 ? '👍' : '💪';

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.emoji}>{emoji}</Text>
      <Text style={styles.scoreText}>{score}%</Text>
      <Text style={styles.subtitle}>
        {rootLabel} {scaleName}
      </Text>

      {/* Staff showing correct/wrong */}
      <View style={styles.staffWrap}>
        <MusicStaff notes={staffNotes} width={340} />
      </View>

      {/* Per-note breakdown */}
      <View style={styles.breakdown}>
        {comparisons.map((c, i) => (
          <View key={i} style={[styles.noteRow, c.correct ? styles.correctRow : styles.wrongRow]}>
            <Text style={styles.noteLabel}>Note {i + 1}</Text>
            <Text style={styles.noteValue}>Expected: {midiLabel(c.expected)}</Text>
            <Text style={styles.noteValue}>
              Played: {c.detected >= 0 ? midiLabel(c.detected) : '—'}
            </Text>
            <Text style={[styles.noteStatus, { color: c.correct ? '#4ade80' : '#f87171' }]}>
              {c.correct ? '✓' : '✗'}
            </Text>
          </View>
        ))}
      </View>

      <TouchableOpacity style={styles.btn} onPress={() => router.replace('/exercise')}>
        <Text style={styles.btnText}>↺  Try Again</Text>
      </TouchableOpacity>

      <TouchableOpacity style={[styles.btn, styles.btnSecondary]} onPress={() => router.replace('/')}>
        <Text style={styles.btnTextSecondary}>🏠  New Exercise</Text>
      </TouchableOpacity>

      <TouchableOpacity style={[styles.btn, styles.btnSecondary]} onPress={() => router.push('/progress')}>
        <Text style={styles.btnTextSecondary}>📊  View Progress</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, gap: 14, alignItems: 'center' },
  emoji: { fontSize: 48 },
  scoreText: { color: '#e2e8f0', fontSize: 52, fontWeight: '800' },
  subtitle: { color: '#94a3b8', fontSize: 14 },
  staffWrap: { width: '100%' },
  breakdown: { width: '100%', gap: 8 },
  noteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  correctRow: { borderColor: '#166534', backgroundColor: '#052e16' },
  wrongRow: { borderColor: '#7f1d1d', backgroundColor: '#1c0505' },
  noteLabel: { color: '#94a3b8', fontSize: 12, width: 50 },
  noteValue: { color: '#e2e8f0', fontSize: 13, flex: 1 },
  noteStatus: { fontSize: 18, fontWeight: '700', width: 24 },
  btn: {
    width: '100%',
    backgroundColor: '#6366f1',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  btnSecondary: { backgroundColor: '#1e293b', borderWidth: 1, borderColor: '#334155' },
  btnText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  btnTextSecondary: { color: '#94a3b8', fontSize: 16 },
});
