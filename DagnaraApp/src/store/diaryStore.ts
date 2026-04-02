import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';

export interface FoodItem {
  id: string;
  icon: string;
  name: string;
  kcal: number;
  carbs: number;
  protein: number;
  fat: number;
  fiber?: number;
  sugar?: number;
  sodium?: number;
  vitaminC?: number;  // mg
  calcium?: number;   // mg
  iron?: number;      // mg
  potassium?: number; // mg
  unit: string;
  meal: 'breakfast' | 'lunch' | 'dinner' | 'snack';
}

export interface SleepLog {
  bedtime: string;
  waketime: string;
  quality: number;   // 0–4
  duration: string;  // e.g. "7h 30m"
}

export interface DiaryEntry {
  date: string;
  foods: FoodItem[];
  water: number;
  calories_burned: number;
  sleep?: SleepLog;
}

interface DiaryState {
  today: string;
  selectedDate: string;
  entries: Record<string, DiaryEntry>;
  setSelectedDate: (date: string) => void;
  loadEntry: (date: string) => Promise<void>;
  addFood: (date: string, item: FoodItem) => Promise<void>;
  removeFood: (date: string, id: string) => Promise<void>;
  addWater: (date: string) => Promise<void>;
  removeWater: (date: string) => Promise<void>;
  updateCaloriesBurned: (date: string, kcal: number) => Promise<void>;
  logSleep: (date: string, sleep: SleepLog) => Promise<void>;
  syncEntry: (date: string, email: string) => Promise<void>;
  restoreFromCloud: (email: string) => Promise<void>;
  reset: () => void;
}

function todayStr() { return new Date().toISOString().split('T')[0]; }
function emptyEntry(date: string): DiaryEntry {
  return { date, foods: [], water: 0, calories_burned: 0 };
}

// Save locally and push to Supabase if email available
async function saveEntry(date: string, entry: DiaryEntry, email: string | null) {
  const key = email ? `diary_${email}_${date}` : `diary_anon_${date}`;
  await AsyncStorage.setItem(key, JSON.stringify(entry));
  if (email) {
    try {
      await supabase.from('dagnara_diary').upsert(
        { email, date, entry_data: entry, updated_at: new Date().toISOString() },
        { onConflict: 'email,date' }
      );
    } catch {
      // Network failure — local save already done
    }
  }
}

// Get the current user's email from authStore (no circular dep — zustand stores are singletons)
function getEmail(): string | null {
  try {
    // Lazy import to avoid circular dependency at module load time
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('./authStore').useAuthStore.getState().email;
  } catch {
    return null;
  }
}

export const useDiaryStore = create<DiaryState>((set, get) => ({
  today: todayStr(),
  selectedDate: todayStr(),
  entries: {},

  setSelectedDate: (date) => set({ selectedDate: date }),

  loadEntry: async (date) => {
    // 1. Try local cache first (instant)
    const email = getEmail();
    const key = email ? `diary_${email}_${date}` : `diary_anon_${date}`;
    const raw = await AsyncStorage.getItem(key);
    const local: DiaryEntry = raw ? JSON.parse(raw) : emptyEntry(date);
    set((s) => ({ entries: { ...s.entries, [date]: local } }));

    // 2. Check Supabase for a newer version
    if (email) {
      try {
        const { data } = await supabase
          .from('dagnara_diary')
          .select('entry_data')
          .eq('email', email)
          .eq('date', date)
          .maybeSingle();

        if (data?.entry_data) {
          const cloud: DiaryEntry = data.entry_data;
          // Use cloud if it has more food entries (more complete)
          const best = cloud.foods.length >= local.foods.length ? cloud : local;
          set((s) => ({ entries: { ...s.entries, [date]: best } }));
          await AsyncStorage.setItem(key, JSON.stringify(best));
        }
      } catch {
        // Network error — local data already shown
      }
    }
  },

  addFood: async (date, item) => {
    const entries = get().entries;
    const entry = entries[date] ?? emptyEntry(date);
    const updated = { ...entry, foods: [...entry.foods, item] };
    set((s) => ({ entries: { ...s.entries, [date]: updated } }));
    await saveEntry(date, updated, getEmail());
  },

  removeFood: async (date, id) => {
    const entries = get().entries;
    const entry = entries[date] ?? emptyEntry(date);
    const updated = { ...entry, foods: entry.foods.filter((f) => f.id !== id) };
    set((s) => ({ entries: { ...s.entries, [date]: updated } }));
    await saveEntry(date, updated, getEmail());
  },

  addWater: async (date) => {
    const entries = get().entries;
    const entry = entries[date] ?? emptyEntry(date);
    const updated = { ...entry, water: entry.water + 1 };
    set((s) => ({ entries: { ...s.entries, [date]: updated } }));
    await saveEntry(date, updated, getEmail());
  },

  removeWater: async (date) => {
    const entries = get().entries;
    const entry = entries[date] ?? emptyEntry(date);
    if (entry.water === 0) return;
    const updated = { ...entry, water: entry.water - 1 };
    set((s) => ({ entries: { ...s.entries, [date]: updated } }));
    await saveEntry(date, updated, getEmail());
  },

  updateCaloriesBurned: async (date, kcal) => {
    const entries = get().entries;
    const entry = entries[date] ?? emptyEntry(date);
    const updated = { ...entry, calories_burned: kcal };
    set((s) => ({ entries: { ...s.entries, [date]: updated } }));
    await saveEntry(date, updated, getEmail());
  },

  logSleep: async (date, sleep) => {
    const entries = get().entries;
    const entry = entries[date] ?? emptyEntry(date);
    const updated = { ...entry, sleep };
    set((s) => ({ entries: { ...s.entries, [date]: updated } }));
    await saveEntry(date, updated, getEmail());
  },

  reset: () => set({ entries: {}, selectedDate: todayStr(), today: todayStr() }),

  // Manual sync (kept for compatibility)
  syncEntry: async (date, email) => {
    const entry = get().entries[date];
    if (!entry) return;
    await supabase.from('dagnara_diary').upsert(
      { email, date, entry_data: entry, updated_at: new Date().toISOString() },
      { onConflict: 'email,date' }
    );
  },

  // Pull last 30 days from Supabase on login/session restore
  restoreFromCloud: async (email: string) => {
    try {
      const since = (() => {
        const d = new Date();
        d.setDate(d.getDate() - 30);
        return d.toISOString().split('T')[0];
      })();

      const { data } = await supabase
        .from('dagnara_diary')
        .select('date, entry_data')
        .eq('email', email)
        .gte('date', since);

      if (!data || data.length === 0) return;

      // Batch-load all local entries in one call
      const localKeys = data.map(row => `diary_${email}_${row.date}`);
      const localPairs = await AsyncStorage.multiGet(localKeys);
      const localMap: Record<string, DiaryEntry> = {};
      for (const [key, raw] of localPairs) {
        const date = key.replace(`diary_${email}_`, '');
        localMap[date] = raw ? JSON.parse(raw) : emptyEntry(date);
      }

      const restored: Record<string, DiaryEntry> = {};
      const toSet: [string, string][] = [];
      for (const row of data) {
        const cloud: DiaryEntry = row.entry_data;
        const local = localMap[row.date] ?? emptyEntry(row.date);
        const best = cloud.foods.length >= local.foods.length ? cloud : local;
        restored[row.date] = best;
        toSet.push([`diary_${email}_${row.date}`, JSON.stringify(best)]);
      }

      await AsyncStorage.multiSet(toSet);
      set((s) => ({ entries: { ...s.entries, ...restored } }));
    } catch {
      // Network error — local data still available
    }
  },
}));
