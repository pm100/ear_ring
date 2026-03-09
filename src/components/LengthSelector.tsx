import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface LengthSelectorProps {
  value: number;
  onChange: (n: number) => void;
  label?: string;
  min?: number;
  max?: number;
}

export default function LengthSelector({ value, onChange, label = 'Sequence length', min = 2, max = 8 }: LengthSelectorProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.row}>
        {Array.from({ length: max - min + 1 }, (_, i) => i + min).map((n) => (
          <TouchableOpacity
            key={n}
            style={[styles.chip, value === n && styles.chipActive]}
            onPress={() => onChange(n)}
          >
            <Text style={[styles.chipText, value === n && styles.chipTextActive]}>{n}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 6 },
  label: { color: '#94a3b8', fontSize: 12, textTransform: 'uppercase' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipActive: { backgroundColor: '#6366f1', borderColor: '#6366f1' },
  chipText: { color: '#94a3b8', fontSize: 15 },
  chipTextActive: { color: '#ffffff', fontWeight: '700' },
});
