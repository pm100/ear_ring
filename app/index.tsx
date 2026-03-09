import { router } from 'expo-router';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import LengthSelector from '../src/components/LengthSelector';
import ScaleSelector from '../src/components/ScaleSelector';
import { useExerciseStore } from '../src/store/exerciseStore';
import { NoteNameStr, NOTE_NAMES, rootMidi, SCALES } from '../src/utils/musicTheory';

export default function HomeScreen() {
  const store = useExerciseStore();
  const [rootName, setRootName] = useState<NoteNameStr>('C');
  const [rootOctave, setRootOctave] = useState(4);

  function handleStart() {
    store.setRoot(rootMidi(rootName, rootOctave));
    store.newSeed();
    store.resetDetected();
    router.push('/exercise');
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.tagline}>Train your ear. Play it back.</Text>

      <View style={styles.card}>
        <ScaleSelector
          rootName={rootName}
          rootOctave={rootOctave}
          scaleId={store.scaleId}
          onRootChange={(name, oct) => {
            setRootName(name);
            setRootOctave(oct);
          }}
          onScaleChange={store.setScaleId}
        />
      </View>

      <View style={styles.card}>
        <LengthSelector value={store.sequenceLength} onChange={store.setSequenceLength} />
      </View>

      <TouchableOpacity style={styles.startBtn} onPress={handleStart}>
        <Text style={styles.startBtnText}>▶  Start Exercise</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.progressBtn} onPress={() => router.push('/progress')}>
        <Text style={styles.progressBtnText}>📊  View Progress</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.setupBtn} onPress={() => router.push('/setup')}>
        <Text style={styles.setupBtnText}>🎙  Mic Setup</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, gap: 16 },
  tagline: { color: '#94a3b8', fontSize: 15, textAlign: 'center', marginBottom: 4 },
  card: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  startBtn: {
    backgroundColor: '#6366f1',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  startBtnText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  progressBtn: {
    backgroundColor: '#1e293b',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  progressBtnText: { color: '#94a3b8', fontSize: 16 },
  setupBtn: {
    backgroundColor: '#1e293b',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  setupBtnText: { color: '#64748b', fontSize: 16 },
});
