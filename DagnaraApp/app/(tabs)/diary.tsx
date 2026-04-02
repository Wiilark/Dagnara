import { useEffect, useState, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, TextInput, Modal, FlatList,
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
import { useDiaryStore, FoodItem } from '../../src/store/diaryStore';
import { useAuthStore } from '../../src/store/authStore';
import { useAppStore, getXpLevel } from '../../src/store/appStore';
import { analyzeFood, importRecipe } from '../../src/lib/api';
import { searchLocalRestaurants, type RestaurantItem } from '../../src/lib/restaurants';
import { colors, spacing, fontSize, radius } from '../../src/theme';

const MEALS = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
type Meal = typeof MEALS[number];

const MEAL_ICONS: Record<string, string> = { breakfast: '🍳', lunch: '🥗', dinner: '🍝', snack: '🍌' };
const MEAL_ACCENT: Record<string, string> = { breakfast: colors.honey, lunch: colors.violet, dinner: colors.sky, snack: colors.rose };
const MEAL_LABEL: Record<string, string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack' };
const MEAL_SUGGESTED: Record<string, string> = { breakfast: '~550 kcal suggested', lunch: '~650 kcal suggested', dinner: '~750 kcal suggested', snack: '~150 kcal suggested' };

const CARBS_GOAL = 250; const PROTEIN_GOAL = 150; const FAT_GOAL = 65; const WATER_GOAL = 8;
const VEG_GOAL = 3; const FRUIT_GOAL = 3;

const RING_R = 76; const RING_SW = 12; const RING_CIRC = 2 * Math.PI * RING_R;

function dateStr(d: Date) { return d.toISOString().split('T')[0]; }
function addDays(date: string, days: number) { const d = new Date(date); d.setDate(d.getDate() + days); return dateStr(d); }
function clamp(v: number, lo: number, hi: number) { return Math.min(hi, Math.max(lo, v)); }

interface OFFProduct { product_name?: string; brands?: string; nutriments?: any; serving_size?: string; }

// ── Food Quality Grade (A–F, per 100g) ───────────────────────────────────────
// Inspired by Lifesum's food grading system
function gradeFood(n: any): { grade: string; color: string } {
  if (!n) return { grade: '?', color: colors.ink3 };
  let score = 50; // start neutral
  const kcal    = n['energy-kcal_100g'] ?? 0;
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

async function searchOpenFoodFacts(query: string): Promise<OFFProduct[]> {
  try {
    const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&json=1&fields=product_name,brands,nutriments,serving_size&page_size=20`;
    const res = await fetch(url);
    const json = await res.json();
    return (json.products ?? []).filter((p: OFFProduct) => p.product_name && p.nutriments?.['energy-kcal_100g'] != null);
  } catch { return []; }
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
      <SafeAreaView style={sl.safe}>
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
  { name: 'Weight Training', emoji: '🏋️', kcalPerMin: 6 },
  { name: 'Yoga', emoji: '🧘', kcalPerMin: 4 },
  { name: 'Walking', emoji: '🚶', kcalPerMin: 5 },
  { name: 'HIIT', emoji: '💪', kcalPerMin: 12 },
  { name: 'Dancing', emoji: '💃', kcalPerMin: 7 },
];

function ExerciseModal({ visible, onClose, onAddCalories }: { visible: boolean; onClose: () => void; onAddCalories: (kcal: number, name: string) => void }) {
  const [tab, setTab] = useState<'list' | 'calories'>('list');
  const [manualKcal, setManualKcal] = useState('');
  const [manualTitle, setManualTitle] = useState('');
  const [search, setSearch] = useState('');

  const filtered = EXERCISES.filter(e => e.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen">
      <SafeAreaView style={ex.safe}>
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
            {/* Health Connect section */}
            <Text style={ex.sectionHdr}>Automatic Tracking</Text>
            {[
              { icon: '❤️', name: 'Apple Health', desc: 'Connect to sync workouts automatically', color: '#ff2d55' },
              { icon: '💚', name: 'Google Fit / Health Connect', desc: 'Connect to sync workouts automatically', color: '#4285f4' },
            ].map((h) => (
              <TouchableOpacity key={h.name} style={ex.healthCard} onPress={() => Alert.alert('Coming soon', `${h.name} integration coming soon.`)}>
                <View style={[ex.healthIcon, { backgroundColor: h.color + '22' }]}><Text style={{ fontSize: 28 }}>{h.icon}</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={ex.healthName}>{h.name}</Text>
                  <Text style={ex.healthDesc}>{h.desc}</Text>
                </View>
                <Text style={ex.connectTxt}>Connect</Text>
              </TouchableOpacity>
            ))}
            <Text style={ex.sectionHdr}>All Exercises</Text>
            {filtered.map((e) => (
              <TouchableOpacity key={e.name} style={ex.exRow} onPress={() => { onAddCalories(e.kcalPerMin * 30, e.name); onClose(); }}>
                <Text style={{ fontSize: 26 }}>{e.emoji}</Text>
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
                if (!isNaN(k) && k > 0) { onAddCalories(k, manualTitle || 'Exercise'); onClose(); }
              }}>
                <Text style={ex.doneTxt}>ADD</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
        <View style={ex.doneWrap}>
          {tab === 'list' && (
            <TouchableOpacity style={ex.doneBtn} onPress={onClose}>
              <Text style={ex.doneTxt}>DONE</Text>
            </TouchableOpacity>
          )}
        </View>
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
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', gap: 0 }}>
        <TouchableOpacity style={{ position: 'absolute', top: 56, right: 24 }} onPress={onClose}>
          <Ionicons name="close" size={28} color={colors.ink3} />
        </TouchableOpacity>
        <Text style={{ fontSize: fontSize.md, fontWeight: '700', color: colors.ink, marginBottom: 40 }}>{exercise.icon} {exercise.name}</Text>
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
      <SafeAreaView style={sbst.safe}>
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
      <SafeAreaView style={moodst.safe}>
        <View style={moodst.header}>
          <TouchableOpacity onPress={onClose} style={moodst.backBtn}><Ionicons name="chevron-back" size={18} color={colors.ink2} /></TouchableOpacity>
          <Text style={moodst.title}>Log Mood</Text>
          <View style={{ width: 34 }} />
        </View>
        <ScrollView contentContainerStyle={{ padding: spacing.md, gap: spacing.md }}>
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

// ── Main Diary Screen ─────────────────────────────────────────────────────────
export default function DiaryScreen() {
  const { email } = useAuthStore();
  const { selectedDate, entries, setSelectedDate, loadEntry, addFood, removeFood, addWater, removeWater, updateCaloriesBurned, logSleep } = useDiaryStore();
  const { streak, xp, checkAndUpdateStreak, addXp, setMessagesOpen, calorieGoal: storeCalGoal } = useAppStore();
  const KCAL_GOAL = storeCalGoal || 2000;
  const xpInfo = getXpLevel(xp);

  const [analyzing, setAnalyzing] = useState(false);
  const [skippedMeals, setSkippedMeals] = useState<Record<string, boolean>>({});

  // Food search
  const [searchVisible, setSearchVisible] = useState(false);
  const [searchMeal, setSearchMeal] = useState<Meal>('breakfast');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<OFFProduct[]>([]);
  const [searching, setSearching] = useState(false);
  const [foodTab, setFoodTab] = useState<'search'|'recent'|'favorites'|'browse'|'create'|'restaurant'|'url'>('search');

  // Recipe URL import
  const [recipeUrl, setRecipeUrl] = useState('');
  const [importingRecipe, setImportingRecipe] = useState(false);

  // Restaurant search
  const [restaurantQuery, setRestaurantQuery] = useState('');
  const [restaurantResults, setRestaurantResults] = useState<RestaurantItem[]>([]);

  // Step tracking
  const [stepCount, setStepCount] = useState(0);
  const [pedometerAvailable, setPedometerAvailable] = useState(false);
  const STEP_GOAL = 8000;

  // Barcode scanner
  const [scanning, setScanning] = useState(false);
  const [barcodePermission, requestBarcodePermission] = useCameraPermissions();
  const [barcodeProduct, setBarcodeProduct] = useState<OFFProduct | null>(null);
  const [barcodeFetching, setBarcodeFetching] = useState(false);
  const scanLockRef = useRef(false);

  // Serving size modal
  const [servingModalVisible, setServingModalVisible] = useState(false);
  const [pendingProduct, setPendingProduct] = useState<OFFProduct | null>(null);
  const [servingQty, setServingQty] = useState('100');

  // Custom food
  const [customFood, setCustomFood] = useState({ name: '', kcal: '', protein: '', carbs: '', fat: '', fiber: '', sodium: '' });

  // Overlays
  const [sleepVisible, setSleepVisible]     = useState(false);
  const [exerciseVisible, setExerciseVisible] = useState(false);
  const [stressVisible, setStressVisible]   = useState(false);
  const [moodVisible, setMoodVisible]       = useState(false);

  // Favorites
  const [favorites, setFavorites] = useState<FoodItem[]>([]);

  // Produce
  const [veggies, setVeggies] = useState(0);
  const [fruits, setFruits] = useState(0);

  const entry = entries[selectedDate];
  const foods = entry?.foods ?? [];
  const water = entry?.water ?? 0;
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
  const remaining = Math.max(0, KCAL_GOAL - netKcal);
  const ringDash = clamp(netKcal / KCAL_GOAL, 0, 1) * RING_CIRC;
  const isToday = selectedDate === dateStr(new Date());
  const waterGoalMet = water >= WATER_GOAL;
  const vegGoalMet = veggies >= VEG_GOAL;
  const fruitGoalMet = fruits >= FRUIT_GOAL;

  // Streak risk: today, no food logged, hour >= 18
  const hourNow = new Date().getHours();
  const showStreakRisk = isToday && foods.length === 0 && streak > 0 && hourNow >= 18;

  useEffect(() => { loadEntry(selectedDate); }, [selectedDate]);

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

  async function handleStressSave(level: number) {
    await addXp(10);
    Alert.alert('Stress logged ✓', `${STRESS_EMOJIS[level - 1]} ${STRESS_LABELS[level - 1]}. +10 XP`);
  }

  async function handleMoodSave(mood: number, _notes: string) {
    await addXp(10);
    Alert.alert('Mood logged ✓', `${MOOD_EMOJIS[mood - 1]} ${MOOD_LABELS[mood - 1]}. +10 XP`);
  }

  // Step tracking — subscribe to pedometer for today
  useEffect(() => {
    let sub: any;
    (async () => {
      const available = await Pedometer.isAvailableAsync();
      setPedometerAvailable(available);
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
    if (!q.trim()) { setSearchResults([]); return; }
    setSearching(true);
    const results = await searchOpenFoodFacts(q);
    setSearchResults(results);
    setSearching(false);
  }

  function openFoodSearch(meal: Meal) { setSearchMeal(meal); setSearchQuery(''); setSearchResults([]); setSearchVisible(true); }

  function addFromSearch(product: OFFProduct) {
    setPendingProduct(product);
    setServingQty('100');
    setServingModalVisible(true);
  }

  async function confirmServing() {
    if (!pendingProduct) return;
    const qty = parseFloat(servingQty) || 100;
    const ratio = qty / 100;
    const n = pendingProduct.nutriments ?? {};
    const food: FoodItem = {
      id: `${Date.now()}_${Math.random()}`,
      icon: '🍽️',
      name: pendingProduct.product_name ?? 'Unknown',
      kcal: Math.round((n['energy-kcal_100g'] ?? 0) * ratio),
      carbs: Math.round((n['carbohydrates_100g'] ?? 0) * ratio),
      protein: Math.round((n['proteins_100g'] ?? 0) * ratio),
      fat: Math.round((n['fat_100g'] ?? 0) * ratio),
      fiber: Math.round((n['fiber_100g'] ?? 0) * ratio),
      sugar: Math.round((n['sugars_100g'] ?? 0) * ratio),
      sodium: Math.round((n['sodium_100g'] ?? 0) * 1000 * ratio),
      vitaminC: Math.round((n['vitamin-c_100g'] ?? 0) * ratio * 10) / 10,
      calcium: Math.round((n['calcium_100g'] ?? 0) * 1000 * ratio),
      iron: Math.round((n['iron_100g'] ?? 0) * 1000 * ratio * 10) / 10,
      potassium: Math.round((n['potassium_100g'] ?? 0) * 1000 * ratio),
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

  async function handleBarcodePress() {
    if (!barcodePermission?.granted) {
      const result = await requestBarcodePermission();
      if (!result.granted) { Alert.alert('Permission needed', 'Allow camera access for barcode scanning.'); return; }
    }
    setSearchVisible(false);
    setScanning(true);
  }

  async function handleImportRecipeUrl() {
    if (!recipeUrl.trim()) return;
    setImportingRecipe(true);
    try {
      const data = await importRecipe(recipeUrl.trim());
      const rawText = data?.content?.[0]?.text ?? '';
      let parsed: any = null;
      try { parsed = rawText ? JSON.parse(rawText) : null; } catch { parsed = null; }
      const items: any[] = parsed?.items ?? [];
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
      const rawText = (data?.content ?? []).find((c: any) => c?.type === 'text')?.text ?? '';
      let items: any[] = [];
      try { items = Array.isArray(JSON.parse(rawText)) ? JSON.parse(rawText) : []; } catch { items = []; }
      for (const item of items) {
        const food: FoodItem = { id: `${Date.now()}_${Math.random()}`, icon: item.icon ?? '🍽️', name: item.name ?? 'Unknown food', kcal: item.kcal ?? 0, carbs: item.carbs ?? 0, protein: item.protein ?? 0, fat: item.fat ?? 0, unit: item.unit ?? 'serving', meal: 'breakfast' };
        await addFood(selectedDate, food);
      }
      if (items.length === 0) Alert.alert('No food detected', 'Try a clearer photo.');
      else { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); await checkAndUpdateStreak(selectedDate); await addXp(items.length * 10); }
    } catch (err: any) {
      if (err?.message === 'SETUP_REQUIRED') {
        Alert.alert('Not set up', 'Food photo analysis requires a deployed server.\nSee EXPO_PUBLIC_API_URL in your .env file.');
      } else if (err?.message === 'NETWORK_ERROR') {
        Alert.alert('Connection failed', 'Could not reach the analysis server. Check your internet connection.');
      } else {
        Alert.alert('Could not analyse photo', 'Try a clearer photo or add food manually.');
      }
    }
    finally { setAnalyzing(false); }
  }

  async function handleCamera() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission needed', 'Allow camera access.'); return; }
    const result = await ImagePicker.launchCameraAsync({ base64: true, quality: 0.7 });
    if (result.canceled || !result.assets[0].base64) return;
    await processBase64Image(result.assets[0].base64);
  }

  async function handleGallery() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission needed', 'Allow photo access.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, base64: true, quality: 0.7 });
    if (result.canceled || !result.assets[0].base64) return;
    await processBase64Image(result.assets[0].base64);
  }

  async function handleWaterTap(idx: number) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const diff = idx + 1 - water;
    if (diff > 0) { for (let i = 0; i < diff; i++) await addWater(selectedDate); await addXp(5); }
    else { for (let i = 0; i < -diff + 1; i++) await removeWater(selectedDate); }
  }

  function toggleSkip(meal: string) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSkippedMeals(p => ({ ...p, [meal]: !p[meal] }));
  }

  async function quickLog(item: { icon: string; name: string; kcal: number; carbs: number; protein: number; fat: number }) {
    const meal: Meal = new Date().getHours() < 11 ? 'breakfast' : new Date().getHours() < 15 ? 'lunch' : 'dinner';
    const food: FoodItem = { id: `${Date.now()}`, icon: item.icon, name: item.name, kcal: item.kcal, carbs: item.carbs, protein: item.protein, fat: item.fat, unit: 'serving', meal };
    await addFood(selectedDate, food);
    await addXp(10);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await checkAndUpdateStreak(selectedDate);
  }

  async function repeatYesterday() {
    const d = new Date(); d.setDate(d.getDate() - 1);
    const yesterday = d.toISOString().split('T')[0];
    const yFoods = entries[yesterday]?.foods ?? [];
    if (yFoods.length === 0) { Alert.alert('Nothing to repeat', 'No foods logged yesterday.'); return; }
    for (const f of yFoods) { await addFood(selectedDate, { ...f, id: `${Date.now()}_${Math.random()}` }); }
    await addXp(yFoods.length * 5);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await checkAndUpdateStreak(selectedDate);
  }

  async function handleAddCalories(kcal: number, name: string) {
    const current = entries[selectedDate]?.calories_burned ?? 0;
    await updateCaloriesBurned(selectedDate, current + kcal);
    await addXp(20);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert(`${name}: ${kcal} kcal burned ✓`, 'Exercise logged! +20 XP');
  }

  async function handleSleepSave(data: SleepSaveData) {
    await logSleep(selectedDate, data);
    await addXp(20);
    Alert.alert('Sleep logged ✓', `${data.duration} saved. +20 XP`);
  }

  return (
    <SafeAreaView style={st.safe} edges={['top']}>

      {/* ── App Header ── */}
      <View style={st.appHeader}>
        <View style={st.logoRow}>
          <DagnaraLogo size={24} color={colors.lavender} />
          <Text style={st.appTitle}>Diary</Text>
          <View style={st.upgradeBadge}>
            <Text style={st.upgradeTxt}>UPGRADE</Text>
          </View>
        </View>
        <View style={st.headerRight}>
          <TouchableOpacity style={st.iconBtn} onPress={() => setMessagesOpen(true)}>
            <Ionicons name="notifications-outline" size={22} color={colors.ink2} />
            <View style={st.notifDot} />
          </TouchableOpacity>
          <TouchableOpacity style={st.iconBtn} onPress={() => router.push('/(tabs)/profile')}>
            <Ionicons name="person-outline" size={22} color={colors.ink2} />
          </TouchableOpacity>
        </View>
      </View>

      {/* ── XP Bar ── */}
      <View style={st.xpWrap}>
        <View style={st.xpBadge}>
          <Text style={st.xpBadgeTxt}>{xpInfo.level}</Text>
        </View>
        <View style={st.xpInner}>
          <View style={st.xpMeta}>
            <Text style={st.xpName}>{xpInfo.name}</Text>
            <Text style={st.xpPts}>{xp} / {xpInfo.nextMin} XP</Text>
          </View>
          <View style={st.xpTrack}>
            <View style={[st.xpFill, { width: `${xpInfo.progress * 100}%` as any }]} />
          </View>
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

        {/* ── Daily Mission Card ── */}
        {isToday && (
          <View style={st.missionCard}>
            <Text style={st.missionCardTitle}>TODAY'S MISSIONS</Text>
            {[
              { emoji: '🍽️', label: 'Log all meals', progress: Math.min(3, new Set(foods.map(f => f.meal)).size), goal: 3, unit: '/ 3 meals' },
              { emoji: '💧', label: 'Drink 8 glasses', progress: water, goal: WATER_GOAL, unit: `/ ${WATER_GOAL} glasses` },
              { emoji: '🏃', label: 'Burn 300 kcal', progress: Math.min(300, caloriesBurned), goal: 300, unit: '/ 300 kcal' },
            ].map((m) => {
              const done = m.progress >= m.goal;
              return (
                <View key={m.label} style={st.missionRow}>
                  <View style={[st.missionCheck, done && st.missionCheckDone]}>
                    {done && <Ionicons name="checkmark" size={12} color="#fff" />}
                  </View>
                  <Text style={st.missionEmoji}>{m.emoji}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[st.missionLabel, done && st.missionLabelDone]}>{m.label}</Text>
                    <View style={st.missionTrack}>
                      <View style={[st.missionBar, { width: `${Math.min(100, (m.progress / m.goal) * 100)}%` as any, backgroundColor: done ? colors.green : colors.lavender }]} />
                    </View>
                  </View>
                  <Text style={[st.missionUnit, done && { color: colors.green }]}>{done ? '✓' : `${m.progress} ${m.unit}`}</Text>
                </View>
              );
            })}
          </View>
        )}

        {/* ── Quick Log Strip ── */}
        {isToday && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.quickStrip}>
            <TouchableOpacity style={st.quickChip} onPress={repeatYesterday} activeOpacity={0.75}>
              <Text style={st.quickChipIcon}>🔁</Text>
              <Text style={st.quickChipLabel}>Repeat yesterday</Text>
            </TouchableOpacity>
            {[
              { icon: '☕', name: 'Coffee', kcal: 5,  carbs: 0, protein: 0, fat: 0 },
              { icon: '🥚', name: 'Egg',    kcal: 78, carbs: 0, protein: 6, fat: 5 },
              { icon: '🍌', name: 'Banana', kcal: 89, carbs: 23,protein: 1, fat: 0 },
              { icon: '🍎', name: 'Apple',  kcal: 52, carbs: 14,protein: 0, fat: 0 },
              { icon: '🥛', name: 'Milk',   kcal: 61, carbs: 5, protein: 3, fat: 3 },
              { icon: '🍞', name: 'Toast',  kcal: 79, carbs: 15,protein: 3, fat: 1 },
              { icon: '🥑', name: 'Avocado',kcal: 80, carbs: 4, protein: 1, fat: 7 },
            ].map(item => (
              <TouchableOpacity key={item.name} style={st.quickChip} onPress={() => quickLog(item)} activeOpacity={0.75}>
                <Text style={st.quickChipIcon}>{item.icon}</Text>
                <Text style={st.quickChipLabel}>{item.name}</Text>
                <Text style={st.quickChipKcal}>{item.kcal} kcal</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* ── Calorie Ring ── */}
        <ExpoLinearGradient
          colors={['rgba(124,77,255,0.14)', 'rgba(34,197,94,0.06)', 'transparent']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={st.calCard}
        >
        <View style={st.calSection}>
          <View style={st.ringWrap}>
            <Svg width={190} height={190} viewBox="0 0 220 220">
              <Defs>
                <LinearGradient id="rg" x1="0%" y1="0%" x2="100%" y2="0%">
                  <Stop offset="0%" stopColor="#7c4dff" /><Stop offset="100%" stopColor="#22c55e" />
                </LinearGradient>
              </Defs>
              <Circle cx={110} cy={110} r={90} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={14} />
              <G rotation="-90" origin="110, 110">
                <Circle cx={110} cy={110} r={90} fill="none" stroke="url(#rg)" strokeWidth={14} strokeLinecap="round"
                  strokeDasharray={`${clamp(netKcal / KCAL_GOAL, 0, 1) * 2 * Math.PI * 90} ${2 * Math.PI * 90}`} />
              </G>
            </Svg>
            <View style={st.ringCenter}>
              <Text style={st.ringNum}>{remaining}</Text>
              <Text style={st.ringLbl}>kcal left</Text>
            </View>
          </View>
          <View style={st.calStatsRow}>
            {[{ val: totalKcal, lbl: 'Eaten', color: colors.lavender }, { val: caloriesBurned, lbl: 'Burned', color: colors.honey }, { val: netKcal, lbl: 'Net', color: colors.green }].map(({ val, lbl, color }) => (
              <View key={lbl} style={st.calStat}>
                <Text style={[st.calStatVal, { color }]}>{val}</Text>
                <Text style={st.calStatLbl}>{lbl}</Text>
              </View>
            ))}
          </View>
        </View>
        </ExpoLinearGradient>

        {/* ── Macro Strip ── */}
        <View style={st.macroStrip}>
          {[
            { label: 'Carbs', val: totalCarbs, goal: CARBS_GOAL, color: colors.sky, gc: ['#38bdf8', '#0ea5e9'] as [string,string], sub: totalFiber > 0 ? `Net: ${netCarbs}g` : null },
            { label: 'Protein', val: totalProtein, goal: PROTEIN_GOAL, color: colors.rose, gc: ['#f43f5e', '#e11d48'] as [string,string], sub: null },
            { label: 'Fat', val: totalFat, goal: FAT_GOAL, color: colors.violet, gc: ['#a855f7', '#7c3aed'] as [string,string], sub: null },
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
              {totalFiber > 0 && <View style={st.microChip}><Text style={st.microVal}>{Math.round(totalFiber)}g</Text><Text style={st.microLbl}>Fiber</Text></View>}
              {totalSugar > 0 && <View style={st.microChip}><Text style={[st.microVal, totalSugar > 50 && { color: colors.rose }]}>{Math.round(totalSugar)}g</Text><Text style={st.microLbl}>Sugar</Text></View>}
              {totalSodium > 0 && <View style={st.microChip}><Text style={[st.microVal, totalSodium > 2300 && { color: colors.rose }]}>{Math.round(totalSodium)}mg</Text><Text style={st.microLbl}>Sodium</Text></View>}
              {totalVitaminC > 0 && <View style={st.microChip}><Text style={st.microVal}>{totalVitaminC.toFixed(1)}mg</Text><Text style={st.microLbl}>Vit C</Text></View>}
              {totalCalcium > 0 && <View style={st.microChip}><Text style={st.microVal}>{Math.round(totalCalcium)}mg</Text><Text style={st.microLbl}>Calcium</Text></View>}
              {totalIron > 0 && <View style={st.microChip}><Text style={st.microVal}>{totalIron.toFixed(1)}mg</Text><Text style={st.microLbl}>Iron</Text></View>}
              {totalPotassium > 0 && <View style={st.microChip}><Text style={st.microVal}>{Math.round(totalPotassium)}mg</Text><Text style={st.microLbl}>Potassium</Text></View>}
            </View>
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
            <TouchableOpacity key={meal} style={[st.mealRow, skipped && st.mealRowSkipped]} onPress={() => openFoodSearch(meal)} activeOpacity={0.75}>
              <View style={st.mealIconWrap}><Text style={st.mealEmoji}>{MEAL_ICONS[meal]}</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={st.mealName}>{MEAL_LABEL[meal]}</Text>
                {mealKcal > 0
                  ? <Text style={[st.mealRec, { color: accent }]}>{mealKcal} kcal logged</Text>
                  : <Text style={st.mealRec}>{MEAL_SUGGESTED[meal]}</Text>
                }
                {mealFoods.length > 0 && (
                  <View style={{ marginTop: 4, gap: 2 }}>
                    {mealFoods.map(f => (
                      <View key={f.id} style={st.mealItem}>
                        <Text style={st.mealItemTxt}>{f.icon} {f.name}</Text>
                        <TouchableOpacity onPress={() => { removeFood(selectedDate, f.id); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                          <Ionicons name="close-circle" size={14} color={colors.rose + 'aa'} />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                )}
              </View>
              <TouchableOpacity style={st.skipBtn} onPress={async () => {
                const d = new Date(); d.setDate(d.getDate() - 1);
                const yesterday = d.toISOString().split('T')[0];
                const yFoods = (entries[yesterday]?.foods ?? []).filter(f => f.meal === meal);
                if (yFoods.length === 0) { Alert.alert('Nothing to copy', `No ${MEAL_LABEL[meal]} logged yesterday.`); return; }
                for (const f of yFoods) await addFood(selectedDate, { ...f, id: `${Date.now()}_${Math.random()}` });
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                await checkAndUpdateStreak(selectedDate);
              }}>
                <Text style={[st.skipTxt]}>Copy</Text>
              </TouchableOpacity>
              <TouchableOpacity style={st.skipBtn} onPress={() => toggleSkip(meal)}>
                <Text style={[st.skipTxt, skipped && st.skipTxtActive]}>{skipped ? 'Skipped' : 'Skip'}</Text>
              </TouchableOpacity>
              <View style={[st.mealAddBtn, { borderColor: accent + '55' }]}>
                <Text style={[{ fontSize: 20, color: accent, lineHeight: 22 }]}>+</Text>
              </View>
            </TouchableOpacity>
          );
        })}

        {/* ── Activity ── */}
        <Text style={st.sectionHdr}>Activity</Text>
        <TouchableOpacity style={[st.mealRow, { borderColor: colors.honey + '44' }]} onPress={() => setExerciseVisible(true)} activeOpacity={0.75}>
          <View style={[st.mealIconWrap, { backgroundColor: colors.honey + '22' }]}><Text style={st.mealEmoji}>🔥</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={[st.mealName, { color: colors.honey }]}>Calories burned</Text>
            <Text style={[st.mealRec, { color: colors.honey, fontWeight: '600' }]}>{caloriesBurned} kcal</Text>
          </View>
          <View style={[st.mealAddBtn, { borderColor: colors.honey + '55' }]}>
            <Text style={[{ fontSize: 20, color: colors.honey, lineHeight: 22 }]}>+</Text>
          </View>
        </TouchableOpacity>

        {/* Sleep log row */}
        <TouchableOpacity style={[st.mealRow, { borderColor: colors.sky + '44' }]} onPress={() => setSleepVisible(true)} activeOpacity={0.75}>
          <View style={[st.mealIconWrap, { backgroundColor: colors.sky + '22' }]}><Text style={st.mealEmoji}>😴</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={[st.mealName, { color: colors.sky }]}>Log Sleep</Text>
            <Text style={st.mealRec}>Track your bedtime & quality</Text>
          </View>
          <View style={[st.mealAddBtn, { borderColor: colors.sky + '55' }]}>
            <Text style={[{ fontSize: 20, color: colors.sky, lineHeight: 22 }]}>+</Text>
          </View>
        </TouchableOpacity>

        {/* Stress & Breathing */}
        <TouchableOpacity style={[st.mealRow, { borderColor: colors.teal + '44' }]} onPress={() => setStressVisible(true)} activeOpacity={0.75}>
          <View style={[st.mealIconWrap, { backgroundColor: colors.teal + '22' }]}><Text style={st.mealEmoji}>🧘</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={[st.mealName, { color: colors.teal }]}>Stress & Breathing</Text>
            <Text style={st.mealRec}>Log stress · Breathing exercises</Text>
          </View>
          <View style={[st.mealAddBtn, { borderColor: colors.teal + '55' }]}>
            <Text style={[{ fontSize: 20, color: colors.teal, lineHeight: 22 }]}>+</Text>
          </View>
        </TouchableOpacity>

        {/* Mood */}
        <TouchableOpacity style={[st.mealRow, { borderColor: colors.honey + '44' }]} onPress={() => setMoodVisible(true)} activeOpacity={0.75}>
          <View style={[st.mealIconWrap, { backgroundColor: colors.honey + '22' }]}><Text style={st.mealEmoji}>😊</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={[st.mealName, { color: colors.honey }]}>Mood</Text>
            <Text style={st.mealRec}>How are you feeling today?</Text>
          </View>
          <View style={[st.mealAddBtn, { borderColor: colors.honey + '55' }]}>
            <Text style={[{ fontSize: 20, color: colors.honey, lineHeight: 22 }]}>+</Text>
          </View>
        </TouchableOpacity>

        {/* ── Daily wins ── */}
        <Text style={st.sectionHdr}>Daily wins</Text>

        {/* Steps */}
        <View style={[st.winCard, stepCount >= STEP_GOAL && { borderColor: colors.honey + '44' }]}>
          <View style={st.winCardHdr}>
            <Text style={st.winCardTitle}>Steps</Text>
            <Text style={{ fontSize: 13, fontWeight: '700', color: stepCount >= STEP_GOAL ? colors.green : colors.honey }}>
              {stepCount.toLocaleString()} / {STEP_GOAL.toLocaleString()}
            </Text>
          </View>
          <View style={{ height: 6, backgroundColor: colors.layer2, borderRadius: 3, marginBottom: 12, overflow: 'hidden' }}>
            <View style={{ height: '100%', backgroundColor: colors.honey, borderRadius: 3, width: `${Math.min(100, (stepCount / STEP_GOAL) * 100)}%` as any }} />
          </View>
          {!pedometerAvailable && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {[1000, 2000, 5000, 8000, 10000].map(n => (
                <TouchableOpacity key={n}
                  style={{ backgroundColor: colors.honey + '22', borderWidth: 1, borderColor: colors.honey + '44', borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 6 }}
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setStepCount(c => c + n); }}>
                  <Text style={{ color: colors.honey, fontSize: 12, fontWeight: '700' }}>+{n >= 1000 ? `${n / 1000}k` : n}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          {stepCount >= STEP_GOAL && (
            <View style={[st.achieveBanner, { marginTop: 8 }]}>
              <Text style={{ fontSize: 22 }}>🏆</Text>
              <Text style={st.achieveTitle}>Step goal reached!</Text>
            </View>
          )}
        </View>

        {/* Water */}
        <View style={[st.winCard, waterGoalMet && { borderColor: colors.sky + '44' }]}>
          <View style={st.winCardHdr}>
            <Text style={st.winCardTitle}>Water <Text style={st.winCardSub}>({(water * 0.25).toFixed(2)} L)</Text></Text>
          </View>
          <View style={st.glassRow}>
            <TouchableOpacity style={st.glassAdd} onPress={() => handleWaterTap(water)}>
              <Text style={{ color: colors.sky, fontSize: 18 }}>+</Text>
            </TouchableOpacity>
            {Array.from({ length: WATER_GOAL }).map((_, i) => (
              <TouchableOpacity key={i} onPress={() => handleWaterTap(i)} style={[st.glass, i < water && st.glassFilled]} activeOpacity={0.7}>
                <Text style={[st.glassEmoji, i >= water && { opacity: 0.22 }]}>💧</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={st.waterProgress}>
            <View style={[st.waterBar, { width: `${(water / WATER_GOAL) * 100}%` as any }]} />
          </View>
          {waterGoalMet && (
            <View style={st.achieveBanner}>
              <Text style={{ fontSize: 22 }}>🏆</Text>
              <View style={{ flex: 1 }}>
                <Text style={st.achieveTitle}>Job well done</Text>
                <Text style={st.achieveBody}>You've reached your water goal. Keep drinking if you're active!</Text>
              </View>
            </View>
          )}
        </View>

        {/* Produce */}
        <View style={st.winCard}>
          <Text style={st.winCardTitle}>Produce</Text>
          <View style={st.produceRow}>
            <Text style={st.produceLbl}>VEG</Text>
            <View style={st.emojiRow}>
              {['🥦', '🥕', '🫑'].map((em, i) => (
                <TouchableOpacity key={i} style={[st.produceDot, i < veggies && { backgroundColor: colors.green + '22' }]}
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setVeggies(v => v === i + 1 ? i : i + 1); }}>
                  <Text style={[st.produceEmoji, i >= veggies && { opacity: 0.22 }]}>{em}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          <View style={[st.produceRow, { marginBottom: 0 }]}>
            <Text style={st.produceLbl}>FRUIT</Text>
            <View style={st.emojiRow}>
              {['🍎', '🍊', '🫐'].map((em, i) => (
                <TouchableOpacity key={i} style={[st.produceDot, i < fruits && { backgroundColor: colors.rose + '22' }]}
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setFruits(v => v === i + 1 ? i : i + 1); }}>
                  <Text style={[st.produceEmoji, i >= fruits && { opacity: 0.22 }]}>{em}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          {vegGoalMet && (
            <View style={[st.achieveBanner, { marginTop: 12 }]}>
              <Text style={{ fontSize: 22 }}>🥦</Text>
              <Text style={st.achieveTitle}>Veg goal hit!</Text>
            </View>
          )}
          {fruitGoalMet && (
            <View style={[st.achieveBanner, { marginTop: 8 }]}>
              <Text style={{ fontSize: 22 }}>🍎</Text>
              <Text style={st.achieveTitle}>Fruit goal hit!</Text>
            </View>
          )}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* ── Modals ── */}
      <SleepModal visible={sleepVisible} onClose={() => setSleepVisible(false)} onSave={handleSleepSave} />
      <ExerciseModal visible={exerciseVisible} onClose={() => setExerciseVisible(false)} onAddCalories={handleAddCalories} />
      <StressBreathingModal visible={stressVisible} onClose={() => setStressVisible(false)} onSave={handleStressSave} />
      <MoodModal visible={moodVisible} onClose={() => setMoodVisible(false)} onSave={handleMoodSave} />

      {/* Barcode fetching overlay */}
      <Modal visible={barcodeFetching} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' }}>
          <View style={{ backgroundColor: '#1a1a1a', borderRadius: 16, padding: 32, alignItems: 'center', gap: 16 }}>
            <ActivityIndicator size="large" color={colors.lavender} />
            <Text style={{ color: '#fff', fontSize: 15 }}>Looking up product…</Text>
          </View>
        </View>
      </Modal>

      {/* Barcode Scanner Modal */}
      <Modal visible={scanning} animationType="slide" presentationStyle="fullScreen">
        <View style={{ flex: 1, backgroundColor: '#000' }}>
          <SafeAreaView style={{ flex: 1 }}>
            <View style={{ padding: 16, flexDirection: 'row', alignItems: 'center' }}>
              <TouchableOpacity onPress={() => { setScanning(false); scanLockRef.current = false; setSearchVisible(true); }} style={{ padding: 8 }}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
              <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700', marginLeft: 8 }}>Scan Barcode</Text>
            </View>
            <CameraView
              style={{ flex: 1 }}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'qr'] }}
              onBarcodeScanned={scanning ? async ({ data }) => {
                if (scanLockRef.current) return;
                scanLockRef.current = true;
                setScanning(false);
                setBarcodeFetching(true);
                try {
                  const res = await fetch(`https://world.openfoodfacts.org/api/v0/product/${data}.json`);
                  const json = await res.json();
                  if (json.status === 1 && json.product) {
                    setBarcodeProduct(json.product as OFFProduct);
                    setPendingProduct(json.product as OFFProduct);
                    setServingQty('100');
                    setServingModalVisible(true);
                  } else {
                    Alert.alert('Not found', 'This barcode is not in our database. Try searching manually.');
                    setSearchVisible(true);
                  }
                } catch {
                  Alert.alert('Error', 'Could not fetch barcode data.');
                  setSearchVisible(true);
                } finally {
                  setBarcodeFetching(false);
                  scanLockRef.current = false;
                }
              } : undefined}
            >
              {/* Aiming overlay */}
              <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                <View style={{ width: 260, height: 160, position: 'relative' }}>
                  {/* Corner brackets */}
                  {[
                    { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3 },
                    { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3 },
                    { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3 },
                    { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3 },
                  ].map((style, i) => (
                    <View key={i} style={[{ position: 'absolute', width: 24, height: 24, borderColor: '#fff' }, style]} />
                  ))}
                  {/* Center scan line */}
                  <View style={{ position: 'absolute', top: '50%', left: 8, right: 8, height: 1, backgroundColor: 'rgba(255,80,80,0.7)' }} />
                </View>
              </View>
            </CameraView>
            <View style={{ padding: 24, alignItems: 'center' }}>
              <Text style={{ color: 'rgba(255,255,255,0.6)', textAlign: 'center' }}>Point your camera at a barcode</Text>
            </View>
          </SafeAreaView>
        </View>
      </Modal>

      {/* Serving Size Modal */}
      <Modal visible={servingModalVisible} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
          <View style={{ padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
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
            const n = pendingProduct.nutriments ?? {};
            const kcal = Math.round((n['energy-kcal_100g'] ?? 0) * ratio);
            const prot = Math.round((n['proteins_100g'] ?? 0) * ratio);
            const carb = Math.round((n['carbohydrates_100g'] ?? 0) * ratio);
            const fat  = Math.round((n['fat_100g'] ?? 0) * ratio);
            return (
              <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
                <Text style={{ color: colors.ink, fontSize: 20, fontWeight: '700' }}>{pendingProduct.product_name}</Text>
                {pendingProduct.brands && <Text style={{ color: colors.ink3, fontSize: 13 }}>{pendingProduct.brands}</Text>}
                <View style={{ backgroundColor: colors.layer2, borderRadius: 16, borderWidth: 1, borderColor: colors.line2, padding: 16, gap: 12 }}>
                  <Text style={{ color: colors.ink3, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, fontWeight: '700' }}>Serving Size (grams)</Text>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {['50', '100', '150', '200', '250'].map(g => (
                      <TouchableOpacity key={g} onPress={() => setServingQty(g)}
                        style={{ flex: 1, paddingVertical: 8, borderRadius: 10, borderWidth: 1.5, alignItems: 'center',
                          borderColor: servingQty === g ? colors.lavender : colors.line2,
                          backgroundColor: servingQty === g ? colors.purple + '22' : colors.layer3 }}>
                        <Text style={{ color: servingQty === g ? colors.lavender : colors.ink3, fontSize: 12, fontWeight: '600' }}>{g}g</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <TextInput
                      style={{ flex: 1, backgroundColor: colors.layer3, borderRadius: 12, borderWidth: 1, borderColor: colors.line2, padding: 12, color: colors.ink, fontSize: 16, textAlign: 'center' }}
                      value={servingQty}
                      onChangeText={setServingQty}
                      keyboardType="decimal-pad"
                      placeholder="Custom grams"
                      placeholderTextColor={colors.ink3}
                    />
                    <Text style={{ color: colors.ink3 }}>g</Text>
                  </View>
                </View>
                <View style={{ backgroundColor: colors.layer2, borderRadius: 16, borderWidth: 1, borderColor: colors.line2, padding: 16 }}>
                  <Text style={{ color: colors.ink3, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, fontWeight: '700', marginBottom: 12 }}>Nutrition for {qty}g</Text>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
                    {[{ val: kcal, lbl: 'kcal', color: colors.lavender }, { val: prot, lbl: 'protein', color: colors.rose }, { val: carb, lbl: 'carbs', color: colors.sky }, { val: fat, lbl: 'fat', color: colors.violet }].map(({ val, lbl, color }) => (
                      <View key={lbl} style={{ alignItems: 'center', gap: 2 }}>
                        <Text style={{ color, fontSize: 22, fontWeight: '800' }}>{val}</Text>
                        <Text style={{ color: colors.ink3, fontSize: 11 }}>{lbl}</Text>
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
        <SafeAreaView style={st.searchModal}>
          <View style={st.searchHeader}>
            <Text style={st.searchTitle}>Add to {MEAL_LABEL[searchMeal]}</Text>
            <TouchableOpacity onPress={() => setSearchVisible(false)} style={st.searchClose}>
              <Ionicons name="close" size={22} color={colors.ink2} />
            </TouchableOpacity>
          </View>

          {/* Search input */}
          <View style={st.searchInputRow}>
            <Ionicons name="search-outline" size={16} color={colors.ink3} />
            <TextInput
              style={st.searchInput}
              placeholder="Search food, meal or brand..."
              placeholderTextColor={colors.ink3}
              value={searchQuery}
              onChangeText={(t) => { setSearchQuery(t); doSearch(t); setFoodTab('search'); }}
              returnKeyType="search"
              onSubmitEditing={() => doSearch(searchQuery)}
            />
            {searching && <ActivityIndicator size="small" color={colors.lavender} />}
          </View>

          {/* Action pills */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.actionPills}>
            {[
              { icon: '📷', label: 'Photo', onPress: () => { setSearchVisible(false); handleCamera(); } },
              { icon: '🔁', label: 'Repeat', onPress: () => { setSearchVisible(false); repeatYesterday(); } },
              { icon: '⚡', label: 'Quick Add', onPress: () => {
                Alert.prompt?.('Quick Add', 'Enter kcal amount', (v) => {
                  if (v) quickLog({ icon: '⚡', name: 'Quick entry', kcal: parseInt(v) || 0, carbs: 0, protein: 0, fat: 0 });
                }, 'plain-text', '', 'numeric');
              }},
              { icon: '🖼️', label: 'Gallery', onPress: () => { setSearchVisible(false); handleGallery(); } },
              { icon: '📦', label: 'Barcode', onPress: handleBarcodePress },
            ].map(p => (
              <TouchableOpacity key={p.label} style={st.actionPill} onPress={p.onPress} activeOpacity={0.75}>
                <Text style={st.actionPillIcon}>{p.icon}</Text>
                <Text style={st.actionPillLabel}>{p.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Daily intake bar */}
          <View style={st.intakeBar}>
            <View style={st.intakeBarRow}>
              <Text style={st.intakeBarLbl}>Today: {totalKcal} / {KCAL_GOAL} kcal</Text>
              <Text style={st.intakeBarPct}>{Math.round(Math.min(100, totalKcal / KCAL_GOAL * 100))}%</Text>
            </View>
            <View style={st.intakeTrack}>
              <View style={[st.intakeFill, { width: `${Math.min(100, totalKcal / KCAL_GOAL * 100)}%` as any }]} />
            </View>
          </View>

          {/* Tabs */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={st.foodTabRow}>
              {(['search','recent','favorites','browse','create','url'] as const).map(t => (
                <TouchableOpacity key={t} style={[st.foodTabBtn, foodTab === t && st.foodTabBtnActive]}
                  onPress={() => setFoodTab(t)}>
                  <Text style={[st.foodTabTxt, foodTab === t && st.foodTabTxtActive]}>
                    {t === 'search' ? '🔍 Search' : t === 'recent' ? '🕐 Recent' : t === 'favorites' ? '❤️ Saved' : t === 'browse' ? '📂 Browse' : t === 'create' ? '➕ Create' : '🔗 URL'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>

          {/* Tab content */}
          {foodTab === 'search' && (
            <FlatList
              data={searchResults}
              keyExtractor={(_, i) => String(i)}
              contentContainerStyle={{ padding: spacing.md, gap: spacing.sm }}
              ListEmptyComponent={
                <View style={{ alignItems: 'center', paddingTop: 32, gap: 8 }}>
                  <Text style={{ fontSize: 36 }}>🔍</Text>
                  <Text style={{ color: colors.ink3, fontSize: fontSize.sm }}>
                    {searchQuery.length > 0 && !searching ? 'No results found' : 'Search millions of foods'}
                  </Text>
                </View>
              }
              renderItem={({ item }) => {
                const n = item.nutriments ?? {};
                const kcal = Math.round(n['energy-kcal_100g'] ?? 0);
                const prot = Math.round(n['proteins_100g'] ?? 0);
                const carb = Math.round(n['carbohydrates_100g'] ?? 0);
                const fat  = Math.round(n['fat_100g'] ?? 0);
                const { grade, color: gradeColor } = gradeFood(n);
                const isFav = favorites.some(f => f.name === item.product_name);
                return (
                  <TouchableOpacity style={st.foodResult} onPress={() => addFromSearch(item)}>
                    <View style={[st.gradeBadge, { backgroundColor: gradeColor + '22', borderColor: gradeColor + '66' }]}>
                      <Text style={[st.gradeText, { color: gradeColor }]}>{grade}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={st.foodResultName}>{item.product_name}</Text>
                      {item.brands && <Text style={st.foodResultBrand}>{item.brands}</Text>}
                      <Text style={st.foodResultMeta}>per 100g · P{prot}g C{carb}g F{fat}g</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 4 }}>
                      <Text style={st.foodResultKcal}>{kcal}</Text>
                      <Text style={st.foodResultKcalLbl}>kcal</Text>
                    </View>
                    <TouchableOpacity onPress={() => saveFavorite({ id: `fav_${Date.now()}`, icon: '🍽️', name: item.product_name ?? 'Unknown', kcal, carbs: carb, protein: prot, fat, unit: '100g', meal: searchMeal })} style={{ padding: 4, marginLeft: 2 }}>
                      <Ionicons name={isFav ? 'heart' : 'heart-outline'} size={18} color={colors.rose} />
                    </TouchableOpacity>
                    <Ionicons name="add-circle" size={24} color={MEAL_ACCENT[searchMeal]} style={{ marginLeft: 4 }} />
                  </TouchableOpacity>
                );
              }}
            />
          )}

          {foodTab === 'recent' && (
            <FlatList
              data={foods.filter(f => f.meal === searchMeal)}
              keyExtractor={(f) => f.id}
              contentContainerStyle={{ padding: spacing.md, gap: spacing.sm }}
              ListEmptyComponent={
                <View style={{ alignItems: 'center', paddingTop: 40, gap: 8 }}>
                  <Text style={{ fontSize: 36 }}>🕐</Text>
                  <Text style={{ color: colors.ink3 }}>No recent foods for {MEAL_LABEL[searchMeal]}</Text>
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
                    <Text style={st.foodResultMeta}>{f.unit} · P{f.protein}g C{f.carbs}g F{f.fat}g</Text>
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
            <ScrollView contentContainerStyle={{ padding: spacing.md, gap: 10 }}>
              {[
                { emoji: '🥣', label: 'Breakfast Foods', items: ['Oatmeal', 'Eggs', 'Toast', 'Yogurt'] },
                { emoji: '🥗', label: 'Salads & Vegetables', items: ['Caesar Salad', 'Spinach', 'Broccoli'] },
                { emoji: '🍗', label: 'Proteins', items: ['Chicken Breast', 'Salmon', 'Tuna', 'Beef'] },
                { emoji: '🍎', label: 'Fruits', items: ['Apple', 'Banana', 'Orange', 'Berries'] },
                { emoji: '🥛', label: 'Dairy', items: ['Milk', 'Cheese', 'Greek Yogurt'] },
                { emoji: '🍝', label: 'Grains & Pasta', items: ['Rice', 'Pasta', 'Quinoa', 'Bread'] },
              ].map(cat => (
                <TouchableOpacity key={cat.label} style={st.browseCard}
                  onPress={() => { setSearchQuery(cat.label.split(' ')[0]); doSearch(cat.label.split(' ')[0]); setFoodTab('search'); }}>
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

          {foodTab === 'create' && (
            <ScrollView contentContainerStyle={{ padding: spacing.md, gap: spacing.sm }}>
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
                  const food: FoodItem = {
                    id: `${Date.now()}_${Math.random()}`,
                    icon: '🍽️',
                    name: customFood.name,
                    kcal: parseInt(customFood.kcal) || 0,
                    protein: parseFloat(customFood.protein) || 0,
                    carbs: parseFloat(customFood.carbs) || 0,
                    fat: parseFloat(customFood.fat) || 0,
                    fiber: parseFloat(customFood.fiber) || undefined,
                    sodium: parseFloat(customFood.sodium) || undefined,
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
            <ScrollView contentContainerStyle={{ padding: spacing.md, gap: spacing.md }}>
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
  // Daily mission card
  missionCard: { backgroundColor: colors.layer2, borderWidth: 1, borderColor: colors.line2, borderRadius: 16, padding: 14, gap: 12 },
  missionCardTitle: { fontSize: 10, fontWeight: '700', letterSpacing: 1.2, color: colors.ink3, textTransform: 'uppercase' },
  missionRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  missionCheck: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: colors.line2, alignItems: 'center', justifyContent: 'center' },
  missionCheckDone: { backgroundColor: colors.green, borderColor: colors.green },
  missionEmoji: { fontSize: 18 },
  missionLabel: { fontSize: 12, fontWeight: '500', color: colors.ink, marginBottom: 4 },
  missionLabelDone: { color: colors.ink3, textDecorationLine: 'line-through' },
  missionTrack: { height: 3, backgroundColor: colors.layer3, borderRadius: 2, overflow: 'hidden' },
  missionBar: { height: '100%', borderRadius: 2 },
  missionUnit: { fontSize: 10, color: colors.ink3, minWidth: 60, textAlign: 'right' },
  // Quick log strip
  quickStrip: { gap: 8, paddingHorizontal: spacing.md, paddingBottom: 4 },
  quickChip: { backgroundColor: colors.layer2, borderWidth: 1, borderColor: colors.line2, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 8, alignItems: 'center', flexDirection: 'row', gap: 6 },
  quickChipIcon: { fontSize: 16 },
  quickChipLabel: { fontSize: 12, fontWeight: '500', color: colors.ink2 },
  quickChipKcal: { fontSize: 10, color: colors.ink3 },
  // Action pills
  actionPills: { paddingHorizontal: spacing.md, paddingBottom: 8, gap: 8 },
  actionPill: { backgroundColor: colors.layer2, borderWidth: 1, borderColor: colors.line2, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 9, flexDirection: 'row', alignItems: 'center', gap: 6 },
  actionPillIcon: { fontSize: 15 },
  actionPillLabel: { fontSize: 12, fontWeight: '600', color: colors.ink2 },
  // Daily intake bar
  intakeBar: { paddingHorizontal: spacing.md, paddingBottom: 10, gap: 4 },
  intakeBarRow: { flexDirection: 'row', justifyContent: 'space-between' },
  intakeBarLbl: { fontSize: 11, color: colors.ink3 },
  intakeBarPct: { fontSize: 11, color: colors.lavender, fontWeight: '700' },
  intakeTrack: { height: 3, backgroundColor: colors.layer2, borderRadius: 2, overflow: 'hidden' },
  intakeFill: { height: '100%', backgroundColor: colors.lavender, borderRadius: 2 },
  // Food tabs
  foodTabRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.line2, paddingHorizontal: spacing.md },
  foodTabBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  foodTabBtnActive: { borderBottomColor: colors.lavender },
  foodTabTxt: { fontSize: 11, fontWeight: '600', color: colors.ink3 },
  foodTabTxtActive: { color: colors.lavender },
  // Browse cards
  browseCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.layer2, borderWidth: 1, borderColor: colors.line2, borderRadius: 14, padding: 14 },
  browseEmoji: { fontSize: 28 },
  browseName: { fontSize: 14, fontWeight: '600', color: colors.ink, marginBottom: 2 },
  browseSub: { fontSize: 11, color: colors.ink3 },
  iconBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  notifDot: { position: 'absolute', top: 8, right: 6, width: 6, height: 6, borderRadius: 3, backgroundColor: colors.rose },

  // XP Bar
  xpWrap: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: colors.line },
  xpBadge: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.purple, alignItems: 'center', justifyContent: 'center' },
  xpBadgeTxt: { fontSize: 18, fontWeight: '800', color: '#fff' },
  xpInner: { flex: 1 },
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
  mealRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: spacing.md, padding: spacing.sm, backgroundColor: colors.layer1, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line },
  mealRowSkipped: { opacity: 0.45 },
  mealIconWrap: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.layer2, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  mealEmoji: { fontSize: 24 },
  mealName: { fontSize: 15, fontWeight: '600', color: colors.ink },
  mealRec: { fontSize: 12, color: colors.ink3, marginTop: 2 },
  mealItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 4 },
  mealItemTxt: { fontSize: 11, color: colors.ink2, flex: 1 },
  skipBtn: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: colors.layer2 },
  skipTxt: { fontSize: 11, fontWeight: '600', color: colors.ink3 },
  skipTxtActive: { color: colors.rose },
  mealAddBtn: { width: 30, height: 30, borderRadius: 15, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },

  // Win cards
  winCard: { marginHorizontal: spacing.md, padding: spacing.md, backgroundColor: colors.layer1, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line },
  winCardHdr: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  winCardTitle: { fontSize: 15, fontWeight: '600', color: colors.ink },
  winCardSub: { fontSize: 12, color: 'rgba(56,189,248,0.6)', fontFamily: 'monospace' },
  glassRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.sm },
  glassAdd: { width: 36, height: 44, alignItems: 'center', justifyContent: 'center' },
  glass: { width: 36, height: 44, borderRadius: 8, borderWidth: 1.5, borderColor: colors.sky + '44', alignItems: 'center', justifyContent: 'center' },
  glassFilled: { backgroundColor: colors.sky + '22', borderColor: colors.sky },
  glassEmoji: { fontSize: 20 },
  waterProgress: { height: 4, backgroundColor: colors.layer2, borderRadius: 2, overflow: 'hidden' },
  waterBar: { height: 4, backgroundColor: colors.sky, borderRadius: 2 },
  achieveBanner: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 12, padding: 12, backgroundColor: 'rgba(124,77,255,0.08)', borderWidth: 1, borderColor: colors.line2, borderRadius: radius.md },
  achieveTitle: { fontSize: 13, fontWeight: '700', color: colors.ink },
  achieveBody: { fontSize: 12, color: colors.ink2, marginTop: 2 },
  produceRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  produceLbl: { fontSize: 9, fontWeight: '700', letterSpacing: 0.12 * 9, textTransform: 'uppercase', color: 'rgba(196,181,255,0.3)', width: 38, flexShrink: 0 },
  emojiRow: { flexDirection: 'row', gap: spacing.xs },
  produceDot: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.layer2 },
  produceEmoji: { fontSize: 22 },

  // Micronutrients
  microRow: { paddingHorizontal: spacing.md, marginBottom: 12 },
  microHdr: { fontSize: 10, fontWeight: '700', color: colors.ink3, letterSpacing: 1, marginBottom: 8 },
  microChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  microChip: { backgroundColor: colors.layer2, borderWidth: 1, borderColor: colors.line2, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, alignItems: 'center', gap: 2 },
  microVal: { fontSize: 14, fontWeight: '700', color: colors.ink },
  microLbl: { fontSize: 10, color: colors.ink3 },
  macroNetCarbs: { fontSize: 10, color: colors.sky, fontWeight: '600', marginTop: 2 },
  // Food grade badge
  gradeBadge: { width: 32, height: 32, borderRadius: 8, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  gradeText: { fontSize: 14, fontWeight: '800' },

  // Search modal
  searchModal: { flex: 1, backgroundColor: colors.bg },
  searchHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.line },
  searchTitle: { color: colors.ink, fontSize: fontSize.base, fontWeight: '700' },
  searchClose: { padding: spacing.xs },
  searchInputRow: { flexDirection: 'row', alignItems: 'center', margin: spacing.md, backgroundColor: colors.layer2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line2, paddingHorizontal: spacing.sm, gap: spacing.xs },
  searchInput: { flex: 1, color: colors.ink, fontSize: fontSize.base, paddingVertical: spacing.sm },
  foodResult: { backgroundColor: colors.layer1, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, padding: spacing.md, flexDirection: 'row', alignItems: 'center' },
  foodResultName: { color: colors.ink, fontSize: fontSize.sm, fontWeight: '600' },
  foodResultBrand: { color: colors.ink3, fontSize: fontSize.xs, marginTop: 1 },
  foodResultMeta: { color: colors.ink3, fontSize: fontSize.xs, marginTop: 2 },
  foodResultKcal: { color: colors.lavender, fontSize: fontSize.md, fontWeight: '800' },
  foodResultKcalLbl: { color: colors.ink3, fontSize: fontSize.xs },
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
  doneWrap: { paddingHorizontal: 14, paddingBottom: 24, paddingTop: 12 },
  doneBtn: { backgroundColor: 'rgba(255,255,255,0.1)', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.18)', borderRadius: 16, padding: 16, alignItems: 'center' },
  doneTxt: { fontSize: 14, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', color: '#fff' },
});
