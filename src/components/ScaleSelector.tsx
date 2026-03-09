import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { NOTE_NAMES, NoteNameStr, SCALES } from '../utils/musicTheory';

interface ScaleSelectorProps {
  rootName: NoteNameStr;
  rootOctave: number;
  scaleId: number;
  onRootChange: (name: NoteNameStr, octave: number) => void;
  onScaleChange: (id: number) => void;
}

export default function ScaleSelector({
  rootName,
  rootOctave,
  scaleId,
  onRootChange,
  onScaleChange,
}: ScaleSelectorProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>Key</Text>
      {/* Note name row */}
      <View style={styles.row}>
        {NOTE_NAMES.map((name) => (
          <TouchableOpacity
            key={name}
            style={[styles.chip, rootName === name && styles.chipActive]}
            onPress={() => onRootChange(name, rootOctave)}
          >
            <Text style={[styles.chipText, rootName === name && styles.chipTextActive]}>
              {name}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Octave row */}
      <Text style={styles.label}>Octave</Text>
      <View style={styles.row}>
        {[3, 4, 5].map((oct) => (
          <TouchableOpacity
            key={oct}
            style={[styles.chip, rootOctave === oct && styles.chipActive]}
            onPress={() => onRootChange(rootName, oct)}
          >
            <Text style={[styles.chipText, rootOctave === oct && styles.chipTextActive]}>
              {oct}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Scale type */}
      <Text style={styles.label}>Scale</Text>
      <View style={styles.row}>
        {SCALES.map((s) => (
          <TouchableOpacity
            key={s.id}
            style={[styles.chip, scaleId === s.id && styles.chipActive]}
            onPress={() => onScaleChange(s.id)}
          >
            <Text style={[styles.chipText, scaleId === s.id && styles.chipTextActive]}>
              {s.name}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 6 },
  label: { color: '#94a3b8', fontSize: 12, marginTop: 8, textTransform: 'uppercase' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
  },
  chipActive: { backgroundColor: '#6366f1', borderColor: '#6366f1' },
  chipText: { color: '#94a3b8', fontSize: 13 },
  chipTextActive: { color: '#ffffff', fontWeight: '600' },
});
