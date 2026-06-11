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
  // Stored verbatim in whatever unit the user logged with — `unit` is the source of
  // truth. Conversion to kg happens at read time (see estimateStrengthKcal).
  weight: number;
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

export interface FastingInterval {
  startTime: string;   // ISO
  endTime: string;     // ISO
  mode: string;        // '16:8', '18:6', etc.
  targetHours: number;
  actualHours: number;
  completed: boolean;
}

export interface DiaryEntry {
  date: string;
  foods: FoodItem[];
  water: number;
  calories_burned: number;
  sleep?: SleepLog;
  mood?: number;   // 0–4 index (Awful → Amazing)
  steps?: number;
  veggies?: number;
  fruits?: number;
  skippedMeals?: Record<string, boolean>;
  strengthSessions?: StrengthSession[];
  cardioSessions?: CardioSession[];
  fastingIntervals?: FastingInterval[];
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
  addCaloriesBurned: (date: string, delta: number) => Promise<void>;
  logSleep: (date: string, sleep: SleepLog) => Promise<void>;
  logMood: (date: string, mood: number) => Promise<void>;
  logSteps: (date: string, steps: number) => Promise<void>;
  addStrengthSession: (date: string, session: StrengthSession) => Promise<void>;
  removeStrengthSession: (date: string, id: string) => Promise<void>;
  addCardioSession: (date: string, session: CardioSession) => Promise<void>;
  removeCardioSession: (date: string, id: string) => Promise<void>;
  logFastingInterval: (date: string, interval: FastingInterval) => Promise<void>;
  syncEntry: (date: string, email: string) => Promise<void>;
  restoreFromCloud: (email: string) => Promise<void>;
  reset: () => void;
}

// Local YYYY-MM-DD — see appStore for rationale. Diary days must align with
// the user's clock, not UTC, or late-evening logs land on the wrong day.
function todayStr() { return new Date().toLocaleDateString('en-CA'); }
function emptyEntry(date: string): DiaryEntry {
  return { date, foods: [], water: 0, calories_burned: 0 };
}

// Debounced sync queue to prevent excessive Supabase writes
const syncQueue = new Set<string>();
let syncTimer: ReturnType<typeof setTimeout> | null = null;

async function processSyncQueue(get: () => DiaryState) {
  const email = getEmail();
  if (!email || syncQueue.size === 0) return;

  const dates = Array.from(syncQueue);
  syncQueue.clear();

  const entries = get().entries;
  const updates = dates
    .filter(date => !!entries[date])
    .map(date => ({
      email,
      date,
      entry_data: entries[date],
      updated_at: entries[date]._savedAt || new Date().toISOString(),
    }));

  if (updates.length > 0) {
    try {
      await supabase.from('dagnara_diary').upsert(updates, { onConflict: 'email,date' });
    } catch (e) {
      // Re-queue on failure
      dates.forEach(d => syncQueue.add(d));
       
      console.error('[diaryStore] batch sync failed, re-queued:', e);
    }
  }
}

function queueSync(date: string, get: () => DiaryState) {
  syncQueue.add(date);
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => processSyncQueue(get), 5000); // 5s debounce
}

// Save locally and push to Supabase if email available
async function saveEntry(date: string, entry: DiaryEntry, email: string | null, get: () => DiaryState) {
  const stamped = { ...entry, _savedAt: new Date().toISOString() };
  const key = email ? `diary_${email}_${date}` : `diary_anon_${date}`;
  await AsyncStorage.setItem(key, JSON.stringify(stamped));
  if (email) {
    queueSync(date, get);
  }
}

// Keep only the most recent 60 dates in memory to prevent unbounded growth
function pruneEntries(entries: Record<string, DiaryEntry>): Record<string, DiaryEntry> {
  const keys = Object.keys(entries).sort();
  if (keys.length <= 60) return entries;
  return Object.fromEntries(keys.slice(-60).map(k => [k, entries[k]]));
}

// Apply an update to one date's entry using the *freshest* state. Computing the
// new entry inside the functional set (rather than from a get() snapshot taken
// before the set) prevents lost updates when two mutations on the same date are
// dispatched in the same tick. Returns the computed entry so callers can persist it.
function mutate(
  set: (fn: (s: DiaryState) => Partial<DiaryState>) => void,
  date: string,
  fn: (entry: DiaryEntry) => DiaryEntry,
): DiaryEntry {
  let result!: DiaryEntry;
  set((s) => {
    result = fn(s.entries[date] ?? emptyEntry(date));
    return { entries: { ...s.entries, [date]: result } };
  });
  return result;
}

// Get the current user's email from authStore (no circular dep — zustand stores are singletons)
function getEmail(): string | null {
  try {
    // Lazy import to avoid circular dependency at module load time
     
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
    let local: DiaryEntry = emptyEntry(date);
    if (raw) {
      try { local = JSON.parse(raw); }
      catch { await AsyncStorage.removeItem(key); }
    }
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
  },

  addFood: async (date, item) => {
    const updated = mutate(set, date, (e) => ({ ...e, foods: [...e.foods, item] }));
    await saveEntry(date, updated, getEmail(), get);
  },

  removeFood: async (date, id) => {
    const updated = mutate(set, date, (e) => ({ ...e, foods: e.foods.filter((f) => f.id !== id) }));
    await saveEntry(date, updated, getEmail(), get);
  },

  addWater: async (date) => {
    const updated = mutate(set, date, (e) => ({ ...e, water: e.water + 1 }));
    await saveEntry(date, updated, getEmail(), get);
  },

  removeWater: async (date) => {
    if ((get().entries[date]?.water ?? 0) === 0) return;
    const updated = mutate(set, date, (e) => ({ ...e, water: Math.max(0, e.water - 1) }));
    await saveEntry(date, updated, getEmail(), get);
  },

  setWater: async (date, n) => {
    const updated = mutate(set, date, (e) => ({ ...e, water: Math.max(0, n) }));
    await saveEntry(date, updated, getEmail(), get);
  },

  setVeggies: async (date, n) => {
    const updated = mutate(set, date, (e) => ({ ...e, veggies: Math.max(0, n) }));
    await saveEntry(date, updated, getEmail(), get);
  },

  setFruits: async (date, n) => {
    const updated = mutate(set, date, (e) => ({ ...e, fruits: Math.max(0, n) }));
    await saveEntry(date, updated, getEmail(), get);
  },

  setSkippedMeals: async (date, meals) => {
    const updated = mutate(set, date, (e) => ({ ...e, skippedMeals: meals }));
    await saveEntry(date, updated, getEmail(), get);
  },

  updateCaloriesBurned: async (date, kcal) => {
    const updated = mutate(set, date, (e) => ({ ...e, calories_burned: kcal }));
    await saveEntry(date, updated, getEmail(), get);
  },

  // Additive — reads the freshest value inside the set, so rapid back-to-back
  // logs (two exercises tapped quickly) accumulate instead of clobbering.
  addCaloriesBurned: async (date, delta) => {
    const updated = mutate(set, date, (e) => ({ ...e, calories_burned: Math.max(0, e.calories_burned + delta) }));
    await saveEntry(date, updated, getEmail(), get);
  },

  logSleep: async (date, sleep) => {
    const updated = mutate(set, date, (e) => ({ ...e, sleep }));
    await saveEntry(date, updated, getEmail(), get);
  },

  logMood: async (date, mood) => {
    const updated = mutate(set, date, (e) => ({ ...e, mood }));
    await saveEntry(date, updated, getEmail(), get);
  },

  logSteps: async (date, steps) => {
    const updated = mutate(set, date, (e) => ({ ...e, steps }));
    await saveEntry(date, updated, getEmail(), get);
  },

  addStrengthSession: async (date, session) => {
    const updated = mutate(set, date, (e) => ({
      ...e,
      strengthSessions: [...(e.strengthSessions ?? []), session],
      calories_burned: e.calories_burned + session.totalKcal,
    }));
    await saveEntry(date, updated, getEmail(), get);
  },

  removeStrengthSession: async (date, id) => {
    const updated = mutate(set, date, (e) => {
      const removed = (e.strengthSessions ?? []).find(s => s.id === id);
      return {
        ...e,
        strengthSessions: (e.strengthSessions ?? []).filter(s => s.id !== id),
        calories_burned: Math.max(0, e.calories_burned - (removed?.totalKcal ?? 0)),
      };
    });
    await saveEntry(date, updated, getEmail(), get);
  },

  addCardioSession: async (date, session) => {
    const updated = mutate(set, date, (e) => ({ ...e, cardioSessions: [...(e.cardioSessions ?? []), session] }));
    await saveEntry(date, updated, getEmail(), get);
  },

  removeCardioSession: async (date, id) => {
    const updated = mutate(set, date, (e) => {
      const removed = (e.cardioSessions ?? []).find(s => s.id === id);
      return {
        ...e,
        cardioSessions: (e.cardioSessions ?? []).filter(s => s.id !== id),
        calories_burned: Math.max(0, e.calories_burned - (removed?.kcal ?? 0)),
      };
    });
    await saveEntry(date, updated, getEmail(), get);
  },

  logFastingInterval: async (date, interval) => {
    const updated = mutate(set, date, (e) => ({ ...e, fastingIntervals: [...(e.fastingIntervals ?? []), interval] }));
    await saveEntry(date, updated, getEmail(), get);
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
        if (raw) {
          try { localMap[date] = JSON.parse(raw); }
          catch { localMap[date] = emptyEntry(date); }
        } else {
          localMap[date] = emptyEntry(date);
        }
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
