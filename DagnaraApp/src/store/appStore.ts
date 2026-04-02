import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';

export const XP_LEVELS = [
  { level: 1, name: '🌱 Seed',      min: 0   },
  { level: 2, name: '🌿 Sprout',    min: 100 },
  { level: 3, name: '🌳 Sapling',   min: 250 },
  { level: 4, name: '🏅 Tracker',   min: 500 },
  { level: 5, name: '⭐ Champion',  min: 900 },
  { level: 6, name: '🏆 Legend',    min: 1500 },
];

export function getXpLevel(xp: number) {
  let current = XP_LEVELS[0];
  for (const tier of XP_LEVELS) { if (xp >= tier.min) current = tier; else break; }
  const next = XP_LEVELS.find(t => t.min > current.min);
  const progress = next ? (xp - current.min) / (next.min - current.min) : 1;
  const toNext = next ? next.min - xp : 0;
  return { ...current, progress, toNext, nextMin: next?.min ?? current.min };
}

// Only these fields are persisted — no UI state, no functions
interface PersistedData {
  lifeScore: number | null;
  lifeScoreDate: string | null;
  streak: number;
  lastLoggedDate: string | null;
  programs: Record<string, boolean>;
  weightHistory: { date: string; kg: number }[];
  xp: number;
  activityLevel: 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';
  weightGoal: 'lose' | 'maintain' | 'gain';
  calorieGoal: number;
}

interface AppState extends PersistedData {
  userEmail: string | null;
  messagesOpen: boolean;
  setUserEmail: (email: string | null) => void;
  setMessagesOpen: (v: boolean) => void;
  setLifeScore: (score: number) => Promise<void>;
  checkAndUpdateStreak: (date: string) => Promise<void>;
  setProgram: (id: string, enabled: boolean) => Promise<void>;
  addWeightEntry: (kg: number) => Promise<void>;
  addXp: (amount: number) => Promise<void>;
  loadApp: (email?: string) => Promise<void>;
  setGoals: (activityLevel: AppState['activityLevel'], weightGoal: AppState['weightGoal'], calorieGoal: number) => Promise<void>;
  reset: () => void;
}

function todayStr() { return new Date().toISOString().split('T')[0]; }

function pick(s: AppState): PersistedData {
  return {
    lifeScore: s.lifeScore,
    lifeScoreDate: s.lifeScoreDate,
    streak: s.streak,
    lastLoggedDate: s.lastLoggedDate,
    programs: s.programs,
    weightHistory: s.weightHistory,
    xp: s.xp,
    activityLevel: s.activityLevel,
    weightGoal: s.weightGoal,
    calorieGoal: s.calorieGoal,
  };
}

// Save to AsyncStorage AND Supabase (fire-and-forget on cloud, never blocks local)
async function persist(data: PersistedData, email: string | null) {
  const key = email ? `app_store_${email}` : 'app_store_anon';
  await AsyncStorage.setItem(key, JSON.stringify(data));
  if (email) {
    try {
      await supabase.from('dagnara_app_state').upsert(
        { email, state_data: data, updated_at: new Date().toISOString() },
        { onConflict: 'email' }
      );
    } catch {
      // Network failure — local save already done, cloud will catch up on next action
    }
  }
}

export const useAppStore = create<AppState>((set, get) => ({
  lifeScore: null,
  lifeScoreDate: null,
  streak: 0,
  lastLoggedDate: null,
  programs: { nutrition: true, hydration: true, movement: false, sleep: false, stress: false, quit_smoking: false, quit_drinking: false, pill_reminder: false },
  weightHistory: [],
  xp: 0,
  activityLevel: 'moderate',
  weightGoal: 'maintain',
  calorieGoal: 2000,
  userEmail: null,
  messagesOpen: false,

  setUserEmail: (email) => set({ userEmail: email }),
  setMessagesOpen: (v) => set({ messagesOpen: v }),

  // Load local first, then overlay with cloud data if email provided
  loadApp: async (email?: string) => {
    // 1. Local restore (scoped to this user)
    const localKey = email ? `app_store_${email}` : 'app_store_anon';
    const raw = await AsyncStorage.getItem(localKey);
    const local: Partial<PersistedData> = raw ? JSON.parse(raw) : {};

    // 2. Cloud restore
    if (email) {
      try {
        const { data } = await supabase
          .from('dagnara_app_state')
          .select('state_data')
          .eq('email', email)
          .maybeSingle();

        if (data?.state_data) {
          const cloud: PersistedData = data.state_data;
          // Merge: take the higher value for numeric progress fields
          const merged: PersistedData = {
            lifeScore: cloud.lifeScore ?? local.lifeScore ?? null,
            lifeScoreDate: cloud.lifeScoreDate ?? local.lifeScoreDate ?? null,
            streak: Math.max(local.streak ?? 0, cloud.streak ?? 0),
            lastLoggedDate: cloud.lastLoggedDate ?? local.lastLoggedDate ?? null,
            programs: { ...(local.programs ?? {}), ...(cloud.programs ?? {}) },
            weightHistory: cloud.weightHistory?.length
              ? cloud.weightHistory
              : (local.weightHistory ?? []),
            xp: Math.max(local.xp ?? 0, cloud.xp ?? 0),
            activityLevel: cloud.activityLevel ?? local.activityLevel ?? 'moderate',
            weightGoal: cloud.weightGoal ?? local.weightGoal ?? 'maintain',
            calorieGoal: cloud.calorieGoal ?? local.calorieGoal ?? 2000,
          };
          set(merged);
          await AsyncStorage.setItem(localKey, JSON.stringify(merged));
          return;
        }
      } catch {
        // Network error — fall through to local data
      }
    }

    if (Object.keys(local).length > 0) set(local);
  },

  setLifeScore: async (score) => {
    const update: Partial<PersistedData> = { lifeScore: score, lifeScoreDate: todayStr() };
    set(update);
    await persist(pick({ ...get(), ...update }), get().userEmail);
  },

  checkAndUpdateStreak: async (date) => {
    const { lastLoggedDate, streak } = get();
    if (lastLoggedDate === date) return;
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];
    const newStreak = lastLoggedDate === yesterdayStr ? streak + 1 : 1;
    const update = { streak: newStreak, lastLoggedDate: date };
    set(update);
    await persist(pick({ ...get(), ...update }), get().userEmail);
  },

  setProgram: async (id, enabled) => {
    const programs = { ...get().programs, [id]: enabled };
    set({ programs });
    await persist(pick({ ...get(), programs }), get().userEmail);
  },

  addWeightEntry: async (kg) => {
    const entry = { date: todayStr(), kg };
    const weightHistory = [...get().weightHistory.filter(w => w.date !== todayStr()), entry]
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-30);
    set({ weightHistory });
    await persist(pick({ ...get(), weightHistory }), get().userEmail);
  },

  addXp: async (amount) => {
    const xp = get().xp + amount;
    set({ xp });
    await persist(pick({ ...get(), xp }), get().userEmail);
  },

  setGoals: async (activityLevel, weightGoal, calorieGoal) => {
    set({ activityLevel, weightGoal, calorieGoal });
    await persist(pick({ ...get(), activityLevel, weightGoal, calorieGoal }), get().userEmail);
  },

  reset: () => set({
    lifeScore: null, lifeScoreDate: null, streak: 0, lastLoggedDate: null,
    programs: { nutrition: true, hydration: true, movement: false, sleep: false, stress: false, quit_smoking: false, quit_drinking: false, pill_reminder: false },
    weightHistory: [], xp: 0, activityLevel: 'moderate', weightGoal: 'maintain', calorieGoal: 2000, userEmail: null, messagesOpen: false,
  }),
}));

export function calcTDEE(age: number, weightKg: number, heightCm: number, sex: 'male' | 'female', activityLevel: string, weightGoal: string): number {
  // Clamp inputs to realistic ranges
  const safeAge    = Math.max(10, Math.min(age    || 25,  100));
  const safeWeight = Math.max(20, Math.min(weightKg || 70, 300));
  const safeHeight = Math.max(100, Math.min(heightCm || 170, 250));
  // Harris-Benedict BMR
  const bmr = sex === 'female'
    ? 447.593 + (9.247 * safeWeight) + (3.098 * safeHeight) - (4.330 * safeAge)
    : 88.362 + (13.397 * safeWeight) + (4.799 * safeHeight) - (5.677 * safeAge);
  const multipliers: Record<string, number> = { sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, very_active: 1.9 };
  const tdee = bmr * (multipliers[activityLevel] ?? 1.55);
  const goalOffset: Record<string, number> = { lose: -500, maintain: 0, gain: 300 };
  return Math.round(tdee + (goalOffset[weightGoal] ?? 0));
}
