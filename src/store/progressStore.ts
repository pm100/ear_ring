import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@ear_ring_history';

export interface SessionRecord {
  id: string;
  date: string;         // ISO timestamp
  scaleName: string;
  rootLabel: string;    // e.g. "C4"
  score: number;        // 0–100
  length: number;
}

interface ProgressState {
  history: SessionRecord[];
  streak: number;       // consecutive sessions with score ≥ 80
  bestByScale: Record<string, number>; // scaleName → best score

  loadHistory: () => Promise<void>;
  addSession: (record: SessionRecord) => Promise<void>;
}

function computeStreak(history: SessionRecord[]): number {
  let streak = 0;
  for (const rec of [...history].reverse()) {
    if (rec.score >= 80) streak++;
    else break;
  }
  return streak;
}

function computeBest(history: SessionRecord[]): Record<string, number> {
  const best: Record<string, number> = {};
  for (const rec of history) {
    if ((best[rec.scaleName] ?? -1) < rec.score) {
      best[rec.scaleName] = rec.score;
    }
  }
  return best;
}

export const useProgressStore = create<ProgressState>((set, get) => ({
  history: [],
  streak: 0,
  bestByScale: {},

  loadHistory: async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      const history: SessionRecord[] = raw ? JSON.parse(raw) : [];
      set({ history, streak: computeStreak(history), bestByScale: computeBest(history) });
    } catch {
      // ignore storage errors
    }
  },

  addSession: async (record) => {
    const history = [...get().history, record];
    set({ history, streak: computeStreak(history), bestByScale: computeBest(history) });
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(history));
    } catch {
      // ignore storage errors
    }
  },
}));
