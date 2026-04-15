import { useState, useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  View, Text, ScrollView, TouchableOpacity, Switch, StyleSheet,
  Modal, Alert, TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';
import { colors, spacing, fontSize, radius } from '../../src/theme';
import { useAppStore } from '../../src/store/appStore';
import { useAuthStore } from '../../src/store/authStore';
import { coachMessage } from '../../src/lib/api';

// ── Storage keys (scoped per user to prevent data leakage between accounts) ───
function makeKeys(email: string) {
  return {
    QS:       `dagnara_quit_smoking_${email}`,
    QD:       `dagnara_quit_drinking_${email}`,
    PILLS:    `dagnara_pill_meds_${email}`,
    PILL_LOG: (day: string) => `dagnara_pill_log_${day}_${email}`,
  };
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface QsData {
  quitDate: string;     // ISO date string
  cigsPerDay: number;
  costPerPack: number;
  cigsPerPack: number;
}

interface QdData {
  quitDate: string;
  drinksPerDay: number;
  costPerDrink: number;
}

interface Medication {
  id: string;
  name: string;
  dosage: string;
  times: string[];
  color: string;
  notes: string;
}

interface DoseEntry {
  takenCount: number;
  takenTimes: string[];
}

interface PillLog {
  [medId: string]: DoseEntry;
}

// ── Pill colors ───────────────────────────────────────────────────────────────
const PILL_COLORS = [
  colors.sky, colors.green, colors.honey, colors.rose,
  colors.violet, colors.teal, colors.purple2, colors.lavender,
];

// ── Achievements & milestones ─────────────────────────────────────────────────
const QS_ACHIEVEMENTS = [
  { id: '20min', hours: 0.33,  icon: '🌟', title: '20 Minutes', desc: 'Heart rate and blood pressure drop' },
  { id: '12h',   hours: 12,    icon: '💨', title: '12 Hours',   desc: 'Carbon monoxide levels normalize' },
  { id: '24h',   hours: 24,    icon: '❤️', title: '1 Day',      desc: 'Heart attack risk begins to drop' },
  { id: '48h',   hours: 48,    icon: '👃', title: '2 Days',     desc: 'Smell and taste start to improve' },
  { id: '72h',   hours: 72,    icon: '🫁', title: '3 Days',     desc: 'Nicotine fully leaves your body' },
  { id: '1w',    hours: 168,   icon: '🏃', title: '1 Week',     desc: 'Lung function begins to improve' },
  { id: '2w',    hours: 336,   icon: '🌿', title: '2 Weeks',    desc: 'Circulation improves significantly' },
  { id: '1mo',   hours: 720,   icon: '💪', title: '1 Month',    desc: 'Cough and fatigue decrease' },
  { id: '3mo',   hours: 2160,  icon: '🫀', title: '3 Months',   desc: 'Lung capacity improves up to 30%' },
  { id: '6mo',   hours: 4380,  icon: '🎯', title: '6 Months',   desc: 'Serious coughing episodes decrease' },
  { id: '1yr',   hours: 8760,  icon: '🏆', title: '1 Year',     desc: 'Heart disease risk halved' },
];

const QS_MILESTONES = [
  { hours: 0.33,  icon: '❤️', text: 'Blood pressure drops' },
  { hours: 8,     icon: '💨', text: 'Oxygen levels normalize' },
  { hours: 24,    icon: '🫀', text: 'Heart attack risk drops' },
  { hours: 48,    icon: '👃', text: 'Taste and smell recover' },
  { hours: 72,    icon: '🫁', text: 'Breathing becomes easier' },
  { hours: 336,   icon: '🏃', text: 'Circulation improves' },
  { hours: 720,   icon: '💪', text: 'Lung function improves 10%' },
  { hours: 4380,  icon: '🎯', text: 'Heart disease risk halved' },
  { hours: 8760,  icon: '🏆', text: 'Stroke risk = non-smoker' },
];

const QD_ACHIEVEMENTS = [
  { hours: 0.083, icon: '⚡', title: '5 Minutes',  desc: 'You made the first step' },
  { hours: 1,     icon: '1️⃣', title: '1 Hour',     desc: 'First hour alcohol-free' },
  { hours: 6,     icon: '🌅', title: '6 Hours',    desc: 'Blood alcohol cleared' },
  { hours: 12,    icon: '💧', title: '12 Hours',   desc: 'Hydration starts recovering' },
  { hours: 24,    icon: '☀️', title: '1 Day',      desc: 'First full day complete' },
  { hours: 48,    icon: '🛌', title: '2 Days',     desc: 'Sleep quality improving' },
  { hours: 72,    icon: '🧠', title: '3 Days',     desc: 'Anxiety and fogginess lift' },
  { hours: 96,    icon: '🍎', title: '4 Days',     desc: 'Hunger and thirst normalize' },
  { hours: 120,   icon: '💪', title: '5 Days',     desc: 'Energy levels rising' },
  { hours: 144,   icon: '🎯', title: '6 Days',     desc: 'Focus and clarity improve' },
  { hours: 168,   icon: '🏅', title: '1 Week',     desc: 'Liver starts to recover' },
  { hours: 240,   icon: '😊', title: '10 Days',    desc: 'Mood significantly better' },
  { hours: 336,   icon: '🌿', title: '2 Weeks',    desc: 'Skin begins to clear up' },
  { hours: 504,   icon: '🔋', title: '3 Weeks',    desc: 'Physical energy restored' },
  { hours: 720,   icon: '🥇', title: '1 Month',    desc: 'Liver fat reduces by 15%' },
  { hours: 1080,  icon: '💎', title: '45 Days',    desc: 'Blood pressure normalizes' },
  { hours: 1440,  icon: '🦁', title: '2 Months',   desc: 'Immune system strengthening' },
  { hours: 2160,  icon: '🌟', title: '3 Months',   desc: 'Cancer risk begins to drop' },
  { hours: 2880,  icon: '🎉', title: '4 Months',   desc: 'Red blood cells fully renewed' },
  { hours: 3600,  icon: '🏆', title: '5 Months',   desc: 'Bone density improving' },
  { hours: 4380,  icon: '🎊', title: '6 Months',   desc: 'Liver fully regenerating' },
  { hours: 5040,  icon: '⭐', title: '7 Months',   desc: 'Brain chemistry rebalancing' },
  { hours: 5760,  icon: '🌙', title: '8 Months',   desc: 'Sleep patterns normalized' },
  { hours: 6480,  icon: '🎵', title: '9 Months',   desc: 'Social confidence returns' },
  { hours: 7200,  icon: '🌈', title: '10 Months',  desc: 'Depression risk greatly reduced' },
  { hours: 7920,  icon: '🦅', title: '11 Months',  desc: 'Craving frequency very low' },
  { hours: 8760,  icon: '🏅', title: '1 Year',     desc: 'Liver disease risk halved' },
  { hours: 43800, icon: '👑', title: '5 Years',    desc: 'Mouth cancer risk halved' },
];

const QD_MILESTONES = [
  { hours: 6,     icon: '🍷', text: 'Blood alcohol fully cleared' },
  { hours: 24,    icon: '🧠', text: 'Brain chemistry stabilizing' },
  { hours: 72,    icon: '😴', text: 'Sleep patterns improving' },
  { hours: 168,   icon: '❤️', text: 'Heart rate and BP normalizing' },
  { hours: 336,   icon: '🌿', text: 'Skin hydration improving' },
  { hours: 720,   icon: '🫁', text: 'Liver fat decreasing' },
  { hours: 2160,  icon: '💪', text: 'Physical strength recovering' },
  { hours: 4380,  icon: '🎯', text: 'Cancer risk dropping' },
  { hours: 8760,  icon: '🏆', text: 'Liver disease risk halved' },
  { hours: 17520, icon: '💎', text: 'Heart disease risk reduces' },
  { hours: 26280, icon: '🌟', text: 'Stroke risk approaches normal' },
  { hours: 43800, icon: '👑', text: 'Life expectancy normalizing' },
];

// ── Programs list ─────────────────────────────────────────────────────────────
const PROGRAMS = [
  { id: 'quit_smoking',  icon: '🚭', name: 'Quit Smoking',   description: 'Track smoke-free days and savings',     color: colors.rose },
  { id: 'quit_drinking', icon: '🍺', name: 'Quit Drinking',  description: 'Track alcohol-free days and benefits',  color: colors.honey },
  { id: 'pill_reminder', icon: '💊', name: 'Pill Reminder',  description: 'Daily medication reminders',            color: colors.purple2 },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function elapsedHours(isoDate: string): number {
  return (Date.now() - new Date(isoDate).getTime()) / 3600000;
}

function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  return `${m}:${String(s).padStart(2,'0')}`;
}

function todayKey(): string {
  return new Date().toISOString().split('T')[0];
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// SVG ring constants
const RING_SIZE = 220;
const RING_R = 88;
const RING_STROKE = 14;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_R;

// ── Quit Smoking Modal ────────────────────────────────────────────────────────
function QuitSmokingModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { email } = useAuthStore();
  const KEYS = makeKeys(email ?? 'anon');
  const [data, setData] = useState<QsData | null>(null);
  const [elapsed, setElapsed] = useState(0); // ms
  const intervalRef = useRef<any>(null);
  // Setup form state
  const [showSetup, setShowSetup] = useState(false);
  const [formDate, setFormDate] = useState('');
  const [formCpd, setFormCpd] = useState('15');
  const [formCpp, setFormCpp] = useState('12');
  const [formCigsPerPack, setFormCigsPerPack] = useState('20');

  useEffect(() => {
    if (!visible) return;
    AsyncStorage.getItem(KEYS.QS).then((raw) => {
      if (raw) {
        const d: QsData = JSON.parse(raw);
        setData(d);
        setShowSetup(false);
      } else {
        setData(null);
        setShowSetup(true);
      }
    });
  }, [visible]);

  useEffect(() => {
    if (!data) { clearInterval(intervalRef.current); return; }
    function tick() { setElapsed(Date.now() - new Date(data!.quitDate).getTime()); }
    tick();
    intervalRef.current = setInterval(tick, 1000);
    return () => clearInterval(intervalRef.current);
  }, [data]);

  function saveSetup() {
    const cpd = parseInt(formCpd) || 15;
    const cpp = parseFloat(formCpp) || 12;
    const cip = parseInt(formCigsPerPack) || 20;
    if (cpd < 1 || cpd > 200) { Alert.alert('Invalid value', 'Cigarettes per day must be between 1 and 200.'); return; }
    if (cpp <= 0 || cpp > 500) { Alert.alert('Invalid value', 'Cost per pack must be between $0.01 and $500.'); return; }
    if (cip < 1 || cip > 100) { Alert.alert('Invalid value', 'Cigarettes per pack must be between 1 and 100.'); return; }
    const quitDate = formDate ? new Date(formDate + 'T00:00:00').toISOString() : new Date().toISOString();
    const d: QsData = { quitDate, cigsPerDay: cpd, costPerPack: cpp, cigsPerPack: cip };
    AsyncStorage.setItem(KEYS.QS, JSON.stringify(d));
    setData(d);
    setShowSetup(false);
  }

  function resetProgress() {
    Alert.alert('Reset Progress', 'This will reset your quit date to now. Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reset', style: 'destructive', onPress: () => {
        const d: QsData = { ...data!, quitDate: new Date().toISOString() };
        AsyncStorage.setItem(KEYS.QS, JSON.stringify(d));
        setData(d);
      }},
    ]);
  }

  const hours = elapsed / 3600000;
  const cigsAvoided = data ? Math.floor(hours * (data.cigsPerDay / 24)) : 0;
  const moneySaved = data ? ((cigsAvoided / data.cigsPerPack) * data.costPerPack) : 0;
  const lifeRegained = cigsAvoided * 11; // minutes
  const unlockedCount = data ? QS_ACHIEVEMENTS.filter(a => hours >= a.hours).length : 0;

  if (showSetup) {
    return (
      <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
          <SafeAreaView style={m.sheet} edges={['bottom']}>
            <View style={m.sheetHeader}>
              <Text style={m.sheetTitle}>🚭 Quit Smoking Setup</Text>
              <TouchableOpacity onPress={onClose}><Ionicons name="close" size={24} color={colors.ink3} /></TouchableOpacity>
            </View>
            <ScrollView
              contentContainerStyle={{ padding: spacing.md, gap: spacing.md }}
              automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={m.label}>Quit date (leave blank for right now)</Text>
              <TextInput
                style={m.input}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={colors.ink3}
                value={formDate}
                onChangeText={setFormDate}
                maxLength={10}
              />
              <Text style={m.label}>Cigarettes per day</Text>
              <TextInput style={m.input} keyboardType="numeric" value={formCpd} onChangeText={setFormCpd} placeholderTextColor={colors.ink3} />
              <Text style={m.label}>Cost per pack ($)</Text>
              <TextInput style={m.input} keyboardType="decimal-pad" value={formCpp} onChangeText={setFormCpp} placeholderTextColor={colors.ink3} />
              <Text style={m.label}>Cigarettes per pack</Text>
              <TextInput style={m.input} keyboardType="numeric" value={formCigsPerPack} onChangeText={setFormCigsPerPack} placeholderTextColor={colors.ink3} />
              <TouchableOpacity style={m.primaryBtn} onPress={saveSetup}>
                <Text style={m.primaryBtnTxt}>Start My Journey</Text>
              </TouchableOpacity>
            </ScrollView>
          </SafeAreaView>
      </Modal>
    );
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <SafeAreaView style={m.sheet} edges={['bottom']}>
        <View style={m.sheetHeader}>
          <Text style={m.sheetTitle}>🚭 Quit Smoking</Text>
          <TouchableOpacity onPress={onClose}><Ionicons name="close" size={24} color={colors.ink3} /></TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ padding: spacing.md, gap: spacing.md }} showsVerticalScrollIndicator={false}>
          {/* Timer */}
          <View style={m.timerCard}>
            <Text style={m.timerLabel}>Smoke-free for</Text>
            <Text style={m.timerValue}>{formatDuration(elapsed)}</Text>
            <Text style={m.timerSub}>{unlockedCount}/{QS_ACHIEVEMENTS.length} achievements unlocked</Text>
          </View>

          {/* Stats */}
          <View style={m.statsRow}>
            <View style={m.statCard}>
              <Text style={m.statVal}>{cigsAvoided}</Text>
              <Text style={m.statLbl}>cigs avoided</Text>
            </View>
            <View style={m.statCard}>
              <Text style={m.statVal}>${moneySaved.toFixed(2)}</Text>
              <Text style={m.statLbl}>money saved</Text>
            </View>
            <View style={m.statCard}>
              <Text style={m.statVal}>{lifeRegained >= 60 ? `${Math.floor(lifeRegained/60)}h` : `${lifeRegained}m`}</Text>
              <Text style={m.statLbl}>life regained</Text>
            </View>
          </View>

          {/* Achievements */}
          <Text style={m.sectionTitle}>Achievements</Text>
          {QS_ACHIEVEMENTS.map((a) => {
            const done = hours >= a.hours;
            return (
              <View key={a.id} style={[m.achieveRow, !done && m.achieveLocked]}>
                <Text style={[m.achieveIcon, !done && { opacity: 0.3 }]}>{a.icon}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[m.achieveTitle, !done && { color: colors.ink3 }]}>{a.title}</Text>
                  <Text style={m.achieveDesc}>{a.desc}</Text>
                </View>
                {done && <Ionicons name="checkmark-circle" size={20} color={colors.green} />}
              </View>
            );
          })}

          {/* Health Timeline */}
          <Text style={m.sectionTitle}>Health Timeline</Text>
          {QS_MILESTONES.map((ms, i) => {
            const done = hours >= ms.hours;
            return (
              <View key={`ms-${i}`} style={m.milestoneRow}>
                <View style={[m.milestoneDot, done && { backgroundColor: colors.green }]} />
                <Text style={m.milestoneIcon}>{ms.icon}</Text>
                <Text style={[m.milestoneTxt, !done && { color: colors.ink3 }]}>{ms.text}</Text>
              </View>
            );
          })}

          {/* Actions */}
          <TouchableOpacity style={m.dangerBtn} onPress={resetProgress}>
            <Text style={m.dangerBtnTxt}>I had a slip — reset timer</Text>
          </TouchableOpacity>
          <TouchableOpacity style={m.ghostBtn} onPress={() => setShowSetup(true)}>
            <Text style={m.ghostBtnTxt}>Edit setup</Text>
          </TouchableOpacity>
          <View style={{ height: 24 }} />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

// ── Quit Drinking Modal ───────────────────────────────────────────────────────
function QuitDrinkingModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { email } = useAuthStore();
  const KEYS = makeKeys(email ?? 'anon');
  const [data, setData] = useState<QdData | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const intervalRef = useRef<any>(null);
  const [showSetup, setShowSetup] = useState(false);
  const [formDate, setFormDate] = useState('');
  const [formDpd, setFormDpd] = useState('2');
  const [formCpd, setFormCpd] = useState('5');

  useEffect(() => {
    if (!visible) return;
    AsyncStorage.getItem(KEYS.QD).then((raw) => {
      if (raw) {
        setData(JSON.parse(raw));
        setShowSetup(false);
      } else {
        setData(null);
        setShowSetup(true);
      }
    });
  }, [visible]);

  useEffect(() => {
    if (!data) { clearInterval(intervalRef.current); return; }
    function tick() { setElapsed(Date.now() - new Date(data!.quitDate).getTime()); }
    tick();
    intervalRef.current = setInterval(tick, 1000);
    return () => clearInterval(intervalRef.current);
  }, [data]);

  function saveSetup() {
    const dpd = parseFloat(formDpd) || 2;
    const cpd = parseFloat(formCpd) || 5;
    if (dpd < 0.1 || dpd > 50) { Alert.alert('Invalid value', 'Drinks per day must be between 0.1 and 50.'); return; }
    if (cpd < 0 || cpd > 500) { Alert.alert('Invalid value', 'Cost per drink must be between $0 and $500.'); return; }
    const quitDate = formDate ? new Date(formDate + 'T00:00:00').toISOString() : new Date().toISOString();
    const d: QdData = { quitDate, drinksPerDay: dpd, costPerDrink: cpd };
    AsyncStorage.setItem(KEYS.QD, JSON.stringify(d));
    setData(d);
    setShowSetup(false);
  }

  function resetProgress() {
    Alert.alert('Reset Progress', 'This will reset your quit date to now. Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reset', style: 'destructive', onPress: () => {
        const d: QdData = { ...data!, quitDate: new Date().toISOString() };
        AsyncStorage.setItem(KEYS.QD, JSON.stringify(d));
        setData(d);
      }},
    ]);
  }

  const hours = elapsed / 3600000;
  const drinksAvoided = data ? Math.floor(hours * (data.drinksPerDay / 24)) : 0;
  const moneySaved = data ? drinksAvoided * data.costPerDrink : 0;
  const calsAvoided = drinksAvoided * 150; // ~150 kcal per drink
  const unlockedCount = data ? QD_ACHIEVEMENTS.filter(a => hours >= a.hours).length : 0;

  if (showSetup) {
    return (
      <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
          <SafeAreaView style={m.sheet} edges={['bottom']}>
            <View style={m.sheetHeader}>
              <Text style={m.sheetTitle}>🍺 Quit Drinking Setup</Text>
              <TouchableOpacity onPress={onClose}><Ionicons name="close" size={24} color={colors.ink3} /></TouchableOpacity>
            </View>
            <ScrollView
              contentContainerStyle={{ padding: spacing.md, gap: spacing.md }}
              automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={m.label}>Quit date (leave blank for right now)</Text>
              <TextInput
                style={m.input}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={colors.ink3}
                value={formDate}
                onChangeText={setFormDate}
                maxLength={10}
              />
              <Text style={m.label}>Drinks per day (average)</Text>
              <TextInput style={m.input} keyboardType="decimal-pad" value={formDpd} onChangeText={setFormDpd} placeholderTextColor={colors.ink3} />
              <Text style={m.label}>Cost per drink ($)</Text>
              <TextInput style={m.input} keyboardType="decimal-pad" value={formCpd} onChangeText={setFormCpd} placeholderTextColor={colors.ink3} />
              <TouchableOpacity style={m.primaryBtn} onPress={saveSetup}>
                <Text style={m.primaryBtnTxt}>Start My Journey</Text>
              </TouchableOpacity>
            </ScrollView>
          </SafeAreaView>
      </Modal>
    );
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <SafeAreaView style={m.sheet} edges={['bottom']}>
        <View style={m.sheetHeader}>
          <Text style={m.sheetTitle}>🍺 Quit Drinking</Text>
          <TouchableOpacity onPress={onClose}><Ionicons name="close" size={24} color={colors.ink3} /></TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ padding: spacing.md, gap: spacing.md }} showsVerticalScrollIndicator={false}>
          {/* Timer */}
          <View style={m.timerCard}>
            <Text style={m.timerLabel}>Alcohol-free for</Text>
            <Text style={m.timerValue}>{formatDuration(elapsed)}</Text>
            <Text style={m.timerSub}>{unlockedCount}/{QD_ACHIEVEMENTS.length} achievements unlocked</Text>
          </View>

          {/* Stats */}
          <View style={m.statsRow}>
            <View style={m.statCard}>
              <Text style={m.statVal}>{drinksAvoided}</Text>
              <Text style={m.statLbl}>drinks avoided</Text>
            </View>
            <View style={m.statCard}>
              <Text style={m.statVal}>${moneySaved.toFixed(2)}</Text>
              <Text style={m.statLbl}>money saved</Text>
            </View>
            <View style={m.statCard}>
              <Text style={m.statVal}>{calsAvoided}</Text>
              <Text style={m.statLbl}>kcal avoided</Text>
            </View>
          </View>

          {/* Achievements */}
          <Text style={m.sectionTitle}>Achievements</Text>
          {QD_ACHIEVEMENTS.map((a, i) => {
            const done = hours >= a.hours;
            return (
              <View key={`ach-${i}`} style={[m.achieveRow, !done && m.achieveLocked]}>
                <Text style={[m.achieveIcon, !done && { opacity: 0.3 }]}>{a.icon}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[m.achieveTitle, !done && { color: colors.ink3 }]}>{a.title}</Text>
                  <Text style={m.achieveDesc}>{a.desc}</Text>
                </View>
                {done && <Ionicons name="checkmark-circle" size={20} color={colors.green} />}
              </View>
            );
          })}

          {/* Health Timeline */}
          <Text style={m.sectionTitle}>Health Timeline</Text>
          {QD_MILESTONES.map((ms, i) => {
            const done = hours >= ms.hours;
            return (
              <View key={`ms-${i}`} style={m.milestoneRow}>
                <View style={[m.milestoneDot, done && { backgroundColor: colors.green }]} />
                <Text style={m.milestoneIcon}>{ms.icon}</Text>
                <Text style={[m.milestoneTxt, !done && { color: colors.ink3 }]}>{ms.text}</Text>
              </View>
            );
          })}

          <TouchableOpacity style={m.dangerBtn} onPress={resetProgress}>
            <Text style={m.dangerBtnTxt}>I had a drink — reset timer</Text>
          </TouchableOpacity>
          <TouchableOpacity style={m.ghostBtn} onPress={() => setShowSetup(true)}>
            <Text style={m.ghostBtnTxt}>Edit setup</Text>
          </TouchableOpacity>
          <View style={{ height: 24 }} />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

// ── Pill Reminder Modal ───────────────────────────────────────────────────────
function PillReminderModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { email } = useAuthStore();
  const KEYS = makeKeys(email ?? 'anon');
  const [meds, setMeds] = useState<Medication[]>([]);
  const [log, setLog] = useState<PillLog>({});
  // Add/Edit sheet
  const [editSheet, setEditSheet] = useState(false);
  const [editMed, setEditMed] = useState<Medication | null>(null);
  const [formName, setFormName] = useState('');
  const [formDosage, setFormDosage] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formTimes, setFormTimes] = useState<string[]>(['08:00']);
  const [formColor, setFormColor] = useState(PILL_COLORS[0]);

  const today = todayKey();

  useEffect(() => {
    if (!visible) return;
    Promise.all([
      AsyncStorage.getItem(KEYS.PILLS),
      AsyncStorage.getItem(KEYS.PILL_LOG(today)),
    ]).then(([medsRaw, logRaw]) => {
      setMeds(medsRaw ? JSON.parse(medsRaw) : []);
      setLog(logRaw ? JSON.parse(logRaw) : {});
    });
  }, [visible]);

  function saveMeds(updated: Medication[]) {
    setMeds(updated);
    AsyncStorage.setItem(KEYS.PILLS, JSON.stringify(updated));
  }

  function saveLog(updated: PillLog) {
    setLog(updated);
    AsyncStorage.setItem(KEYS.PILL_LOG(today), JSON.stringify(updated));
  }

  function incrementDose(medId: string, totalTimes: number) {
    const entry = log[medId] ?? { takenCount: 0, takenTimes: [] };
    if (entry.takenCount >= totalTimes) return;
    const updated: PillLog = {
      ...log,
      [medId]: {
        takenCount: entry.takenCount + 1,
        takenTimes: [...entry.takenTimes, new Date().toISOString()],
      },
    };
    saveLog(updated);
  }

  function undoDose(medId: string) {
    const entry = log[medId];
    if (!entry || entry.takenCount === 0) return;
    const updated: PillLog = {
      ...log,
      [medId]: {
        takenCount: entry.takenCount - 1,
        takenTimes: entry.takenTimes.slice(0, -1),
      },
    };
    saveLog(updated);
  }

  function deleteMed(medId: string) {
    Alert.alert('Remove Medication', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => saveMeds(meds.filter(m => m.id !== medId)) },
    ]);
  }

  function openAdd() {
    setEditMed(null);
    setFormName(''); setFormDosage(''); setFormNotes('');
    setFormTimes(['08:00']); setFormColor(PILL_COLORS[0]);
    setEditSheet(true);
  }

  function openEdit(med: Medication) {
    setEditMed(med);
    setFormName(med.name); setFormDosage(med.dosage); setFormNotes(med.notes);
    setFormTimes(med.times.length ? med.times : ['08:00']); setFormColor(med.color);
    setEditSheet(true);
  }

  function saveMedForm() {
    if (!formName.trim()) { Alert.alert('Name required'); return; }
    const med: Medication = {
      id: editMed?.id ?? Date.now().toString(),
      name: formName.trim(),
      dosage: formDosage.trim(),
      times: formTimes.filter(t => t.trim()),
      color: formColor,
      notes: formNotes.trim(),
    };
    const updated = editMed ? meds.map(x => x.id === editMed.id ? med : x) : [...meds, med];
    saveMeds(updated);
    setEditSheet(false);
  }

  function addTime() { setFormTimes([...formTimes, '12:00']); }
  function removeTime(i: number) { setFormTimes(formTimes.filter((_, idx) => idx !== i)); }
  function updateTime(i: number, val: string) {
    const updated = [...formTimes]; updated[i] = val; setFormTimes(updated);
  }

  // Streak calculation: consecutive days all meds fully taken
  async function calcStreak(): Promise<number> {
    if (meds.length === 0) return 0;
    let streak = 0;
    for (let i = 0; i < 365; i++) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const key = d.toISOString().split('T')[0];
      const raw = await AsyncStorage.getItem(KEYS.PILL_LOG(key));
      const dayLog: PillLog = raw ? JSON.parse(raw) : {};
      const allDone = meds.every(med => (dayLog[med.id]?.takenCount ?? 0) >= med.times.length);
      if (allDone) streak++; else break;
    }
    return streak;
  }

  // 30-day adherence
  const [adherence, setAdherence] = useState<number | null>(null);
  const [streak, setStreak] = useState(0);

  useEffect(() => {
    if (!visible || meds.length === 0) { setAdherence(null); setStreak(0); return; }
    (async () => {
      let taken = 0, total = 0;
      for (let i = 0; i < 30; i++) {
        const d = new Date(); d.setDate(d.getDate() - i);
        const key = d.toISOString().split('T')[0];
        const raw = await AsyncStorage.getItem(KEYS.PILL_LOG(key));
        const dayLog: PillLog = raw ? JSON.parse(raw) : {};
        meds.forEach(med => {
          total += med.times.length;
          taken += Math.min(dayLog[med.id]?.takenCount ?? 0, med.times.length);
        });
      }
      setAdherence(total > 0 ? Math.round((taken / total) * 100) : 100);
      setStreak(await calcStreak());
    })();
  }, [visible, meds, log]);

  const allDoneToday = meds.length > 0 && meds.every(med => (log[med.id]?.takenCount ?? 0) >= med.times.length);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <SafeAreaView style={m.sheet} edges={['bottom']}>
        <View style={m.sheetHeader}>
          <Text style={m.sheetTitle}>💊 Pill Reminder</Text>
          <TouchableOpacity onPress={onClose}><Ionicons name="close" size={24} color={colors.ink3} /></TouchableOpacity>
        </View>

        {/* Add medication sheet */}
        <Modal visible={editSheet} animationType="slide" presentationStyle="pageSheet">
            <SafeAreaView style={m.sheet} edges={['bottom']}>
              <View style={m.sheetHeader}>
                <Text style={m.sheetTitle}>{editMed ? 'Edit Medication' : 'Add Medication'}</Text>
                <TouchableOpacity onPress={() => setEditSheet(false)}><Ionicons name="close" size={24} color={colors.ink3} /></TouchableOpacity>
              </View>
              <ScrollView
                contentContainerStyle={{ padding: spacing.md, gap: spacing.md }}
                automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
                keyboardShouldPersistTaps="handled"
              >
                <Text style={m.label}>Medication name *</Text>
                <TextInput style={m.input} value={formName} onChangeText={setFormName} placeholder="e.g. Vitamin D" placeholderTextColor={colors.ink3} />

                <Text style={m.label}>Dosage</Text>
                <TextInput style={m.input} value={formDosage} onChangeText={setFormDosage} placeholder="e.g. 1000 IU, 2 tablets" placeholderTextColor={colors.ink3} />

                <Text style={m.label}>Reminder times (HH:MM)</Text>
                {formTimes.map((t, i) => (
                  <View key={i} style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                    <TextInput
                      style={[m.input, { flex: 1 }]}
                      value={t}
                      onChangeText={(v) => updateTime(i, v)}
                      placeholder="08:00"
                      placeholderTextColor={colors.ink3}
                      maxLength={5}
                    />
                    {formTimes.length > 1 && (
                      <TouchableOpacity onPress={() => removeTime(i)}>
                        <Ionicons name="remove-circle" size={22} color={colors.rose} />
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
                <TouchableOpacity onPress={addTime} style={m.ghostBtn}>
                  <Text style={m.ghostBtnTxt}>+ Add time</Text>
                </TouchableOpacity>

                <Text style={m.label}>Color</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                  {PILL_COLORS.map((c) => (
                    <TouchableOpacity key={c} onPress={() => setFormColor(c)}>
                      <View style={[m.colorDot, { backgroundColor: c, borderWidth: formColor === c ? 3 : 0, borderColor: colors.white }]} />
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={m.label}>Notes</Text>
                <TextInput
                  style={[m.input, { minHeight: 60, textAlignVertical: 'top' }]}
                  value={formNotes}
                  onChangeText={setFormNotes}
                  placeholder="e.g. Take with food"
                  placeholderTextColor={colors.ink3}
                  multiline
                />
                <TouchableOpacity style={m.primaryBtn} onPress={saveMedForm}>
                  <Text style={m.primaryBtnTxt}>{editMed ? 'Save Changes' : 'Add Medication'}</Text>
                </TouchableOpacity>
                <View style={{ height: spacing.lg }} />
              </ScrollView>
            </SafeAreaView>
        </Modal>

        <ScrollView contentContainerStyle={{ padding: spacing.md, gap: spacing.md }} showsVerticalScrollIndicator={false}>
          {/* Summary stats */}
          {meds.length > 0 && (
            <View style={m.statsRow}>
              <View style={m.statCard}>
                <Text style={m.statVal}>{streak}</Text>
                <Text style={m.statLbl}>day streak</Text>
              </View>
              <View style={m.statCard}>
                <Text style={m.statVal}>{adherence !== null ? `${adherence}%` : '—'}</Text>
                <Text style={m.statLbl}>30-day avg</Text>
              </View>
              <View style={m.statCard}>
                <Text style={[m.statVal, { color: allDoneToday ? colors.green : colors.honey }]}>
                  {allDoneToday ? '✓' : `${meds.filter(med => (log[med.id]?.takenCount ?? 0) >= med.times.length).length}/${meds.length}`}
                </Text>
                <Text style={m.statLbl}>today</Text>
              </View>
            </View>
          )}

          {meds.length === 0 && (
            <View style={m.emptyState}>
              <Text style={m.emptyIcon}>💊</Text>
              <Text style={m.emptyTitle}>No medications added</Text>
              <Text style={m.emptyDesc}>Add your first medication to start tracking</Text>
            </View>
          )}

          {/* Med cards */}
          {meds.map((med) => {
            const entry = log[med.id] ?? { takenCount: 0, takenTimes: [] };
            const total = med.times.length;
            const taken = entry.takenCount;
            const done = taken >= total;
            return (
              <View key={med.id} style={m.medCard}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={[m.medDot, { backgroundColor: med.color }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={m.medName}>{med.name}</Text>
                    {med.dosage ? <Text style={m.medDosage}>{med.dosage}</Text> : null}
                    <Text style={m.medTimes}>{med.times.join(', ')}</Text>
                  </View>
                  <TouchableOpacity onPress={() => openEdit(med)} style={{ padding: 4 }}>
                    <Ionicons name="pencil" size={16} color={colors.ink3} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => deleteMed(med.id)} style={{ padding: 4 }}>
                    <Ionicons name="trash-outline" size={16} color={colors.rose} />
                  </TouchableOpacity>
                </View>

                {/* Dose progress */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 }}>
                  <View style={m.doseBar}>
                    <View style={[m.doseFill, { width: `${total > 0 ? (taken / total) * 100 : 0}%`, backgroundColor: med.color }]} />
                  </View>
                  <Text style={[m.doseTxt, done && { color: colors.green }]}>{taken}/{total}</Text>
                </View>

                <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                  <TouchableOpacity
                    style={[m.doseBtn, { backgroundColor: med.color + '22', flex: 1 }]}
                    onPress={() => incrementDose(med.id, total)}
                    disabled={done}
                  >
                    <Text style={[m.doseBtnTxt, { color: med.color }]}>{done ? 'All taken ✓' : 'Mark taken'}</Text>
                  </TouchableOpacity>
                  {taken > 0 && (
                    <TouchableOpacity style={m.undoBtn} onPress={() => undoDose(med.id)}>
                      <Ionicons name="arrow-undo" size={16} color={colors.ink3} />
                    </TouchableOpacity>
                  )}
                </View>

                {med.notes ? <Text style={m.medNotes}>{med.notes}</Text> : null}
              </View>
            );
          })}

          <TouchableOpacity style={m.primaryBtn} onPress={openAdd}>
            <Text style={m.primaryBtnTxt}>+ Add Medication</Text>
          </TouchableOpacity>
          <View style={{ height: 24 }} />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

// ── Intermittent Fasting ──────────────────────────────────────────────────────
const IF_MODES = [
  { id: '12:12', label: '12:12', fasting: 12, eating: 12, desc: 'Beginner friendly' },
  { id: '16:8',  label: '16:8',  fasting: 16, eating: 8,  desc: 'Most popular' },
  { id: '18:6',  label: '18:6',  fasting: 18, eating: 6,  desc: 'Intermediate' },
  { id: '20:4',  label: '20:4',  fasting: 20, eating: 4,  desc: 'Advanced' },
  { id: '23:1',  label: 'OMAD',  fasting: 23, eating: 1,  desc: 'One meal a day' },
];

interface FastingRecord { startTime: string; endTime: string; mode: string; completed: boolean; }
interface FastingState {
  mode: string;
  active: boolean;
  startTime: string | null;
  history: FastingRecord[];
}

function FastingModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { email } = useAuthStore();
  const FASTING_KEY = `dagnara_fasting_${email ?? 'anon'}`;

  const [state, setState] = useState<FastingState>({ mode: '16:8', active: false, startTime: null, history: [] });
  const [elapsed, setElapsed] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!visible) return;
    AsyncStorage.getItem(FASTING_KEY).then((raw) => {
      if (raw) setState(JSON.parse(raw));
    });
  }, [visible]);

  useEffect(() => {
    if (!state.active || !state.startTime) { clearInterval(intervalRef.current!); return; }
    function tick() { setElapsed(Date.now() - new Date(state.startTime!).getTime()); }
    tick();
    intervalRef.current = setInterval(tick, 1000);
    return () => clearInterval(intervalRef.current!);
  }, [state.active, state.startTime]);

  function save(next: FastingState) {
    setState(next);
    AsyncStorage.setItem(FASTING_KEY, JSON.stringify(next));
  }

  function toggleFast() {
    const modeInfo = IF_MODES.find(m => m.id === state.mode)!;
    if (state.active) {
      const endTime = new Date().toISOString();
      const duration = elapsed / 3600000;
      const completed = duration >= modeInfo.fasting;
      const record: FastingRecord = { startTime: state.startTime!, endTime, mode: state.mode, completed };
      save({ ...state, active: false, startTime: null, history: [record, ...state.history].slice(0, 14) });
      setElapsed(0);
    } else {
      save({ ...state, active: true, startTime: new Date().toISOString() });
    }
  }

  const modeInfo = IF_MODES.find(m => m.id === state.mode) ?? IF_MODES[1];
  const fastingMs = modeInfo.fasting * 3600000;
  const eatingMs = modeInfo.eating * 3600000;
  const progress = Math.min(1, elapsed / fastingMs);
  const progressPct = Math.round(progress * 100);
  const elapsedHrs = elapsed / 3600000;
  const remainingHrs = Math.max(0, modeInfo.fasting - elapsedHrs);
  const inEatingWindow = state.active && elapsedHrs >= modeInfo.fasting;
  const statusColor = inEatingWindow ? colors.green : state.active ? colors.purple : colors.ink3;

  // Computed times
  const fastEndIso = state.startTime
    ? new Date(new Date(state.startTime).getTime() + fastingMs).toISOString() : null;
  const eatEndIso = state.startTime
    ? new Date(new Date(state.startTime).getTime() + fastingMs + eatingMs).toISOString() : null;

  // Weekly stats
  const oneWeekAgo = Date.now() - 7 * 24 * 3600000;
  const weekFasts = state.history.filter(r => new Date(r.endTime).getTime() > oneWeekAgo);
  const weekCompleted = weekFasts.filter(r => r.completed).length;
  const longestFastHrs = state.history.length > 0
    ? Math.max(...state.history.map(r => (new Date(r.endTime).getTime() - new Date(r.startTime).getTime()) / 3600000))
    : 0;

  function fmtHM(hrs: number) {
    const h = Math.floor(hrs);
    const mm = Math.floor((hrs - h) * 60);
    return `${h}h ${String(mm).padStart(2, '0')}m`;
  }

  const strokeDashoffset = RING_CIRCUMFERENCE * (1 - progress);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['bottom']}>
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.line }}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="close" size={24} color={colors.ink2} />
          </TouchableOpacity>
          <Text style={{ flex: 1, textAlign: 'center', fontSize: fontSize.md, fontWeight: '700', color: colors.ink }}>Intermittent Fasting</Text>
          <View style={{ width: 24 }} />
        </View>

        <ScrollView contentContainerStyle={{ padding: spacing.md, gap: spacing.md }} showsVerticalScrollIndicator={false}>
          {/* Mode selector */}
          <View style={{ gap: spacing.xs }}>
            <Text style={{ fontSize: fontSize.xs, fontWeight: '700', color: colors.ink3, letterSpacing: 1.1 }}>FASTING PROTOCOL</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.xs }}>
              {IF_MODES.map((m) => {
                const sel = state.mode === m.id;
                return (
                  <TouchableOpacity
                    key={m.id}
                    onPress={() => { if (!state.active) save({ ...state, mode: m.id }); }}
                    style={{ backgroundColor: sel ? colors.purpleTint : colors.layer1, borderWidth: 1, borderColor: sel ? colors.line3 : colors.line, borderRadius: radius.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, alignItems: 'center', minWidth: 72 }}
                  >
                    <Text style={{ fontSize: fontSize.md, fontWeight: '800', color: sel ? colors.purple : colors.ink }}>{m.label}</Text>
                    <Text style={{ fontSize: fontSize.xs, color: sel ? colors.purple : colors.ink3, marginTop: 2 }}>{m.desc}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* SVG Timer ring */}
          <View style={{ alignItems: 'center', paddingVertical: spacing.sm }}>
            {/* Phase badge */}
            <View style={{
              backgroundColor: inEatingWindow ? colors.green + '22' : state.active ? colors.purple + '22' : colors.line,
              borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
              marginBottom: spacing.md, borderWidth: 1,
              borderColor: inEatingWindow ? colors.green + '55' : state.active ? colors.purple + '55' : colors.line2,
            }}>
              <Text style={{ fontSize: fontSize.xs, fontWeight: '800', letterSpacing: 1.2, color: inEatingWindow ? colors.green : state.active ? colors.purple : colors.ink3 }}>
                {inEatingWindow ? 'EATING WINDOW' : state.active ? 'FASTING' : 'READY'}
              </Text>
            </View>

            <View style={{ width: RING_SIZE, height: RING_SIZE, alignItems: 'center', justifyContent: 'center' }}>
              <Svg width={RING_SIZE} height={RING_SIZE} viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`} style={{ position: 'absolute' }}>
                <Circle
                  cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={RING_R}
                  stroke={colors.line} strokeWidth={RING_STROKE} fill="none"
                />
                {state.active && (
                  <Circle
                    cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={RING_R}
                    stroke={statusColor} strokeWidth={RING_STROKE} fill="none"
                    strokeDasharray={RING_CIRCUMFERENCE}
                    strokeDashoffset={strokeDashoffset}
                    strokeLinecap="round"
                    rotation="-90"
                    origin={`${RING_SIZE / 2}, ${RING_SIZE / 2}`}
                  />
                )}
              </Svg>
              <View style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: state.active ? 42 : 36, fontWeight: '800', color: statusColor, fontVariant: ['tabular-nums'] }}>
                  {state.active ? `${progressPct}%` : '—'}
                </Text>
                <Text style={{ fontSize: fontSize.xs, color: colors.ink3, marginTop: 4 }}>
                  {state.active ? (inEatingWindow ? `${fmtHM(elapsedHrs - modeInfo.fasting)} eaten` : `${fmtHM(elapsedHrs)} fasted`) : 'Not active'}
                </Text>
              </View>
            </View>

            {/* Time stats row */}
            {state.active && (
              <View style={{ marginTop: spacing.md, flexDirection: 'row', gap: spacing.lg }}>
                <View style={{ alignItems: 'center' }}>
                  <Text style={{ fontSize: fontSize.md, fontWeight: '800', color: colors.purple, fontVariant: ['tabular-nums'] }}>{fmtHM(elapsedHrs)}</Text>
                  <Text style={{ fontSize: fontSize.xs, color: colors.ink3, marginTop: 2 }}>Fasted</Text>
                </View>
                {!inEatingWindow && (
                  <View style={{ alignItems: 'center' }}>
                    <Text style={{ fontSize: fontSize.md, fontWeight: '800', color: colors.honey, fontVariant: ['tabular-nums'] }}>{fmtHM(remainingHrs)}</Text>
                    <Text style={{ fontSize: fontSize.xs, color: colors.ink3, marginTop: 2 }}>Remaining</Text>
                  </View>
                )}
                <View style={{ alignItems: 'center' }}>
                  <Text style={{ fontSize: fontSize.md, fontWeight: '800', color: colors.teal }}>
                    {inEatingWindow ? fmtHM(Math.max(0, modeInfo.fasting + modeInfo.eating - elapsedHrs)) : `${modeInfo.eating}h`}
                  </Text>
                  <Text style={{ fontSize: fontSize.xs, color: colors.ink3, marginTop: 2 }}>
                    {inEatingWindow ? 'Eating left' : 'Eating window'}
                  </Text>
                </View>
              </View>
            )}

            {/* Scheduled times */}
            {state.active && fastEndIso && eatEndIso && (
              <View style={{ marginTop: spacing.md, flexDirection: 'row', gap: spacing.sm }}>
                <View style={{ flex: 1, backgroundColor: colors.layer1, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, padding: spacing.sm, alignItems: 'center' }}>
                  <Text style={{ fontSize: fontSize.xs, color: colors.ink3 }}>Started</Text>
                  <Text style={{ fontSize: fontSize.sm, fontWeight: '700', color: colors.ink, marginTop: 2 }}>{fmtTime(state.startTime!)}</Text>
                </View>
                <View style={{ flex: 1, backgroundColor: colors.layer1, borderRadius: radius.md, borderWidth: 1, borderColor: inEatingWindow ? colors.green + '44' : colors.line, padding: spacing.sm, alignItems: 'center' }}>
                  <Text style={{ fontSize: fontSize.xs, color: colors.ink3 }}>Eat from</Text>
                  <Text style={{ fontSize: fontSize.sm, fontWeight: '700', color: inEatingWindow ? colors.green : colors.ink, marginTop: 2 }}>{fmtTime(fastEndIso)}</Text>
                </View>
                <View style={{ flex: 1, backgroundColor: colors.layer1, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, padding: spacing.sm, alignItems: 'center' }}>
                  <Text style={{ fontSize: fontSize.xs, color: colors.ink3 }}>Window ends</Text>
                  <Text style={{ fontSize: fontSize.sm, fontWeight: '700', color: colors.ink, marginTop: 2 }}>{fmtTime(eatEndIso)}</Text>
                </View>
              </View>
            )}
          </View>

          {/* Start / Stop button */}
          <TouchableOpacity onPress={toggleFast} activeOpacity={0.8} style={{ borderRadius: radius.md, overflow: 'hidden' }}>
            {state.active ? (
              <View style={{ backgroundColor: colors.rose + '18', borderRadius: radius.md, borderWidth: 1, borderColor: colors.rose + '44', paddingVertical: spacing.md, alignItems: 'center' }}>
                <Text style={{ fontSize: fontSize.md, fontWeight: '700', color: colors.rose }}>End Fast</Text>
              </View>
            ) : (
              <LinearGradient colors={[colors.purple, colors.purpleGlow]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ paddingVertical: spacing.md, alignItems: 'center', borderRadius: radius.md }}>
                <Text style={{ fontSize: fontSize.md, fontWeight: '700', color: colors.white }}>Start Fast</Text>
              </LinearGradient>
            )}
          </TouchableOpacity>

          {/* Weekly stats */}
          {state.history.length > 0 && (
            <View style={{ gap: spacing.sm }}>
              <Text style={{ fontSize: fontSize.xs, fontWeight: '700', color: colors.ink3, letterSpacing: 1.1 }}>THIS WEEK</Text>
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                <View style={{ flex: 1, backgroundColor: colors.layer1, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, padding: spacing.md, alignItems: 'center' }}>
                  <Text style={{ fontSize: fontSize.xl, fontWeight: '800', color: colors.purple }}>{weekFasts.length}</Text>
                  <Text style={{ fontSize: fontSize.xs, color: colors.ink3, marginTop: 2 }}>Fasts</Text>
                </View>
                <View style={{ flex: 1, backgroundColor: colors.layer1, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, padding: spacing.md, alignItems: 'center' }}>
                  <Text style={{ fontSize: fontSize.xl, fontWeight: '800', color: colors.green }}>{weekCompleted}</Text>
                  <Text style={{ fontSize: fontSize.xs, color: colors.ink3, marginTop: 2 }}>Goals met</Text>
                </View>
                <View style={{ flex: 1, backgroundColor: colors.layer1, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, padding: spacing.md, alignItems: 'center' }}>
                  <Text style={{ fontSize: fontSize.xl, fontWeight: '800', color: colors.teal }}>{Math.round(longestFastHrs)}h</Text>
                  <Text style={{ fontSize: fontSize.xs, color: colors.ink3, marginTop: 2 }}>Best fast</Text>
                </View>
              </View>
            </View>
          )}

          {/* History */}
          {state.history.length > 0 && (
            <View style={{ gap: spacing.sm }}>
              <Text style={{ fontSize: fontSize.xs, fontWeight: '700', color: colors.ink3, letterSpacing: 1.1 }}>RECENT FASTS</Text>
              {state.history.slice(0, 7).map((rec, i) => {
                const dur = (new Date(rec.endTime).getTime() - new Date(rec.startTime).getTime()) / 3600000;
                const mInfo = IF_MODES.find(m => m.id === rec.mode) ?? IF_MODES[1];
                return (
                  <View key={i} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.layer1, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, padding: spacing.md, gap: spacing.sm }}>
                    <Text style={{ fontSize: fontSize.md }}>{rec.completed ? '✅' : '⭕'}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: fontSize.sm, fontWeight: '600', color: colors.ink }}>{mInfo.label} — {fmtHM(dur)}</Text>
                      <Text style={{ fontSize: fontSize.xs, color: colors.ink3 }}>{new Date(rec.startTime).toLocaleDateString()}</Text>
                    </View>
                    <View style={{ backgroundColor: rec.completed ? colors.green + '22' : colors.honey + '22', borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 3 }}>
                      <Text style={{ fontSize: fontSize.xs, fontWeight: '700', color: rec.completed ? colors.green : colors.honey }}>{rec.completed ? 'Goal met' : 'Partial'}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          <View style={{ height: 32 }} />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

// ── AI Nutrition Coach Modal ──────────────────────────────────────────────────
interface ChatMsg { id: string; role: 'user' | 'assistant'; text: string; isError?: boolean; }

const COACH_STARTERS = [
  'What should I eat today?',
  'How do I hit my protein goal?',
  'Give me a high-protein breakfast',
  'Why am I not losing weight?',
];

function CoachModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { email, profile } = useAuthStore();
  const { calorieGoal, weightGoal, macroPcts } = useAppStore();
  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [retryMsg, setRetryMsg] = useState('');
  const scrollRef = useRef<ScrollView>(null);

  const userContext = [
    profile.name ? `Name: ${profile.name}` : null,
    `Daily calorie goal: ${calorieGoal} kcal`,
    `Weight goal: ${weightGoal}`,
    `Macros: ${macroPcts.protein}% protein, ${macroPcts.carbs}% carbs, ${macroPcts.fat}% fat`,
  ].filter(Boolean).join('\n');

  function buildErrText(err: unknown): string {
    const code = err instanceof Error ? err.message : '';
    if (code === 'NETWORK_ERROR') return 'Could not reach server. Check your connection and try again.';
    if (code === 'SETUP_REQUIRED') return 'AI coach is not configured. Set EXPO_PUBLIC_API_URL in your .env file.';
    if (code === 'SERVER_ERROR') return 'Server error. Please try again in a moment.';
    return code || 'Something went wrong. Please try again.';
  }

  async function send(text?: string) {
    const msg = (text ?? input).trim();
    if (!msg || loading) return;
    const userMsg: ChatMsg = { id: Date.now().toString(), role: 'user', text: msg };
    const next = [...msgs.filter((m) => !m.isError), userMsg];
    setMsgs(next);
    setInput('');
    setRetryMsg(msg);
    setLoading(true);
    try {
      const apiMsgs = next.map((m) => ({ role: m.role, content: m.text }));
      const { reply } = await coachMessage(apiMsgs, userContext, email ?? undefined);
      setMsgs((prev) => [...prev, { id: Date.now().toString() + 'r', role: 'assistant', text: reply }]);
      setRetryMsg('');
    } catch (err: unknown) {
      setMsgs((prev) => [...prev, { id: Date.now().toString() + 'e', role: 'assistant', text: buildErrText(err), isError: true }]);
    } finally {
      setLoading(false);
    }
  }

  async function retry() {
    if (!retryMsg || loading) return;
    const cleanMsgs = msgs.filter((m) => !m.isError);
    const userMsg: ChatMsg = { id: Date.now().toString(), role: 'user', text: retryMsg };
    const next = [...cleanMsgs, userMsg];
    setMsgs(next);
    setLoading(true);
    try {
      const apiMsgs = next.map((m) => ({ role: m.role, content: m.text }));
      const { reply } = await coachMessage(apiMsgs, userContext, email ?? undefined);
      setMsgs((prev) => [...prev, { id: Date.now().toString() + 'r', role: 'assistant', text: reply }]);
      setRetryMsg('');
    } catch (err: unknown) {
      setMsgs((prev) => [...prev, { id: Date.now().toString() + 'e', role: 'assistant', text: buildErrText(err), isError: true }]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (msgs.length > 0 || loading) {
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 150);
    }
  }, [msgs.length, loading]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['bottom']}>
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.line }}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="chevron-down" size={26} color={colors.ink2} />
          </TouchableOpacity>
          <Text style={{ flex: 1, textAlign: 'center', fontSize: fontSize.md, fontWeight: '700', color: colors.ink }}>AI Nutrition Coach</Text>
          <View style={{ width: 26 }} />
        </View>

        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView
            ref={scrollRef}
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: spacing.md, gap: spacing.sm, flexGrow: 1 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {msgs.length === 0 && (
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, paddingTop: spacing.xl }}>
                <Text style={{ fontSize: fontSize['2xl'] }}>🤖</Text>
                <Text style={{ fontSize: fontSize.md, fontWeight: '700', color: colors.ink, textAlign: 'center' }}>Your AI Nutrition Coach</Text>
                <Text style={{ fontSize: fontSize.sm, color: colors.ink3, textAlign: 'center', maxWidth: 280 }}>
                  Ask anything about nutrition, macros, meal ideas, or your goals.
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, justifyContent: 'center', marginTop: spacing.sm }}>
                  {COACH_STARTERS.map((q) => (
                    <TouchableOpacity
                      key={q}
                      onPress={() => send(q)}
                      style={{ backgroundColor: colors.purpleTint, borderWidth: 1, borderColor: colors.line3, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.xs }}
                    >
                      <Text style={{ fontSize: fontSize.xs, color: colors.purple }}>{q}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {msgs.map((msg) => (
              <View key={msg.id} style={{ alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                <View style={{
                  maxWidth: '82%',
                  backgroundColor: msg.isError ? colors.rose + '18' : msg.role === 'user' ? colors.purple : colors.layer1,
                  borderRadius: radius.md,
                  padding: spacing.sm,
                  borderWidth: msg.role === 'user' ? 0 : 1,
                  borderColor: msg.isError ? colors.rose + '44' : colors.line2,
                }}>
                  <Text style={{ fontSize: fontSize.sm, color: msg.isError ? colors.rose : msg.role === 'user' ? colors.white : colors.ink, lineHeight: 20 }}>
                    {msg.text}
                  </Text>
                </View>
                {/* Fix #2: retry button below error bubbles */}
                {msg.isError && retryMsg && (
                  <TouchableOpacity onPress={retry} disabled={loading} style={{ marginTop: spacing.xs, paddingHorizontal: spacing.sm }}>
                    <Text style={{ fontSize: fontSize.xs, color: colors.purple, fontWeight: '600' }}>↺ Retry</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))}

            {loading && (
              <View style={{ alignItems: 'flex-start' }}>
                <View style={{ backgroundColor: colors.layer1, borderRadius: radius.md, padding: spacing.sm, borderWidth: 1, borderColor: colors.line2 }}>
                  <Text style={{ fontSize: fontSize.sm, color: colors.ink3 }}>Thinking...</Text>
                </View>
              </View>
            )}
          </ScrollView>

          {/* Input row */}
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, padding: spacing.md, borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.bg }}>
            <TextInput
              style={{ flex: 1, backgroundColor: colors.layer2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line2, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, color: colors.ink, fontSize: fontSize.sm, maxHeight: 100 }}
              value={input}
              onChangeText={setInput}
              placeholder="Ask your coach..."
              placeholderTextColor={colors.ink3}
              multiline
              blurOnSubmit={false}
            />
            <TouchableOpacity
              onPress={() => send()}
              disabled={!input.trim() || loading}
              style={{ width: 44, height: 44, borderRadius: radius.md, backgroundColor: input.trim() && !loading ? colors.purple : colors.layer2, alignItems: 'center', justifyContent: 'center' }}
            >
              <Ionicons name="send" size={18} color={input.trim() && !loading ? colors.white : colors.ink3} />
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

// ── Grocery Planner ───────────────────────────────────────────────────────────
const GROCERY_CATS = [
  { id: 'produce',  icon: '🥦', label: 'Produce' },
  { id: 'protein',  icon: '🥩', label: 'Proteins' },
  { id: 'dairy',    icon: '🧀', label: 'Dairy' },
  { id: 'grains',   icon: '🌾', label: 'Grains' },
  { id: 'frozen',   icon: '❄️', label: 'Frozen' },
  { id: 'drinks',   icon: '🧃', label: 'Drinks' },
  { id: 'snacks',   icon: '🍿', label: 'Snacks' },
  { id: 'other',    icon: '📦', label: 'Other' },
];

interface GroceryItem {
  id: string;
  name: string;
  qty: string;
  category: string;
  checked: boolean;
}

function GroceryModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { email } = useAuthStore();
  const GROCERY_KEY = `dagnara_grocery_${email ?? 'anon'}`;

  const [items, setItems] = useState<GroceryItem[]>([]);
  const [newName, setNewName] = useState('');
  const [newQty, setNewQty] = useState('');
  const [newCat, setNewCat] = useState('produce');

  useEffect(() => {
    if (!visible) return;
    AsyncStorage.getItem(GROCERY_KEY).then(raw => { if (raw) setItems(JSON.parse(raw)); });
  }, [visible]);

  function save(next: GroceryItem[]) {
    setItems(next);
    AsyncStorage.setItem(GROCERY_KEY, JSON.stringify(next));
  }

  function addItem() {
    if (!newName.trim()) return;
    save([...items, { id: `${Date.now()}`, name: newName.trim(), qty: newQty.trim(), category: newCat, checked: false }]);
    setNewName('');
    setNewQty('');
  }

  const checkedCount = items.filter(i => i.checked).length;
  const pct = items.length > 0 ? checkedCount / items.length : 0;
  const grouped = GROCERY_CATS
    .map(cat => ({ ...cat, items: items.filter(i => i.category === cat.id) }))
    .filter(g => g.items.length > 0);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={m.sheet} edges={['bottom']}>
        {/* Header */}
        <View style={m.sheetHeader}>
          <TouchableOpacity onPress={onClose} style={{ padding: spacing.xs }}>
            <Ionicons name="chevron-down" size={22} color={colors.ink2} />
          </TouchableOpacity>
          <Text style={m.sheetTitle}>Grocery List</Text>
          <TouchableOpacity onPress={() => save(items.filter(i => !i.checked))} disabled={checkedCount === 0} style={{ padding: spacing.xs }}>
            <Text style={{ fontSize: fontSize.sm, fontWeight: '600', color: checkedCount > 0 ? colors.green : colors.ink3 }}>Clear done</Text>
          </TouchableOpacity>
        </View>

        {/* Progress */}
        {items.length > 0 && (
          <View style={{ paddingHorizontal: spacing.md, paddingTop: spacing.xs, paddingBottom: spacing.sm, gap: 5 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: fontSize.sm, color: colors.ink3 }}>
                <Text style={{ color: colors.green, fontWeight: '700' }}>{checkedCount}</Text>/{items.length} items
              </Text>
              <Text style={{ fontSize: fontSize.sm, fontWeight: '700', color: colors.green }}>{Math.round(pct * 100)}%</Text>
            </View>
            <View style={{ height: 6, backgroundColor: colors.layer2, borderRadius: radius.pill, overflow: 'hidden' }}>
              <View style={{ height: '100%', width: `${Math.round(pct * 100)}%` as any, backgroundColor: colors.green, borderRadius: radius.pill }} />
            </View>
          </View>
        )}

        {/* Add item */}
        <View style={{ paddingHorizontal: spacing.md, paddingBottom: spacing.sm, gap: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.line }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}>
            <View style={{ flexDirection: 'row', gap: spacing.xs, paddingVertical: 2 }}>
              {GROCERY_CATS.map(cat => (
                <TouchableOpacity key={cat.id} onPress={() => setNewCat(cat.id)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radius.pill, borderWidth: 1, backgroundColor: newCat === cat.id ? colors.purpleTint : colors.layer2, borderColor: newCat === cat.id ? colors.line3 : colors.line2 }}>
                  <Text style={{ fontSize: fontSize.sm }}>{cat.icon}</Text>
                  <Text style={{ fontSize: fontSize.xs, fontWeight: '600', color: newCat === cat.id ? colors.lavender : colors.ink3 }}>{cat.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <TextInput
              style={{ flex: 1, backgroundColor: colors.layer2, borderWidth: 1, borderColor: colors.line2, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, color: colors.ink, fontSize: fontSize.base }}
              placeholder="Item name…"
              placeholderTextColor={colors.ink3}
              value={newName}
              onChangeText={setNewName}
              returnKeyType="next"
            />
            <TextInput
              style={{ width: 76, backgroundColor: colors.layer2, borderWidth: 1, borderColor: colors.line2, borderRadius: radius.md, paddingHorizontal: spacing.sm, paddingVertical: spacing.sm, color: colors.ink, fontSize: fontSize.base, textAlign: 'center' }}
              placeholder="Qty"
              placeholderTextColor={colors.ink3}
              value={newQty}
              onChangeText={setNewQty}
              returnKeyType="done"
              onSubmitEditing={addItem}
            />
            <TouchableOpacity onPress={addItem} disabled={!newName.trim()} style={{ borderRadius: radius.md, overflow: 'hidden' }}>
              <LinearGradient
                colors={!newName.trim() ? [colors.layer2, colors.layer2] : [colors.purple, colors.purpleGlow]}
                start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
                style={{ width: 48, height: 48, justifyContent: 'center', alignItems: 'center' }}>
                <Ionicons name="add" size={24} color={!newName.trim() ? colors.ink3 : colors.ink} />
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>

        {/* List */}
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing.md, gap: spacing.lg }} keyboardShouldPersistTaps="handled">
          {grouped.length === 0 && (
            <View style={{ alignItems: 'center', paddingTop: spacing.xl + spacing.xl, gap: spacing.md }}>
              <Text style={{ fontSize: fontSize.xl + fontSize.lg }}>🛒</Text>
              <Text style={{ color: colors.ink3, fontSize: fontSize.base, textAlign: 'center', lineHeight: 22 }}>
                Your list is empty{'\n'}Add your first item above
              </Text>
            </View>
          )}
          {grouped.map(group => (
            <View key={group.id} style={{ gap: spacing.xs }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingBottom: 4 }}>
                <Text style={{ fontSize: fontSize.sm }}>{group.icon}</Text>
                <Text style={{ fontSize: fontSize.xs, fontWeight: '700', color: colors.ink3, letterSpacing: 1.1, textTransform: 'uppercase' }}>{group.label}</Text>
              </View>
              {group.items.map(item => (
                <View key={item.id} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: item.checked ? colors.layer1 : colors.layer2, borderWidth: 1, borderColor: item.checked ? colors.line : colors.line2, borderRadius: radius.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.md }}>
                  <TouchableOpacity
                    onPress={() => save(items.map(i => i.id === item.id ? { ...i, checked: !i.checked } : i))}
                    style={{ width: 24, height: 24, borderRadius: radius.pill, borderWidth: 2, borderColor: item.checked ? colors.green : colors.line3, backgroundColor: item.checked ? colors.green : colors.bg, alignItems: 'center', justifyContent: 'center' }}>
                    {item.checked && <Ionicons name="checkmark" size={fontSize.sm} color={colors.bg} />}
                  </TouchableOpacity>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: fontSize.base, fontWeight: '500', color: item.checked ? colors.ink3 : colors.ink, textDecorationLine: item.checked ? 'line-through' : 'none' }}>{item.name}</Text>
                    {!!item.qty && <Text style={{ fontSize: fontSize.xs, color: colors.ink3, marginTop: 1 }}>{item.qty}</Text>}
                  </View>
                  <TouchableOpacity onPress={() => save(items.filter(i => i.id !== item.id))} style={{ padding: spacing.xs }}>
                    <Ionicons name="close" size={fontSize.md} color={colors.ink3} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          ))}
          <View style={{ height: spacing.xl }} />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

// ── Main Programs Screen ──────────────────────────────────────────────────────
export default function ProgramsScreen() {
  const { programs, setProgram, setMessagesOpen, hasUnread } = useAppStore();
  const [qsVisible, setQsVisible] = useState(false);
  const [qdVisible, setQdVisible] = useState(false);
  const [pillVisible, setPillVisible] = useState(false);
  const [fastingVisible, setFastingVisible] = useState(false);
  const [coachVisible, setCoachVisible] = useState(false);
  const [groceryVisible, setGroceryVisible] = useState(false);

  function openProgram(id: string) {
    if (id === 'quit_smoking')          { setQsVisible(true);      return; }
    if (id === 'quit_drinking')         { setQdVisible(true);      return; }
    if (id === 'pill_reminder')         { setPillVisible(true);    return; }
    if (id === 'intermittent_fasting')  { setFastingVisible(true); return; }
    if (id === 'ai_coach')              { setCoachVisible(true);   return; }
  }

  return (
    <SafeAreaView style={st.safe} edges={['top']}>
      <View style={st.header}>
        <Text style={st.title}>Programs</Text>
        <View style={{ flexDirection: 'row', gap: 4 }}>
          <TouchableOpacity style={st.iconBtn} onPress={() => setMessagesOpen(true)}>
            <Ionicons name="notifications-outline" size={22} color={colors.ink2} />
            {hasUnread && <View style={st.notifDot} />}
          </TouchableOpacity>
          <TouchableOpacity style={st.iconBtn} onPress={() => router.push('/(tabs)/profile')}>
            <Ionicons name="person-outline" size={22} color={colors.ink2} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={st.scroll} showsVerticalScrollIndicator={false}>
        {/* Grocery Planner card */}
        <TouchableOpacity style={st.card} onPress={() => setGroceryVisible(true)} activeOpacity={0.75}>
          <View style={[st.iconWrap, { backgroundColor: colors.green + '22' }]}>
            <Text style={st.progIcon}>🛒</Text>
          </View>
          <View style={st.cardBody}>
            <Text style={st.progName}>Grocery Planner</Text>
            <Text style={st.progDesc} numberOfLines={1}>Build your weekly shopping list</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.ink3} />
        </TouchableOpacity>

        {/* Intermittent Fasting card (always first) */}
        <TouchableOpacity style={st.card} onPress={() => setFastingVisible(true)} activeOpacity={0.75}>
          <View style={[st.iconWrap, { backgroundColor: colors.teal + '22' }]}>
            <Text style={st.progIcon}>⏱️</Text>
          </View>
          <View style={st.cardBody}>
            <Text style={st.progName}>Intermittent Fasting</Text>
            <Text style={st.progDesc} numberOfLines={1}>16:8, 18:6, 20:4, OMAD timer</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.ink3} />
        </TouchableOpacity>

        {/* AI Nutrition Coach card */}
        <TouchableOpacity style={st.card} onPress={() => setCoachVisible(true)} activeOpacity={0.75}>
          <View style={[st.iconWrap, { backgroundColor: colors.purple + '22' }]}>
            <Text style={st.progIcon}>🤖</Text>
          </View>
          <View style={st.cardBody}>
            <Text style={st.progName}>AI Nutrition Coach</Text>
            <Text style={st.progDesc} numberOfLines={1}>Personalized nutrition & macro advice</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.ink3} />
        </TouchableOpacity>

        {PROGRAMS.map((prog) => {
          const isActive = programs[prog.id] ?? false;
          const hasDetail = ['quit_smoking', 'quit_drinking', 'pill_reminder'].includes(prog.id);
          return (
            <TouchableOpacity
              key={prog.id}
              style={st.card}
              onPress={() => hasDetail ? openProgram(prog.id) : void setProgram(prog.id, !isActive)}
              activeOpacity={0.75}
            >
              <View style={[st.iconWrap, { backgroundColor: prog.color + '22' }]}>
                <Text style={st.progIcon}>{prog.icon}</Text>
              </View>
              <View style={st.cardBody}>
                <Text style={st.progName}>{prog.name}</Text>
                <Text style={st.progDesc} numberOfLines={1}>{prog.description}</Text>
              </View>
              {hasDetail ? (
                <Ionicons name="chevron-forward" size={18} color={colors.ink3} />
              ) : (
                <Switch
                  value={isActive}
                  onValueChange={(v) => void setProgram(prog.id, v)}
                  thumbColor={isActive ? prog.color : colors.ink3}
                  trackColor={{ false: colors.line2, true: prog.color + '44' }}
                />
              )}
            </TouchableOpacity>
          );
        })}
        <View style={{ height: 32 }} />
      </ScrollView>

      <QuitSmokingModal  visible={qsVisible}      onClose={() => setQsVisible(false)} />
      <QuitDrinkingModal visible={qdVisible}      onClose={() => setQdVisible(false)} />
      <PillReminderModal visible={pillVisible}    onClose={() => setPillVisible(false)} />
      <FastingModal      visible={fastingVisible} onClose={() => setFastingVisible(false)} />
      <CoachModal        visible={coachVisible}   onClose={() => setCoachVisible(false)} />
      <GroceryModal      visible={groceryVisible} onClose={() => setGroceryVisible(false)} />
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const st = StyleSheet.create({
  safe:     { flex: 1, backgroundColor: colors.bg },
  header:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  title:    { fontSize: fontSize.xl, fontWeight: '800', color: colors.ink },
  iconBtn:  { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  notifDot: { position: 'absolute', top: 8, right: 6, width: 6, height: 6, borderRadius: 3, backgroundColor: colors.rose },
  scroll:   { padding: spacing.md, gap: spacing.sm },
  card:     { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.layer1, borderWidth: 1, borderColor: colors.line2, borderRadius: radius.lg, padding: spacing.md },
  iconWrap: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  progIcon: { fontSize: 22 },
  cardBody: { flex: 1 },
  progName: { fontSize: fontSize.sm, fontWeight: '700', color: colors.ink },
  progDesc: { fontSize: fontSize.xs, color: colors.ink3, marginTop: 2 },
});

// Modal shared styles
const m = StyleSheet.create({
  sheet:       { flex: 1, backgroundColor: colors.bg },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.line },
  sheetTitle:  { fontSize: fontSize.md, fontWeight: '700', color: colors.ink },

  timerCard:  { alignItems: 'center', backgroundColor: colors.layer1, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.line2 },
  timerLabel: { fontSize: fontSize.sm, color: colors.ink3 },
  timerValue: { fontSize: fontSize['2xl'], fontWeight: '800', color: colors.ink, marginVertical: 4, fontVariant: ['tabular-nums'] },
  timerSub:   { fontSize: fontSize.xs, color: colors.ink3 },

  statsRow:  { flexDirection: 'row', gap: spacing.sm },
  statCard:  { flex: 1, alignItems: 'center', backgroundColor: colors.layer1, borderRadius: radius.md, padding: spacing.sm, borderWidth: 1, borderColor: colors.line },
  statVal:   { fontSize: fontSize.md, fontWeight: '800', color: colors.ink },
  statLbl:   { fontSize: fontSize.xs, color: colors.ink3, marginTop: 2, textAlign: 'center' },

  sectionTitle: { fontSize: fontSize.sm, fontWeight: '700', color: colors.ink3, textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 4 },

  achieveRow:    { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.layer1, borderRadius: radius.md, padding: spacing.sm, borderWidth: 1, borderColor: colors.line },
  achieveLocked: { opacity: 0.55 },
  achieveIcon:   { fontSize: 24, width: 32, textAlign: 'center' },
  achieveTitle:  { fontSize: fontSize.sm, fontWeight: '700', color: colors.ink },
  achieveDesc:   { fontSize: fontSize.xs, color: colors.ink3, marginTop: 1 },

  milestoneRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  milestoneDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.layer3, borderWidth: 1, borderColor: colors.line },
  milestoneIcon:{ fontSize: 16, width: 24, textAlign: 'center' },
  milestoneTxt: { fontSize: fontSize.xs, color: colors.ink2, flex: 1 },

  label:      { fontSize: fontSize.xs, color: colors.ink3, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  input:      { backgroundColor: colors.layer2, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.line2, color: colors.ink, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, fontSize: fontSize.sm },

  primaryBtn:    { backgroundColor: colors.purple, borderRadius: radius.md, alignItems: 'center', paddingVertical: 14 },
  primaryBtnTxt: { color: colors.white, fontWeight: '700', fontSize: fontSize.sm },
  dangerBtn:     { borderRadius: radius.md, alignItems: 'center', paddingVertical: 12, backgroundColor: 'rgba(244,63,94,0.12)', borderWidth: 1, borderColor: 'rgba(244,63,94,0.25)' },
  dangerBtnTxt:  { color: colors.rose, fontWeight: '600', fontSize: fontSize.sm },
  ghostBtn:      { borderRadius: radius.md, alignItems: 'center', paddingVertical: spacing.sm, backgroundColor: colors.layer1 },
  ghostBtnTxt:   { color: colors.ink2, fontSize: fontSize.sm },

  // Pill-specific
  medCard:   { backgroundColor: colors.layer1, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.line },
  medDot:    { width: 14, height: 14, borderRadius: 7 },
  medName:   { fontSize: fontSize.sm, fontWeight: '700', color: colors.ink },
  medDosage: { fontSize: fontSize.xs, color: colors.ink2, marginTop: 1 },
  medTimes:  { fontSize: fontSize.xs, color: colors.ink3, marginTop: 1 },
  medNotes:  { fontSize: fontSize.xs, color: colors.ink3, fontStyle: 'italic', marginTop: 6, paddingTop: 6, borderTopWidth: 1, borderTopColor: colors.line },
  doseBar:   { flex: 1, height: 6, backgroundColor: colors.layer2, borderRadius: 3, overflow: 'hidden' },
  doseFill:  { height: '100%', borderRadius: 3 },
  doseTxt:   { fontSize: fontSize.xs, color: colors.ink3, width: 30, textAlign: 'right' },
  doseBtn:   { borderRadius: radius.sm, alignItems: 'center', paddingVertical: 8 },
  doseBtnTxt:{ fontSize: fontSize.xs, fontWeight: '700' },
  undoBtn:   { backgroundColor: colors.layer1, borderRadius: radius.sm, paddingHorizontal: spacing.sm, justifyContent: 'center' },
  colorDot:  { width: 28, height: 28, borderRadius: 14 },
  emptyState:{ alignItems: 'center', paddingVertical: spacing.xl, gap: 8 },
  emptyIcon: { fontSize: 48 },
  emptyTitle:{ fontSize: fontSize.md, fontWeight: '700', color: colors.ink },
  emptyDesc: { fontSize: fontSize.sm, color: colors.ink3, textAlign: 'center' },
});
