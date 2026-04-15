import { useEffect, useState, useRef, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, TextInput, Modal, FlatList,
  Animated, Share, KeyboardAvoidingView, Platform, Keyboard,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Pedometer } from 'expo-sensors';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle, Defs, LinearGradient, Stop, G, Line } from 'react-native-svg';
import { LinearGradient as ExpoLinearGradient } from 'expo-linear-gradient';
import { useDiaryStore, FoodItem, StrengthSession, StrengthExercise, CardioSession } from '../../src/store/diaryStore';
import { STRENGTH_EXERCISES, estimateStrengthKcal } from '../../src/lib/strengthExercises';
import { useAuthStore } from '../../src/store/authStore';
import { useAppStore, getXpLevel } from '../../src/store/appStore';
import { analyzeFood, importRecipe, estimateNutrition } from '../../src/lib/api';
import { searchLocalRestaurants, type RestaurantItem } from '../../src/lib/restaurants';
import { skipMealReminderToday } from '../../src/lib/notifications';
import { colors, spacing, fontSize, radius } from '../../src/theme';

const MEALS = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
type Meal = typeof MEALS[number];

const MEAL_ICONS: Record<string, string> = { breakfast: '🍳', lunch: '🥗', dinner: '🍝', snack: '🍌' };
const MEAL_ACCENT: Record<string, string> = { breakfast: colors.honey, lunch: colors.violet, dinner: colors.sky, snack: colors.rose };
const MEAL_LABEL: Record<string, string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack' };
const MEAL_SUGGESTED: Record<string, string> = { breakfast: '~550 kcal suggested', lunch: '~650 kcal suggested', dinner: '~750 kcal suggested', snack: '~150 kcal suggested' };


const WATER_GOAL = 8;
const VEG_GOAL = 3; const FRUIT_GOAL = 3;

const RING_R = 76; const RING_SW = 12; const RING_CIRC = 2 * Math.PI * RING_R;

function dateStr(d: Date) { return d.toISOString().split('T')[0]; }
function addDays(date: string, days: number) { const d = new Date(date); d.setDate(d.getDate() + days); return dateStr(d); }
function clamp(v: number, lo: number, hi: number) { return Math.min(hi, Math.max(lo, v)); }
/** Format a number to at most 2 decimal places, stripping trailing zeros */
function r2(v: number): string { return parseFloat(v.toFixed(2)).toString(); }

// Raw OpenFoodFacts product shape (barcode lookups + search)
interface OFFProduct { id?: string; product_name?: string; brands?: string; nutriments?: Record<string, number>; serving_size?: string; }

// Unified food result — used for all search flows (USDA + barcode)
interface FoodSearchResult {
  id: string;
  name: string;
  brand?: string;
  kcal100: number;
  protein100: number;
  carbs100: number;
  fat100: number;
  fiber100: number;
  sugar100: number;
  sodium100: number;
}

function offToResult(p: OFFProduct): FoodSearchResult | null {
  const n = p.nutriments ?? {};
  const kcal = offKcal(n);
  if (!p.product_name || kcal <= 0) return null;
  return {
    id: `off_${Date.now()}`,
    name: p.product_name,
    brand: p.brands,
    kcal100: Math.round(kcal),
    protein100: n['proteins_100g'] ?? 0,
    carbs100: n['carbohydrates_100g'] ?? 0,
    fat100: n['fat_100g'] ?? 0,
    fiber100: n['fiber_100g'] ?? 0,
    sugar100: n['sugars_100g'] ?? 0,
    sodium100: (n['sodium_100g'] ?? 0) * 1000,
  };
}

interface AiItem {
  icon: string; name: string; kcal: number; carbs: number; protein: number; fat: number; unit: string;
  weight_g?: number;
  per100?: { kcal: number; carbs: number; protein: number; fat: number };
  multiplier: number; // user-editable: 0.5 / 1 / 1.5 / 2
}

interface ProgramsCardData {
  qsDays?: number;   // days since quit smoking
  qdDays?: number;   // days since quit drinking
  pillsCount?: number; // number of meds tracked
}

// ── Food Quality Grade (A–F, per 100g) ───────────────────────────────────────
// Inspired by Lifesum's food grading system
function gradeFood(n: any): { grade: string; color: string } {
  if (!n) return { grade: '?', color: colors.ink3 };
  let score = 50; // start neutral
  const kcal    = offKcal(n);
  const protein = n['proteins_100g'] ?? 0;
  const fiber   = n['fiber_100g'] ?? 0;
  const sugar   = n['sugars_100g'] ?? 0;
  const fat     = n['fat_100g'] ?? 0;
  const saturated = n['saturated-fat_100g'] ?? fat * 0.4;
  const sodium  = (n['sodium_100g'] ?? 0) * 1000; // to mg

  // Positives
  score += Math.min(20, protein * 0.8);      // protein up to +20
  score += Math.min(15, fiber * 2.5);        // fiber up to +15

  // Negatives
  score -= Math.min(20, sugar * 0.8);        // sugar up to -20
  score -= Math.min(15, saturated * 1.2);    // sat fat up to -15
  score -= Math.min(10, (sodium / 100));     // sodium up to -10
  score -= Math.min(10, Math.max(0, (kcal - 200) / 50)); // high kcal penalty

  if (score >= 75) return { grade: 'A', color: '#22c55e' };
  if (score >= 60) return { grade: 'B', color: '#84cc16' };
  if (score >= 45) return { grade: 'C', color: '#f59e0b' };
  if (score >= 30) return { grade: 'D', color: '#f97316' };
  return { grade: 'F', color: '#ef4444' };
}

/** Grade a logged FoodItem — returns Nutri-Score A–E with official colors */
function gradeFoodItem(f: FoodItem): { grade: string; color: string } {
  if (!f.kcal || f.kcal <= 0) return { grade: '?', color: colors.ink3 };
  const pPct = ((f.protein ?? 0) * 4 / f.kcal) * 100;
  let score = 40;
  score += Math.min(30, pPct * 0.7);
  if ((f.fiber  ?? 0) > 0) score += Math.min(10, (f.fiber  ?? 0) * 2);
  if ((f.sugar  ?? 0) > 15) score -= Math.min(15, ((f.sugar  ?? 0) - 15) * 0.5);
  if ((f.sodium ?? 0) > 500) score -= Math.min(10, ((f.sodium ?? 0) - 500) / 100);
  score -= Math.min(10, Math.max(0, (f.kcal - 400) / 50));
  if (score >= 75) return { grade: 'A', color: colors.nutriA };
  if (score >= 60) return { grade: 'B', color: colors.nutriB };
  if (score >= 45) return { grade: 'C', color: colors.nutriC };
  if (score >= 30) return { grade: 'D', color: colors.nutriD };
  return { grade: 'E', color: colors.nutriE };
}

/** Returns kcal per 100g — tries kcal field first, falls back from kJ */
function offKcal(n: any): number {
  if (!n) return 0;
  if (n['energy-kcal_100g'] != null) return n['energy-kcal_100g'];
  if (n['energy-kcal']      != null) return n['energy-kcal'];
  if (n['energy_100g']      != null) return Math.round(n['energy_100g'] / 4.184);
  if (n['energy']           != null) return Math.round(n['energy'] / 4.184);
  return 0;
}

// Cleans up USDA's ALL-CAPS scientific names into readable Title Case
function cleanFoodName(raw: string): string {
  // Remove trailing comma-separated qualifiers like ", RAW" ", COOKED" etc after the main name
  const trimmed = raw
    .replace(/,\s*(raw|cooked|baked|boiled|fried|dried|frozen|canned|fresh|roasted|grilled|steamed|whole|sliced|diced|chopped|ground|boneless|skinless|flesh only|drained|with skin|without skin|ns as to|not further defined|nfs)\b.*/i, '')
    .trim();
  // Title-case: lowercase everything then capitalise each word
  return trimmed
    .toLowerCase()
    .replace(/\b\w/g, c => c.toUpperCase());
}

// USDA FoodData Central — generic whole foods + branded products
async function searchUSDA(query: string): Promise<FoodSearchResult[]> {
  try {
    const url = `https://api.nal.usda.gov/fdc/v1/foods/search?query=${encodeURIComponent(query)}&api_key=${process.env.EXPO_PUBLIC_USDA_KEY ?? 'DEMO_KEY'}&dataType=Foundation,SR%20Legacy,Branded&pageSize=20&sortBy=score&sortOrder=desc`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    const json = await res.json();
    return ((json.foods ?? []) as any[]).flatMap((f): FoodSearchResult[] => {
      const get = (id: number): number =>
        (f.foodNutrients ?? []).find((n: any) => n.nutrientId === id)?.value ?? 0;
      const kcal = Math.round(get(1008));
      const protein = Math.round(get(1003) * 10) / 10;
      const carbs   = Math.round(get(1005) * 10) / 10;
      const fat     = Math.round(get(1004) * 10) / 10;
      if (!f.description || kcal <= 0) return [];
      // Skip entries that have no macros at all (incomplete data)
      if (protein === 0 && carbs === 0 && fat === 0) return [];
      return [{
        id: `usda_${f.fdcId}`,
        name: cleanFoodName(f.description),
        brand: f.brandOwner ?? f.brandName,
        kcal100: kcal,
        protein100: protein,
        carbs100: carbs,
        fat100: fat,
        fiber100: Math.round(get(1079) * 10) / 10,
        sugar100: Math.round(get(2000) * 10) / 10,
        sodium100: Math.round(get(1093)),
      }];
    });
  } catch { return []; }
}

// Open Food Facts — huge crowd-sourced branded/packaged food database
async function searchOFF(query: string): Promise<FoodSearchResult[]> {
  try {
    const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=15&fields=id,product_name,brands,nutriments,serving_size`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    const json = await res.json();
    return ((json.products ?? []) as OFFProduct[]).flatMap((p): FoodSearchResult[] => {
      const n = p.nutriments ?? {};
      const kcal = Math.round(n['energy-kcal_100g'] ?? n['energy-kcal'] ?? 0);
      const protein = Math.round((n.proteins_100g ?? 0) * 10) / 10;
      const carbs   = Math.round((n.carbohydrates_100g ?? 0) * 10) / 10;
      const fat     = Math.round((n.fat_100g ?? 0) * 10) / 10;
      const name = p.product_name?.trim();
      if (!name || kcal <= 0) return [];
      if (protein === 0 && carbs === 0 && fat === 0) return [];
      return [{
        id: `off_${p.id ?? Math.random()}`,
        name,
        brand: p.brands?.split(',')[0]?.trim(),
        kcal100: kcal,
        protein100: protein,
        carbs100: carbs,
        fat100: fat,
        fiber100: Math.round((n.fiber_100g ?? 0) * 10) / 10,
        sugar100: Math.round((n.sugars_100g ?? 0) * 10) / 10,
        sodium100: Math.round((n.sodium_100g ?? 0) * 1000),
      }];
    });
  } catch { return []; }
}

// Merges USDA + OFF results, deduplicating by normalised name
async function searchFoods(query: string): Promise<FoodSearchResult[]> {
  const [usda, off] = await Promise.all([searchUSDA(query), searchOFF(query)]);
  const seen = new Set<string>();
  const out: FoodSearchResult[] = [];
  for (const item of [...usda, ...off]) {
    const key = item.name.toLowerCase().replace(/\s+/g, ' ').trim();
    if (!seen.has(key)) { seen.add(key); out.push(item); }
  }
  return out;
}

// ── Sleep Logger Modal ────────────────────────────────────────────────────────
const SLEEP_QUALITY = ['😫', '😕', '😐', '😊', '🌟'];

type SleepSaveData = { bedtime: string; waketime: string; quality: number; duration: string };

function SleepModal({ visible, onClose, onSave }: {
  visible: boolean;
  onClose: () => void;
  onSave: (data: SleepSaveData) => void;
}) {
  const [bedtime, setBedtime] = useState('22:30');
  const [waketime, setWaketime] = useState('06:00');
  const [quality, setQuality] = useState(2);

  function calcDuration() {
    const [bh, bm] = bedtime.split(':').map(Number);
    const [wh, wm] = waketime.split(':').map(Number);
    let mins = (wh * 60 + wm) - (bh * 60 + bm);
    if (mins < 0) mins += 24 * 60;
    return `${Math.floor(mins / 60)}h ${mins % 60}m`;
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <SafeAreaView style={sl.safe} edges={['bottom']}>
        <View style={sl.header}>
          <TouchableOpacity onPress={onClose} style={sl.backBtn}>
            <Ionicons name="chevron-back" size={18} color={colors.ink2} />
          </TouchableOpacity>
          <Text style={sl.title}>Log Sleep</Text>
          <View style={{ width: 34 }} />
        </View>
        <ScrollView contentContainerStyle={sl.content}>
          <View style={sl.durationDisplay}>
            <Text style={sl.durNum}>{calcDuration()}</Text>
            <Text style={sl.durLbl}>Sleep duration</Text>
          </View>
          <Text style={sl.sectionLbl}>BEDTIME & WAKE TIME</Text>
          <View style={sl.timeRow}>
            <View style={[sl.timeCard, { borderColor: 'rgba(124,77,255,0.5)', backgroundColor: 'rgba(124,77,255,0.08)' }]}>
              <Text style={sl.timeCardLbl}>🌙 Bedtime</Text>
              <TextInput style={sl.timeVal} value={bedtime} onChangeText={setBedtime} keyboardType="numbers-and-punctuation" />
            </View>
            <View style={sl.timeCard}>
              <Text style={sl.timeCardLbl}>☀️ Wake time</Text>
              <TextInput style={sl.timeVal} value={waketime} onChangeText={setWaketime} keyboardType="numbers-and-punctuation" />
            </View>
          </View>
          <Text style={sl.sectionLbl}>SLEEP QUALITY</Text>
          <View style={sl.qualityRow}>
            {SLEEP_QUALITY.map((em, i) => (
              <TouchableOpacity key={i} style={[sl.qBtn, quality === i && sl.qBtnSel]} onPress={() => setQuality(i)}>
                <Text style={sl.qEmoji}>{em}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={sl.insight}>
            <Text style={sl.insightLbl}>✦ Insight</Text>
            <Text style={sl.insightTxt}>On days following 8h+ sleep, your step count is 34% higher. Your mood also improves on average.</Text>
          </View>
          <TouchableOpacity style={sl.saveBtn} onPress={() => {
            onSave({ bedtime, waketime, quality, duration: calcDuration() });
            onClose();
          }}>
            <Text style={sl.saveTxt}>Save Sleep Log</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

// ── Exercise Logger Modal ─────────────────────────────────────────────────────
const EXERCISES = [
  { name: 'Running', emoji: '🏃', kcalPerMin: 10 },
  { name: 'Cycling', emoji: '🚴', kcalPerMin: 8 },
  { name: 'Swimming', emoji: '🏊', kcalPerMin: 9 },
  { name: 'Weight Training', emoji: '🏋️', kcalPerMin: 6, isStrength: true },
  { name: 'Yoga', emoji: '🧘', kcalPerMin: 4 },
  { name: 'Walking', emoji: '🚶', kcalPerMin: 5 },
  { name: 'HIIT', emoji: '💪', kcalPerMin: 12 },
  { name: 'Dancing', emoji: '💃', kcalPerMin: 7 },
];

function ExerciseModal({ visible, onClose, onAddCalories, onAddStrengthSession }: {
  visible: boolean;
  onClose: () => void;
  onAddCalories: (kcal: number, name: string, emoji?: string, minutes?: number) => void;
  onAddStrengthSession: (session: StrengthSession) => void;
}) {
  const [tab, setTab] = useState<'list' | 'calories'>('list');
  const [manualKcal, setManualKcal] = useState('');
  const [manualTitle, setManualTitle] = useState('');
  const [search, setSearch] = useState('');
  const [selectedExercise, setSelectedExercise] = useState<typeof EXERCISES[0] | null>(null);
  const [duration, setDuration] = useState('30');

  // Strength training state
  const [strengthMode, setStrengthMode] = useState(false);
  const [strengthExercises, setStrengthExercises] = useState<StrengthExercise[]>([]);
  const [strengthSearch, setStrengthSearch] = useState('');
  const [weightUnit, setWeightUnit] = useState<'kg' | 'lbs'>('kg');

  // Keyboard tracking — animate durPanel bottom to match keyboard height
  const kbBottom = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const onShow = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      e => Animated.timing(kbBottom, { toValue: e.endCoordinates.height, duration: e.duration || 250, useNativeDriver: false }).start(),
    );
    const onHide = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => Animated.timing(kbBottom, { toValue: 0, duration: 250, useNativeDriver: false }).start(),
    );
    return () => { onShow.remove(); onHide.remove(); };
  }, []);

  const filteredStrength = STRENGTH_EXERCISES.filter(n =>
    n.toLowerCase().includes(strengthSearch.toLowerCase())
  );

  function addStrengthExercise(name: string) {
    setStrengthExercises(prev => [...prev, { name, sets: [{ reps: 10, weight: 20, unit: weightUnit }] }]);
    setStrengthSearch('');
  }

  function addSet(exIdx: number) {
    setStrengthExercises(prev => prev.map((ex, i) =>
      i === exIdx ? { ...ex, sets: [...ex.sets, { reps: 10, weight: ex.sets[ex.sets.length - 1]?.weight ?? 20, unit: weightUnit }] } : ex
    ));
  }

  function removeSet(exIdx: number, setIdx: number) {
    setStrengthExercises(prev => prev.map((ex, i) => {
      if (i !== exIdx) return ex;
      const sets = ex.sets.filter((_, si) => si !== setIdx);
      return sets.length === 0 ? null as unknown as StrengthExercise : { ...ex, sets };
    }).filter(Boolean));
  }

  function updateSet(exIdx: number, setIdx: number, field: 'reps' | 'weight', val: string) {
    const n = parseFloat(val);
    if (isNaN(n) || n < 0) return;
    setStrengthExercises(prev => prev.map((ex, i) =>
      i === exIdx ? { ...ex, sets: ex.sets.map((s, si) => si === setIdx ? { ...s, [field]: n } : s) } : ex
    ));
  }

  function logStrengthWorkout() {
    if (strengthExercises.length === 0) { Alert.alert('Add exercises', 'Add at least one exercise before logging.'); return; }
    const totalKcal = estimateStrengthKcal(strengthExercises);
    const session: StrengthSession = {
      id: Date.now().toString(),
      exercises: strengthExercises,
      totalKcal,
      loggedAt: new Date().toISOString(),
    };
    onAddStrengthSession(session);
    onAddCalories(totalKcal, 'Weight Training');
    setStrengthMode(false);
    setStrengthExercises([]);
    onClose();
  }

  const filtered = EXERCISES.filter(e => e.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen">
      <SafeAreaView style={ex.safe} edges={['top', 'bottom']}>
        {/* Header */}
        <View style={ex.header}>
          <TouchableOpacity onPress={onClose} style={ex.closeBtn}>
            <Ionicons name="close" size={16} color={colors.ink} />
          </TouchableOpacity>
          <Text style={ex.title}>Exercise</Text>
          <TouchableOpacity onPress={() => setTab('calories')}>
            <Text style={ex.addTxt}>+ Add</Text>
          </TouchableOpacity>
        </View>
        {/* Search */}
        <View style={ex.searchRow}>
          <Ionicons name="search-outline" size={16} color="rgba(255,255,255,0.4)" />
          <TextInput style={ex.searchInput} placeholder="Search Exercise" placeholderTextColor="rgba(255,255,255,0.35)" value={search} onChangeText={setSearch} />
        </View>
        {/* Tabs */}
        <View style={ex.tabRow}>
          {(['list', 'calories'] as const).map((t) => (
            <TouchableOpacity key={t} style={[ex.tabBtn, tab === t && ex.tabBtnActive]} onPress={() => setTab(t)}>
              <Text style={[ex.tabLbl, tab === t && ex.tabLblActive]}>{t === 'list' ? 'EXERCISE LIST' : 'CALORIES'}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {tab === 'list' ? (
          <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
            <Text style={ex.sectionHdr}>All Exercises</Text>
            {filtered.map((e) => (
              <TouchableOpacity key={e.name} style={[ex.exRow, selectedExercise?.name === e.name && ex.exRowSelected]} onPress={() => {
                if ((e as typeof e & { isStrength?: boolean }).isStrength) {
                  setStrengthMode(true);
                  setStrengthExercises([]);
                } else {
                  setSelectedExercise(e);
                  setDuration('30');
                }
              }}>
                <Text style={{ fontSize: fontSize.xl }}>{e.emoji}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={ex.exName}>{e.name}</Text>
                  <Text style={ex.exMeta}>~{e.kcalPerMin} kcal/min</Text>
                </View>
                <Ionicons name="add-circle-outline" size={22} color={colors.purple2} />
              </TouchableOpacity>
            ))}
          </ScrollView>
        ) : (
          <View style={{ flex: 1 }}>
            <TouchableOpacity style={ex.calField} onPress={() => {}}>
              <Text style={ex.calFieldLbl}>Calories</Text>
              <TextInput style={ex.calFieldInput} placeholder="Required" placeholderTextColor="rgba(255,255,255,0.3)" value={manualKcal} onChangeText={setManualKcal} keyboardType="numeric" />
            </TouchableOpacity>
            <TouchableOpacity style={ex.calField} onPress={() => {}}>
              <Text style={ex.calFieldLbl}>Title</Text>
              <TextInput style={ex.calFieldInput} placeholder="Optional" placeholderTextColor="rgba(255,255,255,0.3)" value={manualTitle} onChangeText={setManualTitle} />
            </TouchableOpacity>
            <View style={{ flex: 1 }} />
            <View style={ex.doneWrap}>
              <TouchableOpacity style={ex.doneBtn} onPress={() => {
                const k = parseInt(manualKcal);
                if (isNaN(k) || k < 1 || k > 5000) { Alert.alert('Invalid calories', 'Enter a value between 1 and 5000 kcal.'); return; }
                onAddCalories(k, manualTitle || 'Exercise'); onClose();
              }}>
                <Text style={ex.doneTxt}>ADD</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
        <View style={ex.doneWrap}>
          {tab === 'list' && !selectedExercise && (
            <TouchableOpacity style={ex.doneBtn} onPress={onClose}>
              <Text style={ex.doneTxt}>DONE</Text>
            </TouchableOpacity>
          )}
        </View>
        {/* Duration picker — slides up when an exercise row is tapped */}
        {selectedExercise && tab === 'list' && (() => {
          const mins = parseInt(duration) || 30;
          const kcal = Math.round(selectedExercise.kcalPerMin * mins);
          return (
            <Animated.View style={[ex.durPanel, { bottom: kbBottom }]}>
              <Text style={ex.durTitle}>{selectedExercise.emoji} {selectedExercise.name}</Text>
              <View style={ex.durRow}>
                <Text style={ex.durLbl}>Duration (min)</Text>
                <TextInput
                  style={ex.durInput}
                  value={duration}
                  onChangeText={setDuration}
                  keyboardType="number-pad"
                  selectTextOnFocus
                />
              </View>
              <Text style={ex.durKcal}>~{kcal} kcal burned</Text>
              <View style={ex.durActions}>
                <TouchableOpacity style={ex.durCancelBtn} onPress={() => setSelectedExercise(null)}>
                  <Text style={ex.durCancelTxt}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={ex.durLogBtn} onPress={() => { onAddCalories(kcal, selectedExercise.name, selectedExercise.emoji, mins); setSelectedExercise(null); onClose(); }}>
                  <Text style={ex.durLogTxt}>LOG</Text>
                </TouchableOpacity>
              </View>
            </Animated.View>
          );
        })()}
        {/* ── Strength training panel ── */}
        {strengthMode && (
          <Animated.View style={[ex.durPanel, { bottom: kbBottom }]}>
            {/* Header */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={ex.durTitle}>🏋️ Weight Training</Text>
              <TouchableOpacity onPress={() => setStrengthMode(false)}>
                <Ionicons name="close" size={20} color={colors.ink3} />
              </TouchableOpacity>
            </View>

            {/* kg / lbs toggle */}
            <View style={{ flexDirection: 'row', gap: spacing.xs, alignSelf: 'flex-start' }}>
              {(['kg', 'lbs'] as const).map(u => (
                <TouchableOpacity key={u} onPress={() => setWeightUnit(u)}
                  style={{ paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radius.pill, backgroundColor: weightUnit === u ? colors.purple : colors.layer2, borderWidth: 1, borderColor: weightUnit === u ? colors.purple : colors.line2 }}>
                  <Text style={{ fontSize: fontSize.xs, fontWeight: '700', color: weightUnit === u ? colors.white : colors.ink3 }}>{u}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <ScrollView style={{ maxHeight: 260 }} keyboardShouldPersistTaps="handled">
              {/* Exercise search */}
              <View style={[ex.searchRow, { marginHorizontal: 0, marginBottom: spacing.xs }]}>
                <Ionicons name="search-outline" size={14} color={colors.ink3} />
                <TextInput style={ex.searchInput} placeholder="Add exercise…" placeholderTextColor={colors.ink3}
                  value={strengthSearch} onChangeText={setStrengthSearch} />
              </View>
              {strengthSearch.length > 0 && (
                <View style={{ backgroundColor: colors.layer2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line2, marginBottom: spacing.sm }}>
                  {filteredStrength.slice(0, 6).map((name, i, arr) => (
                    <TouchableOpacity key={name} onPress={() => addStrengthExercise(name)}
                      style={{ paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: i < arr.length - 1 ? 1 : 0, borderBottomColor: colors.line }}>
                      <Text style={{ color: colors.ink, fontSize: fontSize.sm }}>{name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {/* Added exercises */}
              {strengthExercises.map((exItem, exIdx) => (
                <View key={exIdx} style={{ marginBottom: spacing.sm, backgroundColor: colors.layer2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line2, padding: spacing.sm }}>
                  <Text style={{ color: colors.ink, fontWeight: '700', fontSize: fontSize.sm, marginBottom: spacing.xs }}>{exItem.name}</Text>
                  {exItem.sets.map((s, si) => (
                    <View key={si} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.xs }}>
                      <Text style={{ color: colors.ink3, fontSize: fontSize.xs, width: 22 }}>#{si + 1}</Text>
                      <TextInput
                        style={[ex.durInput, { width: 52, fontSize: fontSize.sm }]}
                        value={String(s.reps)} keyboardType="number-pad"
                        onChangeText={v => updateSet(exIdx, si, 'reps', v)} />
                      <Text style={{ color: colors.ink3, fontSize: fontSize.xs }}>reps ×</Text>
                      <TextInput
                        style={[ex.durInput, { width: 62, fontSize: fontSize.sm }]}
                        value={String(s.weight)} keyboardType="decimal-pad"
                        onChangeText={v => updateSet(exIdx, si, 'weight', v)} />
                      <Text style={{ color: colors.ink3, fontSize: fontSize.xs, flex: 1 }}>{weightUnit}</Text>
                      <TouchableOpacity onPress={() => removeSet(exIdx, si)}>
                        <Ionicons name="remove-circle-outline" size={18} color={colors.rose} />
                      </TouchableOpacity>
                    </View>
                  ))}
                  <TouchableOpacity onPress={() => addSet(exIdx)}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingTop: spacing.xs }}>
                    <Ionicons name="add-circle-outline" size={16} color={colors.purple2} />
                    <Text style={{ color: colors.purple2, fontSize: fontSize.xs, fontWeight: '600' }}>Add set</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>

            {/* Calorie preview + log button */}
            {strengthExercises.length > 0 && (
              <Text style={ex.durKcal}>~{estimateStrengthKcal(strengthExercises)} kcal estimated</Text>
            )}
            <View style={ex.durActions}>
              <TouchableOpacity style={ex.durCancelBtn} onPress={() => setStrengthMode(false)}>
                <Text style={ex.durCancelTxt}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={ex.durLogBtn} onPress={logStrengthWorkout}>
                <Text style={ex.durLogTxt}>LOG WORKOUT</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        )}
      </SafeAreaView>
    </Modal>
  );
}

// ── Stress & Breathing Modal ──────────────────────────────────────────────────
type BreathPhase = { label: string; duration: number };
type BreathExercise = { name: string; icon: string; color: string; desc: string; totalSecs: number; phases: BreathPhase[] };

const BREATH_EXERCISES: BreathExercise[] = [
  { name: '4-7-8 Breathing', icon: '🌊', color: colors.purple,
    desc: 'Inhale 4s · Hold 7s · Exhale 8s · 8 min', totalSecs: 480,
    phases: [{ label: 'Inhale', duration: 4 }, { label: 'Hold', duration: 7 }, { label: 'Exhale', duration: 8 }] },
  { name: 'Box Breathing', icon: '🔲', color: colors.sky,
    desc: 'Inhale 4s · Hold 4s · Exhale 4s · Hold 4s · 4 min', totalSecs: 240,
    phases: [{ label: 'Inhale', duration: 4 }, { label: 'Hold', duration: 4 }, { label: 'Exhale', duration: 4 }, { label: 'Hold', duration: 4 }] },
  { name: 'Deep Breathing', icon: '💨', color: colors.green,
    desc: 'Slow deep breaths · 2 min', totalSecs: 120,
    phases: [{ label: 'Inhale', duration: 6 }, { label: 'Exhale', duration: 6 }] },
];

const STRESS_EMOJIS = ['😌', '😊', '😐', '😟', '😩'];
const STRESS_LABELS = ['Calm', 'OK', 'Neutral', 'Stressed', 'Overwhelmed'];
const MOOD_EMOJIS   = ['😩', '😕', '😐', '😊', '🤩'];
const MOOD_LABELS   = ['Awful', 'Bad', 'Ok', 'Good', 'Great'];

function BreathingGuideModal({ exercise, onClose }: { exercise: BreathExercise; onClose: () => void }) {
  const phaseIdxRef  = useRef(0);
  const countdownRef = useRef(exercise.phases[0].duration);
  const totalRef     = useRef(exercise.totalSecs);
  const [phaseIdx, setPhaseIdx]   = useState(0);
  const [countdown, setCountdown] = useState(exercise.phases[0].duration);
  const [totalLeft, setTotalLeft] = useState(exercise.totalSecs);
  const [running, setRunning]     = useState(true);
  const [done, setDone]           = useState(false);

  useEffect(() => {
    if (!running || done) return;
    const id = setInterval(() => {
      countdownRef.current -= 1;
      totalRef.current     -= 1;
      if (countdownRef.current <= 0) {
        phaseIdxRef.current = (phaseIdxRef.current + 1) % exercise.phases.length;
        countdownRef.current = exercise.phases[phaseIdxRef.current].duration;
        setPhaseIdx(phaseIdxRef.current);
      }
      setCountdown(countdownRef.current);
      setTotalLeft(totalRef.current);
      if (totalRef.current <= 0) { clearInterval(id); setDone(true); }
    }, 1000);
    return () => clearInterval(id);
  }, [running, done]);

  const phase   = exercise.phases[phaseIdx];
  const elapsed = phase.duration - countdown;
  const R = 80; const CIRC = 2 * Math.PI * R;
  const dash = Math.min(1, elapsed / phase.duration) * CIRC;
  const mins = Math.floor(totalLeft / 60);
  const secs = totalLeft % 60;

  return (
    <Modal visible animationType="fade" presentationStyle="fullScreen">
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top', 'bottom']}>
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: spacing.md, paddingTop: spacing.sm }}>
          <TouchableOpacity style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }} onPress={onClose}>
            <Ionicons name="close" size={28} color={colors.ink3} />
          </TouchableOpacity>
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: fontSize.md, fontWeight: '700', color: colors.ink, marginBottom: spacing.xl }}>{exercise.icon} {exercise.name}</Text>
        <View style={{ alignItems: 'center', justifyContent: 'center', marginBottom: 32 }}>
          <Svg width={200} height={200} viewBox="0 0 200 200">
            <Circle cx={100} cy={100} r={R} fill="none" stroke={exercise.color + '22'} strokeWidth={14} />
            <G rotation="-90" origin="100, 100">
              <Circle cx={100} cy={100} r={R} fill="none" stroke={exercise.color} strokeWidth={14}
                strokeLinecap="round" strokeDasharray={`${dash} ${CIRC}`} />
            </G>
          </Svg>
          <View style={{ position: 'absolute', alignItems: 'center' }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: exercise.color }}>{phase.label}</Text>
            <Text style={{ fontSize: 52, fontWeight: '900', color: colors.ink }}>{countdown}</Text>
          </View>
        </View>
        {done ? (
          <View style={{ alignItems: 'center', gap: 16, marginTop: 16 }}>
            <Text style={{ fontSize: 48 }}>✅</Text>
            <Text style={{ fontSize: fontSize.md, fontWeight: '700', color: colors.ink }}>Session complete!</Text>
            <TouchableOpacity style={{ backgroundColor: exercise.color, borderRadius: radius.md, paddingHorizontal: 36, paddingVertical: 14, marginTop: 8 }} onPress={onClose}>
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: fontSize.sm }}>Done · +20 XP</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <Text style={{ color: colors.ink3, fontSize: fontSize.sm, marginBottom: 32 }}>{mins}:{String(secs).padStart(2, '0')} remaining</Text>
            <TouchableOpacity onPress={() => setRunning(r => !r)}
              style={{ backgroundColor: exercise.color + '22', borderWidth: 1, borderColor: exercise.color + '44', borderRadius: 50, width: 64, height: 64, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name={running ? 'pause' : 'play'} size={28} color={exercise.color} />
            </TouchableOpacity>
          </>
        )}
        </View>
      </SafeAreaView>
    </Modal>
  );
}

function StressBreathingModal({ visible, onClose, onSave }: { visible: boolean; onClose: () => void; onSave: (level: number) => void }) {
  const [stressLevel, setStressLevel]       = useState<number | null>(null);
  const [activeExercise, setActiveExercise] = useState<BreathExercise | null>(null);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      {activeExercise && <BreathingGuideModal exercise={activeExercise} onClose={() => setActiveExercise(null)} />}
      <SafeAreaView style={sbst.safe} edges={['bottom']}>
        <View style={sbst.header}>
          <TouchableOpacity onPress={onClose} style={sbst.backBtn}><Ionicons name="chevron-back" size={18} color={colors.ink2} /></TouchableOpacity>
          <Text style={sbst.title}>Stress & Breathing</Text>
          <View style={{ width: 34 }} />
        </View>
        <ScrollView contentContainerStyle={{ padding: spacing.md, gap: spacing.md }}>
          <Text style={sbst.sectionLbl}>HOW STRESSED ARE YOU?</Text>
          <View style={sbst.emojiRow}>
            {STRESS_EMOJIS.map((em, i) => (
              <TouchableOpacity key={i} style={[sbst.emojiBtn, stressLevel === i + 1 && sbst.emojiBtnSel]} onPress={() => setStressLevel(i + 1)}>
                <Text style={sbst.emoji}>{em}</Text>
                <Text style={[sbst.emojiLbl, stressLevel === i + 1 && { color: colors.ink }]}>{STRESS_LABELS[i]}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {stressLevel !== null && (
            <TouchableOpacity style={sbst.saveBtn} onPress={() => { onSave(stressLevel); onClose(); }}>
              <Text style={sbst.saveBtnTxt}>Log Stress Level</Text>
            </TouchableOpacity>
          )}
          <Text style={[sbst.sectionLbl, { marginTop: 8 }]}>BREATHING EXERCISES</Text>
          {BREATH_EXERCISES.map((ex) => (
            <TouchableOpacity key={ex.name} style={[sbst.breathCard, { borderColor: ex.color + '25', backgroundColor: ex.color + '0d' }]} onPress={() => setActiveExercise(ex)}>
              <Text style={{ fontSize: 28, flexShrink: 0 }}>{ex.icon}</Text>
              <View style={{ flex: 1 }}>
                <Text style={sbst.breathName}>{ex.name}</Text>
                <Text style={sbst.breathDesc}>{ex.desc}</Text>
              </View>
              <Text style={{ fontSize: 18, color: colors.ink3 }}>▶</Text>
            </TouchableOpacity>
          ))}
          <View style={{ height: 40 }} />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const sbst = StyleSheet.create({
  safe:       { flex: 1, backgroundColor: colors.bg },
  header:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.md, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.07)' },
  backBtn:    { padding: 8, backgroundColor: colors.layer2, borderRadius: 20 },
  title:      { fontSize: fontSize.md, fontWeight: '700', color: colors.ink },
  sectionLbl: { fontSize: 10, fontWeight: '700', letterSpacing: 1.2, color: colors.ink3, textTransform: 'uppercase' },
  emojiRow:   { flexDirection: 'row', gap: 4 },
  emojiBtn:   { flex: 1, alignItems: 'center', padding: 10, borderRadius: radius.md, backgroundColor: colors.layer2, borderWidth: 1.5, borderColor: 'transparent' },
  emojiBtnSel:{ borderColor: colors.teal, backgroundColor: colors.teal + '11' },
  emoji:      { fontSize: 22 },
  emojiLbl:   { fontSize: 9, color: colors.ink3, marginTop: 4, textAlign: 'center' },
  saveBtn:    { backgroundColor: colors.teal, borderRadius: radius.md, alignItems: 'center', paddingVertical: 13 },
  saveBtnTxt: { color: '#fff', fontWeight: '700', fontSize: fontSize.sm },
  breathCard: { flexDirection: 'row', alignItems: 'center', gap: 14, borderWidth: 1, borderRadius: radius.lg, padding: 14 },
  breathName: { fontSize: fontSize.sm, fontWeight: '700', color: colors.ink },
  breathDesc: { fontSize: fontSize.xs, color: colors.ink3, marginTop: 2 },
});

// ── Mood Logger Modal ─────────────────────────────────────────────────────────
function MoodModal({ visible, onClose, onSave }: { visible: boolean; onClose: () => void; onSave: (mood: number, notes: string) => void }) {
  const [mood, setMood]   = useState<number | null>(null);
  const [notes, setNotes] = useState('');

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <SafeAreaView style={moodst.safe} edges={['bottom']}>
        <View style={moodst.header}>
          <TouchableOpacity onPress={onClose} style={moodst.backBtn}><Ionicons name="chevron-back" size={18} color={colors.ink2} /></TouchableOpacity>
          <Text style={moodst.title}>Log Mood</Text>
          <View style={{ width: 34 }} />
        </View>
        <ScrollView contentContainerStyle={{ padding: spacing.md, gap: spacing.md }} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}>
          <Text style={moodst.question}>How are you feeling?</Text>
          <View style={moodst.emojiRow}>
            {MOOD_EMOJIS.map((em, i) => (
              <TouchableOpacity key={i} style={[moodst.emojiBtn, mood === i + 1 && moodst.emojiBtnSel]} onPress={() => setMood(i + 1)}>
                <Text style={moodst.emoji}>{em}</Text>
                <Text style={[moodst.emojiLbl, mood === i + 1 && { color: colors.ink }]}>{MOOD_LABELS[i]}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TextInput
            style={moodst.notesInput}
            placeholder="What's on your mind? (optional)"
            placeholderTextColor={colors.ink3}
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={3}
          />
          <TouchableOpacity style={[moodst.saveBtn, mood === null && { opacity: 0.4 }]}
            onPress={() => { if (mood !== null) { onSave(mood, notes); onClose(); } }} disabled={mood === null}>
            <Text style={moodst.saveBtnTxt}>Log Mood</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const moodst = StyleSheet.create({
  safe:       { flex: 1, backgroundColor: colors.bg },
  header:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.md, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.07)' },
  backBtn:    { padding: 8, backgroundColor: colors.layer2, borderRadius: 20 },
  title:      { fontSize: fontSize.md, fontWeight: '700', color: colors.ink },
  question:   { fontSize: fontSize.sm, fontWeight: '600', color: colors.ink },
  emojiRow:   { flexDirection: 'row', gap: 4 },
  emojiBtn:   { flex: 1, alignItems: 'center', padding: 10, borderRadius: radius.md, backgroundColor: colors.layer2, borderWidth: 1.5, borderColor: 'transparent' },
  emojiBtnSel:{ borderColor: colors.honey, backgroundColor: colors.honey + '11' },
  emoji:      { fontSize: 22 },
  emojiLbl:   { fontSize: 9, color: colors.ink3, marginTop: 4, textAlign: 'center' },
  notesInput: { backgroundColor: colors.layer2, borderWidth: 1, borderColor: colors.line2, borderRadius: radius.md, color: colors.ink, padding: 14, fontSize: fontSize.sm, minHeight: 90, textAlignVertical: 'top' },
  saveBtn:    { backgroundColor: colors.honey, borderRadius: radius.md, alignItems: 'center', paddingVertical: 13 },
  saveBtnTxt: { color: '#fff', fontWeight: '700', fontSize: fontSize.sm },
});

// ── Dagnara Logo ──────────────────────────────────────────────────────────────
function DagnaraLogo({ size = 22, color = colors.lavender }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 28 28">
      <Line x1="14" y1="2" x2="14" y2="26" stroke={color} strokeWidth="0.8" opacity="0.35" />
      <Line x1="2" y1="14" x2="26" y2="14" stroke={color} strokeWidth="0.8" opacity="0.35" />
      <Circle cx="14" cy="14" r="11" stroke={color} strokeWidth="1.4" fill="none" />
      <Circle cx="14" cy="14" r="2.5" fill={color} />
      <Line x1="14" y1="2" x2="14" y2="6.5" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <Line x1="14" y1="21.5" x2="14" y2="26" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <Line x1="2" y1="14" x2="6.5" y2="14" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <Line x1="21.5" y1="14" x2="26" y2="14" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </Svg>
  );
}

// ── Food row ──────────────────────────────────────────────────────────────────
function FoodRow({ food, onDelete, onFavorite }: { food: FoodItem; onDelete: () => void; onFavorite: () => void }) {
  const grade = gradeFoodItem(food);

  function handleLongPress() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(food.name, undefined, [
      { text: 'Add to Favourites ⭐', onPress: onFavorite },
      { text: 'Delete', style: 'destructive', onPress: () => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        onDelete();
      }},
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  return (
    <TouchableOpacity style={fr.row} onLongPress={handleLongPress} activeOpacity={0.7} delayLongPress={400}>
      <Text style={fr.icon}>{food.icon ?? '🍽️'}</Text>
      <View style={fr.info}>
        <Text style={fr.name} numberOfLines={1}>{food.name}</Text>
        {((food.protein ?? 0) > 0 || (food.carbs ?? 0) > 0 || (food.fat ?? 0) > 0) && (
          <View style={fr.pills}>
            {(food.protein ?? 0) > 0 && <Text style={[fr.pill, fr.pillP]}>P {r2(food.protein)}g</Text>}
            {(food.carbs   ?? 0) > 0 && <Text style={[fr.pill, fr.pillC]}>C {r2(food.carbs)}g</Text>}
            {(food.fat     ?? 0) > 0 && <Text style={[fr.pill, fr.pillF]}>F {r2(food.fat)}g</Text>}
          </View>
        )}
      </View>
      <Text style={[fr.kcal, { color: grade.color, backgroundColor: grade.color + '18', borderColor: grade.color + '44' }]}>+{food.kcal} kcal</Text>
      <View style={[fr.gradeBadge, { backgroundColor: grade.color, borderColor: grade.color }]}>
        <Text style={fr.gradeText}>{grade.grade}</Text>
      </View>
      <TouchableOpacity
        style={fr.trash}
        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); onDelete(); }}
        hitSlop={{ top: 10, bottom: 10, left: 14, right: 6 }}
      >
        <Ionicons name="trash-outline" size={fontSize.sm} color={colors.rose} />
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

const fr = StyleSheet.create({
  row:   { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.sm, paddingHorizontal: spacing.xs, backgroundColor: colors.layer2, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.line },
  icon:  { fontSize: fontSize.base },
  info:  { flex: 1, gap: 2 },
  name:  { fontSize: fontSize.sm, color: colors.ink, fontWeight: '500' },
  pills: { flexDirection: 'row', gap: 3, flexWrap: 'wrap' },
  pill:  { fontSize: fontSize.xs, fontWeight: '600', borderRadius: 3, paddingHorizontal: 4, paddingVertical: 1 },
  pillP: { color: colors.sky,   backgroundColor: colors.sky   + '22', borderWidth: 1, borderColor: colors.sky   + '55' },
  pillC: { color: colors.honey, backgroundColor: colors.honey + '22', borderWidth: 1, borderColor: colors.honey + '55' },
  pillF: { color: colors.rose,  backgroundColor: colors.rose  + '22', borderWidth: 1, borderColor: colors.rose  + '55' },
  kcal:  { fontSize: fontSize.sm, fontWeight: '700', borderRadius: 3, paddingHorizontal: 4, paddingVertical: 1, borderWidth: 1 },
  gradeBadge:  { width: 22, height: 22, borderRadius: radius.sm, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  gradeText:   { fontSize: fontSize.xs, fontWeight: '800', letterSpacing: 0.5, color: colors.white },
  trash:       { padding: 2 },
});

// ── Activity row (mirrors FoodRow) ────────────────────────────────────────────
function ActivityRow({ emoji, name, detail, kcal, onDelete }: {
  emoji: string;
  name: string;
  detail?: string;
  kcal: number;
  onDelete: () => void;
}) {
  return (
    <TouchableOpacity
      style={fr.row}
      onLongPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        Alert.alert(name, undefined, [
          { text: 'Delete', style: 'destructive', onPress: () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            onDelete();
          }},
          { text: 'Cancel', style: 'cancel' },
        ]);
      }}
      activeOpacity={0.7}
      delayLongPress={400}
    >
      <Text style={fr.icon}>{emoji}</Text>
      <View style={fr.info}>
        <Text style={fr.name} numberOfLines={1}>{name}</Text>
        {detail && (
          <View style={fr.pills}>
            <Text style={[fr.pill, { color: colors.teal, backgroundColor: colors.teal + '22', borderWidth: 1, borderColor: colors.teal + '55' }]}>{detail}</Text>
          </View>
        )}
      </View>
      <Text style={[fr.kcal, { color: colors.teal, backgroundColor: colors.teal + '18', borderColor: colors.teal + '44' }]}>−{kcal} kcal</Text>
      <TouchableOpacity
        style={fr.trash}
        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); onDelete(); }}
        hitSlop={{ top: 10, bottom: 10, left: 14, right: 6 }}
      >
        <Ionicons name="trash-outline" size={fontSize.sm} color={colors.rose} />
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

// ── AI Confirm Modal ──────────────────────────────────────────────────────────
const AI_MULTIPLIERS = [0.5, 1, 1.5, 2] as const;

function AiConfirmModal({ visible, items, meal, onConfirm, onClose }: {
  visible: boolean;
  items: AiItem[];
  meal: Meal;
  onConfirm: (items: AiItem[]) => void;
  onClose: () => void;
}) {
  const [list, setList] = useState<AiItem[]>([]);
  useEffect(() => { setList(items); }, [items]);

  function setMultiplier(idx: number, m: number) {
    setList(prev => prev.map((it, i) => {
      if (i !== idx) return it;
      const base = it.per100 && it.weight_g
        ? { kcal: it.per100.kcal * it.weight_g / 100, carbs: it.per100.carbs * it.weight_g / 100, protein: it.per100.protein * it.weight_g / 100, fat: it.per100.fat * it.weight_g / 100 }
        : { kcal: it.kcal / it.multiplier, carbs: it.carbs / it.multiplier, protein: it.protein / it.multiplier, fat: it.fat / it.multiplier };
      return { ...it, multiplier: m, kcal: Math.round(base.kcal * m), carbs: Math.round(base.carbs * m), protein: Math.round(base.protein * m), fat: Math.round(base.fat * m) };
    }));
  }

  function removeItem(idx: number) { setList(prev => prev.filter((_, i) => i !== idx)); }

  const totalKcal = list.reduce((s, it) => s + it.kcal, 0);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['bottom']}>
        <View style={{ padding: spacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: colors.line }}>
          <TouchableOpacity onPress={onClose} style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="close" size={22} color={colors.ink2} />
          </TouchableOpacity>
          <View style={{ alignItems: 'center' }}>
            <Text style={{ color: colors.ink, fontSize: fontSize.md, fontWeight: '700' }}>AI Detected Food</Text>
            <Text style={{ color: colors.ink3, fontSize: fontSize.xs }}>Adjust portions before logging</Text>
          </View>
          <View style={{ width: spacing.xl }} />
        </View>

        <ScrollView contentContainerStyle={{ padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xl * 3 }}>
          {list.length === 0 ? (
            <View style={{ alignItems: 'center', paddingTop: spacing.lg + spacing.md }}>
              <Text style={{ fontSize: fontSize['2xl'] }}>🗑️</Text>
              <Text style={{ color: colors.ink3, marginTop: spacing.sm }}>All items removed</Text>
            </View>
          ) : list.map((item, idx) => (
            <View key={idx} style={{ backgroundColor: colors.layer1, borderWidth: 1, borderColor: colors.line2, borderRadius: radius.lg, padding: spacing.md, gap: spacing.sm }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <Text style={{ fontSize: fontSize.xl }}>{item.icon}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.ink, fontSize: fontSize.base, fontWeight: '600' }}>{item.name}</Text>
                  <Text style={{ color: colors.ink3, fontSize: fontSize.xs }}>{item.unit}{item.weight_g ? ` · ~${Math.round(item.weight_g * item.multiplier)}g` : ''}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ color: colors.lavender, fontSize: fontSize.md, fontWeight: '800' }}>{item.kcal}</Text>
                  <Text style={{ color: colors.ink3, fontSize: fontSize.xs }}>kcal</Text>
                </View>
                <TouchableOpacity onPress={() => removeItem(idx)} style={{ padding: 4 }}>
                  <Ionicons name="trash-outline" size={fontSize.lg} color={colors.rose} />
                </TouchableOpacity>
              </View>
              <View style={{ flexDirection: 'row', gap: spacing.xs }}>
                {AI_MULTIPLIERS.map(m => (
                  <TouchableOpacity key={m} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setMultiplier(idx, m); }}
                    style={{ flex: 1, paddingVertical: spacing.xs, borderRadius: radius.sm, alignItems: 'center', borderWidth: 1.5,
                      borderColor: item.multiplier === m ? colors.purple : colors.line2,
                      backgroundColor: item.multiplier === m ? colors.purpleTint : colors.layer2 }}>
                    <Text style={{ color: item.multiplier === m ? colors.lavender : colors.ink3, fontSize: fontSize.xs, fontWeight: '700' }}>{m}×</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                {[{ v: item.protein, l: 'P', c: colors.rose }, { v: item.carbs, l: 'C', c: colors.sky }, { v: item.fat, l: 'F', c: colors.violet }].map(({ v, l, c }) => (
                  <View key={l} style={{ flexDirection: 'row', gap: 3, alignItems: 'center' }}>
                    <Text style={{ color: c, fontSize: fontSize.xs, fontWeight: '700' }}>{l}</Text>
                    <Text style={{ color: colors.ink3, fontSize: fontSize.xs }}>{v}g</Text>
                  </View>
                ))}
              </View>
            </View>
          ))}
        </ScrollView>

        <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: spacing.lg, paddingBottom: spacing.xl, backgroundColor: colors.bg, borderTopWidth: 1, borderTopColor: colors.line }}>
          <Text style={{ color: colors.ink3, fontSize: fontSize.xs, textAlign: 'center', marginBottom: spacing.sm }}>
            Total: {totalKcal} kcal · {list.length} item{list.length !== 1 ? 's' : ''} to {meal}
          </Text>
          <View style={{ borderRadius: radius.md, overflow: 'hidden' }}>
            <ExpoLinearGradient colors={[colors.purple, colors.purpleGlow]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={{ paddingVertical: spacing.md, alignItems: 'center' }}>
              <TouchableOpacity onPress={() => list.length > 0 && onConfirm(list)} style={{ width: '100%', alignItems: 'center' }}>
                <Text style={{ color: colors.ink, fontSize: fontSize.base, fontWeight: '800', letterSpacing: 0.5 }}>LOG {list.length} ITEM{list.length !== 1 ? 'S' : ''} TO {meal.toUpperCase()}</Text>
              </TouchableOpacity>
            </ExpoLinearGradient>
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

// ── Main Diary Screen ─────────────────────────────────────────────────────────
export default function DiaryScreen() {
  const { email } = useAuthStore();
  const { selectedDate, entries, setSelectedDate, loadEntry, addFood, removeFood, addWater, removeWater, setWater, setVeggies: storeSetVeggies, setFruits: storeSetFruits, setSkippedMeals: storeSetSkippedMeals, updateCaloriesBurned, logSleep, addStrengthSession, addCardioSession } = useDiaryStore();
  const { streak, xp, checkAndUpdateStreak, addXp, calorieGoal: storeCalGoal, setMessagesOpen, hasUnread, programs, weightGoal, macroPcts } = useAppStore();
  const KCAL_GOAL = storeCalGoal || 2000;
  const xpInfo = getXpLevel(xp);

  const [analyzing, setAnalyzing] = useState(false);

  // AI confirm modal (photo analysis)
  const [aiConfirmVisible, setAiConfirmVisible] = useState(false);
  const [pendingAiItems, setPendingAiItems] = useState<AiItem[]>([]);
  const [aiConfirmMeal, setAiConfirmMeal] = useState<Meal>('breakfast');

  // AI text estimation
  const [aiEstimating, setAiEstimating] = useState(false);
  const [aiEstimateQuery, setAiEstimateQuery] = useState('');

  // Programs card data
  const [programsCardData, setProgramsCardData] = useState<ProgramsCardData>({});

  // Goal celebration
  const celebrateAnim = useRef(new Animated.Value(0)).current;
  const celebratedRef = useRef<string | null>(null);

  // Quick Add (cross-platform alternative to Alert.prompt)
  const [quickAddVisible, setQuickAddVisible] = useState(false);
  const [quickAddInput, setQuickAddInput] = useState('');

  // Food search
  const [searchVisible, setSearchVisible] = useState(false);
  const [searchMeal, setSearchMeal] = useState<Meal>('breakfast');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<FoodSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchQueryRef = useRef('');
  const [foodTab, setFoodTab] = useState<'search'|'recent'|'favorites'|'browse'|'create'|'restaurant'|'url'>('search');

  // Recipe URL import
  const [recipeUrl, setRecipeUrl] = useState('');
  const [importingRecipe, setImportingRecipe] = useState(false);

  // Restaurant search
  const [restaurantQuery, setRestaurantQuery] = useState('');
  const [restaurantResults, setRestaurantResults] = useState<RestaurantItem[]>([]);

  // Step tracking
  const [stepCount, setStepCount] = useState(0);
  const STEP_GOAL = 8000;

  // Barcode scanner
  const [scanning, setScanning] = useState(false);
  const [barcodePermission, requestBarcodePermission] = useCameraPermissions();
  const [barcodeLoading, setBarcodeLoading] = useState(false);
  const scanLockRef = useRef(false);

  // Serving size modal
  const [servingModalVisible, setServingModalVisible] = useState(false);
  const [pendingProduct, setPendingProduct] = useState<FoodSearchResult | null>(null);
  const [servingQty, setServingQty] = useState('100');

  // Custom food
  const [customFood, setCustomFood] = useState({ name: '', kcal: '', protein: '', carbs: '', fat: '', fiber: '', sodium: '' });

  // Overlays
  const [exerciseVisible, setExerciseVisible] = useState(false);
  const [copiedMeal, setCopiedMeal]         = useState<string | null>(null);

  // Favorites
  const [favorites, setFavorites] = useState<FoodItem[]>([]);

  const entry = entries[selectedDate];
  const foods = entry?.foods ?? [];
  const water = entry?.water ?? 0;
  const veggies = entry?.veggies ?? 0;
  const fruits = entry?.fruits ?? 0;
  const skippedMeals = entry?.skippedMeals ?? {};
  const caloriesBurned = entry?.calories_burned ?? 0;
  const totalKcal = foods.reduce((s, f) => s + f.kcal, 0);
  const totalCarbs = foods.reduce((s, f) => s + f.carbs, 0);
  const totalProtein = foods.reduce((s, f) => s + f.protein, 0);
  const totalFat = foods.reduce((s, f) => s + f.fat, 0);
  const totalFiber = foods.reduce((s, f) => s + (f.fiber ?? 0), 0);
  const totalSugar = foods.reduce((s, f) => s + (f.sugar ?? 0), 0);
  const totalSodium = foods.reduce((s, f) => s + (f.sodium ?? 0), 0);
  const totalVitaminC = foods.reduce((s, f) => s + (f.vitaminC ?? 0), 0);
  const totalCalcium = foods.reduce((s, f) => s + (f.calcium ?? 0), 0);
  const totalIron = foods.reduce((s, f) => s + (f.iron ?? 0), 0);
  const totalPotassium = foods.reduce((s, f) => s + (f.potassium ?? 0), 0);
  const netCarbs = Math.max(0, Math.round(totalCarbs - totalFiber));
  const netKcal = totalKcal - caloriesBurned;
  const CARBS_GOAL   = Math.round(KCAL_GOAL * (macroPcts.carbs   / 100) / 4);
  const PROTEIN_GOAL = Math.round(KCAL_GOAL * (macroPcts.protein / 100) / 4);
  const FAT_GOAL     = Math.round(KCAL_GOAL * (macroPcts.fat     / 100) / 9);
  const remaining = Math.max(0, KCAL_GOAL - netKcal);
  const ringDash = clamp(netKcal / KCAL_GOAL, 0, 1) * RING_CIRC;
  const isToday = selectedDate === dateStr(new Date());
  const waterGoalMet = water >= WATER_GOAL;

  // Calorie deficit projection (7700 kcal ≈ 1 kg body fat)
  const projText = useMemo(() => {
    if (!isToday || totalKcal <= 0) return null;
    const deficit = KCAL_GOAL - netKcal;
    if (Math.abs(deficit) < 50) return null;
    const kgPerWeek = (deficit * 7) / 7700;
    const absKg = Math.abs(kgPerWeek).toFixed(2);
    if (kgPerWeek > 0) return `At this rate: −${absKg} kg/week`;
    return `At this rate: +${absKg} kg/week`;
  }, [isToday, totalKcal, netKcal, KCAL_GOAL]);

  // Today's contextual insight tip
  const insightTip = useMemo(() => {
    if (!isToday || totalKcal <= 0) return null;
    const proteinPct = totalProtein * 4 / totalKcal * 100;
    if (proteinPct < 20) return { icon: '💪', text: 'Protein is low today — aim for 30% of calories from protein to preserve muscle.' };
    if (totalSodium > 2300) return { icon: '🧂', text: 'Sodium is high today. Consider more whole foods and less processed items.' };
    if (totalFiber < 10 && totalKcal > 500) return { icon: '🥦', text: 'Fiber is low — add veggies, legumes, or whole grains to support gut health.' };
    if (netKcal > KCAL_GOAL * 1.1) return { icon: '⚠️', text: 'You\'re over your calorie goal. A short walk can help offset the difference.' };
    if (water < 5) return { icon: '💧', text: 'Hydration looks low. Aim for 8 cups of water throughout the day.' };
    if (totalSugar > 50) return { icon: '🍬', text: 'Sugar intake is elevated. Watch out for hidden sugars in sauces and drinks.' };
    return { icon: '✅', text: 'Great balance today! You\'re hitting your targets well — keep it up.' };
  }, [isToday, totalKcal, totalProtein, totalSodium, totalFiber, netKcal, KCAL_GOAL, water, totalSugar]);

  // Cross-day recent foods: unique by name, most recent date first
  const recentFoods = useMemo(() => {
    const seen = new Set<string>();
    const result: FoodItem[] = [];
    for (const date of Object.keys(entries).sort().reverse()) {
      for (const f of (entries[date]?.foods ?? [])) {
        const key = f.name.toLowerCase().trim();
        if (!seen.has(key)) { seen.add(key); result.push(f); }
        if (result.length >= 40) return result;
      }
    }
    return result;
  }, [entries]);

  const vegGoalMet = veggies >= VEG_GOAL;
  const fruitGoalMet = fruits >= FRUIT_GOAL;

  // Streak risk: today, no food logged, hour >= 18
  const hourNow = new Date().getHours();
  const showStreakRisk = isToday && foods.length === 0 && streak > 0 && hourNow >= 18;

  useEffect(() => { loadEntry(selectedDate); }, [selectedDate]);

  // Programs card: load quit/pill stats from AsyncStorage
  useEffect(() => {
    if (!email) return;
    const QS_KEY  = `dagnara_quit_smoking_${email}`;
    const QD_KEY  = `dagnara_quit_drinking_${email}`;
    const PIL_KEY = `dagnara_pill_meds_${email}`;
    (async () => {
      try {
        const [qsRaw, qdRaw, pilRaw] = await Promise.all([
          AsyncStorage.getItem(QS_KEY),
          AsyncStorage.getItem(QD_KEY),
          AsyncStorage.getItem(PIL_KEY),
        ]);
        const now = Date.now();
        const dayMs = 86400000;
        let qsDays: number | undefined;
        let qdDays: number | undefined;
        let pillsCount: number | undefined;
        if (qsRaw) {
          const d = JSON.parse(qsRaw);
          if (d?.quitDate) qsDays = Math.floor((now - new Date(d.quitDate).getTime()) / dayMs);
        }
        if (qdRaw) {
          const d = JSON.parse(qdRaw);
          if (d?.quitDate) qdDays = Math.floor((now - new Date(d.quitDate).getTime()) / dayMs);
        }
        if (pilRaw) {
          const meds = JSON.parse(pilRaw);
          if (Array.isArray(meds)) pillsCount = meds.length;
        }
        setProgramsCardData({ qsDays, qdDays, pillsCount });
      } catch {}
    })();
  }, [email]);

  // Calorie goal celebration: fire once per day when hitting 95–110% of goal
  useEffect(() => {
    if (
      totalKcal >= KCAL_GOAL * 0.95 &&
      totalKcal <= KCAL_GOAL * 1.15 &&
      celebratedRef.current !== selectedDate
    ) {
      celebratedRef.current = selectedDate;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Animated.sequence([
        Animated.timing(celebrateAnim, { toValue: 1, duration: 250, useNativeDriver: false }),
        Animated.delay(400),
        Animated.timing(celebrateAnim, { toValue: 0, duration: 500, useNativeDriver: false }),
      ]).start();
    }
  }, [totalKcal]);

  // Cancel meal reminder for today once the user logs their first item for that meal
  useEffect(() => {
    if (!isToday || foods.length === 0) return;
    const logged = new Set(foods.map(f => f.meal));
    (['breakfast', 'lunch', 'dinner'] as const).forEach(meal => {
      if (logged.has(meal)) skipMealReminderToday(meal);
    });
  }, [foods.length, isToday]);

  useEffect(() => {
    AsyncStorage.getItem(`dagnara_food_favorites_${email ?? 'anon'}`).then(raw => {
      if (raw) setFavorites(JSON.parse(raw));
    });
  }, []);

  async function saveFavorite(food: FoodItem) {
    const alreadySaved = favorites.some(f => f.name === food.name);
    let updated: FoodItem[];
    if (alreadySaved) {
      updated = favorites.filter(f => f.name !== food.name);
    } else {
      updated = [{ ...food, id: `fav_${Date.now()}` }, ...favorites].slice(0, 50);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    setFavorites(updated);
    await AsyncStorage.setItem(`dagnara_food_favorites_${email ?? 'anon'}`, JSON.stringify(updated));
  }

  // Step tracking — subscribe to pedometer for today
  useEffect(() => {
    let sub: any;
    (async () => {
      const available = await Pedometer.isAvailableAsync();
      if (!available) return;
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      // Get today's steps so far
      const { steps } = await Pedometer.getStepCountAsync(start, new Date());
      setStepCount(steps);
      // Live updates
      sub = Pedometer.watchStepCount(({ steps: s }) => setStepCount(s));
    })();
    return () => sub?.remove?.();
  }, []);

  function doRestaurantSearch(q: string) {
    if (!q.trim()) { setRestaurantResults([]); return; }
    setRestaurantResults(searchLocalRestaurants(q));
  }

  async function addRestaurantItem(item: RestaurantItem) {
    const food: FoodItem = {
      id: `${Date.now()}_${Math.random()}`,
      icon: item.icon,
      name: `${item.brand} ${item.name}`,
      kcal: item.kcal,
      protein: item.protein,
      carbs: item.carbs,
      fat: item.fat,
      fiber: item.fiber,
      sodium: item.sodium,
      unit: item.serving,
      meal: searchMeal,
    };
    await addFood(selectedDate, food);
    await checkAndUpdateStreak(selectedDate);
    await addXp(10);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSearchVisible(false);
  }

  async function doSearch(q: string) {
    if (!q.trim()) { setSearchResults([]); setSearching(false); return; }
    setSearching(true);
    setSearchResults([]);
    const results = await searchFoods(q);
    setSearchResults(results);
    setSearching(false);
  }

  function openFoodSearch(meal: Meal) { setSearchMeal(meal); setSearchQuery(''); searchQueryRef.current = ''; setSearchResults([]); setFoodTab('search'); setSearchVisible(true); }

  function addFromSearch(product: FoodSearchResult) {
    setPendingProduct(product);
    setServingQty('100');
    setServingModalVisible(true);
  }

  async function confirmServing() {
    if (!pendingProduct) return;
    const qty = parseFloat(servingQty) || 100;
    if (qty < 1 || qty > 2000) { Alert.alert('Invalid serving', 'Serving size must be between 1 and 2000 g.'); return; }
    const ratio = qty / 100;
    const food: FoodItem = {
      id: `${Date.now()}_${Math.random()}`,
      icon: '🍽️',
      name: pendingProduct.name,
      kcal: Math.round(pendingProduct.kcal100 * ratio),
      carbs: Math.round(pendingProduct.carbs100 * ratio * 10) / 10,
      protein: Math.round(pendingProduct.protein100 * ratio * 10) / 10,
      fat: Math.round(pendingProduct.fat100 * ratio * 10) / 10,
      fiber: Math.round(pendingProduct.fiber100 * ratio * 10) / 10,
      sugar: Math.round(pendingProduct.sugar100 * ratio * 10) / 10,
      sodium: Math.round(pendingProduct.sodium100 * ratio),
      unit: `${qty}g`,
      meal: searchMeal,
    };
    await addFood(selectedDate, food);
    await checkAndUpdateStreak(selectedDate);
    await addXp(10);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setServingModalVisible(false);
    setPendingProduct(null);
    setSearchVisible(false);
  }

  async function handleBarcodeData(data: string) {
    setBarcodeLoading(true);
    try {
      const controller = new AbortController();
      const fetchTimeout = setTimeout(() => controller.abort(), 10000);
      const res = await fetch(
        `https://world.openfoodfacts.org/api/v2/product/${data}?fields=product_name,nutriments,serving_size,brands`,
        { signal: controller.signal }
      );
      clearTimeout(fetchTimeout);
      const json = await res.json();
      if (json.status === 1 && json.product) {
        const result = offToResult(json.product as OFFProduct);
        if (!result) {
          Alert.alert('No data', 'This product has no nutrition info. Try searching manually.');
          setSearchVisible(true);
        } else {
          setPendingProduct(result);
          setServingQty('100');
          setServingModalVisible(true);
        }
      } else {
        Alert.alert('Not found', 'This barcode is not in our database. Try searching manually.');
        setSearchVisible(true);
      }
    } catch (err: unknown) {
      const isTimeout = err instanceof Error && err.name === 'AbortError';
      Alert.alert('Error', isTimeout ? 'Request timed out. Check your connection.' : 'Could not fetch barcode data.');
      setSearchVisible(true);
    } finally {
      setBarcodeLoading(false);
      scanLockRef.current = false;
    }
  }

  async function handleBarcodePress() {
    if (!barcodePermission?.granted) {
      const result = await requestBarcodePermission();
      if (!result.granted) { Alert.alert('Permission needed', 'Allow camera access for barcode scanning.'); return; }
    }
    scanLockRef.current = false;
    setSearchVisible(false);
    setScanning(true);
  }

  async function handleImportRecipeUrl() {
    if (!recipeUrl.trim()) return;
    setImportingRecipe(true);
    try {
      const data = await importRecipe(recipeUrl.trim());
      // api.ts already returns the parsed object — not a raw Anthropic response
      const items: any[] = data?.items ?? [];
      if (items.length === 0) { Alert.alert('Nothing found', 'Could not extract recipe items. Try a direct recipe page URL.'); return; }
      for (const item of items) {
        const food: FoodItem = {
          id: `${Date.now()}_${Math.random()}`,
          icon: item.icon ?? '🍽️',
          name: item.name ?? 'Unknown',
          kcal: item.kcal ?? 0,
          carbs: item.carbs ?? 0,
          protein: item.protein ?? 0,
          fat: item.fat ?? 0,
          unit: item.unit ?? 'serving',
          meal: searchMeal,
        };
        await addFood(selectedDate, food);
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setRecipeUrl('');
      setSearchVisible(false);
      Alert.alert('Recipe imported!', `Added ${items.length} item${items.length !== 1 ? 's' : ''} from the recipe.`);
    } catch (err: any) {
      if (err?.message === 'SETUP_REQUIRED') {
        Alert.alert('Not set up', 'Recipe import requires a deployed server. Set EXPO_PUBLIC_API_URL in your .env.');
      } else {
        Alert.alert('Import failed', err?.message ?? 'Could not import recipe. Try a different URL.');
      }
    } finally {
      setImportingRecipe(false);
    }
  }

  async function processBase64Image(base64: string) {
    setAnalyzing(true);
    try {
      const data = await analyzeFood(base64, 'image/jpeg');
      const raw: any[] = Array.isArray(data?.items) ? data.items : [];
      if (raw.length === 0) { Alert.alert('No food detected', 'Try a clearer photo.'); return; }
      const h = new Date().getHours();
      const meal: Meal = h < 11 ? 'breakfast' : h < 15 ? 'lunch' : h < 20 ? 'dinner' : 'snack';
      const aiItems: AiItem[] = raw.map(item => ({
        icon: item.icon ?? '🍽️', name: item.name ?? 'Unknown food',
        kcal: item.kcal ?? 0, carbs: item.carbs ?? 0, protein: item.protein ?? 0, fat: item.fat ?? 0,
        unit: item.unit ?? 'serving', weight_g: item.weight_g, per100: item.per100, multiplier: 1,
      }));
      setPendingAiItems(aiItems);
      setAiConfirmMeal(meal);
      setAiConfirmVisible(true);
    } catch (err: any) {
      if (err?.message === 'SETUP_REQUIRED') {
        Alert.alert('Not set up', 'Food photo analysis requires a deployed server.\nSee EXPO_PUBLIC_API_URL in your .env file.');
      } else if (err?.message === 'NETWORK_ERROR') {
        Alert.alert('Connection failed', 'Could not reach the analysis server. Check your internet connection.');
      } else {
        Alert.alert('Could not analyse photo', 'Try a clearer photo or add food manually.');
      }
    } finally { setAnalyzing(false); }
  }

  async function handleConfirmAiItems(items: AiItem[]) {
    setAiConfirmVisible(false);
    for (const item of items) {
      const food: FoodItem = { id: `${Date.now()}_${Math.random()}`, icon: item.icon, name: item.name, kcal: item.kcal, carbs: item.carbs, protein: item.protein, fat: item.fat, unit: item.unit, meal: aiConfirmMeal };
      await addFood(selectedDate, food);
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await checkAndUpdateStreak(selectedDate);
    await addXp(items.length * 10);
  }

  async function handleAiEstimate() {
    const q = aiEstimateQuery.trim();
    if (!q) return;
    setAiEstimating(true);
    try {
      const data = await estimateNutrition(q);
      const items: any[] = Array.isArray(data?.items) ? data.items : [];
      if (items.length === 0) { Alert.alert('No estimate', 'Could not estimate nutrition for that description.'); return; }
      for (const item of items) {
        const food: FoodItem = { id: `${Date.now()}_${Math.random()}`, icon: item.icon ?? '🍽️', name: item.name ?? q, kcal: item.kcal ?? 0, carbs: item.carbs ?? 0, protein: item.protein ?? 0, fat: item.fat ?? 0, unit: item.unit ?? 'serving', meal: searchMeal };
        await addFood(selectedDate, food);
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await addXp(items.length * 10);
      setAiEstimateQuery('');
      setSearchVisible(false);
    } catch (err: any) {
      if (err?.message === 'SETUP_REQUIRED') {
        Alert.alert('Not set up', 'AI estimation requires a deployed server.');
      } else {
        Alert.alert('Estimate failed', err?.message ?? 'Could not estimate nutrition.');
      }
    } finally { setAiEstimating(false); }
  }

  async function handleCamera() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission needed', 'Allow camera access.'); return; }
    const result = await ImagePicker.launchCameraAsync({ base64: true, quality: 0.5 });
    if (result.canceled || !result.assets[0].base64) return;
    const b64 = result.assets[0].base64;
    if (b64.length > 10_000_000) { Alert.alert('Photo too large', 'Please use a lower-resolution photo.'); return; }
    await processBase64Image(b64);
  }

  async function handleGallery() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission needed', 'Allow photo access.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, base64: true, quality: 0.5 });
    if (result.canceled || !result.assets[0].base64) return;
    const b64 = result.assets[0].base64;
    if (b64.length > 10_000_000) { Alert.alert('Photo too large', 'Please use a lower-resolution photo.'); return; }
    await processBase64Image(b64);
  }

  async function handleGlassTap(i: number) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Tap filled glass → set to that index (remove it + above), tap empty → fill up to it
    const next = i < water ? i : i + 1;
    await setWater(selectedDate, next);
    if (next === WATER_GOAL && water < WATER_GOAL) {
      await addXp(5);
      await checkAndUpdateStreak(selectedDate);
    }
  }

  async function handleShareDay() {
    const kcalLine = `🔥 ${totalKcal} / ${KCAL_GOAL} kcal`;
    const macroLine = `🥩 ${Math.round(totalProtein)}g protein · 🍞 ${Math.round(totalCarbs)}g carbs · 🧈 ${Math.round(totalFat)}g fat`;
    const waterLine = `💧 ${water}/${WATER_GOAL} glasses`;
    const streakLine = streak > 0 ? `🔥 ${streak}-day streak` : '';
    const message = `📊 Nutrition for ${selectedDate} — tracked on Dagnara\n\n${kcalLine}\n${macroLine}\n${waterLine}${streakLine ? '\n' + streakLine : ''}\n\nTrack yours: dagnara.com`;
    Share.share({ message });
  }

  async function handleVegToggle() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await storeSetVeggies(selectedDate, vegGoalMet ? 0 : VEG_GOAL);
    if (!vegGoalMet) await checkAndUpdateStreak(selectedDate);
  }

  async function handleFruitToggle() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await storeSetFruits(selectedDate, fruitGoalMet ? 0 : FRUIT_GOAL);
    if (!fruitGoalMet) await checkAndUpdateStreak(selectedDate);
  }

  function toggleSkip(meal: string) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    storeSetSkippedMeals(selectedDate, { ...skippedMeals, [meal]: !skippedMeals[meal] });
  }


  async function handleAddCalories(kcal: number, name: string, emoji?: string, minutes?: number) {
    const current = entries[selectedDate]?.calories_burned ?? 0;
    await updateCaloriesBurned(selectedDate, current + kcal);
    const session: CardioSession = {
      id: Date.now().toString(),
      name,
      emoji: emoji ?? '🔥',
      minutes: minutes ?? 0,
      kcal,
      loggedAt: new Date().toISOString(),
    };
    await addCardioSession(selectedDate, session);
    await addXp(20);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert(`${name}: ${kcal} kcal burned ✓`, 'Exercise logged! +20 XP');
  }

  async function handleAddStrengthSession(session: StrengthSession) {
    await addStrengthSession(selectedDate, session);
  }

  async function quickLog(item: { icon: string; name: string; kcal: number; carbs: number; protein: number; fat: number }) {
    const meal: Meal = new Date().getHours() < 11 ? 'breakfast' : new Date().getHours() < 15 ? 'lunch' : 'dinner';
    const food: FoodItem = { id: `${Date.now()}`, icon: item.icon, name: item.name, kcal: item.kcal, carbs: item.carbs, protein: item.protein, fat: item.fat, unit: 'serving', meal };
    await addFood(selectedDate, food);
    await addXp(10);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await checkAndUpdateStreak(selectedDate);
  }

  return (
    <SafeAreaView style={st.safe} edges={['top']}>

      {/* ── App Header ── */}
      <View style={st.appHeader}>
        <Text style={st.appTitle}>Diary</Text>
        <View style={st.headerRight}>
          <TouchableOpacity style={st.iconBtn} onPress={handleShareDay}>
            <Ionicons name="share-outline" size={22} color={colors.ink2} />
          </TouchableOpacity>
          <TouchableOpacity style={st.iconBtn} onPress={() => setMessagesOpen(true)}>
            <Ionicons name="notifications-outline" size={22} color={colors.ink2} />
            {hasUnread && <View style={st.notifDot} />}
          </TouchableOpacity>
          <TouchableOpacity style={st.iconBtn} onPress={() => router.push('/(tabs)/profile')}>
            <Ionicons name="person-outline" size={22} color={colors.ink2} />
          </TouchableOpacity>
        </View>
      </View>


      {/* ── Streak Risk Banner ── */}
      {showStreakRisk && (
        <View style={st.streakRisk}>
          <Text style={{ fontSize: 22 }}>🔥</Text>
          <View style={{ flex: 1 }}>
            <Text style={st.srbTitle}>Your streak is at risk!</Text>
            <Text style={st.srbSub}>Log before midnight to keep it alive.</Text>
          </View>
          <Text style={st.srbCta}>LOG NOW</Text>
        </View>
      )}

      {/* ── Date Nav ── */}
      <View style={st.dateBar}>
        <TouchableOpacity onPress={() => setSelectedDate(addDays(selectedDate, -1))} style={st.navBtn}>
          <Ionicons name="chevron-back" size={20} color={colors.ink2} />
        </TouchableOpacity>
        <Text style={st.dateText}>
          {isToday ? 'Today' : new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
        </Text>
        <TouchableOpacity onPress={() => setSelectedDate(addDays(selectedDate, 1))} style={st.navBtn} disabled={isToday}>
          <Ionicons name="chevron-forward" size={20} color={isToday ? colors.ink3 : colors.ink2} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={st.scroll} showsVerticalScrollIndicator={false}>

        {/* ── Calorie Ring ── */}
        <ExpoLinearGradient
          colors={['rgba(124,77,255,0.14)', 'rgba(34,197,94,0.06)', 'transparent']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={st.calCard}
        >
        {/* Step counter (left) + Achievement tracker (right) */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.md, paddingTop: spacing.sm }}>
          {/* Step counter */}
          <View style={st.achieveBadge}>
            <View style={[st.xpBadge, { backgroundColor: stepCount >= STEP_GOAL ? colors.green : colors.honey }]}>
              <Text style={st.xpBadgeTxt}>👟</Text>
            </View>
            <View style={{ gap: 4 }}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: spacing.xs }}>
                <Text style={st.xpName}>{stepCount.toLocaleString()}</Text>
                <Text style={st.xpPts}>/ {STEP_GOAL.toLocaleString()}</Text>
              </View>
              <View style={[st.xpTrack, { width: 90 }]}>
                <View style={[st.xpFill, { width: `${Math.min(100, (stepCount / STEP_GOAL) * 100)}%` as any, backgroundColor: stepCount >= STEP_GOAL ? colors.green : colors.honey }]} />
              </View>
            </View>
          </View>

          {/* Achievement tracker */}
          <View style={st.achieveBadge}>
            <View style={st.xpBadge}><Text style={st.xpBadgeTxt}>{xpInfo.level}</Text></View>
            <View style={{ gap: 4 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <Text style={st.xpName}>{xpInfo.name}</Text>
                <Text style={st.xpPts}>{xp} XP</Text>
              </View>
              <View style={[st.xpTrack, { width: 90 }]}><View style={[st.xpFill, { width: `${xpInfo.progress * 100}%` as any }]} /></View>
            </View>
          </View>
        </View>
        <View style={st.calSection}>
          <View style={st.ringWrap}>
            <Svg width={190} height={190} viewBox="0 0 220 220">
              <Defs>
                <LinearGradient id="rg" x1="0%" y1="0%" x2="100%" y2="0%">
                  <Stop offset="0%" stopColor={colors.purple} /><Stop offset="100%" stopColor={colors.green} />
                </LinearGradient>
              </Defs>
              <Circle cx={110} cy={110} r={90} fill="none" stroke={colors.line} strokeWidth={14} />
              <G rotation="-90" origin="110, 110">
                <Circle cx={110} cy={110} r={90} fill="none" stroke="url(#rg)" strokeWidth={14} strokeLinecap="round"
                  strokeDasharray={`${clamp(netKcal / KCAL_GOAL, 0, 1) * 2 * Math.PI * 90} ${2 * Math.PI * 90}`} />
              </G>
            </Svg>
            <Animated.View style={[st.ringCenter, {
              transform: [{ scale: celebrateAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] }) }],
            }]}>
              <Animated.Text style={[st.ringNum, {
                color: celebrateAnim.interpolate({ inputRange: [0, 1], outputRange: [colors.ink, colors.green] }),
              }]}>{remaining}</Animated.Text>
              <Text style={st.ringLbl}>kcal left</Text>
            </Animated.View>
          </View>
          <View style={st.calStatsRow}>
            {[{ val: totalKcal, lbl: 'Eaten', color: colors.lavender }, { val: caloriesBurned, lbl: 'Burned', color: colors.honey }, { val: netKcal, lbl: 'Net', color: colors.green }].map(({ val, lbl, color }) => (
              <View key={lbl} style={st.calStat}>
                <Text style={[st.calStatVal, { color }]}>{val}</Text>
                <Text style={st.calStatLbl}>{lbl}</Text>
              </View>
            ))}
          </View>
          {projText && (
            <View style={st.projRow}>
              <Ionicons name="trending-down" size={fontSize.xs} color={colors.teal} />
              <Text style={st.projTxt}>{projText}</Text>
            </View>
          )}
        </View>
        </ExpoLinearGradient>

        {/* ── Macro Strip ── */}
        <View style={st.macroStrip}>
          {[
            { label: 'Carbs', val: totalCarbs, goal: CARBS_GOAL, color: colors.sky, gc: [colors.sky, colors.sky] as [string,string], sub: totalFiber > 0 ? `Net: ${netCarbs}g` : null },
            { label: 'Protein', val: totalProtein, goal: PROTEIN_GOAL, color: colors.rose, gc: [colors.rose, colors.rose] as [string,string], sub: null },
            { label: 'Fat', val: totalFat, goal: FAT_GOAL, color: colors.violet, gc: [colors.violet, colors.violet] as [string,string], sub: null },
          ].map(({ label, val, goal, color, gc, sub }) => (
            <View key={label} style={st.macroTile}>
              <ExpoLinearGradient colors={gc} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={st.macroTopBar} />
              <View style={st.macroHeader}>
                <Text style={st.macroName}>{label}</Text>
                <Text style={st.macroGoalLbl}>/ goal</Text>
              </View>
              <Text style={[st.macroVal, { color }]}>{Math.round(val)} / {goal}g</Text>
              {sub && <Text style={st.macroNetCarbs}>{sub}</Text>}
              <View style={st.macroTrack}>
                <View style={[st.macroFill, { width: `${clamp(val / goal, 0, 1) * 100}%` as any, backgroundColor: color }]} />
              </View>
            </View>
          ))}
        </View>

        {/* ── Micronutrients & Vitamins ── */}
        {(totalFiber > 0 || totalSugar > 0 || totalSodium > 0 || totalVitaminC > 0 || totalCalcium > 0 || totalIron > 0 || totalPotassium > 0) && (
          <View style={st.microRow}>
            <Text style={st.microHdr}>MICRONUTRIENTS & VITAMINS</Text>
            <View style={st.microChips}>
              {totalFiber > 0 && <View style={st.microChip}><Text style={st.microVal}>{Math.round(totalFiber)}g</Text><Text style={st.microLbl}>Fiber</Text><Text style={st.microDv}>{Math.round(totalFiber / 28 * 100)}%DV</Text></View>}
              {totalSugar > 0 && <View style={st.microChip}><Text style={[st.microVal, totalSugar > 50 && { color: colors.rose }]}>{Math.round(totalSugar)}g</Text><Text style={st.microLbl}>Sugar</Text><Text style={[st.microDv, totalSugar > 50 && { color: colors.rose }]}>{Math.round(totalSugar / 50 * 100)}%DV</Text></View>}
              {totalSodium > 0 && <View style={st.microChip}><Text style={[st.microVal, totalSodium > 2300 && { color: colors.rose }]}>{Math.round(totalSodium)}mg</Text><Text style={st.microLbl}>Sodium</Text><Text style={[st.microDv, totalSodium > 2300 && { color: colors.rose }]}>{Math.round(totalSodium / 2300 * 100)}%DV</Text></View>}
              {totalVitaminC > 0 && <View style={st.microChip}><Text style={st.microVal}>{totalVitaminC.toFixed(1)}mg</Text><Text style={st.microLbl}>Vit C</Text><Text style={st.microDv}>{Math.round(totalVitaminC / 90 * 100)}%DV</Text></View>}
              {totalCalcium > 0 && <View style={st.microChip}><Text style={st.microVal}>{Math.round(totalCalcium)}mg</Text><Text style={st.microLbl}>Calcium</Text><Text style={st.microDv}>{Math.round(totalCalcium / 1300 * 100)}%DV</Text></View>}
              {totalIron > 0 && <View style={st.microChip}><Text style={st.microVal}>{totalIron.toFixed(1)}mg</Text><Text style={st.microLbl}>Iron</Text><Text style={st.microDv}>{Math.round(totalIron / 18 * 100)}%DV</Text></View>}
              {totalPotassium > 0 && <View style={st.microChip}><Text style={st.microVal}>{Math.round(totalPotassium)}mg</Text><Text style={st.microLbl}>Potassium</Text><Text style={st.microDv}>{Math.round(totalPotassium / 4700 * 100)}%DV</Text></View>}
            </View>
          </View>
        )}

        {/* ── Today's Insight ── */}
        {insightTip && (
          <View style={st.insightCard}>
            <Text style={st.insightIcon}>{insightTip.icon}</Text>
            <Text style={st.insightText}>{insightTip.text}</Text>
          </View>
        )}

        {/* ── Scan buttons ── */}
        <View style={st.scanRow}>
          <TouchableOpacity style={st.scanPrimary} onPress={handleCamera} disabled={analyzing}>
            <Ionicons name="camera" size={18} color={colors.white} />
            <Text style={st.scanTxt}>AI Scan</Text>
          </TouchableOpacity>
          <TouchableOpacity style={st.scanSecondary} onPress={handleGallery} disabled={analyzing}>
            <Ionicons name="images-outline" size={18} color={colors.lavender} />
            <Text style={[st.scanTxt, { color: colors.lavender }]}>Gallery</Text>
          </TouchableOpacity>
          {analyzing && <ActivityIndicator color={colors.lavender} style={{ marginLeft: 4 }} />}
        </View>

        {/* ── Today's meals ── */}
        <Text style={st.sectionHdr}>Today's meals</Text>
        {MEALS.map((meal) => {
          const mealFoods = foods.filter((f) => f.meal === meal);
          const mealKcal = mealFoods.reduce((s, f) => s + f.kcal, 0);
          const accent = MEAL_ACCENT[meal];
          const skipped = skippedMeals[meal];
          return (
            <View key={meal} style={st.mealCard}>
              {/* Header row — tapping it opens food search */}
              <TouchableOpacity style={st.mealHeader} onPress={() => !skipped && openFoodSearch(meal)} activeOpacity={skipped ? 1 : 0.75}>
                <View style={st.mealIconWrap}><Text style={[st.mealEmoji, skipped && { opacity: 0.4 }]}>{MEAL_ICONS[meal]}</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={[st.mealName, skipped && { opacity: 0.4 }]}>{MEAL_LABEL[meal]}</Text>
                  {!skipped && (mealKcal > 0
                    ? <Text style={[st.mealRec, { color: accent }]}>{mealKcal} kcal logged</Text>
                    : <Text style={st.mealRec}>{MEAL_SUGGESTED[meal]}</Text>
                  )}
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                  {skipped ? (
                    // When skipped: single tappable pill to undo
                    <TouchableOpacity style={st.skippedPill} onPress={() => toggleSkip(meal)} activeOpacity={0.7}>
                      <Text style={st.skippedPillTxt}>Skipped</Text>
                    </TouchableOpacity>
                  ) : (
                    <>
                      <TouchableOpacity
                        style={[st.skipBtn, copiedMeal === meal && { backgroundColor: colors.green + '22' }]}
                        onPress={async () => {
                          const d = new Date(); d.setDate(d.getDate() - 1);
                          const yesterday = d.toISOString().split('T')[0];
                          const yFoods = (entries[yesterday]?.foods ?? []).filter(f => f.meal === meal);
                          if (yFoods.length === 0) { Alert.alert('Nothing to copy', `No ${MEAL_LABEL[meal]} logged yesterday.`); return; }
                          for (const f of yFoods) await addFood(selectedDate, { ...f, id: `${Date.now()}_${Math.random()}` });
                          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                          setCopiedMeal(meal);
                          setTimeout(() => setCopiedMeal(null), 1500);
                          await checkAndUpdateStreak(selectedDate);
                        }}
                      >
                        <Text style={[st.skipTxt, copiedMeal === meal && { color: colors.green }]}>{copiedMeal === meal ? '✓' : 'Copy'}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={st.skipBtn} onPress={() => toggleSkip(meal)}>
                        <Text style={st.skipTxt}>Skip</Text>
                      </TouchableOpacity>
                      <View style={[st.mealAddBtn, { borderColor: accent + '55' }]}>
                        <Text style={{ fontSize: fontSize.lg, color: accent, lineHeight: fontSize.lg + 2 }}>+</Text>
                      </View>
                    </>
                  )}
                </View>
              </TouchableOpacity>

              {/* Food items — full width below header */}
              {mealFoods.length > 0 && (
                <View style={st.mealFoods}>
                  {mealFoods.map(f => (
                    <FoodRow
                      key={f.id}
                      food={f}
                      onDelete={() => removeFood(selectedDate, f.id)}
                      onFavorite={() => saveFavorite(f)}
                    />
                  ))}
                </View>
              )}
            </View>
          );
        })}

        {/* ── Activity ── */}
        <Text style={st.sectionHdr}>Activity</Text>
        <View style={st.mealCard}>
          <TouchableOpacity style={st.mealHeader} onPress={() => setExerciseVisible(true)} activeOpacity={0.75}>
            <View style={[st.mealIconWrap, { backgroundColor: colors.teal + '22' }]}>
              <Text style={st.mealEmoji}>🔥</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[st.mealName, { color: colors.teal }]}>Activity</Text>
              <Text style={[st.mealRec, { color: colors.teal, fontWeight: '600' }]}>
                {caloriesBurned > 0 ? `−${caloriesBurned} kcal burned` : 'Log exercise'}
              </Text>
            </View>
            <View style={[st.mealAddBtn, { borderColor: colors.teal + '55' }]}>
              <Text style={{ fontSize: fontSize.lg, color: colors.teal, lineHeight: fontSize.lg + 2 }}>+</Text>
            </View>
          </TouchableOpacity>

          {((entry?.cardioSessions?.length ?? 0) > 0 || (entry?.strengthSessions?.length ?? 0) > 0) && (
            <View style={st.mealFoods}>
              {(entry?.cardioSessions ?? []).map(session => (
                <ActivityRow
                  key={session.id}
                  emoji={session.emoji}
                  name={session.name}
                  detail={session.minutes > 0 ? `${session.minutes} min` : undefined}
                  kcal={session.kcal}
                  onDelete={() => useDiaryStore.getState().removeCardioSession(selectedDate, session.id)}
                />
              ))}
              {(entry?.strengthSessions ?? []).map(session => (
                <ActivityRow
                  key={session.id}
                  emoji="🏋️"
                  name={session.exercises.map(e => `${e.name} ${e.sets.length}×${e.sets[0]?.reps ?? 0}`).join(' · ')}
                  kcal={session.totalKcal}
                  onDelete={() => useDiaryStore.getState().removeStrengthSession(selectedDate, session.id)}
                />
              ))}
            </View>
          )}
        </View>

        {/* ── Daily wins ── */}
        <Text style={st.sectionHdr}>Daily wins</Text>


        {/* Water / Veg / Fruit */}
        <View style={st.winCard}>
          {/* Per-glass water tracker */}
          <View style={st.waterCard}>
            <View style={st.waterHeader}>
              <Text style={st.wvfLabel}>💧 WATER</Text>
              <Text style={[st.waterCount, { color: waterGoalMet ? colors.sky : colors.ink3 }]}>{water}/{WATER_GOAL} glasses</Text>
            </View>
            <View style={st.waterGlasses}>
              {Array.from({ length: WATER_GOAL }, (_, i) => (
                <TouchableOpacity
                  key={i}
                  onPress={() => handleGlassTap(i)}
                  activeOpacity={0.7}
                  style={[st.waterGlass, i < water && st.waterGlassFull]}
                >
                  <Text style={{ fontSize: fontSize.md, color: i < water ? colors.sky : colors.ink3 }}>💧</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Veg / Fruit row */}
          <View style={st.wvfRow}>
            <TouchableOpacity
              style={[st.wvfBtn, vegGoalMet && st.wvfBtnVeg]}
              onPress={handleVegToggle}
              activeOpacity={0.75}
            >
              <Text style={st.wvfEmoji}>🥦</Text>
              <Text style={[st.wvfLabel, vegGoalMet && { color: colors.green }]}>Vegetables</Text>
              {vegGoalMet && <Text style={[st.wvfCheck, { color: colors.green }]}>✓</Text>}
            </TouchableOpacity>
            <TouchableOpacity
              style={[st.wvfBtn, fruitGoalMet && st.wvfBtnFruit]}
              onPress={handleFruitToggle}
              activeOpacity={0.75}
            >
              <Text style={st.wvfEmoji}>🍎</Text>
              <Text style={[st.wvfLabel, fruitGoalMet && { color: colors.rose }]}>Fruits</Text>
              {fruitGoalMet && <Text style={[st.wvfCheck, { color: colors.rose }]}>✓</Text>}
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Programs moat card ── */}
        {(programs?.quit_smoking || programs?.quit_drinking || programs?.pill_reminder) && (
          <TouchableOpacity style={{ backgroundColor: colors.layer1, borderWidth: 1, borderColor: colors.line2, borderRadius: radius.lg, padding: spacing.md, gap: spacing.sm, marginTop: spacing.md }} activeOpacity={0.8} onPress={() => router.push('/(tabs)/programs')}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ color: colors.ink3, fontSize: fontSize.xs, fontWeight: '700', letterSpacing: 1.1, textTransform: 'uppercase' }}>Programs</Text>
              <Ionicons name="chevron-forward" size={fontSize.sm} color={colors.ink3} />
            </View>
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              {programs?.quit_smoking && programsCardData.qsDays != null && (
                <View style={{ flex: 1, backgroundColor: colors.purpleTint, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line3, padding: spacing.sm, alignItems: 'center', gap: 2 }}>
                  <Text style={{ fontSize: fontSize.lg }}>🚬</Text>
                  <Text style={{ color: colors.lavender, fontSize: fontSize.md, fontWeight: '800' }}>{programsCardData.qsDays}</Text>
                  <Text style={{ color: colors.ink3, fontSize: fontSize.xs }}>days smoke-free</Text>
                </View>
              )}
              {programs?.quit_drinking && programsCardData.qdDays != null && (
                <View style={{ flex: 1, backgroundColor: colors.purpleTint, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line3, padding: spacing.sm, alignItems: 'center', gap: 2 }}>
                  <Text style={{ fontSize: fontSize.lg }}>🍺</Text>
                  <Text style={{ color: colors.teal, fontSize: fontSize.md, fontWeight: '800' }}>{programsCardData.qdDays}</Text>
                  <Text style={{ color: colors.ink3, fontSize: fontSize.xs }}>days sober</Text>
                </View>
              )}
              {programs?.pill_reminder && programsCardData.pillsCount != null && programsCardData.pillsCount > 0 && (
                <View style={{ flex: 1, backgroundColor: colors.purpleTint, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line3, padding: spacing.sm, alignItems: 'center', gap: 2 }}>
                  <Text style={{ fontSize: fontSize.lg }}>💊</Text>
                  <Text style={{ color: colors.green, fontSize: fontSize.md, fontWeight: '800' }}>{programsCardData.pillsCount}</Text>
                  <Text style={{ color: colors.ink3, fontSize: fontSize.xs }}>med{programsCardData.pillsCount !== 1 ? 's' : ''} tracked</Text>
                </View>
              )}
            </View>
          </TouchableOpacity>
        )}

        <View style={{ height: spacing.xl }} />
      </ScrollView>

      {/* ── Modals ── */}
      <AiConfirmModal visible={aiConfirmVisible} items={pendingAiItems} meal={aiConfirmMeal} onConfirm={handleConfirmAiItems} onClose={() => setAiConfirmVisible(false)} />
      <ExerciseModal visible={exerciseVisible} onClose={() => setExerciseVisible(false)} onAddCalories={handleAddCalories} onAddStrengthSession={handleAddStrengthSession} />

      {/* Barcode Scanner Modal */}
      <Modal visible={scanning} animationType="slide" presentationStyle="fullScreen">
        <View style={{ flex: 1, backgroundColor: colors.bg }}>
          <SafeAreaView style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.line }}>
              <View style={{ width: 40 }} />
              <Text style={{ color: colors.ink, fontSize: fontSize.md, fontWeight: '700' }}>Scan Barcode</Text>
              <TouchableOpacity
                onPress={() => { setScanning(false); scanLockRef.current = false; setSearchVisible(true); }}
                style={{ width: 40, alignItems: 'flex-end', padding: spacing.xs }}
              >
                <Ionicons name="close" size={24} color={colors.ink} />
              </TouchableOpacity>
            </View>
            <CameraView
              style={{ flex: 1 }}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'qr'] }}
              onBarcodeScanned={({ data }) => {
                if (scanLockRef.current) return;
                scanLockRef.current = true;
                setScanning(false);
                handleBarcodeData(data);
              }}
            >
              <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                <View style={{ width: 260, height: 160, position: 'relative' }}>
                  {[
                    { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3 },
                    { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3 },
                    { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3 },
                    { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3 },
                  ].map((style, i) => (
                    <View key={i} style={[{ position: 'absolute', width: 24, height: 24, borderColor: colors.ink }, style]} />
                  ))}
                  <View style={{ position: 'absolute', top: '50%', left: spacing.sm, right: spacing.sm, height: 1, backgroundColor: colors.rose + '99' }} />
                </View>
              </View>
            </CameraView>
            <View style={{ padding: spacing.lg, alignItems: 'center' }}>
              <Text style={{ color: colors.ink3, textAlign: 'center' }}>Point your camera at a barcode</Text>
            </View>
          </SafeAreaView>
        </View>
      </Modal>

      {/* Barcode lookup loading overlay */}
      <Modal visible={barcodeLoading} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: colors.dim, justifyContent: 'center', alignItems: 'center' }}>
          <View style={{ backgroundColor: colors.layer3, borderRadius: radius.lg, padding: spacing.xl, alignItems: 'center', gap: spacing.md }}>
            <ActivityIndicator size="large" color={colors.lavender} />
            <Text style={{ color: colors.ink, fontSize: fontSize.base, fontWeight: '600' }}>Looking up product…</Text>
          </View>
        </View>
      </Modal>

      {/* Serving Size Modal */}
      <Modal visible={servingModalVisible} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['bottom']}>
          <View style={{ padding: spacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <TouchableOpacity onPress={() => { setServingModalVisible(false); setSearchVisible(true); }}>
              <Text style={{ color: colors.ink2, fontSize: 15 }}>Back</Text>
            </TouchableOpacity>
            <Text style={{ color: colors.ink, fontSize: 17, fontWeight: '700' }}>Serving Size</Text>
            <TouchableOpacity onPress={confirmServing}>
              <Text style={{ color: colors.lavender, fontSize: 15, fontWeight: '700' }}>Add</Text>
            </TouchableOpacity>
          </View>
          {pendingProduct && (() => {
            const qty = parseFloat(servingQty) || 100;
            const ratio = qty / 100;
            const kcal = Math.round(pendingProduct.kcal100 * ratio);
            const prot = parseFloat((pendingProduct.protein100 * ratio).toFixed(1));
            const carb = parseFloat((pendingProduct.carbs100 * ratio).toFixed(1));
            const fat  = parseFloat((pendingProduct.fat100 * ratio).toFixed(1));
            return (
              <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}>
                <Text style={{ color: colors.ink, fontSize: fontSize.md, fontWeight: '700' }}>{pendingProduct.name}</Text>
                {pendingProduct.brand && <Text style={{ color: colors.ink3, fontSize: fontSize.sm }}>{pendingProduct.brand}</Text>}
                <View style={{ backgroundColor: colors.layer2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line2, padding: spacing.md, gap: spacing.sm }}>
                  <Text style={{ color: colors.ink3, fontSize: fontSize.xs, textTransform: 'uppercase', letterSpacing: 1, fontWeight: '700' }}>Serving Size (grams)</Text>
                  <View style={{ flexDirection: 'row', gap: spacing.xs }}>
                    {['50', '100', '150', '200', '250'].map(g => (
                      <TouchableOpacity key={g} onPress={() => setServingQty(g)}
                        style={{ flex: 1, paddingVertical: spacing.sm, borderRadius: radius.sm, borderWidth: 1.5, alignItems: 'center',
                          borderColor: servingQty === g ? colors.purple : colors.line2,
                          backgroundColor: servingQty === g ? colors.purpleTint : colors.layer3 }}>
                        <Text style={{ color: servingQty === g ? colors.purple : colors.ink3, fontSize: fontSize.xs, fontWeight: '600' }}>{g}g</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                    <TextInput
                      style={{ flex: 1, backgroundColor: colors.layer3, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line2, padding: spacing.md, color: colors.ink, fontSize: fontSize.base, textAlign: 'center' }}
                      value={servingQty}
                      onChangeText={setServingQty}
                      keyboardType="decimal-pad"
                      placeholder="Custom grams"
                      placeholderTextColor={colors.ink3}
                    />
                    <Text style={{ color: colors.ink3 }}>g</Text>
                  </View>
                </View>
                <View style={{ backgroundColor: colors.layer2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line2, padding: spacing.md }}>
                  <Text style={{ color: colors.ink3, fontSize: fontSize.xs, textTransform: 'uppercase', letterSpacing: 1, fontWeight: '700', marginBottom: spacing.sm }}>Nutrition for {qty}g</Text>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
                    {[
                      { val: kcal, lbl: 'kcal',    color: colors.purple },
                      { val: prot, lbl: 'protein',  color: colors.sky },
                      { val: carb, lbl: 'carbs',    color: colors.honey },
                      { val: fat,  lbl: 'fat',      color: colors.rose },
                    ].map(({ val, lbl, color }) => (
                      <View key={lbl} style={{ alignItems: 'center', gap: 2 }}>
                        <Text style={{ color, fontSize: fontSize.lg, fontWeight: '800' }}>{val}</Text>
                        <Text style={{ color: colors.ink3, fontSize: fontSize.xs }}>{lbl}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              </ScrollView>
            );
          })()}
        </SafeAreaView>
      </Modal>

      {/* Food search modal */}
      <Modal visible={searchVisible} animationType="slide" presentationStyle="pageSheet"
        onRequestClose={() => setSearchVisible(false)}>
        <SafeAreaView style={st.searchModal} edges={['bottom']}>
          <View style={st.searchHeader}>
            <Text style={st.searchTitle}>Add to {MEAL_LABEL[searchMeal]}</Text>
            <TouchableOpacity onPress={() => setSearchVisible(false)} style={st.searchClose}>
              <Ionicons name="close" size={22} color={colors.ink2} />
            </TouchableOpacity>
          </View>

          {/* Search input */}
          <View style={st.searchInputRow}>
            <Ionicons name="search-outline" size={20} color={colors.ink3} />
            <TextInput
              style={st.searchInput}
              placeholder="Search food, meal or brand..."
              placeholderTextColor={colors.ink3}
              value={searchQuery}
              onChangeText={(t) => {
                setSearchQuery(t);
                searchQueryRef.current = t;
                setFoodTab('search');
                if (!t.trim()) { setSearchResults([]); setSearching(false); return; }
                setSearchResults([]); // Clear stale immediately
                if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
                searchDebounceRef.current = setTimeout(() => doSearch(t), 400);
              }}
              returnKeyType="search"
              onSubmitEditing={() => doSearch(searchQuery)}
            />
            {searching && <ActivityIndicator size="small" color={colors.lavender} />}
          </View>

          {/* Action buttons — single unified row */}
          <View style={st.actionRow}>
            {[
              { icon: '📷', label: 'Scan Photo',    onPress: () => { setSearchVisible(false); handleCamera(); } },
              { icon: '📦', label: 'Scan Barcode',  onPress: handleBarcodePress },
              { icon: '🖼️', label: 'Gallery',       onPress: () => { setSearchVisible(false); handleGallery(); } },
              { icon: '⚡', label: 'Quick Add',     onPress: () => { setQuickAddInput(''); setQuickAddVisible(true); } },
            ].map(p => (
              <TouchableOpacity key={p.label} style={st.actionBtn} onPress={p.onPress} activeOpacity={0.75}>
                <Text style={st.actionBtnIcon}>{p.icon}</Text>
                <Text style={st.actionBtnLabel}>{p.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Tabs */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}>
            <View style={st.foodTabRow}>
              {(['search','recent','favorites','browse','restaurant','create','url'] as const).map(t => (
                <TouchableOpacity key={t} style={[st.foodTabBtn, foodTab === t && st.foodTabBtnActive]}
                  onPress={() => setFoodTab(t)}>
                  <Text style={[st.foodTabTxt, foodTab === t && st.foodTabTxtActive]}>
                    {t === 'search' ? '🔍 Search' : t === 'recent' ? '🕐 Recent' : t === 'favorites' ? '❤️ Saved' : t === 'browse' ? '📂 Browse' : t === 'restaurant' ? '🍔 Chains' : t === 'create' ? '➕ Create' : '🔗 URL'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>

          {/* Tab content */}
          {foodTab === 'search' && (
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing.md, gap: spacing.sm }} keyboardShouldPersistTaps="handled">
              {/* Loading */}
              {searchQuery.length > 0 && searching && (
                <View style={{ alignItems: 'center', paddingVertical: spacing.md }}>
                  <ActivityIndicator size="small" color={colors.lavender} />
                </View>
              )}
              {/* Empty state */}
              {searchQuery.length > 0 && !searching && searchResults.length === 0 && (
                <View style={{ alignItems: 'center', paddingTop: spacing.lg, gap: spacing.sm }}>
                  <Text style={{ fontSize: fontSize.xl }}>🔍</Text>
                  <Text style={{ color: colors.ink3, fontSize: fontSize.sm }}>No results found</Text>
                </View>
              )}
              {/* Search results */}
              {searchResults.map((item, i) => {
                const { grade, color: gradeColor } = gradeFoodItem({ kcal: item.kcal100, protein: item.protein100, fiber: item.fiber100, sugar: item.sugar100, sodium: item.sodium100 } as FoodItem);
                const isFav = favorites.some(f => f.name === item.name);
                return (
                  <TouchableOpacity key={String(i)} style={st.foodResult} onPress={() => addFromSearch(item)}>
                    <View style={[st.gradeBadge, { backgroundColor: gradeColor + '22', borderColor: gradeColor + '66' }]}>
                      <Text style={[st.gradeText, { color: gradeColor }]}>{grade}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={st.foodResultName}>{item.name}</Text>
                      {item.brand && <Text style={st.foodResultBrand}>{item.brand}</Text>}
                      <Text style={st.foodResultMeta}>per 100g · P{r2(item.protein100)}g C{r2(item.carbs100)}g F{r2(item.fat100)}g</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 4 }}>
                      <Text style={st.foodResultKcal}>{item.kcal100}</Text>
                      <Text style={st.foodResultKcalLbl}>kcal</Text>
                    </View>
                    <TouchableOpacity onPress={() => saveFavorite({ id: `fav_${Date.now()}`, icon: '🍽️', name: item.name, kcal: item.kcal100, carbs: item.carbs100, protein: item.protein100, fat: item.fat100, unit: '100g', meal: searchMeal })} style={{ padding: 4, marginLeft: 2 }}>
                      <Ionicons name={isFav ? 'heart' : 'heart-outline'} size={fontSize.md} color={colors.rose} />
                    </TouchableOpacity>
                    <View style={[st.addFoodBtn, { backgroundColor: MEAL_ACCENT[searchMeal] + '22', borderColor: MEAL_ACCENT[searchMeal] + '66' }]}>
                      <Ionicons name="add" size={20} color={MEAL_ACCENT[searchMeal]} />
                    </View>
                  </TouchableOpacity>
                );
              })}
              {/* Divider when results present */}
              {searchResults.length > 0 && (
                <View style={{ height: 1, backgroundColor: colors.line, marginVertical: spacing.xs }} />
              )}
              {/* Ask AI */}
              <View style={{ backgroundColor: colors.purpleTint, borderWidth: 1, borderColor: colors.line3, borderRadius: radius.lg, padding: spacing.sm, gap: spacing.xs }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                  <Text style={{ fontSize: fontSize.sm }}>✨</Text>
                  <Text style={{ fontSize: fontSize.sm, color: colors.lavender, fontWeight: '700' }}>Describe what you ate</Text>
                </View>
                <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                  <TextInput
                    style={{ flex: 1, backgroundColor: colors.layer2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line2, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, color: colors.ink, fontSize: fontSize.base, minHeight: 46 }}
                    placeholder="e.g. 1 cup cooked rice, large apple..."
                    placeholderTextColor={colors.ink3}
                    value={aiEstimateQuery}
                    onChangeText={setAiEstimateQuery}
                    returnKeyType="done"
                    onSubmitEditing={handleAiEstimate}
                    multiline={false}
                  />
                  <TouchableOpacity onPress={handleAiEstimate} disabled={aiEstimating || !aiEstimateQuery.trim()}
                    style={{ borderRadius: radius.md, overflow: 'hidden', alignSelf: 'stretch' }}>
                    <ExpoLinearGradient
                      colors={aiEstimating || !aiEstimateQuery.trim() ? [colors.layer2, colors.layer2] : [colors.purple, colors.purpleGlow]}
                      start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
                      style={{ flex: 1, paddingHorizontal: spacing.lg, justifyContent: 'center', alignItems: 'center', minWidth: 64 }}>
                      {aiEstimating
                        ? <ActivityIndicator size="small" color={colors.lavender} />
                        : <Text style={{ color: colors.ink, fontSize: fontSize.sm, fontWeight: '800', letterSpacing: 0.5 }}>GO</Text>}
                    </ExpoLinearGradient>
                  </TouchableOpacity>
                </View>
              </View>
            </ScrollView>
          )}

          {foodTab === 'recent' && (
            <FlatList
              style={{ flex: 1 }}
              data={recentFoods}
              keyExtractor={(f) => f.id}
              contentContainerStyle={{ padding: spacing.md, gap: spacing.sm }}
              ListEmptyComponent={
                <View style={{ alignItems: 'center', paddingTop: spacing.xl, gap: spacing.sm }}>
                  <Text style={{ fontSize: fontSize.xl }}>🕐</Text>
                  <Text style={{ color: colors.ink3 }}>No recent foods yet — log something first</Text>
                </View>
              }
              renderItem={({ item: f }) => (
                <TouchableOpacity style={st.foodResult} onPress={async () => {
                  await addFood(selectedDate, { ...f, id: `${Date.now()}` });
                  await addXp(10);
                  setSearchVisible(false);
                }}>
                  <Text style={{ fontSize: 24, marginRight: 8 }}>{f.icon}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={st.foodResultName}>{f.name}</Text>
                    <Text style={st.foodResultMeta}>{f.unit}</Text>
                  </View>
                  <Text style={st.foodResultKcal}>{f.kcal} kcal</Text>
                  <Ionicons name="add-circle" size={24} color={MEAL_ACCENT[searchMeal]} style={{ marginLeft: 8 }} />
                </TouchableOpacity>
              )}
            />
          )}

          {foodTab === 'favorites' && (
            <FlatList
              style={{ flex: 1 }}
              data={favorites}
              keyExtractor={f => f.id}
              contentContainerStyle={{ padding: spacing.md, gap: spacing.sm }}
              ListEmptyComponent={
                <View style={{ alignItems: 'center', paddingTop: 40, gap: 8 }}>
                  <Text style={{ fontSize: 36 }}>❤️</Text>
                  <Text style={{ color: colors.ink, fontSize: 16, fontWeight: '700' }}>No saved foods yet</Text>
                  <Text style={{ color: colors.ink3, textAlign: 'center', paddingHorizontal: 24 }}>
                    Tap ♡ on any food in Search to save it here
                  </Text>
                </View>
              }
              renderItem={({ item: f }) => (
                <TouchableOpacity style={st.foodResult} onPress={async () => {
                  await addFood(selectedDate, { ...f, id: `${Date.now()}_${Math.random()}`, meal: searchMeal });
                  await addXp(10);
                  await checkAndUpdateStreak(selectedDate);
                  setSearchVisible(false);
                }}>
                  <Text style={{ fontSize: 24, marginRight: 8 }}>{f.icon}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={st.foodResultName}>{f.name}</Text>
                    <Text style={st.foodResultMeta}>{f.unit} · P{r2(f.protein)}g C{r2(f.carbs)}g F{r2(f.fat)}g</Text>
                  </View>
                  <Text style={st.foodResultKcal}>{f.kcal}</Text>
                  <Text style={st.foodResultKcalLbl}>kcal</Text>
                  <TouchableOpacity onPress={() => saveFavorite(f)} style={{ marginLeft: 8, padding: 4 }}>
                    <Ionicons name="heart" size={18} color={colors.rose} />
                  </TouchableOpacity>
                </TouchableOpacity>
              )}
            />
          )}

          {foodTab === 'browse' && (
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing.md, gap: spacing.sm }}>
              {[
                { emoji: '🥣', label: 'Breakfast Foods', items: ['Oatmeal', 'Eggs', 'Toast', 'Yogurt'] },
                { emoji: '🥗', label: 'Salads & Vegetables', items: ['Caesar Salad', 'Spinach', 'Broccoli'] },
                { emoji: '🍗', label: 'Proteins', items: ['Chicken Breast', 'Salmon', 'Tuna', 'Beef'] },
                { emoji: '🍎', label: 'Fruits', items: ['Apple', 'Banana', 'Orange', 'Berries'] },
                { emoji: '🥛', label: 'Dairy', items: ['Milk', 'Cheese', 'Greek Yogurt'] },
                { emoji: '🍝', label: 'Grains & Pasta', items: ['Rice', 'Pasta', 'Quinoa', 'Bread'] },
              ].map(cat => (
                <TouchableOpacity key={cat.label} style={st.browseCard}
                  onPress={() => { const q = cat.label.split(' ')[0]; setSearchQuery(q); searchQueryRef.current = q; doSearch(q); setFoodTab('search'); }}>
                  <Text style={st.browseEmoji}>{cat.emoji}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={st.browseName}>{cat.label}</Text>
                    <Text style={st.browseSub}>{cat.items.slice(0,3).join(', ')}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.ink3} />
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          {foodTab === 'restaurant' && (
            <View style={{ flex: 1 }}>
              <View style={{ paddingHorizontal: spacing.md, paddingVertical: spacing.sm }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.layer2, borderWidth: 1, borderColor: colors.line2, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm }}>
                  <Ionicons name="search-outline" size={16} color={colors.ink3} />
                  <TextInput style={{ flex: 1, color: colors.ink, fontSize: fontSize.base }} placeholder="Search chains or items…" placeholderTextColor={colors.ink3} value={restaurantQuery} onChangeText={q => { setRestaurantQuery(q); doRestaurantSearch(q); }} />
                </View>
              </View>
              <FlatList
                data={restaurantResults.length > 0 ? restaurantResults : (restaurantQuery.length === 0 ? searchLocalRestaurants('') : [])}
                keyExtractor={(_, i) => String(i)}
                contentContainerStyle={{ padding: spacing.md, gap: spacing.sm }}
                ListEmptyComponent={
                  <View style={{ alignItems: 'center', paddingTop: spacing.xl, gap: spacing.sm }}>
                    <Text style={{ fontSize: fontSize.xl }}>🍔</Text>
                    <Text style={{ color: colors.ink3, fontSize: fontSize.sm }}>No results found</Text>
                  </View>
                }
                renderItem={({ item }) => (
                  <TouchableOpacity style={st.foodResult} onPress={() => addRestaurantItem(item)}>
                    <Text style={{ fontSize: fontSize.md, marginRight: spacing.sm }}>{item.icon}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={st.foodResultName}>{item.name}</Text>
                      <Text style={st.foodResultBrand}>{item.brand}</Text>
                      <Text style={st.foodResultMeta}>{item.serving} · P{r2(item.protein)}g C{r2(item.carbs)}g F{r2(item.fat)}g</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: spacing.xs }}>
                      <Text style={st.foodResultKcal}>{item.kcal}</Text>
                      <Text style={st.foodResultKcalLbl}>kcal</Text>
                    </View>
                    <View style={[st.addFoodBtn, { backgroundColor: MEAL_ACCENT[searchMeal] + '22', borderColor: MEAL_ACCENT[searchMeal] + '66', marginLeft: spacing.sm }]}>
                      <Ionicons name="add" size={20} color={MEAL_ACCENT[searchMeal]} />
                    </View>
                  </TouchableOpacity>
                )}
              />
            </View>
          )}

          {foodTab === 'create' && (
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing.md, gap: spacing.sm }}>
              <Text style={{ color: colors.ink2, fontSize: 13, marginBottom: 8 }}>Create a custom food entry</Text>
              {[
                { key: 'name', label: 'Food name', keyboard: 'default' as const },
                { key: 'kcal', label: 'Calories (kcal) *', keyboard: 'numeric' as const },
                { key: 'protein', label: 'Protein (g)', keyboard: 'numeric' as const },
                { key: 'carbs', label: 'Carbs (g)', keyboard: 'numeric' as const },
                { key: 'fat', label: 'Fat (g)', keyboard: 'numeric' as const },
                { key: 'fiber', label: 'Fiber (g)', keyboard: 'numeric' as const },
                { key: 'sodium', label: 'Sodium (mg)', keyboard: 'numeric' as const },
              ].map(({ key, label, keyboard }) => (
                <View key={key}>
                  <Text style={{ color: colors.ink3, fontSize: 12, marginBottom: 4 }}>{label}</Text>
                  <TextInput
                    style={{ backgroundColor: colors.layer2, borderWidth: 1, borderColor: colors.line2, borderRadius: 12, padding: 12, color: colors.ink, fontSize: 15 }}
                    value={customFood[key as keyof typeof customFood]}
                    onChangeText={v => setCustomFood(p => ({ ...p, [key]: v }))}
                    keyboardType={keyboard}
                    placeholderTextColor={colors.ink3}
                    placeholder={key === 'name' ? 'e.g. Homemade Protein Bar' : '0'}
                  />
                </View>
              ))}
              <TouchableOpacity
                style={{ backgroundColor: colors.purple, borderRadius: 14, padding: 14, alignItems: 'center', marginTop: 8 }}
                onPress={async () => {
                  if (!customFood.name || !customFood.kcal) { Alert.alert('Required', 'Please enter a name and calories.'); return; }
                  const _kcal    = parseInt(customFood.kcal);
                  const _protein = parseFloat(customFood.protein) || 0;
                  const _carbs   = parseFloat(customFood.carbs) || 0;
                  const _fat     = parseFloat(customFood.fat) || 0;
                  const _fiber   = customFood.fiber   ? parseFloat(customFood.fiber)   : undefined;
                  const _sodium  = customFood.sodium  ? parseFloat(customFood.sodium)  : undefined;
                  if (isNaN(_kcal) || _kcal < 1 || _kcal > 9999)        { Alert.alert('Invalid calories', 'Calories must be between 1 and 9999 kcal.'); return; }
                  if (_protein < 0 || _protein > 500)                    { Alert.alert('Invalid protein', 'Protein must be between 0 and 500 g.'); return; }
                  if (_carbs < 0 || _carbs > 500)                        { Alert.alert('Invalid carbs', 'Carbs must be between 0 and 500 g.'); return; }
                  if (_fat < 0 || _fat > 300)                            { Alert.alert('Invalid fat', 'Fat must be between 0 and 300 g.'); return; }
                  if (_fiber  != null && (_fiber  < 0 || _fiber  > 100)) { Alert.alert('Invalid fiber', 'Fiber must be between 0 and 100 g.'); return; }
                  if (_sodium != null && (_sodium < 0 || _sodium > 10000)) { Alert.alert('Invalid sodium', 'Sodium must be between 0 and 10000 mg.'); return; }
                  const food: FoodItem = {
                    id: `${Date.now()}_${Math.random()}`,
                    icon: '🍽️',
                    name: customFood.name.slice(0, 100),
                    kcal: _kcal,
                    protein: _protein,
                    carbs: _carbs,
                    fat: _fat,
                    fiber: _fiber,
                    sodium: _sodium,
                    unit: '1 serving',
                    meal: searchMeal,
                  };
                  await addFood(selectedDate, food);
                  await addXp(10);
                  await checkAndUpdateStreak(selectedDate);
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setCustomFood({ name: '', kcal: '', protein: '', carbs: '', fat: '', fiber: '', sodium: '' });
                  setSearchVisible(false);
                }}>
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Add to {MEAL_LABEL[searchMeal]}</Text>
              </TouchableOpacity>
            </ScrollView>
          )}

          {foodTab === 'url' && (
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing.md, gap: spacing.md }}>
              <View style={{ gap: 8 }}>
                <Text style={{ color: colors.ink, fontSize: fontSize.base, fontWeight: '700' }}>Import from recipe URL</Text>
                <Text style={{ color: colors.ink3, fontSize: fontSize.xs, lineHeight: 18 }}>
                  Paste a recipe page URL (e.g. from AllRecipes, BBC Good Food, Yummly) and we'll extract the ingredients and estimate nutrition automatically.
                </Text>
              </View>
              <View style={{ gap: 8 }}>
                <Text style={{ color: colors.ink3, fontSize: 12, fontWeight: '700', letterSpacing: 1 }}>RECIPE URL</Text>
                <TextInput
                  style={{ backgroundColor: colors.layer2, borderWidth: 1, borderColor: colors.line2, borderRadius: 12, padding: 12, color: colors.ink, fontSize: 14 }}
                  placeholder="https://www.allrecipes.com/recipe/..."
                  placeholderTextColor={colors.ink3}
                  value={recipeUrl}
                  onChangeText={setRecipeUrl}
                  autoCapitalize="none"
                  keyboardType="url"
                  autoComplete="url"
                />
              </View>
              <TouchableOpacity
                style={{ backgroundColor: importingRecipe ? colors.layer2 : colors.purple, borderRadius: 14, padding: 14, alignItems: 'center', opacity: importingRecipe ? 0.7 : 1 }}
                onPress={handleImportRecipeUrl}
                disabled={importingRecipe}
              >
                {importingRecipe
                  ? <ActivityIndicator color={colors.white} />
                  : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Import recipe</Text>}
              </TouchableOpacity>
              <Text style={{ color: colors.ink3, fontSize: 11, textAlign: 'center', lineHeight: 16 }}>
                Requires a deployed Dagnara server with ANTHROPIC_API_KEY configured.
              </Text>
            </ScrollView>
          )}
        </SafeAreaView>
      </Modal>

      {/* Quick Add modal — cross-platform replacement for Alert.prompt */}
      <Modal visible={quickAddVisible} transparent animationType="fade" onRequestClose={() => setQuickAddVisible(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={{ flex: 1, backgroundColor: colors.dim, justifyContent: 'center', alignItems: 'center', padding: spacing.lg }}>
          <View style={{ backgroundColor: colors.layer1, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line2, padding: spacing.lg, width: '100%', gap: spacing.md }}>
            <Text style={{ fontSize: fontSize.md, fontWeight: '700', color: colors.ink }}>Quick Add</Text>
            <Text style={{ fontSize: fontSize.sm, color: colors.ink3 }}>Enter kcal amount</Text>
            <TextInput
              style={{ backgroundColor: colors.layer2, borderWidth: 1, borderColor: colors.line2, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, color: colors.ink, fontSize: fontSize.lg, fontWeight: '700', textAlign: 'center' }}
              value={quickAddInput}
              onChangeText={setQuickAddInput}
              keyboardType="numeric"
              autoFocus
              placeholder="0"
              placeholderTextColor={colors.ink3}
              returnKeyType="done"
              onSubmitEditing={() => {
                const kcal = parseInt(quickAddInput) || 0;
                if (kcal > 0) quickLog({ icon: '⚡', name: 'Quick entry', kcal, carbs: 0, protein: 0, fat: 0 });
                setQuickAddVisible(false);
              }}
            />
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <TouchableOpacity onPress={() => setQuickAddVisible(false)}
                style={{ flex: 1, paddingVertical: spacing.sm, alignItems: 'center', borderWidth: 1, borderColor: colors.line2, borderRadius: radius.md }}>
                <Text style={{ color: colors.ink2, fontWeight: '600', fontSize: fontSize.sm }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  const kcal = parseInt(quickAddInput) || 0;
                  if (kcal > 0) quickLog({ icon: '⚡', name: 'Quick entry', kcal, carbs: 0, protein: 0, fat: 0 });
                  setQuickAddVisible(false);
                }}
                style={{ flex: 2, borderRadius: radius.md, overflow: 'hidden' }}>
                <ExpoLinearGradient colors={[colors.purple, colors.purpleGlow]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={{ paddingVertical: spacing.sm, alignItems: 'center' }}>
                  <Text style={{ color: colors.ink, fontWeight: '700', fontSize: fontSize.sm }}>Add</Text>
                </ExpoLinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },

  // Header
  appHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  appTitle: { fontSize: fontSize.xl, fontWeight: '800', color: colors.ink, letterSpacing: -0.03 * 28 },
  upgradeBadge: { backgroundColor: 'rgba(124,77,255,0.18)', borderWidth: 1, borderColor: 'rgba(124,77,255,0.4)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  upgradeTxt: { fontSize: 9, fontWeight: '700', color: colors.lavender, letterSpacing: 0.8 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  // Action buttons
  actionBtnPrimary: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, backgroundColor: colors.layer2, borderWidth: 1, borderColor: colors.line2, borderRadius: radius.md, paddingVertical: spacing.md },
  actionBtnPrimaryIcon: { fontSize: fontSize.lg },
  actionBtnPrimaryLabel: { fontSize: fontSize.sm, fontWeight: '700', color: colors.ink },
  actionRow: { flexDirection: 'row', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: spacing.sm },
  actionBtn: { flex: 1, alignItems: 'center', gap: 4, backgroundColor: colors.layer2, borderWidth: 1, borderColor: colors.line2, borderRadius: radius.md, paddingVertical: spacing.sm },
  actionBtnIcon: { fontSize: fontSize.base },
  actionBtnLabel: { fontSize: fontSize.xs, fontWeight: '600', color: colors.ink2 },
  // Daily intake bar
  intakeBar: { paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.sm, gap: 5 },
  intakeBarRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  intakeBarLbl: { fontSize: fontSize.sm, color: colors.ink3 },
  intakeBarPct: { fontSize: fontSize.sm, fontWeight: '700' },
  intakeTrack: { height: 7, backgroundColor: colors.layer2, borderRadius: radius.pill, overflow: 'hidden', flexDirection: 'row' },
  intakeSeg: { height: '100%' },
  intakeMacroRow: { flexDirection: 'row', justifyContent: 'space-between' },
  intakeMacroLbl: { fontSize: fontSize.sm, fontWeight: '600', color: colors.ink3 },
  // Food tabs
  foodTabRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.line2, paddingHorizontal: spacing.xs },
  foodTabBtn: { paddingVertical: spacing.sm, paddingHorizontal: spacing.md, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: colors.bg },
  foodTabBtnActive: { borderBottomColor: colors.purple },
  foodTabTxt: { fontSize: fontSize.sm, fontWeight: '600', color: colors.ink3 },
  foodTabTxtActive: { color: colors.purple, fontWeight: '700' },
  // Browse cards
  browseCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.layer2, borderWidth: 1, borderColor: colors.line2, borderRadius: 14, padding: 14 },
  browseEmoji: { fontSize: 28 },
  browseName: { fontSize: 14, fontWeight: '600', color: colors.ink, marginBottom: 2 },
  browseSub: { fontSize: 11, color: colors.ink3 },
  iconBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  notifDot: { position: 'absolute', top: 8, right: 6, width: 6, height: 6, borderRadius: 3, backgroundColor: colors.rose },

  // XP / Achievement
  achieveBadge: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, backgroundColor: colors.layer2, borderRadius: radius.md, paddingHorizontal: spacing.sm, paddingVertical: 6, borderWidth: 1, borderColor: colors.line2 },
  xpBadge: { width: 32, height: 32, borderRadius: radius.md, backgroundColor: colors.purple, alignItems: 'center', justifyContent: 'center' },
  xpBadgeTxt: { fontSize: fontSize.sm, fontWeight: '800', color: colors.ink },
  xpMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 },
  xpName: { fontSize: 12, fontWeight: '600', color: colors.ink },
  xpPts: { fontSize: 11, color: colors.ink3 },
  xpTrack: { height: 4, backgroundColor: colors.layer2, borderRadius: 2, overflow: 'hidden' },
  xpFill: { height: 4, backgroundColor: colors.purple, borderRadius: 2 },

  // Streak risk
  streakRisk: { flexDirection: 'row', alignItems: 'center', gap: 12, margin: 8, marginHorizontal: 14, padding: 11, backgroundColor: 'rgba(244,63,94,0.1)', borderWidth: 1, borderColor: 'rgba(244,63,94,0.25)', borderRadius: radius.lg },
  srbTitle: { fontSize: 13, fontWeight: '700', color: 'rgba(244,63,94,0.9)', marginBottom: 2 },
  srbSub: { fontSize: 12, color: 'rgba(244,63,94,0.7)' },
  srbCta: { fontSize: 11, fontWeight: '700', color: 'rgba(244,63,94,0.85)' },

  // Date nav
  dateBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderBottomWidth: 1, borderBottomColor: colors.line },
  navBtn: { padding: spacing.sm },
  dateText: { color: colors.ink, fontSize: fontSize.base, fontWeight: '700' },

  scroll: { paddingTop: spacing.xs, gap: spacing.xs, paddingBottom: 24 },

  // Section header
  sectionHdr: { paddingHorizontal: spacing.md, paddingTop: 10, paddingBottom: 4, fontSize: 11, fontWeight: '700', letterSpacing: 0.12 * 11, textTransform: 'uppercase', color: colors.ink3 },

  // Calorie ring
  calCard: {
    marginHorizontal: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line2,
    shadowColor: colors.purple,
    shadowOpacity: 0.15,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  calSection: { alignItems: 'center', paddingVertical: spacing.sm },
  ringWrap: { position: 'relative', width: 190, height: 190, alignItems: 'center', justifyContent: 'center' },
  ringCenter: { position: 'absolute', alignItems: 'center' },
  ringNum: { fontSize: 32, fontWeight: '800', color: colors.ink },
  ringLbl: { fontSize: 12, color: colors.ink3 },
  calStatsRow: { flexDirection: 'row', gap: spacing.xl, marginTop: spacing.md },
  calStat: { alignItems: 'center', gap: 2 },
  calStatVal: { fontSize: fontSize.lg, fontWeight: '700' },
  calStatLbl: { fontSize: fontSize.xs, color: colors.ink3 },
  projRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.sm, paddingHorizontal: spacing.md },
  projTxt: { fontSize: fontSize.xs, color: colors.teal, fontWeight: '600' },
  insightCard: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginHorizontal: spacing.md, marginBottom: spacing.sm, backgroundColor: colors.layer1, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line2, padding: spacing.md },
  insightIcon: { fontSize: fontSize.md },
  insightText: { flex: 1, fontSize: fontSize.sm, color: colors.ink2, lineHeight: 20 },

  // Macro strip
  macroStrip: { flexDirection: 'row', gap: spacing.xs, paddingHorizontal: spacing.md },
  macroTile: { flex: 1, backgroundColor: colors.layer1, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, overflow: 'hidden', padding: spacing.sm, paddingTop: spacing.sm + 2, gap: 3 },
  macroTopBar: { position: 'absolute', top: 0, left: 0, right: 0, height: 2 },
  macroHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 },
  macroName: { fontSize: 11, fontWeight: '600', color: colors.ink3 },
  macroGoalLbl: { fontSize: 9, color: 'rgba(255,255,255,0.18)' },
  macroVal: { fontSize: 12, fontWeight: '700' },
  macroTrack: { height: 3, backgroundColor: colors.layer2, borderRadius: 2, overflow: 'hidden', marginTop: 4 },
  macroFill: { height: 3, borderRadius: 2 },

  // Scan
  scanRow: { flexDirection: 'row', gap: spacing.xs, alignItems: 'center', paddingHorizontal: spacing.md },
  scanPrimary: { flex: 1, backgroundColor: colors.purple, borderRadius: radius.md, paddingVertical: spacing.sm, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs },
  scanSecondary: { flex: 1, backgroundColor: colors.layer2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line2, paddingVertical: spacing.sm, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs },
  scanTxt: { color: colors.white, fontWeight: '600', fontSize: fontSize.sm },

  // Meal rows
  mealCard: { flexDirection: 'column', marginHorizontal: spacing.md, backgroundColor: colors.layer1, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line },
  mealHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.sm },
  mealFoods: { paddingHorizontal: spacing.sm, paddingBottom: spacing.sm, gap: spacing.xs },
  mealRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginHorizontal: spacing.md, padding: spacing.sm, backgroundColor: colors.layer1, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line },
  mealRowSkipped: { opacity: 0.45 },
  mealIconWrap: { width: 44, height: 44, borderRadius: radius.lg, backgroundColor: colors.layer2, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  mealEmoji: { fontSize: fontSize.lg },
  mealName: { fontSize: fontSize.base, fontWeight: '600', color: colors.ink },
  mealRec: { fontSize: fontSize.xs, color: colors.ink3, marginTop: 2 },
  mealItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 4 },
  mealItemTxt: { fontSize: 11, color: colors.ink2, flex: 1 },
  skipBtn: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radius.sm, backgroundColor: colors.layer2 },
  skipTxt: { fontSize: fontSize.xs, fontWeight: '600', color: colors.ink3 },
  skipTxtActive: { color: colors.rose },
  skippedBadge: { alignSelf: 'center', backgroundColor: colors.rose + '22', borderWidth: 1, borderColor: colors.rose + '55', borderRadius: radius.sm, paddingHorizontal: spacing.xs, paddingVertical: 2 },
  skippedBadgeTxt: { fontSize: fontSize.xs, fontWeight: '700', color: colors.rose, letterSpacing: 0.8 },
  skippedPill: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radius.pill, backgroundColor: colors.rose + '22', borderWidth: 1, borderColor: colors.rose + '55' },
  skippedPillTxt: { fontSize: fontSize.xs, fontWeight: '700', color: colors.rose, letterSpacing: 0.5 },
  mealAddBtn: { width: 30, height: 30, borderRadius: 15, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },

  // Win cards
  winCard: { marginHorizontal: spacing.md, padding: spacing.md, backgroundColor: colors.layer1, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line },
  winCardHdr: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  winCardTitle: { fontSize: fontSize.sm, fontWeight: '600', color: colors.ink },
  waterCard: { backgroundColor: colors.layer2, borderWidth: 1, borderColor: colors.line2, borderRadius: radius.md, padding: spacing.sm, marginBottom: spacing.sm },
  waterHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  waterCount: { fontSize: fontSize.xs, fontWeight: '700' },
  waterGlasses: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.xs },
  waterGlass: { flex: 1, borderRadius: radius.sm, backgroundColor: colors.line, borderWidth: 1, borderColor: colors.line2, alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.sm },
  waterGlassFull: { backgroundColor: colors.sky + '22', borderColor: colors.sky },
  wvfRow: { flexDirection: 'row', gap: spacing.sm },
  wvfBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.md, borderRadius: radius.md, backgroundColor: colors.layer2, borderWidth: 1, borderColor: colors.line2, gap: spacing.xs },
  wvfBtnWater: { backgroundColor: colors.sky + '18', borderColor: colors.sky + '66' },
  wvfBtnVeg:   { backgroundColor: colors.green + '18', borderColor: colors.green + '66' },
  wvfBtnFruit: { backgroundColor: colors.rose + '18', borderColor: colors.rose + '66' },
  wvfEmoji:  { fontSize: fontSize.xl },
  wvfLabel:  { fontSize: fontSize.xs, fontWeight: '700', color: colors.ink2, letterSpacing: 0.5 },
  wvfCheck:  { fontSize: fontSize.xs, fontWeight: '800', color: colors.ink3 },
  achieveBanner: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm, padding: spacing.sm, backgroundColor: colors.purpleTint, borderWidth: 1, borderColor: colors.line2, borderRadius: radius.md },
  achieveTitle: { fontSize: fontSize.sm, fontWeight: '700', color: colors.ink },
  achieveBody: { fontSize: fontSize.xs, color: colors.ink2, marginTop: 2 },

  // Micronutrients
  microRow: { paddingHorizontal: spacing.md, marginBottom: 12 },
  microHdr: { fontSize: 10, fontWeight: '700', color: colors.ink3, letterSpacing: 1, marginBottom: 8 },
  microChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  microChip: { backgroundColor: colors.layer2, borderWidth: 1, borderColor: colors.line2, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, alignItems: 'center', gap: 2 },
  microVal: { fontSize: 14, fontWeight: '700', color: colors.ink },
  microLbl: { fontSize: 10, color: colors.ink3 },
  macroNetCarbs: { fontSize: 10, color: colors.sky, fontWeight: '600', marginTop: 2 },
  microDv:  { fontSize: fontSize.xs, color: colors.purple, fontWeight: '600' },
  // Food grade badge
  gradeBadge: { width: 32, height: 32, borderRadius: 8, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  gradeText: { fontSize: 14, fontWeight: '800' },

  // Search modal
  searchModal: { flex: 1, backgroundColor: colors.bg },
  searchHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.line },
  searchTitle: { color: colors.ink, fontSize: fontSize.md, fontWeight: '700' },
  searchClose: { padding: spacing.sm, marginRight: -spacing.xs },
  searchInputRow: { flexDirection: 'row', alignItems: 'center', marginHorizontal: spacing.md, marginVertical: spacing.sm, backgroundColor: colors.layer2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line2, paddingHorizontal: spacing.md, gap: spacing.sm, height: 52 },
  searchInput: { flex: 1, color: colors.ink, fontSize: fontSize.md, paddingVertical: 0 },
  foodResult: { backgroundColor: colors.layer1, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, paddingVertical: spacing.md, paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 70 },
  foodResultName: { color: colors.ink, fontSize: fontSize.base, fontWeight: '600' },
  foodResultBrand: { color: colors.ink3, fontSize: fontSize.xs, marginTop: 1 },
  foodResultMeta: { color: colors.ink3, fontSize: fontSize.xs, marginTop: 2 },
  foodResultKcal: { color: colors.lavender, fontSize: fontSize.md, fontWeight: '800' },
  foodResultKcalLbl: { color: colors.ink3, fontSize: fontSize.xs },
  addFoodBtn: { width: 38, height: 38, borderRadius: radius.md, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
});

// ── Sleep modal styles ────────────────────────────────────────────────────────
const sl = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.md },
  backBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.layer2, borderWidth: 1, borderColor: colors.line2, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 17, fontWeight: '700', color: colors.ink },
  content: { padding: spacing.md, gap: spacing.md },
  durationDisplay: { alignItems: 'center', paddingVertical: spacing.lg },
  durNum: { fontSize: 38, fontWeight: '800', color: colors.ink },
  durLbl: { fontSize: 13, color: colors.ink3, marginTop: 4 },
  sectionLbl: { fontSize: 10, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase', color: colors.ink3 },
  timeRow: { flexDirection: 'row', gap: 12 },
  timeCard: { flex: 1, backgroundColor: colors.layer1, borderWidth: 1, borderColor: colors.line2, borderRadius: radius.md, padding: spacing.md, alignItems: 'center' },
  timeCardLbl: { fontSize: 12, color: colors.ink3, marginBottom: 8 },
  timeVal: { fontSize: 22, fontWeight: '700', color: colors.ink, textAlign: 'center' },
  qualityRow: { flexDirection: 'row', justifyContent: 'space-between' },
  qBtn: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.layer2, alignItems: 'center', justifyContent: 'center' },
  qBtnSel: { backgroundColor: colors.purple + '33', borderWidth: 2, borderColor: colors.purple },
  qEmoji: { fontSize: 26 },
  insight: { backgroundColor: colors.layer1, borderWidth: 1, borderColor: colors.line2, borderRadius: radius.md, padding: spacing.md },
  insightLbl: { fontSize: 11, fontWeight: '700', color: colors.purple2, marginBottom: 6 },
  insightTxt: { fontSize: 13, color: colors.ink2, lineHeight: 20 },
  saveBtn: { backgroundColor: colors.purple, borderRadius: radius.md, padding: spacing.md, alignItems: 'center' },
  saveTxt: { color: '#fff', fontWeight: '700', fontSize: 15 },
});

// ── Exercise modal styles ─────────────────────────────────────────────────────
const ex = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.md, paddingTop: spacing.sm },
  closeBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 17, fontWeight: '700', color: '#fff' },
  addTxt: { fontSize: 13, fontWeight: '600', color: colors.purple2 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 14, marginBottom: 12, backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.14)', borderRadius: 24, paddingHorizontal: 16, paddingVertical: 11 },
  searchInput: { flex: 1, color: '#fff', fontSize: 14, fontWeight: '300' },
  tabRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)', marginHorizontal: 14 },
  tabBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabBtnActive: { borderBottomColor: colors.purple2 },
  tabLbl: { fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.35)' },
  tabLblActive: { color: colors.lavender },
  sectionHdr: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8, fontSize: 11, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)' },
  healthCard: { flexDirection: 'row', alignItems: 'center', gap: 14, marginHorizontal: 14, marginBottom: 12, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.12)', borderRadius: 16, padding: 16 },
  healthIcon: { width: 52, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  healthName: { fontSize: 15, fontWeight: '600', color: '#fff', marginBottom: 3 },
  healthDesc: { fontSize: 12, color: 'rgba(255,255,255,0.4)', fontWeight: '300' },
  connectTxt: { fontSize: 12, fontWeight: '600', color: colors.purple2 },
  exRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  exName: { fontSize: 15, fontWeight: '500', color: '#fff' },
  exMeta: { fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 2 },
  calField: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingVertical: 20, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.09)' },
  calFieldLbl: { fontSize: 18, fontWeight: '500', color: '#fff' },
  calFieldInput: { fontSize: 18, color: '#fff', textAlign: 'right', width: '55%' },
  doneWrap: { paddingHorizontal: spacing.md, paddingBottom: spacing.lg, paddingTop: spacing.sm },
  doneBtn: { backgroundColor: colors.line, borderWidth: 1, borderColor: colors.line2, borderRadius: radius.md, padding: spacing.md, alignItems: 'center' },
  doneTxt: { fontSize: fontSize.sm, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', color: colors.ink },
  exRowSelected: { backgroundColor: colors.purpleTint },
  durPanel: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: colors.layer1, borderTopWidth: 1, borderTopColor: colors.line2,
    borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg,
    padding: spacing.lg, gap: spacing.md,
  },
  durTitle: { fontSize: fontSize.md, fontWeight: '700', color: colors.ink },
  durRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  durLbl: { fontSize: fontSize.sm, color: colors.ink2 },
  durInput: {
    backgroundColor: colors.layer2, borderWidth: 1, borderColor: colors.line2,
    borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
    color: colors.ink, fontSize: fontSize.md, fontWeight: '700', textAlign: 'center', width: 80,
  },
  durKcal: { fontSize: fontSize.sm, color: colors.purple, fontWeight: '600', textAlign: 'center' },
  durActions: { flexDirection: 'row', gap: spacing.sm },
  durCancelBtn: { flex: 1, paddingVertical: spacing.sm + 2, alignItems: 'center', borderWidth: 1, borderColor: colors.line2, borderRadius: radius.md },
  durCancelTxt: { fontSize: fontSize.sm, fontWeight: '600', color: colors.ink2 },
  durLogBtn: { flex: 2, paddingVertical: spacing.sm + 2, alignItems: 'center', backgroundColor: colors.purple, borderRadius: radius.md },
  durLogTxt: { fontSize: fontSize.sm, fontWeight: '700', color: colors.white, letterSpacing: 0.5 },
});
