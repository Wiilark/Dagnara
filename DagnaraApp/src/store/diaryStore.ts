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

export interface StrengthSet {
  reps: number;
  weight: number;  // always stored in kg internally
  unit: 'kg' | 'lbs';
}

export interface StrengthExercise {
  name: string;
  sets: StrengthSet[];
}

export interface StrengthSession {
  id: string;
  exercises: StrengthExercise[];
  totalKcal: number;
  loggedAt: string;
}

export interface CardioSession {
  id: string;
  name: string;
  emoji: string;
  minutes: number;
  kcal: number;
  loggedAt: string;
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
  veggies?: number;
  fruits?: number;
  skippedMeals?: Record<string, boolean>;
  strengthSessions?: StrengthSession[];
  cardioSessions?: CardioSession[];
  _savedAt?: string;
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
  setWater: (date: string, n: number) => Promise<void>;
  setVeggies: (date: string, n: number) => Promise<void>;
  setFruits: (date: string, n: number) => Promise<void>;
  setSkippedMeals: (date: string, meals: Record<string, boolean>) => Promise<void>;
  updateCaloriesBurned: (date: string, kcal: number) => Promise<void>;
  logSleep: (date: string, sleep: SleepLog) => Promise<void>;
  addStrengthSession: (date: string, session: StrengthSession) => Promise<void>;
  removeStrengthSession: (date: string, id: string) => Promise<void>;
  addCardioSession: (date: string, session: CardioSession) => Promise<void>;
  removeCardioSession: (date: string, id: string) => Promise<void>;
  syncEntry: (date: string, email: string) => Promise<void>;
  restoreFromCloud: (email: string) => Promise<void>;
  reset: () => void;
}

function todayStr() { return new Date().toISOString().split('T')[0]; }
function emptyEntry(date: string): DiaryEntry {
  return { date, foods: [], water: 0, calories_burned: 0 };
}

// Save locally and push to Supabase if email available (retries once on failure)
async function saveEntry(date: string, entry: DiaryEntry, email: string | null) {
  const stamped = { ...entry, _savedAt: new Date().toISOString() };
  const key = email ? `diary_${email}_${date}` : `diary_anon_${date}`;
  await AsyncStorage.setItem(key, JSON.stringify(stamped));
  if (email) {
    const push = () => supabase.from('dagnara_diary').upsert(
      { email, date, entry_data: stamped, updated_at: stamped._savedAt },
      { onConflict: 'email,date' }
    );
    void (async () => { try { await push(); } catch { try { await new Promise(r => setTimeout(r, 4000)); await push(); } catch {} } })();
  }
}

// Keep only the most recent 60 dates in memory to prevent unbounded growth
function pruneEntries(entries: Record<string, DiaryEntry>): Record<string, DiaryEntry> {
  const keys = Object.keys(entries).sort();
  if (keys.length <= 60) return entries;
  return Object.fromEntries(keys.slice(-60).map(k => [k, entries[k]]));
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
    // Show local immediately for instant UI, cloud may overwrite below
    set((s) => ({ entries: pruneEntries({ ...s.entries, [date]: local }) }));

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
          // Prefer whichever was saved more recently (_savedAt timestamp)
          const best = (cloud._savedAt ?? '') >= (local._savedAt ?? '') ? cloud : local;
          set((s) => ({ entries: pruneEntries({ ...s.entries, [date]: best }) }));
          await AsyncStorage.setItem(key, JSON.stringify(best));
          return;
        }
      } catch {
        // Network error — local data already shown
      }
    }
    set((s) => ({ entries: pruneEntries({ ...s.entries, [date]: local }) }));
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

  setWater: async (date, n) => {
    const entries = get().entries;
    const entry = entries[date] ?? emptyEntry(date);
    const updated = { ...entry, water: Math.max(0, n) };
    set((s) => ({ entries: { ...s.entries, [date]: updated } }));
    await saveEntry(date, updated, getEmail());
  },

  setVeggies: async (date, n) => {
    const entries = get().entries;
    const entry = entries[date] ?? emptyEntry(date);
    const updated = { ...entry, veggies: Math.max(0, n) };
    set((s) => ({ entries: { ...s.entries, [date]: updated } }));
    await saveEntry(date, updated, getEmail());
  },

  setFruits: async (date, n) => {
    const entries = get().entries;
    const entry = entries[date] ?? emptyEntry(date);
    const updated = { ...entry, fruits: Math.max(0, n) };
    set((s) => ({ entries: { ...s.entries, [date]: updated } }));
    await saveEntry(date, updated, getEmail());
  },

  setSkippedMeals: async (date, meals) => {
    const entries = get().entries;
    const entry = entries[date] ?? emptyEntry(date);
    const updated = { ...entry, skippedMeals: meals };
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

  addStrengthSession: async (date, session) => {
    const entries = get().entries;
    const entry = entries[date] ?? emptyEntry(date);
    const updated = { ...entry, strengthSessions: [...(entry.strengthSessions ?? []), session] };
    set((s) => ({ entries: { ...s.entries, [date]: updated } }));
    await saveEntry(date, updated, getEmail());
  },

  removeStrengthSession: async (date, id) => {
    const entries = get().entries;
    const entry = entries[date] ?? emptyEntry(date);
    const updated = { ...entry, strengthSessions: (entry.strengthSessions ?? []).filter(s => s.id !== id) };
    set((s) => ({ entries: { ...s.entries, [date]: updated } }));
    await saveEntry(date, updated, getEmail());
  },

  addCardioSession: async (date, session) => {
    const entries = get().entries;
    const entry = entries[date] ?? emptyEntry(date);
    const updated = { ...entry, cardioSessions: [...(entry.cardioSessions ?? []), session] };
    set((s) => ({ entries: { ...s.entries, [date]: updated } }));
    await saveEntry(date, updated, getEmail());
  },

  removeCardioSession: async (date, id) => {
    const entries = get().entries;
    const entry = entries[date] ?? emptyEntry(date);
    const removed = (entry.cardioSessions ?? []).find(s => s.id === id);
    const updated = {
      ...entry,
      cardioSessions: (entry.cardioSessions ?? []).filter(s => s.id !== id),
      calories_burned: Math.max(0, entry.calories_burned - (removed?.kcal ?? 0)),
    };
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
        d.setDate(d.getDate() - 90);
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
        const best = (cloud._savedAt ?? '') >= (local._savedAt ?? '') ? cloud : local;
        restored[row.date] = best;
        toSet.push([`diary_${email}_${row.date}`, JSON.stringify(best)]);
      }

      await AsyncStorage.multiSet(toSet);
      set((s) => ({ entries: pruneEntries({ ...s.entries, ...restored }) }));
    } catch {
      // Network error — local data still available
    }
  },
}));
