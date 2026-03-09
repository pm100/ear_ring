import { router } from 'expo-router';
import React, { useEffect } from 'react';
import { FlatList, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useProgressStore, SessionRecord } from '../src/store/progressStore';

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 80 ? '#4ade80' : score >= 50 ? '#facc15' : '#f87171';
  return (
    <View style={[styles.badge, { borderColor: color }]}>
      <Text style={[styles.badgeText, { color }]}>{score}%</Text>
    </View>
  );
}

function SessionRow({ item }: { item: SessionRecord }) {
  const date = new Date(item.date);
  const label = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const time = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  return (
    <View style={styles.row}>
      <View style={styles.rowLeft}>
        <Text style={styles.rowTitle}>
          {item.rootLabel} {item.scaleName}
        </Text>
        <Text style={styles.rowSub}>
          {item.length} notes · {label} {time}
        </Text>
      </View>
      <ScoreBadge score={item.score} />
    </View>
  );
}

export default function ProgressScreen() {
  const { history, streak, bestByScale, loadHistory } = useProgressStore();

  useEffect(() => {
    loadHistory();
  }, []);

  const sorted = [...history].reverse();

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {/* Streak */}
      <View style={styles.streakCard}>
        <Text style={styles.streakEmoji}>🔥</Text>
        <View>
          <Text style={styles.streakNum}>{streak}</Text>
          <Text style={styles.streakLabel}>day streak (≥80%)</Text>
        </View>
      </View>

      {/* Best by scale */}
      {Object.keys(bestByScale).length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Best scores by scale</Text>
          {Object.entries(bestByScale).map(([scale, score]) => (
            <View key={scale} style={styles.bestRow}>
              <Text style={styles.bestScale}>{scale}</Text>
              <ScoreBadge score={score} />
            </View>
          ))}
        </View>
      )}

      {/* History */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Session history</Text>
        {sorted.length === 0 ? (
          <Text style={styles.empty}>No sessions yet. Complete an exercise to start tracking!</Text>
        ) : (
          sorted.map((s) => <SessionRow key={s.id} item={s} />)
        )}
      </View>

      <TouchableOpacity style={styles.btn} onPress={() => router.push('/')}>
        <Text style={styles.btnText}>➕  New Exercise</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, gap: 16 },
  streakCard: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  streakEmoji: { fontSize: 40 },
  streakNum: { color: '#e2e8f0', fontSize: 36, fontWeight: '800' },
  streakLabel: { color: '#94a3b8', fontSize: 13 },
  card: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 16,
    gap: 10,
    borderWidth: 1,
    borderColor: '#334155',
  },
  cardTitle: { color: '#e2e8f0', fontSize: 15, fontWeight: '700', marginBottom: 4 },
  bestRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  bestScale: { color: '#94a3b8', fontSize: 14 },
  badge: {
    borderWidth: 1.5,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeText: { fontSize: 13, fontWeight: '700' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  rowLeft: { flex: 1, gap: 2 },
  rowTitle: { color: '#e2e8f0', fontSize: 14, fontWeight: '600' },
  rowSub: { color: '#64748b', fontSize: 12 },
  empty: { color: '#475569', fontSize: 14, textAlign: 'center', paddingVertical: 12 },
  btn: {
    backgroundColor: '#6366f1',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  btnText: { color: '#fff', fontSize: 17, fontWeight: '700' },
});
