import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import type { LocalFood } from '../lib/foodDatabase';
import { countUnread, MESSAGES } from '../lib/messages';

export const XP_LEVELS = [
  { level: 1,  name: '🌱 Seed',            min: 0      },
  { level: 2,  name: '🌿 Sprout',           min: 100    },
  { level: 3,  name: '🌳 Sapling',          min: 250    },
  { level: 4,  name: '📋 Tracker',          min: 500    },
  { level: 5,  name: '⭐ Achiever',         min: 900    },
  { level: 6,  name: '💪 Athlete',          min: 1_500  },
  { level: 7,  name: '🎯 Focused',          min: 2_400  },
  { level: 8,  name: '🔥 On Fire',          min: 3_600  },
  { level: 9,  name: '🏃 In Motion',        min: 5_100  },
  { level: 10, name: '🥇 Contender',        min: 7_000  },
  { level: 11, name: '🦁 Beast',            min: 9_500  },
  { level: 12, name: '💎 Diamond',          min: 12_500 },
  { level: 13, name: '🚀 Rocket',           min: 16_000 },
  { level: 14, name: '🧠 Mastermind',       min: 20_000 },
  { level: 15, name: '🌟 All-Star',         min: 25_000 },
  { level: 16, name: '🔱 Elite',            min: 31_000 },
  { level: 17, name: '👑 Royalty',          min: 38_000 },
  { level: 18, name: '⚡ Lightning',        min: 46_500 },
  { level: 19, name: '🌊 Force',            min: 56_500 },
  { level: 20, name: '🏆 Grand Champion',   min: 68_000 },
  { level: 21, name: '🐉 Legend',           min: 81_500 },
  { level: 22, name: '🌌 Cosmic',           min: 97_000 },
  { level: 23, name: '🔮 Oracle',           min: 115_000 },
  { level: 24, name: '🛡️ Guardian',         min: 136_000 },
  { level: 25, name: '⚔️ Warrior',          min: 160_000 },
  { level: 26, name: '🌙 Lunar',            min: 188_000 },
  { level: 27, name: '☀️ Solar',            min: 220_000 },
  { level: 28, name: '🌠 Nova',             min: 257_000 },
  { level: 29, name: '🎖️ Veteran',          min: 299_000 },
  { level: 30, name: '💫 Mythic',           min: 347_000 },
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
  unitSystem: 'Metric' | 'Imperial (US)' | 'UK' | 'US Customary';
  macroPcts: { carbs: number; protein: number; fat: number };
  savedRecipes: LocalFood[];
  country: string;  // ISO 3166-1 alpha-2 (e.g. 'US', 'SE'). Drives currency in Programs / money widgets.
  fastingWindow: string | null;       // e.g. '16:8', '18:6', '14:10' — null = not set
  dietaryPreferences: string | null;  // maps to a DIET_FILTERS value: 'High Protein', 'Vegan', etc.
  pillDefaultTime: string | null;     // 'HH:MM' 24h, e.g. '07:30'
  readMessageIds: number[];           // ids of inbox messages the user has read
  premium: boolean;                   // Pro tier. Free during launch → defaults true; flip false when real billing ships.
}

interface AppState extends PersistedData {
  userEmail: string | null;
  messagesOpen: boolean;
  coachOpen: boolean;
  hasUnread: boolean;
  unreadCount: number;
  setUserEmail: (email: string | null) => void;
  setMessagesOpen: (v: boolean) => void;
  setCoachOpen: (v: boolean) => void;
  setHasUnread: (v: boolean) => void;
  markMessageRead: (id: number) => Promise<void>;
  markAllRead: () => Promise<void>;
  setLifeScore: (score: number) => Promise<void>;
  checkAndUpdateStreak: (date: string) => Promise<void>;
  setProgram: (id: string, enabled: boolean) => Promise<void>;
  addWeightEntry: (kg: number) => Promise<void>;
  addXp: (amount: number) => Promise<void>;
  loadApp: (email?: string) => Promise<void>;
  setGoals: (activityLevel: AppState['activityLevel'], weightGoal: AppState['weightGoal'], calorieGoal: number) => Promise<void>;
  setUnitSystem: (system: AppState['unitSystem']) => Promise<void>;
  setCountry: (code: string) => Promise<void>;
  setFastingWindow: (window: string | null) => Promise<void>;
  setDietaryPreferences: (pref: string | null) => Promise<void>;
  setPillDefaultTime: (time: string | null) => Promise<void>;
  setPremium: (v: boolean) => Promise<void>;
  setMacroPcts: (pcts: { carbs: number; protein: number; fat: number }) => Promise<void>;
  saveRecipe: (recipe: LocalFood) => Promise<void>;
  deleteRecipe: (id: string) => Promise<void>;
  pendingAddMeal: string | null;
  setPendingAddMeal: (meal: string | null) => void;
  reset: () => void;
}

// Local (not UTC) YYYY-MM-DD — a user logging at 11pm PST must count as that
// day, not the next UTC day. 'en-CA' locale guarantees YYYY-MM-DD formatting.
function todayStr() { return new Date().toLocaleDateString('en-CA'); }

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
    unitSystem: s.unitSystem,
    macroPcts: s.macroPcts,
    savedRecipes: s.savedRecipes,
    country: s.country,
    fastingWindow: s.fastingWindow,
    dietaryPreferences: s.dietaryPreferences,
    pillDefaultTime: s.pillDefaultTime,
    readMessageIds: s.readMessageIds,
    premium: s.premium,
  };
}

// Debounced sync to prevent excessive Supabase writes
let syncTimer: ReturnType<typeof setTimeout> | null = null;
async function queueAppSync(data: PersistedData, email: string | null) {
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(async () => {
    if (!email) return;
    try {
      await supabase.from('dagnara_app_state').upsert(
        { email, state_data: data, updated_at: new Date().toISOString() },
        { onConflict: 'email' }
      );
    } catch (e) {
      // Retry logic or fail silently (AsyncStorage still has it)
       
      console.error('[appStore] cloud sync failed:', e);
    }
  }, 5000); // 5s debounce
}

// Save to AsyncStorage AND Supabase (fire-and-forget on cloud, never blocks local)
async function persist(data: PersistedData, email: string | null) {
  const key = email ? `app_store_${email}` : 'app_store_anon';
  await AsyncStorage.setItem(key, JSON.stringify(data));
  if (email) {
    queueAppSync(data, email);
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
  unitSystem: 'Metric',
  macroPcts: { carbs: 45, protein: 30, fat: 25 },
  savedRecipes: [],
  country: 'US',
  fastingWindow: null,
  dietaryPreferences: null,
  pillDefaultTime: null,
  readMessageIds: [],
  premium: true,   // free during launch — everyone gets Pro for now
  userEmail: null,
  messagesOpen: false,
  coachOpen: false,
  hasUnread: countUnread([]) > 0,
  unreadCount: countUnread([]),

  pendingAddMeal: null,
  setPendingAddMeal: (meal) => set({ pendingAddMeal: meal }),

  setUserEmail: (email) => set({ userEmail: email }),
  setMessagesOpen: (v) => set({ messagesOpen: v }),
  setCoachOpen: (v) => set({ coachOpen: v }),
  setHasUnread: (v) => set({ hasUnread: v }),

  markMessageRead: async (id) => {
    const { readMessageIds } = get();
    if (readMessageIds.includes(id)) return;
    const next = [...readMessageIds, id];
    const count = countUnread(next);
    set({ readMessageIds: next, unreadCount: count, hasUnread: count > 0 });
    await persist(pick(get()), get().userEmail);
  },

  markAllRead: async () => {
    const allIds = MESSAGES.map((m) => m.id);
    set({ readMessageIds: allIds, unreadCount: 0, hasUnread: false });
    await persist(pick(get()), get().userEmail);
  },

  // Load local first, then overlay with cloud data if email provided
  loadApp: async (email?: string) => {
    // 1. Local restore (scoped to this user)
    const localKey = email ? `app_store_${email}` : 'app_store_anon';
    const raw = await AsyncStorage.getItem(localKey);
    let local: Partial<PersistedData> = {};
    if (raw) {
      try { local = JSON.parse(raw); }
      catch { await AsyncStorage.removeItem(localKey); }
    }

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
            unitSystem: cloud.unitSystem ?? local.unitSystem ?? 'Metric',
            macroPcts: cloud.macroPcts ?? local.macroPcts ?? { carbs: 45, protein: 30, fat: 25 },
            savedRecipes: cloud.savedRecipes?.length ? cloud.savedRecipes : (local.savedRecipes ?? []),
            country: cloud.country ?? local.country ?? 'US',
            fastingWindow: cloud.fastingWindow ?? local.fastingWindow ?? null,
            dietaryPreferences: cloud.dietaryPreferences ?? local.dietaryPreferences ?? null,
            pillDefaultTime: cloud.pillDefaultTime ?? local.pillDefaultTime ?? null,
            readMessageIds: cloud.readMessageIds ?? local.readMessageIds ?? [],
            premium: cloud.premium ?? local.premium ?? true,
          };
          const mergedCount = countUnread(merged.readMessageIds);
          set({ ...merged, unreadCount: mergedCount, hasUnread: mergedCount > 0 });
          await AsyncStorage.setItem(localKey, JSON.stringify(merged));
          return;
        }
      } catch {
        // Network error — fall through to local data
      }
    }

    if (Object.keys(local).length > 0) {
      const localCount = countUnread(local.readMessageIds ?? []);
      set({ ...local, unreadCount: localCount, hasUnread: localCount > 0 });
    }
  },

  setLifeScore: async (score) => {
    const update: Partial<PersistedData> = { lifeScore: score, lifeScoreDate: todayStr() };
    set(update);
    await persist(pick({ ...get(), ...update }), get().userEmail);
  },

  checkAndUpdateStreak: async (date) => {
    // Logging on a past date must never corrupt the streak — only today counts
    if (date !== todayStr()) return;
    const { lastLoggedDate, streak } = get();
    if (lastLoggedDate === date) return;
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toLocaleDateString('en-CA');
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
      .slice(-365);
    set({ weightHistory });
    await persist(pick({ ...get(), weightHistory }), get().userEmail);

    // Sync weight to authStore profile for global consistency
    const { useAuthStore } = require('./authStore');
    const authStore = useAuthStore.getState();
    if (authStore.email) {
      await authStore.setProfile({
        ...authStore.profile,
        weight: String(Math.round(kg * 10) / 10)
      });
    }
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

  setUnitSystem: async (system) => {
    set({ unitSystem: system });
    await persist(pick({ ...get(), unitSystem: system }), get().userEmail);
  },

  setCountry: async (code) => {
    set({ country: code });
    await persist(pick({ ...get(), country: code }), get().userEmail);
  },

  setFastingWindow: async (fastingWindow) => {
    set({ fastingWindow });
    await persist(pick({ ...get(), fastingWindow }), get().userEmail);
  },

  setDietaryPreferences: async (dietaryPreferences) => {
    set({ dietaryPreferences });
    await persist(pick({ ...get(), dietaryPreferences }), get().userEmail);
  },

  setPillDefaultTime: async (pillDefaultTime) => {
    set({ pillDefaultTime });
    await persist(pick({ ...get(), pillDefaultTime }), get().userEmail);
  },

  setPremium: async (premium) => {
    set({ premium });
    await persist(pick({ ...get(), premium }), get().userEmail);
  },

  setMacroPcts: async (pcts) => {
    set({ macroPcts: pcts });
    await persist(pick({ ...get(), macroPcts: pcts }), get().userEmail);
  },

  saveRecipe: async (recipe) => {
    const savedRecipes = [...get().savedRecipes.filter(r => r.id !== recipe.id), recipe];
    set({ savedRecipes });
    await persist(pick({ ...get(), savedRecipes }), get().userEmail);
  },

  deleteRecipe: async (id) => {
    const savedRecipes = get().savedRecipes.filter(r => r.id !== id);
    set({ savedRecipes });
    await persist(pick({ ...get(), savedRecipes }), get().userEmail);
  },

  reset: () => set({
    lifeScore: null, lifeScoreDate: null, streak: 0, lastLoggedDate: null,
    programs: { nutrition: true, hydration: true, movement: false, sleep: false, stress: false, quit_smoking: false, quit_drinking: false, pill_reminder: false },
    weightHistory: [], xp: 0, activityLevel: 'moderate', weightGoal: 'maintain', calorieGoal: 2000, unitSystem: 'Metric', macroPcts: { carbs: 45, protein: 30, fat: 25 }, savedRecipes: [], country: 'US', fastingWindow: null, dietaryPreferences: null, pillDefaultTime: null, readMessageIds: [], premium: true, unreadCount: countUnread([]), hasUnread: countUnread([]) > 0, userEmail: null, messagesOpen: false, coachOpen: false,
  }),
}));

// Round three percentages that should sum to 100 so they still sum to exactly 100
// after integer rounding (largest-remainder method). Guarantees the macroPcts
// contract is never off-by-one from naive Math.round.
function roundTo100(carbs: number, protein: number, fat: number): { carbs: number; protein: number; fat: number } {
  const raw = [carbs, protein, fat];
  const floors = raw.map(Math.floor);
  let remainder = 100 - floors.reduce((a, b) => a + b, 0);
  // Hand the leftover units to the largest fractional parts first.
  const order = raw
    .map((v, i) => ({ i, frac: v - floors[i] }))
    .sort((a, b) => b.frac - a.frac);
  const out = [...floors];
  for (let k = 0; k < order.length && remainder > 0; k++, remainder--) out[order[k].i]++;
  return { carbs: out[0], protein: out[1], fat: out[2] };
}

// Personalised macro split (carbs/protein/fat %, always sums to exactly 100),
// derived from the goal + diet + bodyweight the user already gives us. Protein is
// anchored to bodyweight (g/kg) — the evidence-based way — rather than a flat % that
// breaks at the extremes; fat gets a hormonal-health floor; carbs flex to fill the
// rest. Diet ceilings (Keto/Low Carb) override the carb target.
export function macrosFor(
  weightGoal: 'lose' | 'maintain' | 'gain',
  dietaryPref: string | null,
  weightKg = 70,
  calories = 2000,
): { carbs: number; protein: number; fat: number } {
  const w = Math.max(35, Math.min(weightKg || 70, 250));
  const kcal = Math.max(800, Math.min(calories || 2000, 8000));

  // 1) Protein target in g/kg, by goal — plant-based eats slightly less (harder to hit).
  const plant = dietaryPref === 'Vegan' || dietaryPref === 'Vegetarian';
  let proteinPerKg = weightGoal === 'lose' ? 2.0 : weightGoal === 'gain' ? 1.8 : 1.6;
  if (dietaryPref === 'High Protein') proteinPerKg = 2.2;
  if (plant) proteinPerKg = Math.min(proteinPerKg, 1.6) - 0.2; // ease the plant ceiling
  proteinPerKg = Math.max(1.2, Math.min(proteinPerKg, 2.4));
  const proteinG = proteinPerKg * w;
  let proteinPct = (proteinG * 4 / kcal) * 100;

  // 2) Fat — diet-driven ceiling for Keto/Low Carb, else a 25% target with a 20% floor.
  let fatPct =
    dietaryPref === 'Keto'     ? 65 :
    dietaryPref === 'Low Carb' ? 40 :
    25;

  // 3) Clamp protein so the two non-carb macros leave room for some carbs (except Keto,
  // which is intentionally carb-minimal).
  const carbFloor = dietaryPref === 'Keto' ? 5 : 10;
  const maxProtein = 100 - fatPct - carbFloor;
  proteinPct = Math.max(15, Math.min(proteinPct, maxProtein));

  // 4) Carbs take whatever calories remain.
  const carbsPct = Math.max(carbFloor, 100 - proteinPct - fatPct);

  return roundTo100(carbsPct, proteinPct, fatPct);
}

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
  const rawGoal = Math.round(tdee + (goalOffset[weightGoal] ?? 0));
  // Clamp between 800 and 8000 to prevent UI layout explosions
  return Math.min(8000, Math.max(800, rawGoal));
}
