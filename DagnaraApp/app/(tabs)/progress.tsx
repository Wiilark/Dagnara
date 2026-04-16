import { useState, useEffect, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Modal, TextInput, Alert, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Svg, { Circle, Defs, LinearGradient, Stop, G, Polyline, Text as SvgText } from 'react-native-svg';
import { useDiaryStore } from '../../src/store/diaryStore';
import { useAppStore } from '../../src/store/appStore';
import { useAuthStore } from '../../src/store/authStore';
import { formatWeight, parseWeight, weightUnit } from '../../src/lib/units';
import { colors, spacing, fontSize, radius } from '../../src/theme';

// ── Life Score Questions ──────────────────────────────────────────────────────
const LS_QUESTIONS = [
  { q: 'Whole fruit', hint: 'Fresh, frozen, or dried', emoji: '🍎', type: 'positive' },
  { q: 'Berries', hint: 'Strawberries, blueberries, etc.', emoji: '🫐', type: 'positive' },
  { q: 'Leafy green vegetables', hint: 'Spinach, kale, salad greens', emoji: '🥬', type: 'positive' },
  { q: 'Colourful vegetables', hint: 'Peppers, carrots, beetroot', emoji: '🌈', type: 'positive' },
  { q: 'Root vegetables', hint: 'Sweet potato, parsnip', emoji: '🥕', type: 'positive' },
  { q: 'Cruciferous vegetables', hint: 'Broccoli, cabbage, cauliflower', emoji: '🥦', type: 'positive' },
  { q: 'Plant-based protein', hint: 'Tofu, tempeh, legumes', emoji: '🌱', type: 'positive' },
  { q: 'Poultry', hint: 'Chicken, turkey', emoji: '🍗', type: 'positive' },
  { q: 'Fish / seafood', hint: 'Any fish or shellfish', emoji: '🐟', type: 'positive' },
  { q: 'Red meat', hint: 'Beef, pork, lamb', emoji: '🥩', type: 'negative' },
  { q: 'Processed meat', hint: 'Sausages, bacon, deli meat', emoji: '🌭', type: 'negative' },
  { q: 'Eggs', hint: 'Whole eggs, any style', emoji: '🥚', type: 'positive' },
  { q: 'Plain dairy', hint: 'Milk, plain yogurt, kefir', emoji: '🥛', type: 'positive' },
  { q: 'Flavoured sugary yogurt', hint: '', emoji: '🍦', type: 'negative' },
  { q: 'Cheese', hint: 'All types', emoji: '🧀', type: 'neutral' },
  { q: 'Healthy cooking oils', hint: 'Olive oil, avocado oil', emoji: '🫒', type: 'positive' },
  { q: 'Sugary cereal', hint: 'Frosted, honey-coated', emoji: '🥣', type: 'negative' },
  { q: 'Plain oats / whole grains', hint: 'Oatmeal, brown rice', emoji: '🌾', type: 'positive' },
  { q: 'Bread', hint: 'Any type', emoji: '🍞', type: 'neutral' },
  { q: 'Pastries / baked goods', hint: 'Cake, cookies, muffins', emoji: '🍰', type: 'negative' },
  { q: 'Nuts and seeds', hint: 'Almonds, walnuts, chia', emoji: '🥜', type: 'positive' },
  { q: 'Fast food', hint: 'Takeaway, fried food', emoji: '🍔', type: 'negative' },
  { q: 'Sugary drinks', hint: 'Soda, juice, energy drinks', emoji: '🥤', type: 'negative' },
  { q: 'Plain water', hint: '8+ glasses per day', emoji: '💧', type: 'positive' },
  { q: 'Legumes', hint: 'Lentils, chickpeas, beans', emoji: '🫘', type: 'positive' },
  { q: 'Exercise (any)', hint: 'Walking, cycling, sports', emoji: '🏃', type: 'positive' },
  { q: 'Vigorous exercise', hint: 'Running, HIIT, intense gym', emoji: '💪', type: 'positive' },
  { q: 'Strength training', hint: 'Weights, resistance bands', emoji: '🏋️', type: 'positive' },
  { q: 'Sitting >8 hours', hint: 'Desk work, screen time', emoji: '🪑', type: 'negative' },
  { q: 'Sleep 7-9 hours', hint: 'Quality uninterrupted sleep', emoji: '😴', type: 'positive' },
  { q: 'Felt stressed', hint: 'Work, relationships, finances', emoji: '😰', type: 'negative' },
  { q: 'Felt relaxed', hint: 'Calm, at ease', emoji: '😌', type: 'positive' },
  { q: 'Mindfulness / meditation', hint: 'Any mindfulness practice', emoji: '🧘', type: 'positive' },
  { q: 'Smoking', hint: 'Cigarettes, vaping', emoji: '🚬', type: 'negative' },
  { q: 'Alcohol', hint: 'Any alcoholic drinks', emoji: '🍺', type: 'negative' },
  { q: 'Ate breakfast', hint: 'Within 2 hrs of waking', emoji: '🌅', type: 'positive' },
  { q: 'Ate after 9 pm', hint: 'Late-night snacking', emoji: '🌙', type: 'negative' },
  { q: 'Cooked at home', hint: 'Prepared your own meal', emoji: '🍳', type: 'positive' },
  { q: 'Read food labels', hint: 'Checked ingredients/nutrition', emoji: '🔍', type: 'positive' },
  { q: 'Felt satisfied after meals', hint: 'Not overfull, not hungry', emoji: '😊', type: 'positive' },
  { q: 'Snacking between meals', hint: 'Unplanned snacks', emoji: '🍿', type: 'neutral' },
] as const;

const LS_LABELS = ['Never', 'Rarely', 'Once/week', '2×/week', '3-4×/week', '5-6×/week', 'Daily'];

function calcLifeScore(answers: number[]) {
  let score = 0;
  const unit = 150 / LS_QUESTIONS.length;
  LS_QUESTIONS.forEach((q, i) => {
    const v = answers[i] ?? 0;
    if (q.type === 'positive') score += (v / 6) * unit * 1.2;
    else if (q.type === 'negative') score += ((6 - v) / 6) * unit * 0.9;
    else score += unit * 0.4;
  });
  return Math.min(150, Math.max(0, Math.round(score)));
}

function scoreColor(s: number) {
  if (s >= 120) return colors.green;
  if (s >= 80) return colors.sky;
  if (s >= 50) return colors.honey;
  return colors.rose;
}

function dateStr(d: Date) { return d.toISOString().split('T')[0]; }

const PILLARS = [
  { key: 'nutrition', label: 'Nutrition', emoji: '🥗', color: colors.green, max: 40 },
  { key: 'sleep',     label: 'Sleep',     emoji: '😴', color: colors.violet, max: 30 },
  { key: 'activity',  label: 'Activity',  emoji: '🏃', color: colors.honey,  max: 30 },
  { key: 'hydration', label: 'Hydration', emoji: '💧', color: colors.sky,    max: 25 },
  { key: 'mindset',   label: 'Mindset',   emoji: '🧘', color: colors.teal,   max: 25 },
];

const STREAK_MILESTONES = [
  { days: 7,  emoji: '🌱', label: 'Week Warrior' },
  { days: 14, emoji: '🌿', label: 'Fortnight Fighter' },
  { days: 30, emoji: '🏅', label: 'Month Master' },
  { days: 60, emoji: '⭐', label: 'Double Month' },
  { days: 100, emoji: '🏆', label: 'Century Club' },
];

function getNextMilestone(streak: number) {
  return STREAK_MILESTONES.find(m => m.days > streak) ?? STREAK_MILESTONES[STREAK_MILESTONES.length - 1];
}

// ── 30-Day Logging Calendar ───────────────────────────────────────────────────
function LoggingCalendar({ entries }: { entries: Record<string, any> }) {
  const [gridWidth, setGridWidth] = useState(0);
  const today = new Date();
  const days: { date: string; status: 'logged' | 'partial' | 'none' }[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = d.toISOString().split('T')[0];
    const entry = entries[key];
    const kcal = (entry?.foods ?? []).reduce((s: number, f: any) => s + f.kcal, 0);
    days.push({ date: key, status: kcal >= 1200 ? 'logged' : kcal > 0 ? 'partial' : 'none' });
  }
  const firstDate = new Date(days[0].date);
  const pad = (firstDate.getDay() + 6) % 7;
  const cells: (typeof days[0] | null)[] = [...Array(pad).fill(null), ...days];
  const loggedCount = days.filter(d => d.status !== 'none').length;

  const CAL_GAP = 3;
  const cellSize = gridWidth > 0 ? Math.floor((gridWidth - CAL_GAP * 6) / 7) : 0;

  return (
    <View style={st.card}>
      <View style={st.calHead}>
        <Text style={st.cardLabel}>30-DAY LOGGING STREAK</Text>
        <Text style={st.calCount}>{loggedCount}/30</Text>
      </View>
      <View style={st.calWeekRow}>
        {['M','T','W','T','F','S','S'].map((d, i) => (
          <Text key={i} style={st.calWeekDay}>{d}</Text>
        ))}
      </View>
      <View style={[st.calGrid, { gap: CAL_GAP }]}
        onLayout={e => setGridWidth(e.nativeEvent.layout.width)}>
        {cellSize > 0 && cells.map((cell, i) => {
          if (!cell) return <View key={`p${i}`} style={[st.calCell, { width: cellSize, height: cellSize }]} />;
          const bg = cell.status === 'logged' ? colors.green
            : cell.status === 'partial' ? colors.honey
            : colors.layer2;
          return <View key={cell.date} style={[st.calCell, { width: cellSize, height: cellSize, backgroundColor: bg }]} />;
        })}
      </View>
      <View style={st.calLegend}>
        {[[colors.green,'Goal met'],[colors.honey,'Partial'],[colors.layer2,'No log']].map(([c,l]) => (
          <View key={l} style={st.calLegendItem}>
            <View style={[st.calLegendDot, { backgroundColor: c }]} />
            <Text style={st.calLegendTxt}>{l}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ── Weight Trend Chart ────────────────────────────────────────────────────────
function WeightChart({ weightHistory, unitSystem }: { weightHistory: { date: string; kg: number }[]; unitSystem: string }) {
  if (weightHistory.length < 2) return null;
  const last = weightHistory.slice(-14);
  const minKg = Math.min(...last.map(w => w.kg)) - 1;
  const maxKg = Math.max(...last.map(w => w.kg)) + 1;
  const range = maxKg - minKg || 1;
  const W = 280; const H = 80;
  const pts = last.map((w, i) => {
    const x = (i / (last.length - 1)) * W;
    const y = H - ((w.kg - minKg) / range) * H;
    return `${x},${y}`;
  }).join(' ');

  return (
    <View style={st.weightChartWrap}>
      <Text style={st.cardLabel}>WEIGHT TREND</Text>
      <Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        <Defs>
          <LinearGradient id="wGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <Stop offset="0%" stopColor={colors.sky} stopOpacity="0.4" />
            <Stop offset="100%" stopColor={colors.lavender} stopOpacity="0.8" />
          </LinearGradient>
        </Defs>
        <Polyline points={pts} fill="none" stroke="url(#wGrad)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        {last.map((w, i) => {
          const x = (i / (last.length - 1)) * W;
          const y = H - ((w.kg - minKg) / range) * H;
          return <Circle key={w.date} cx={x} cy={y} r={i === last.length - 1 ? 5 : 3}
            fill={i === last.length - 1 ? colors.lavender : colors.sky} />;
        })}
      </Svg>
      <View style={st.weightChartLabels}>
        <Text style={st.weightChartLbl}>{new Date(last[0].date + 'T12:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</Text>
        <Text style={[st.weightChartLbl, { color: colors.lavender }]}>{formatWeight(last[last.length - 1].kg, unitSystem as any)}</Text>
        <Text style={st.weightChartLbl}>{new Date(last[last.length - 1].date + 'T12:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</Text>
      </View>
    </View>
  );
}

// ── Statistics Modal ──────────────────────────────────────────────────────────
const STAT_PERIODS = ['Week', '1 Month', '3 Months', 'All'] as const;
type StatPeriod = typeof STAT_PERIODS[number];

function StatisticsModal({ visible, onClose, entries }: {
  visible: boolean; onClose: () => void; entries: Record<string, any>;
}) {
  const [period, setPeriod] = useState<StatPeriod>('Week');

  const days = period === 'Week' ? 7 : period === '1 Month' ? 30 : period === '3 Months' ? 90 : 180;
  const bars: { label: string; kcal: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const key = d.toISOString().split('T')[0];
    const kcal = (entries[key]?.foods ?? []).reduce((s: number, f: any) => s + f.kcal, 0);
    const label = days <= 7
      ? d.toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 1)
      : days <= 30
        ? d.getDate() % 5 === 0 ? String(d.getDate()) : ''
        : d.getDate() === 1 ? d.toLocaleDateString('en-US', { month: 'short' }) : '';
    bars.push({ label, kcal });
  }
  const maxKcal = Math.max(...bars.map(b => b.kcal), 500);
  const avg = Math.round(bars.reduce((s, b) => s + b.kcal, 0) / bars.filter(b => b.kcal > 0).length) || 0;
  const total = bars.reduce((s, b) => s + b.kcal, 0);
  const loggedDays = bars.filter(b => b.kcal > 0).length;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={stat.safe} edges={['top', 'bottom']}>
        <View style={stat.header}>
          <TouchableOpacity onPress={onClose} style={stat.backBtn}>
            <Ionicons name="chevron-back" size={18} color={colors.ink2} />
          </TouchableOpacity>
          <Text style={stat.title}>Statistics</Text>
          <View style={{ width: 34 }} />
        </View>

        <ScrollView contentContainerStyle={stat.scroll} showsVerticalScrollIndicator={false}>
          {/* Period tabs */}
          <View style={stat.tabs}>
            {STAT_PERIODS.map(p => (
              <TouchableOpacity key={p} style={[stat.tab, period === p && stat.tabActive]} onPress={() => setPeriod(p)}>
                <Text style={[stat.tabTxt, period === p && stat.tabTxtActive]}>{p}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Summary row */}
          <View style={stat.summaryRow}>
            {[
              { label: 'Avg daily', val: avg > 0 ? `${avg}` : '—', unit: 'kcal' },
              { label: 'Total', val: total > 0 ? `${(total / 1000).toFixed(1)}k` : '—', unit: 'kcal' },
              { label: 'Days logged', val: String(loggedDays), unit: `/ ${days}` },
            ].map(s => (
              <View key={s.label} style={stat.summaryTile}>
                <Text style={stat.summaryVal}>{s.val}</Text>
                <Text style={stat.summaryUnit}>{s.unit}</Text>
                <Text style={stat.summaryLbl}>{s.label}</Text>
              </View>
            ))}
          </View>

          {/* Calorie chart */}
          <View style={stat.chartCard}>
            <Text style={stat.cardLbl}>CALORIE INTAKE</Text>
            <View style={stat.chartBars}>
              {bars.map((b, i) => {
                const h = maxKcal > 0 ? Math.max(2, (b.kcal / maxKcal) * 120) : 2;
                return (
                  <View key={i} style={stat.barCol}>
                    <View style={[stat.bar, { height: h, backgroundColor: b.kcal > 0 ? colors.lavender : 'rgba(124,77,255,0.15)' }]} />
                    {b.label ? <Text style={stat.barLbl}>{b.label}</Text> : null}
                  </View>
                );
              })}
            </View>
            {avg > 0 && (
              <View style={stat.avgLine}>
                <Text style={stat.avgTxt}>Daily avg: {avg} kcal</Text>
              </View>
            )}
          </View>

          {/* Lifestyle breakdown */}
          <View style={stat.lifestyleCard}>
            <View style={stat.lifestyleHead}>
              <Text style={stat.cardLbl}>LIFESTYLE BREAKDOWN</Text>
              <View style={stat.premiumBadge}>
                <Ionicons name="lock-closed" size={10} color={colors.lavender} />
                <Text style={stat.premiumTxt}>PRO</Text>
              </View>
            </View>
            {[
              { label: 'Nutrition score', pct: 0, color: colors.green },
              { label: 'Hydration score', pct: 0, color: colors.sky },
              { label: 'Sleep quality',  pct: 0, color: colors.violet },
              { label: 'Activity level', pct: 0, color: colors.honey },
            ].map(r => (
              <View key={r.label} style={stat.lsRow}>
                <Text style={stat.lsLbl}>{r.label}</Text>
                <View style={stat.lsTrack}>
                  <View style={[stat.lsBar, { width: `${r.pct}%` as any, backgroundColor: r.color }]} />
                </View>
                <Text style={[stat.lsPct, { color: r.color }]}>{r.pct}%</Text>
              </View>
            ))}
            <View style={stat.blurOverlay} pointerEvents="none">
              <Ionicons name="lock-closed" size={24} color={colors.lavender} />
              <Text style={stat.blurTxt}>Unlock with Pro</Text>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

// ── Daily Progress Modal ──────────────────────────────────────────────────────
function DailyProgressModal({ visible, onClose, entries }: {
  visible: boolean; onClose: () => void; entries: Record<string, any>;
}) {
  const { calorieGoal: storeCalGoal } = useAppStore();
  const today = new Date().toISOString().split('T')[0];
  const todayEntry = entries[today];
  const foods = todayEntry?.foods ?? [];
  const kcal = foods.reduce((s: number, f: any) => s + f.kcal, 0);
  const carbs = foods.reduce((s: number, f: any) => s + f.carbs, 0);
  const protein = foods.reduce((s: number, f: any) => s + f.protein, 0);
  const fat = foods.reduce((s: number, f: any) => s + f.fat, 0);

  const KCAL_GOAL   = storeCalGoal || 2000;
  const CARBS_GOAL  = Math.round(KCAL_GOAL * 0.45 / 4);
  const PROT_GOAL   = Math.round(KCAL_GOAL * 0.30 / 4);
  const FAT_GOAL    = Math.round(KCAL_GOAL * 0.25 / 9);
  const dateLabel = new Date().toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'short' }).toUpperCase();

  // 7-day bars
  const weekBars = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - i));
    const key = d.toISOString().split('T')[0];
    const dayKcal = (entries[key]?.foods ?? []).reduce((s: number, f: any) => s + f.kcal, 0);
    const label = d.toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 1);
    return { key, kcal: dayKcal, label, isToday: key === today };
  });
  const maxWeekKcal = Math.max(...weekBars.map(b => b.kcal), 500);

  // Donut helpers
  const totalMacros = carbs + protein + fat || 1;
  const carbsPct = Math.round((carbs / totalMacros) * 100);
  const protPct  = Math.round((protein / totalMacros) * 100);
  const fatPct   = Math.round((fat / totalMacros) * 100);
  const CIRC = 175.93;
  const carbsArc = (carbsPct / 100) * CIRC;
  const protArc  = (protPct / 100) * CIRC;
  const fatArc   = (fatPct / 100) * CIRC;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <SafeAreaView style={dp2.safe} edges={['top', 'bottom']}>
        <View style={dp2.header}>
          <TouchableOpacity onPress={onClose} style={dp2.closeBtn}>
            <Ionicons name="close" size={16} color={colors.ink} />
          </TouchableOpacity>
          <Text style={dp2.title}>Daily progress</Text>
          <View style={{ width: 36 }} />
        </View>

        <ScrollView contentContainerStyle={dp2.scroll} showsVerticalScrollIndicator={false}>
          {/* Date */}
          <Text style={dp2.date}>{dateLabel}</Text>

          {/* Weekly kcal chart */}
          <View style={dp2.chartCard}>
            <View style={dp2.chartHead}>
              <Text style={dp2.chartLbl}>KCAL</Text>
              <Ionicons name="swap-vertical" size={16} color={colors.honey} />
            </View>
            <View style={dp2.weekBars}>
              {weekBars.map(b => {
                const h = Math.max(4, (b.kcal / maxWeekKcal) * 80);
                return (
                  <View key={b.key} style={dp2.weekBarCol}>
                    <View style={[dp2.weekBar, {
                      height: h,
                      backgroundColor: b.isToday ? colors.violet : b.kcal > 0 ? colors.line3 : colors.line,
                    }]} />
                  </View>
                );
              })}
            </View>
            <View style={dp2.weekLabels}>
              {weekBars.map((b, i) => (
                <Text key={i} style={[dp2.weekLabel, b.isToday && { color: colors.violet }]}>{b.label}</Text>
              ))}
            </View>
          </View>

          {/* Daily intake bars */}
          <Text style={dp2.h2}>Daily intake</Text>
          {[
            { lbl: 'KCAL', val: kcal, goal: KCAL_GOAL, unit: 'kcal', color: colors.green },
            { lbl: 'CARBS', val: carbs, goal: CARBS_GOAL, unit: 'g', color: colors.honey },
            { lbl: 'PROTEIN', val: protein, goal: PROT_GOAL, unit: 'g', color: colors.sky },
            { lbl: 'FAT', val: fat, goal: FAT_GOAL, unit: 'g', color: colors.violet },
          ].map(({ lbl, val, goal, unit, color }) => (
            <View key={lbl} style={dp2.intakeRow}>
              <View style={dp2.intakeMeta}>
                <Text style={dp2.intakeLbl}>{lbl}</Text>
                <Text style={dp2.intakeVal}>{Math.round(val)} / {goal} {unit.toUpperCase()}</Text>
              </View>
              <View style={dp2.intakeTrack}>
                <View style={[dp2.intakeFill, {
                  width: `${Math.min(100, goal > 0 ? (val / goal) * 100 : 0)}%` as any,
                  backgroundColor: color,
                }]} />
              </View>
            </View>
          ))}

          {/* Goal intake donut */}
          <Text style={dp2.h2}>Goal intake</Text>
          <View style={dp2.donutCard}>
            <View style={dp2.donutLegend}>
              {[[colors.honey,'45%','CARBS'],[colors.sky,'30%','PROTEIN'],[colors.violet,'25%','FAT']].map(([c,p,l]) => (
                <View key={l} style={dp2.legendItem}>
                  <View style={[dp2.legendDot, { backgroundColor: c }]} />
                  <Text style={dp2.legendTxt}>{p} {l}</Text>
                </View>
              ))}
            </View>
            <Svg width={72} height={72} viewBox="0 0 72 72">
              <Circle cx="36" cy="36" r="28" fill="none" stroke={colors.line} strokeWidth={10} />
              <Circle cx="36" cy="36" r="28" fill="none" stroke={colors.honey} strokeWidth={10}
                strokeDasharray={`${CIRC * 0.45} ${CIRC}`} strokeDashoffset={CIRC * 0.25}
                transform="rotate(-90 36 36)" />
              <Circle cx="36" cy="36" r="28" fill="none" stroke={colors.sky} strokeWidth={10}
                strokeDasharray={`${CIRC * 0.30} ${CIRC}`} strokeDashoffset={-(CIRC * 0.20)}
                transform="rotate(-90 36 36)" />
              <Circle cx="36" cy="36" r="28" fill="none" stroke={colors.violet} strokeWidth={10}
                strokeDasharray={`${CIRC * 0.25} ${CIRC}`} strokeDashoffset={-(CIRC * 0.50)}
                transform="rotate(-90 36 36)" />
            </Svg>
          </View>

          {/* Your intake donut */}
          <Text style={dp2.h2}>Your intake</Text>
          <View style={dp2.donutCard}>
            <View style={dp2.donutLegend}>
              {[
                [colors.honey, `${carbsPct}%`, 'CARBS'],
                [colors.sky, `${protPct}%`, 'PROTEIN'],
                [colors.violet, `${fatPct}%`, 'FAT'],
              ].map(([c, p, l]) => (
                <View key={l} style={dp2.legendItem}>
                  <View style={[dp2.legendDot, { backgroundColor: c as string }]} />
                  <Text style={dp2.legendTxt}>{p} {l}</Text>
                </View>
              ))}
            </View>
            <Svg width={72} height={72} viewBox="0 0 72 72">
              <Circle cx="36" cy="36" r="28" fill="none" stroke={colors.line} strokeWidth={10} />
              {totalMacros > 1 ? (
                <>
                  <Circle cx="36" cy="36" r="28" fill="none" stroke={colors.honey} strokeWidth={10}
                    strokeDasharray={`${carbsArc} ${CIRC}`} strokeDashoffset={CIRC * 0.25}
                    transform="rotate(-90 36 36)" />
                  <Circle cx="36" cy="36" r="28" fill="none" stroke={colors.sky} strokeWidth={10}
                    strokeDasharray={`${protArc} ${CIRC}`} strokeDashoffset={-(carbsArc - CIRC * 0.25)}
                    transform="rotate(-90 36 36)" />
                  <Circle cx="36" cy="36" r="28" fill="none" stroke={colors.violet} strokeWidth={10}
                    strokeDasharray={`${fatArc} ${CIRC}`} strokeDashoffset={-(carbsArc + protArc - CIRC * 0.25)}
                    transform="rotate(-90 36 36)" />
                </>
              ) : null}
            </Svg>
          </View>

          {/* Comparison */}
          <Text style={dp2.h2}>Comparison</Text>
          <View style={dp2.compCard}>
            <View style={dp2.compLegendRow}>
              <View style={dp2.legendItem}><View style={[dp2.legendDot, { backgroundColor: colors.ink3 }]} /><Text style={dp2.legendTxt}>GOAL</Text></View>
              <View style={dp2.legendItem}><View style={[dp2.legendDot, { backgroundColor: colors.green }]} /><Text style={dp2.legendTxt}>ACTUAL</Text></View>
            </View>
            <Text style={dp2.compYLabel}>50 %</Text>
            <View style={dp2.compBars}>
              {[
                { goalH: 50, actualH: CARBS_GOAL > 0 ? (carbs / CARBS_GOAL) * 50 : 0, label: 'CARBS' },
                { goalH: 20, actualH: PROT_GOAL > 0 ? (protein / PROT_GOAL) * 20 : 0, label: 'PROTEIN' },
                { goalH: 30, actualH: FAT_GOAL > 0 ? (fat / FAT_GOAL) * 30 : 0, label: 'FAT' },
              ].map(({ goalH, actualH, label }) => (
                <View key={label} style={dp2.compBarGroup}>
                  <View style={dp2.compBarPair}>
                    <View style={[dp2.compBar, { height: goalH, backgroundColor: colors.line2 }]} />
                    <View style={[dp2.compBar, { height: Math.min(100, actualH), backgroundColor: colors.green }]} />
                  </View>
                  <Text style={dp2.compBarLabel}>{label}</Text>
                </View>
              ))}
            </View>
            <Text style={dp2.compYLabel}>0 %</Text>
          </View>

          <View style={{ height: 24 }} />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

// ── Insight Detail Modal ──────────────────────────────────────────────────────
const INSIGHT_ARTICLE = {
  title: "Today's Insight",
  subtitle: 'Sleep × Activity Connection',
  emoji: '✦',
  sections: [
    {
      heading: 'The Pattern',
      body: 'On the 3 nights you slept 8+ hours this week, your step count was 34% higher the following day. This is not a coincidence — it is the most robust finding in sleep science.',
    },
    {
      heading: 'Why it happens',
      body: 'Deep sleep (NREM stage 3) restores physical energy, regulates cortisol, and primes motor circuits in the brain. When you skip this stage, your body operates in a state of mild physiological fatigue, making movement feel harder and motivation feel lower.',
    },
    {
      heading: 'Your biggest lever',
      body: 'Based on your data, improving sleep consistency (same bedtime ±30 min) is likely to produce a bigger impact on your daily activity than any exercise programme alone. Sleep is the multiplier.',
    },
    {
      heading: 'One thing to try',
      body: 'Set a wind-down alarm 45 minutes before your target bedtime. Use this as a cue to dim screens and lower lighting. Even 3 days of consistent application produces measurable changes in sleep architecture.',
    },
  ],
};

function InsightDetailModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={ins.safe} edges={['top', 'bottom']}>
        <View style={ins.header}>
          <TouchableOpacity style={ins.closeBtn} onPress={onClose}>
            <Ionicons name="close" size={16} color={colors.ink2} />
          </TouchableOpacity>
          <Text style={ins.title}>{INSIGHT_ARTICLE.title}</Text>
          <View style={{ width: 34 }} />
        </View>
        <ScrollView contentContainerStyle={ins.scroll} showsVerticalScrollIndicator={false}>
          {/* Hero */}
          <View style={ins.heroCard}>
            <Text style={ins.heroEmoji}>{INSIGHT_ARTICLE.emoji}</Text>
            <Text style={ins.heroTitle}>{INSIGHT_ARTICLE.subtitle}</Text>
            <View style={ins.heroBadge}>
              <Text style={ins.heroBadgeTxt}>PERSONALISED</Text>
            </View>
          </View>
          {/* Sections */}
          {INSIGHT_ARTICLE.sections.map((sec, i) => (
            <View key={i} style={ins.section}>
              <View style={ins.sectionHead}>
                <View style={ins.sectionNum}><Text style={ins.sectionNumTxt}>{i + 1}</Text></View>
                <Text style={ins.sectionTitle}>{sec.heading}</Text>
              </View>
              <Text style={ins.sectionBody}>{sec.body}</Text>
            </View>
          ))}
          {/* Action prompt */}
          <View style={ins.actionCard}>
            <Ionicons name="checkmark-circle" size={22} color={colors.green} />
            <Text style={ins.actionTxt}>Complete your next check-in to unlock a new personalised insight.</Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

// ── Insights Engine ───────────────────────────────────────────────────────────
interface Insight {
  id: string;
  emoji: string;
  title: string;
  body: string;
  color: string;
}

function generateInsights(
  entries: Record<string, any>,
  calorieGoal: number,
  weightGoal: string,
  weightHistory: { date: string; kg: number }[]
): Insight[] {
  const insights: Insight[] = [];
  const today = new Date();

  const last14 = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(today); d.setDate(today.getDate() - (13 - i));
    const key = d.toISOString().split('T')[0];
    const foods = entries[key]?.foods ?? [];
    const dow = d.getDay();
    return {
      date: key,
      kcal:    foods.reduce((s: number, f: any) => s + f.kcal, 0),
      protein: foods.reduce((s: number, f: any) => s + f.protein, 0),
      carbs:   foods.reduce((s: number, f: any) => s + f.carbs, 0),
      fat:     foods.reduce((s: number, f: any) => s + f.fat, 0),
      isWeekend: dow === 0 || dow === 6,
    };
  });

  const last7    = last14.slice(7);
  const logged7  = last7.filter(d => d.kcal > 0);
  if (logged7.length < 2) return [];

  const PROTEIN_GOAL = Math.round(calorieGoal * 0.30 / 4);
  const avg7kcal    = Math.round(logged7.reduce((s, d) => s + d.kcal, 0) / logged7.length);
  const avg7protein = Math.round(logged7.reduce((s, d) => s + d.protein, 0) / logged7.length);
  const kcalDiff    = avg7kcal - calorieGoal;

  // 1 — Calorie vs goal
  if (kcalDiff > 200) {
    insights.push({
      id: 'kcal_over', emoji: '⚡',
      title: `${kcalDiff} kcal above goal daily`,
      body: `7-day average: ${avg7kcal} kcal vs ${calorieGoal} goal. ${weightGoal === 'lose' ? 'This slows fat loss — try cutting one snack.' : 'Supports your muscle-gain goal.'}`,
      color: kcalDiff > 400 ? colors.rose : colors.honey,
    });
  } else if (kcalDiff < -250) {
    insights.push({
      id: 'kcal_under', emoji: '📉',
      title: `${Math.abs(kcalDiff)} kcal under goal daily`,
      body: `Averaging ${avg7kcal} kcal vs ${calorieGoal} goal. ${weightGoal === 'lose' ? 'Healthy deficit — stay consistent.' : 'Under-eating stunts muscle growth and energy.'}`,
      color: weightGoal === 'lose' ? colors.green : colors.honey,
    });
  } else {
    insights.push({
      id: 'kcal_on_track', emoji: '🎯',
      title: 'On target this week',
      body: `7-day average is ${avg7kcal} kcal — within ${Math.abs(kcalDiff)} kcal of your ${calorieGoal} goal. Consistent precision.`,
      color: colors.green,
    });
  }

  // 2 — Protein gap
  const proteinGap = PROTEIN_GOAL - avg7protein;
  if (proteinGap > 15) {
    insights.push({
      id: 'protein_low', emoji: '💪',
      title: `Protein ${proteinGap}g short daily`,
      body: `Averaging ${avg7protein}g vs ${PROTEIN_GOAL}g target. Add eggs at breakfast or chicken at lunch to close the gap.`,
      color: colors.sky,
    });
  } else if (proteinGap < -10) {
    insights.push({
      id: 'protein_high', emoji: '💪',
      title: 'Protein goal crushed',
      body: `Averaging ${avg7protein}g/day — ${Math.abs(proteinGap)}g above your ${PROTEIN_GOAL}g target. Your muscles are well-fed.`,
      color: colors.green,
    });
  }

  // 3 — Weekend vs weekday
  const weekdays = logged7.filter(d => !d.isWeekend);
  const weekends = logged7.filter(d => d.isWeekend);
  if (weekdays.length >= 2 && weekends.length >= 1) {
    const wdAvg = Math.round(weekdays.reduce((s, d) => s + d.kcal, 0) / weekdays.length);
    const weAvg = Math.round(weekends.reduce((s, d) => s + d.kcal, 0) / weekends.length);
    const diff = weAvg - wdAvg;
    if (Math.abs(diff) > 250) {
      insights.push({
        id: 'weekend_pattern', emoji: '📅',
        title: diff > 0 ? `+${diff} kcal on weekends` : `${Math.abs(diff)} kcal less on weekends`,
        body: diff > 0
          ? `Weekday avg ${wdAvg} kcal → weekend avg ${weAvg}. Social eating and late-night snacking are the usual culprits.`
          : `Weekday avg ${wdAvg} kcal → weekend avg ${weAvg}. Make sure you're fuelling rest-day recovery properly.`,
        color: diff > 0 ? colors.honey : colors.sky,
      });
    }
  }

  // 4 — Consistency
  if (logged7.length === 7) {
    insights.push({
      id: 'perfect_week', emoji: '🔥',
      title: 'Perfect logging week',
      body: 'Every day logged. Users who track 7/7 days are 3× more likely to hit their calorie goal consistently.',
      color: colors.green,
    });
  } else if (logged7.length <= 3) {
    insights.push({
      id: 'consistency_low', emoji: '📝',
      title: `Only ${logged7.length}/7 days logged`,
      body: `${7 - logged7.length} days this week had no food log. Even a rough estimate beats nothing — gaps skew averages and hide patterns.`,
      color: colors.rose,
    });
  }

  // 5 — Weight projection
  if (weightHistory.length >= 3) {
    const recent = weightHistory.slice(-Math.min(weightHistory.length, 10));
    const msPerDay = 1000 * 60 * 60 * 24;
    const daySpan = Math.max(1, (new Date(recent[recent.length - 1].date).getTime() - new Date(recent[0].date).getTime()) / msPerDay);
    const kgPerWeek = ((recent[recent.length - 1].kg - recent[0].kg) / daySpan) * 7;
    if (Math.abs(kgPerWeek) > 0.05) {
      const dir = kgPerWeek < 0 ? 'losing' : 'gaining';
      const rate = Math.abs(kgPerWeek).toFixed(2);
      const healthy = Math.abs(kgPerWeek) <= 0.75;
      insights.push({
        id: 'weight_rate', emoji: '⚖️',
        title: `${dir === 'losing' ? '↓' : '↑'} ${rate} kg/week`,
        body: healthy
          ? `${dir === 'losing' ? 'Healthy loss rate' : 'Solid lean-gain pace'} — keep your current intake and activity level.`
          : `${Math.abs(kgPerWeek).toFixed(1)} kg/week is ${dir === 'losing' ? 'aggressive — monitor energy and muscle retention' : 'fast — some may be fat, not muscle'}.`,
        color: healthy ? colors.green : colors.honey,
      });
    }
  }

  return insights.slice(0, 4);
}

interface ProgressPhoto { uri: string; date: string; }

export default function ProgressScreen() {
  const { entries, selectedDate } = useDiaryStore();
  const { lifeScore, lifeScoreDate, streak, weightHistory, addWeightEntry, setLifeScore, setMessagesOpen, calorieGoal, weightGoal, hasUnread, addXp, unitSystem } = useAppStore();
  const { email, profile } = useAuthStore();

  const [lsVisible, setLsVisible] = useState(false);
  const [statsVisible, setStatsVisible] = useState(false);
  const [dailyProgressVisible, setDailyProgressVisible] = useState(false);
  const [insightDetailVisible, setInsightDetailVisible] = useState(false);
  const [lsStep, setLsStep] = useState(0);
  const [lsAnswers, setLsAnswers] = useState<number[]>(Array(LS_QUESTIONS.length).fill(0));
  const [lsResult, setLsResult] = useState<number | null>(null);
  const [weightInput, setWeightInput] = useState('');
  const [progressPhotos, setProgressPhotos] = useState<ProgressPhoto[]>([]);
  const PHOTOS_KEY = `${email ?? 'anon'}_progress_photos`;

  useEffect(() => {
    AsyncStorage.getItem(PHOTOS_KEY).then(raw => { if (raw) setProgressPhotos(JSON.parse(raw)); });
  }, [PHOTOS_KEY]);

  async function addProgressPhoto() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission needed', 'Allow photo library access to add progress photos.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7, base64: false });
    if (result.canceled || !result.assets[0]) return;
    const photo: ProgressPhoto = { uri: result.assets[0].uri, date: new Date().toISOString().split('T')[0] };
    const updated = [photo, ...progressPhotos].slice(0, 20);
    setProgressPhotos(updated);
    AsyncStorage.setItem(PHOTOS_KEY, JSON.stringify(updated));
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }

  function removeProgressPhoto(index: number) {
    Alert.alert('Remove photo?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => {
        const updated = progressPhotos.filter((_, i) => i !== index);
        setProgressPhotos(updated);
        AsyncStorage.setItem(PHOTOS_KEY, JSON.stringify(updated));
      }},
    ]);
  }

  // 7-day calorie chart
  const days = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - i));
    const key = dateStr(d);
    const entry = entries[key];
    const kcal = entry?.foods.reduce((s, f) => s + f.kcal, 0) ?? 0;
    return { label: d.toLocaleDateString('en-US', { weekday: 'short' }), kcal, key };
  });
  const maxKcal = Math.max(...days.map(d => d.kcal), 1);

  const entry = entries[selectedDate];
  const foods = entry?.foods ?? [];
  const totalKcal = foods.reduce((s, f) => s + f.kcal, 0);
  const totalCarbs = foods.reduce((s, f) => s + f.carbs, 0);
  const totalProtein = foods.reduce((s, f) => s + f.protein, 0);
  const totalFat = foods.reduce((s, f) => s + f.fat, 0);
  const totalMacros = totalCarbs + totalProtein + totalFat || 1;

  const latestWeight = weightHistory[weightHistory.length - 1]?.kg;

  const bmi = useMemo(() => {
    const heightCm = parseFloat(profile?.height ?? '0');
    if (!latestWeight || !heightCm || heightCm <= 0) return null;
    const val = latestWeight / Math.pow(heightCm / 100, 2);
    let category: string;
    let color: string;
    if (val < 18.5)      { category = 'Underweight'; color = colors.sky; }
    else if (val < 25)   { category = 'Healthy';     color = colors.green; }
    else if (val < 30)   { category = 'Overweight';  color = colors.honey; }
    else                 { category = 'Obese';        color = colors.rose; }
    return { val: val.toFixed(1), category, color };
  }, [latestWeight, profile?.height]);

  function startQuiz() { setLsAnswers(Array(LS_QUESTIONS.length).fill(0)); setLsStep(0); setLsResult(null); setLsVisible(true); }

  function finishQuiz() {
    const score = calcLifeScore(lsAnswers);
    setLsResult(score);
    setLifeScore(score);
    addXp(50);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }

  async function logWeight() {
    const kg = parseWeight(weightInput, unitSystem);
    if (kg === null || kg < 20 || kg > 300) { Alert.alert('Enter a valid weight'); return; }
    await addWeightEntry(kg);
    await addXp(15);
    setWeightInput('');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }

  const q = LS_QUESTIONS[lsStep];
  const progress = (lsStep / LS_QUESTIONS.length) * 100;

  const nextMilestone = getNextMilestone(streak);
  const milestoneProgress = nextMilestone ? streak / nextMilestone.days : 1;

  // Pillar scores derived from life score + diary data
  const pillarScores = PILLARS.map((p) => {
    if (lifeScore === null) return { ...p, score: 0 };
    const ratio = lifeScore / 150;
    const offsets: Record<string, number> = { nutrition: 1.1, sleep: 0.95, activity: 0.9, hydration: 1.05, mindset: 0.9 };
    const score = Math.min(p.max, Math.round(ratio * p.max * (offsets[p.key] ?? 1)));
    return { ...p, score };
  });

  const insights = useMemo(
    () => generateInsights(entries, calorieGoal || 2000, weightGoal || 'maintain', weightHistory),
    [entries, calorieGoal, weightGoal, weightHistory]
  );

  return (
    <SafeAreaView style={st.safe} edges={['top']}>
        {/* Header */}
        <View style={st.appHeader}>
          <Text style={st.heading}>Progress</Text>
          <View style={{ flexDirection: 'row', gap: 4 }}>
            <TouchableOpacity style={st.profileBtn} onPress={() => setStatsVisible(true)}>
              <Ionicons name="stats-chart-outline" size={22} color={colors.ink2} />
            </TouchableOpacity>
            <TouchableOpacity style={st.profileBtn} onPress={() => setMessagesOpen(true)}>
              <Ionicons name="notifications-outline" size={22} color={colors.ink2} />
              {hasUnread && <View style={st.notifDot} />}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.push('/(tabs)/profile')} style={st.profileBtn}>
              <Ionicons name="person-outline" size={22} color={colors.ink2} />
            </TouchableOpacity>
          </View>
        </View>

      <ScrollView contentContainerStyle={st.scroll} showsVerticalScrollIndicator={false}>
        {/* Streaks card */}
        <View style={st.card}>
          <Text style={st.cardLabel}>STREAKS</Text>
          <View style={st.streaksGrid}>
            <View style={st.streakCell}>
              <Text style={[st.streakNum, { color: colors.honey }]}>{streak}</Text>
              <Text style={st.streakUnit}>days</Text>
              <Text style={st.streakDesc}>Current streak</Text>
            </View>
            <View style={[st.streakCell, { borderLeftWidth: 1, borderLeftColor: colors.line }]}>
              <Text style={[st.streakNum, { color: colors.lavender }]}>{foods.length}</Text>
              <Text style={st.streakUnit}>items</Text>
              <Text style={st.streakDesc}>Logged today</Text>
            </View>
          </View>
          {/* Next milestone */}
          {nextMilestone && (
            <View style={st.milestoneWrap}>
              <View style={st.milestoneRow}>
                <Text style={{ fontSize: 20 }}>{nextMilestone.emoji}</Text>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={st.milestoneName}>{nextMilestone.label}</Text>
                    <Text style={st.milestoneProg}>{streak} / {nextMilestone.days} days</Text>
                  </View>
                  <View style={st.milestoneTrack}>
                    <View style={[st.milestoneBar, { width: `${Math.min(milestoneProgress, 1) * 100}%` as any }]} />
                  </View>
                </View>
              </View>
            </View>
          )}
        </View>

        {/* Insights */}
        {insights.length > 0 && (
          <View style={st.card}>
            <Text style={st.cardLabel}>THIS WEEK'S INSIGHTS</Text>
            {insights.map((ins, idx) => (
              <View key={ins.id} style={[
                st.insightRow,
                idx < insights.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.line },
                { borderLeftWidth: 3, borderLeftColor: ins.color },
              ]}>
                <Text style={{ fontSize: fontSize.lg, lineHeight: fontSize.lg * 1.2 }}>{ins.emoji}</Text>
                <View style={{ flex: 1, gap: spacing.xs / 2 }}>
                  <Text style={[st.insightTitle, { color: ins.color }]}>{ins.title}</Text>
                  <Text style={st.insightBody}>{ins.body}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Life Score card */}
        <View style={[st.card, { borderColor: lifeScore ? (scoreColor(lifeScore) + '44') : colors.line }]}>
          <View style={st.lsRow}>
            <View style={{ flex: 1 }}>
              <Text style={st.cardLabel}>LIFE SCORE</Text>
              {lifeScore !== null ? (
                <>
                  <Text style={[st.lsScore, { color: scoreColor(lifeScore) }]}>{lifeScore}</Text>
                  <Text style={st.lsSubtitle}>/ 150 — {lifeScore >= 120 ? 'Excellent' : lifeScore >= 80 ? 'Good' : lifeScore >= 50 ? 'Fair' : 'Needs work'}</Text>
                  {lifeScoreDate && <Text style={st.lsDate}>Last check-in: {new Date(lifeScoreDate + 'T12:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</Text>}
                </>
              ) : (
                <Text style={st.lsEmpty}>Take the weekly check-in to see your score</Text>
              )}
            </View>
            <View>
              <Svg width={64} height={64} viewBox="0 0 64 64">
                <Circle cx={32} cy={32} r={28} fill="none" stroke={colors.line2} strokeWidth={6} />
                <G rotation="-90" origin="32, 32">
                  <Circle cx={32} cy={32} r={28} fill="none" stroke={lifeScore ? scoreColor(lifeScore) : colors.purple} strokeWidth={6} strokeLinecap="round" strokeDasharray={`${((lifeScore ?? 0) / 150) * 175.9} 175.9`} />
                </G>
              </Svg>
            </View>
          </View>

          {/* Pillars breakdown */}
          {lifeScore !== null && (
            <View style={st.pillarsWrap}>
              {pillarScores.map((p) => (
                <View key={p.key} style={st.pillarRow}>
                  <Text style={{ fontSize: 16 }}>{p.emoji}</Text>
                  <Text style={st.pillarLabel}>{p.label}</Text>
                  <View style={st.pillarTrack}>
                    <View style={[st.pillarBar, { width: `${(p.score / p.max) * 100}%` as any, backgroundColor: p.color }]} />
                  </View>
                  <Text style={[st.pillarScore, { color: p.color }]}>{p.score}/{p.max}</Text>
                </View>
              ))}
            </View>
          )}

          <TouchableOpacity style={st.lsBtn} onPress={startQuiz}>
            <Text style={st.lsBtnTxt}>✨ Weekly Check-In</Text>
          </TouchableOpacity>

          {/* Locked insights */}
          {lifeScore !== null && (
            <TouchableOpacity style={st.insightLocked} activeOpacity={0.8}
              onPress={() => setInsightDetailVisible(true)}>
              <View style={st.insightBlur}>
                <Text style={st.insightBlurText}>Your weekly insight is ready</Text>
                <Text style={st.insightBlurSub}>Tap to read today's insight</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.lavender} />
            </TouchableOpacity>
          )}
        </View>

        {/* 7-day calorie chart */}
        <View style={st.card}>
          <Text style={st.cardLabel}>CALORIES — LAST 7 DAYS</Text>
          <View style={st.chart}>
            {days.map(({ label, kcal }) => (
              <View key={label} style={st.barCol}>
                {kcal > 0 && <Text style={st.barVal}>{kcal}</Text>}
                <View style={st.barTrack}>
                  <View style={[st.bar, { height: `${(kcal / maxKcal) * 100}%` as any }]} />
                </View>
                <Text style={st.barLabel}>{label}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Macros today */}
        <View style={st.card}>
          <Text style={st.cardLabel}>TODAY'S MACROS</Text>
          {[{ label: 'Carbs', val: totalCarbs, color: colors.sky }, { label: 'Protein', val: totalProtein, color: colors.rose }, { label: 'Fat', val: totalFat, color: colors.violet }].map(({ label, val, color }) => (
            <View key={label} style={st.macroRow}>
              <Text style={st.macroLabel}>{label}</Text>
              <View style={st.macroTrack}>
                <View style={[st.macroBar, { width: `${(val / totalMacros) * 100}%` as any, backgroundColor: color }]} />
              </View>
              <Text style={[st.macroVal, { color }]}>{Math.round(val)}g</Text>
            </View>
          ))}
        </View>

        {/* Weight tracker */}
        <View style={st.card}>
          <Text style={st.cardLabel}>WEIGHT</Text>
          <View style={st.weightRow}>
            <View style={{ flex: 1 }}>
              <Text style={[st.weightNum, { color: colors.sky }]}>{latestWeight ? formatWeight(latestWeight, unitSystem) : '—'}</Text>
              <Text style={st.weightLbl}>Current weight</Text>
            </View>
            <View style={st.weightInput}>
              <TextInput
                style={st.weightField}
                placeholder={weightUnit(unitSystem)}
                placeholderTextColor={colors.ink3}
                value={weightInput}
                onChangeText={setWeightInput}
                keyboardType={unitSystem === 'UK' ? 'default' : 'decimal-pad'}
              />
              <TouchableOpacity style={st.weightBtn} onPress={logWeight}>
                <Text style={st.weightBtnTxt}>Log</Text>
              </TouchableOpacity>
            </View>
          </View>
          {weightHistory.length > 1 && (
            <View style={st.weightHistory}>
              {weightHistory.slice(-5).reverse().map((w, i) => (
                <View key={w.date} style={st.weightEntry}>
                  <Text style={st.weightEntryDate}>{new Date(w.date + 'T12:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</Text>
                  <Text style={[st.weightEntryVal, { color: i === 0 ? colors.sky : colors.ink3 }]}>{formatWeight(w.kg, unitSystem)}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* BMI Card */}
        {bmi && (
          <View style={st.card}>
            <Text style={st.cardLabel}>BODY MASS INDEX</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg }}>
              <View style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: fontSize['2xl'], fontWeight: '800', color: bmi.color }}>{bmi.val}</Text>
                <Text style={{ fontSize: fontSize.xs, color: colors.ink3 }}>BMI</Text>
              </View>
              <View style={{ flex: 1, gap: spacing.xs }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: bmi.color }} />
                  <Text style={{ fontSize: fontSize.base, fontWeight: '700', color: bmi.color }}>{bmi.category}</Text>
                </View>
                {/* BMI scale bar */}
                <View style={{ height: 6, borderRadius: 3, overflow: 'hidden', flexDirection: 'row' }}>
                  <View style={{ flex: 1, backgroundColor: colors.sky }} />
                  <View style={{ flex: 1.3, backgroundColor: colors.green }} />
                  <View style={{ flex: 1, backgroundColor: colors.honey }} />
                  <View style={{ flex: 1, backgroundColor: colors.rose }} />
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: fontSize.xs, color: colors.ink3 }}>16</Text>
                  <Text style={{ fontSize: fontSize.xs, color: colors.ink3 }}>18.5</Text>
                  <Text style={{ fontSize: fontSize.xs, color: colors.ink3 }}>25</Text>
                  <Text style={{ fontSize: fontSize.xs, color: colors.ink3 }}>30</Text>
                  <Text style={{ fontSize: fontSize.xs, color: colors.ink3 }}>40</Text>
                </View>
              </View>
            </View>
          </View>
        )}

        {/* Progress Photos */}
        <View style={st.card}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm }}>
            <Text style={st.cardLabel}>PROGRESS PHOTOS</Text>
            <TouchableOpacity
              onPress={addProgressPhoto}
              style={{ backgroundColor: colors.purpleTint, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderWidth: 1, borderColor: colors.line3 }}
            >
              <Text style={{ fontSize: fontSize.xs, fontWeight: '700', color: colors.purple }}>+ Add</Text>
            </TouchableOpacity>
          </View>
          {progressPhotos.length === 0 ? (
            <TouchableOpacity onPress={addProgressPhoto} style={{ alignItems: 'center', paddingVertical: spacing.lg, borderWidth: 1, borderColor: colors.line2, borderRadius: radius.md, borderStyle: 'dashed' }}>
              <Ionicons name="camera-outline" size={28} color={colors.ink3} />
              <Text style={{ fontSize: fontSize.sm, color: colors.ink3, marginTop: spacing.xs }}>Add your first progress photo</Text>
            </TouchableOpacity>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
              {progressPhotos.map((p, i) => (
                <TouchableOpacity key={i} onLongPress={() => removeProgressPhoto(i)} activeOpacity={0.85}>
                  <Image source={{ uri: p.uri }} style={{ width: 100, height: 130, borderRadius: radius.md, backgroundColor: colors.layer2 }} resizeMode="cover" />
                  <Text style={{ fontSize: fontSize.xs, color: colors.ink3, marginTop: 3, textAlign: 'center' }}>{new Date(p.date + 'T12:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </View>

        {/* Stats grid */}
        <View style={st.statsGrid}>
          {[
            { label: 'Kcal today', value: totalKcal, unit: 'kcal', color: colors.lavender, tap: () => setDailyProgressVisible(true) },
            { label: 'Water', value: entry?.water ?? 0, unit: 'glasses', color: colors.sky, tap: undefined },
            { label: 'Meals logged', value: new Set(foods.map(f => f.meal)).size, unit: 'meals', color: colors.green, tap: undefined },
            { label: 'Food items', value: foods.length, unit: 'items', color: colors.honey, tap: undefined },
          ].map(({ label, value, unit, color, tap }) => (
            <TouchableOpacity key={label} style={st.statCard} onPress={tap} activeOpacity={tap ? 0.7 : 1}>
              <Text style={[st.statVal, { color }]}>{value}</Text>
              <Text style={st.statUnit}>{unit}</Text>
              <Text style={st.statLabel}>{label}</Text>
              {tap && <Ionicons name="chevron-forward" size={12} color={colors.ink3} style={{ position: 'absolute', top: 8, right: 8 }} />}
            </TouchableOpacity>
          ))}
        </View>

        {/* 30-day logging calendar */}
        <LoggingCalendar entries={entries} />

        {/* Weight chart */}
        {weightHistory.length >= 2 && (
          <View style={st.card}>
            <WeightChart weightHistory={weightHistory} unitSystem={unitSystem} />
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      <StatisticsModal visible={statsVisible} onClose={() => setStatsVisible(false)} entries={entries} />
      <DailyProgressModal visible={dailyProgressVisible} onClose={() => setDailyProgressVisible(false)} entries={entries} />
      <InsightDetailModal visible={insightDetailVisible} onClose={() => setInsightDetailVisible(false)} />

      {/* Life Score Quiz Modal */}
      <Modal visible={lsVisible} animationType="slide" presentationStyle="fullScreen">
        <SafeAreaView style={st.lsModal} edges={['top', 'bottom']}>
          {lsResult === null ? (
            <>
              {/* Progress bar */}
              <View style={st.lsProgressTrack}>
                <View style={[st.lsProgressBar, { width: `${progress}%` as any }]} />
              </View>
              <View style={st.lsTopRow}>
                <TouchableOpacity onPress={() => setLsVisible(false)} style={st.lsCloseBtn}>
                  <Text style={{ color: colors.ink3, fontSize: fontSize.sm }}>Cancel</Text>
                </TouchableOpacity>
                <Text style={st.lsStepTxt}>{lsStep + 1} / {LS_QUESTIONS.length}</Text>
              </View>

              <ScrollView contentContainerStyle={st.lsContent} showsVerticalScrollIndicator={false}>
                <Text style={st.lsEmoji}>{q.emoji}</Text>
                <Text style={st.lsQuestion}>{q.q}</Text>
                {q.hint ? <Text style={st.lsHint}>{q.hint}</Text> : null}

                <View style={st.lsOptions}>
                  {LS_LABELS.map((label, i) => {
                    const selected = lsAnswers[lsStep] === i;
                    return (
                      <TouchableOpacity
                        key={i}
                        style={[st.lsOption, selected && st.lsOptionSelected]}
                        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setLsAnswers(a => { const n = [...a]; n[lsStep] = i; return n; }); }}
                      >
                        <View style={[st.lsRadio, selected && { backgroundColor: colors.purple, borderColor: colors.purple }]}>
                          {selected && <View style={st.lsRadioDot} />}
                        </View>
                        <Text style={[st.lsOptionTxt, selected && { color: colors.lavender }]}>{label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </ScrollView>

              <View style={st.lsNav}>
                {lsStep > 0 && (
                  <TouchableOpacity style={st.lsBackBtn} onPress={() => setLsStep(s => s - 1)}>
                    <Text style={{ color: colors.ink2, fontSize: fontSize.base }}>← Back</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={[st.lsNextBtn, { flex: lsStep === 0 ? 1 : undefined }]}
                  onPress={() => { if (lsStep < LS_QUESTIONS.length - 1) setLsStep(s => s + 1); else finishQuiz(); }}
                >
                  <Text style={st.lsNextTxt}>{lsStep < LS_QUESTIONS.length - 1 ? 'Next →' : 'See Results ✨'}</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <View style={st.lsResultWrap}>
              <Text style={st.lsResultEmoji}>🏆</Text>
              <Text style={st.lsResultTitle}>Your Life Score</Text>
              <Text style={[st.lsResultScore, { color: scoreColor(lsResult) }]}>{lsResult}</Text>
              <Text style={st.lsResultMax}>/ 150</Text>
              <Text style={[st.lsResultGrade, { color: scoreColor(lsResult) }]}>
                {lsResult >= 120 ? 'Excellent! Keep it up 🌟' : lsResult >= 80 ? 'Good job! Room to grow 💪' : lsResult >= 50 ? 'Fair — small changes help 🌱' : 'Start your journey today ❤️'}
              </Text>
              <TouchableOpacity style={st.lsDoneBtn} onPress={() => setLsVisible(false)}>
                <Text style={st.lsDoneTxt}>Done</Text>
              </TouchableOpacity>
            </View>
          )}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing.md, gap: spacing.sm, paddingBottom: 24 },
  appHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  profileBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  notifDot: { position: 'absolute', top: 8, right: 6, width: 6, height: 6, borderRadius: 3, backgroundColor: colors.rose },
  heading: { fontSize: fontSize.xl, fontWeight: '800', color: colors.ink },
  card: { backgroundColor: colors.layer1, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: spacing.md },
  cardLabel: { color: colors.ink3, fontSize: fontSize.xs, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginBottom: spacing.sm },
  // Streaks
  streaksGrid: { flexDirection: 'row' },
  streakCell: { flex: 1, alignItems: 'center', gap: 3, paddingVertical: spacing.xs },
  streakNum: { fontSize: fontSize['2xl'], fontWeight: '800' },
  streakUnit: { fontSize: fontSize.md, fontWeight: '600', color: colors.ink },
  streakDesc: { fontSize: fontSize.sm, color: colors.ink2 },
  // Milestone
  milestoneWrap: { marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.line },
  milestoneRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  milestoneName: { fontSize: 13, fontWeight: '700', color: colors.ink },
  milestoneProg: { fontSize: 11, color: colors.ink3 },
  milestoneTrack: { height: 4, backgroundColor: colors.layer3, borderRadius: 2, marginTop: 6, overflow: 'hidden' },
  milestoneBar: { height: 4, backgroundColor: colors.honey, borderRadius: 2 },
  // Pillars
  pillarsWrap: { marginBottom: spacing.md, gap: spacing.xs },
  pillarRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pillarLabel: { width: 62, fontSize: 12, color: colors.ink2 },
  pillarTrack: { flex: 1, height: 5, backgroundColor: colors.layer3, borderRadius: 3, overflow: 'hidden' },
  pillarBar: { height: 5, borderRadius: 3 },
  pillarScore: { width: 36, textAlign: 'right', fontSize: 11, fontWeight: '600' },
  // Insight locked
  insightRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, paddingVertical: spacing.md, paddingLeft: spacing.sm, borderRadius: radius.sm, marginLeft: -spacing.sm },
  insightTitle: { fontSize: fontSize.sm, fontWeight: '700' },
  insightBody: { fontSize: fontSize.xs, color: colors.ink2, lineHeight: fontSize.xs * 1.55 },
  insightLocked: { marginTop: spacing.sm, backgroundColor: colors.layer2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line2, padding: spacing.md, overflow: 'hidden', position: 'relative' },
  insightBlur: { opacity: 0.4 },
  insightBlurText: { fontSize: 14, fontWeight: '700', color: colors.ink },
  insightBlurSub: { fontSize: 12, color: colors.ink3, marginTop: 3 },
  insightLockBadge: { position: 'absolute', top: spacing.md, right: spacing.md },
  // Life Score
  lsRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.md },
  lsScore: { fontSize: fontSize['2xl'], fontWeight: '800' },
  lsSubtitle: { color: colors.ink2, fontSize: fontSize.sm, marginTop: 2 },
  lsDate: { color: colors.ink3, fontSize: fontSize.xs, marginTop: 4 },
  lsEmpty: { color: colors.ink3, fontSize: fontSize.sm, marginTop: spacing.xs },
  lsBtn: { backgroundColor: colors.purple, borderRadius: radius.md, paddingVertical: spacing.sm, alignItems: 'center' },
  lsBtnTxt: { color: colors.white, fontSize: fontSize.base, fontWeight: '700' },
  // Chart
  chart: { flexDirection: 'row', height: 100, alignItems: 'flex-end', gap: spacing.xs },
  barCol: { flex: 1, alignItems: 'center', gap: 4 },
  barVal: { color: colors.ink3, fontSize: 9 },
  barTrack: { flex: 1, width: '70%', justifyContent: 'flex-end' },
  bar: { width: '100%', backgroundColor: colors.purple, borderRadius: 4, minHeight: 2 },
  barLabel: { color: colors.ink3, fontSize: 10 },
  // Macros
  macroRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  macroLabel: { width: 54, color: colors.ink2, fontSize: fontSize.sm },
  macroTrack: { flex: 1, height: 6, backgroundColor: colors.layer3, borderRadius: 3, overflow: 'hidden' },
  macroBar: { height: '100%', borderRadius: 3 },
  macroVal: { width: 42, textAlign: 'right', fontSize: fontSize.sm, fontWeight: '600' },
  // Weight
  weightRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.sm },
  weightNum: { fontSize: fontSize.xl, fontWeight: '800' },
  weightLbl: { color: colors.ink3, fontSize: fontSize.xs, marginTop: 2 },
  weightInput: { flexDirection: 'row', gap: spacing.xs },
  weightField: { backgroundColor: colors.layer2, borderWidth: 1, borderColor: colors.line2, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.xs, color: colors.ink, fontSize: fontSize.base, width: 80, textAlign: 'center' },
  weightBtn: { backgroundColor: colors.purple, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.xs, justifyContent: 'center' },
  weightBtnTxt: { color: colors.white, fontWeight: '700', fontSize: fontSize.sm },
  weightHistory: { borderTopWidth: 1, borderTopColor: colors.line, paddingTop: spacing.sm, gap: spacing.xs },
  weightEntry: { flexDirection: 'row', justifyContent: 'space-between' },
  weightEntryDate: { color: colors.ink3, fontSize: fontSize.sm },
  weightEntryVal: { fontSize: fontSize.sm, fontWeight: '600' },
  // Stats grid
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  statCard: { flex: 1, minWidth: '45%', backgroundColor: colors.layer1, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, padding: spacing.md, alignItems: 'center' },
  statVal: { fontSize: fontSize.xl, fontWeight: '800' },
  statUnit: { color: colors.ink3, fontSize: fontSize.xs },
  statLabel: { color: colors.ink2, fontSize: fontSize.sm, marginTop: 2 },
  // Life Score Quiz Modal
  lsModal: { flex: 1, backgroundColor: colors.bg },
  lsProgressTrack: { height: 3, backgroundColor: colors.layer2 },
  lsProgressBar: { height: 3, backgroundColor: colors.purple },
  lsTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  lsCloseBtn: { padding: spacing.xs },
  lsStepTxt: { color: colors.ink3, fontSize: fontSize.sm },
  lsContent: { paddingHorizontal: spacing.lg, paddingBottom: 20, alignItems: 'center' },
  lsEmoji: { fontSize: 64, marginBottom: spacing.md, marginTop: spacing.lg },
  lsQuestion: { fontSize: fontSize.lg, fontWeight: '800', color: colors.ink, textAlign: 'center', marginBottom: spacing.xs },
  lsHint: { fontSize: fontSize.sm, color: colors.ink3, textAlign: 'center', marginBottom: spacing.lg },
  lsOptions: { width: '100%', gap: spacing.xs, marginTop: spacing.md },
  lsOption: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.layer1, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, padding: spacing.md },
  lsOptionSelected: { borderColor: colors.purple, backgroundColor: colors.purple + '11' },
  lsRadio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: colors.line3, alignItems: 'center', justifyContent: 'center' },
  lsRadioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.white },
  lsOptionTxt: { color: colors.ink2, fontSize: fontSize.base },
  lsNav: { flexDirection: 'row', gap: spacing.sm, padding: spacing.md },
  lsBackBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.layer2, borderRadius: radius.md, paddingVertical: spacing.sm },
  lsNextBtn: { flex: 2, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.purple, borderRadius: radius.md, paddingVertical: spacing.sm },
  lsNextTxt: { color: colors.white, fontWeight: '700', fontSize: fontSize.base },
  // Result
  lsResultWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.md },
  lsResultEmoji: { fontSize: 72 },
  lsResultTitle: { fontSize: fontSize.lg, fontWeight: '800', color: colors.ink },
  lsResultScore: { fontSize: 80, fontWeight: '800' },
  lsResultMax: { fontSize: fontSize.lg, color: colors.ink3, marginTop: -16 },
  lsResultGrade: { fontSize: fontSize.base, fontWeight: '600', textAlign: 'center' },
  lsDoneBtn: { backgroundColor: colors.purple, borderRadius: radius.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.xl, marginTop: spacing.md },
  lsDoneTxt: { color: colors.white, fontWeight: '700', fontSize: fontSize.base },
  // Statistics modal extra styles (stat.* used inline)

  // Calendar
  calHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  calCount: { fontSize: 12, color: colors.ink3, fontFamily: 'monospace' },
  calWeekRow: { flexDirection: 'row', marginBottom: 4 },
  calWeekDay: { flex: 1, textAlign: 'center', fontSize: 8, color: colors.ink3, fontFamily: 'monospace' },
  calGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  calCell: { borderRadius: 3, backgroundColor: colors.layer2 },
  calLegend: { flexDirection: 'row', gap: 12, marginTop: 10 },
  calLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  calLegendDot: { width: 8, height: 8, borderRadius: 2 },
  calLegendTxt: { fontSize: 10, color: colors.ink3 },
  // Weight chart
  weightChartWrap: { gap: 10 },
  weightChartLabels: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  weightChartLbl: { fontSize: 10, color: colors.ink3 },
});

const stat = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.line2 },
  backBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.layer2, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 16, fontWeight: '700', color: colors.ink },
  scroll: { padding: 16, gap: 14, paddingBottom: 40 },
  tabs: { flexDirection: 'row', backgroundColor: colors.layer2, borderRadius: 12, padding: 3, gap: 2 },
  tab: { flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center' },
  tabActive: { backgroundColor: colors.purple },
  tabTxt: { fontSize: 12, fontWeight: '600', color: colors.ink3 },
  tabTxtActive: { color: '#fff' },
  summaryRow: { flexDirection: 'row', gap: 10 },
  summaryTile: { flex: 1, backgroundColor: colors.layer2, borderWidth: 1, borderColor: colors.line2, borderRadius: 14, padding: 12, alignItems: 'center', gap: 2 },
  summaryVal: { fontSize: 20, fontWeight: '800', color: colors.ink },
  summaryUnit: { fontSize: 10, color: colors.ink3 },
  summaryLbl: { fontSize: 10, color: colors.ink3, textAlign: 'center' },
  chartCard: { backgroundColor: colors.layer2, borderWidth: 1, borderColor: colors.line2, borderRadius: 16, padding: 14, gap: 10 },
  cardLbl: { fontSize: 10, fontWeight: '700', letterSpacing: 1, color: colors.ink3, textTransform: 'uppercase' },
  chartBars: { flexDirection: 'row', alignItems: 'flex-end', height: 128, gap: 2 },
  barCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: '100%', gap: 3 },
  bar: { width: '90%', borderRadius: 3, minHeight: 2 },
  barLbl: { fontSize: 8, color: colors.ink3, textAlign: 'center' },
  avgLine: { borderTopWidth: 1, borderTopColor: colors.line2, paddingTop: 8 },
  avgTxt: { fontSize: 11, color: colors.lavender, fontWeight: '600' },
  lifestyleCard: { backgroundColor: colors.layer2, borderWidth: 1, borderColor: colors.line2, borderRadius: 16, padding: 14, gap: 10, position: 'relative', overflow: 'hidden' },
  lifestyleHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  premiumBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(124,77,255,0.15)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  premiumTxt: { fontSize: 9, fontWeight: '700', color: colors.lavender, letterSpacing: 0.5 },
  lsRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  lsLbl: { fontSize: 12, color: colors.ink2, width: 110 },
  lsTrack: { flex: 1, height: 5, backgroundColor: colors.layer3, borderRadius: 3, overflow: 'hidden' },
  lsBar: { height: '100%', borderRadius: 3 },
  lsPct: { fontSize: 11, fontWeight: '700', width: 34, textAlign: 'right' },
  blurOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 100, backgroundColor: colors.layer2 + 'cc', alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 16, gap: 6 },
  blurTxt: { fontSize: 13, fontWeight: '700', color: colors.lavender },
});

// ── Daily Progress Modal styles ────────────────────────────────────────────────
const dp2 = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.line },
  closeBtn: { width: spacing.xl, height: spacing.xl, borderRadius: radius.pill, backgroundColor: colors.layer2, borderWidth: 1, borderColor: colors.line2, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: fontSize.base, fontWeight: '700', color: colors.ink },
  scroll: { padding: spacing.md, paddingTop: spacing.md },
  h1: { fontSize: fontSize.xl, fontWeight: '800', color: colors.ink, letterSpacing: -0.5, marginBottom: 4 },
  h2: { fontSize: fontSize.lg, fontWeight: '800', color: colors.ink, letterSpacing: -0.5, marginBottom: spacing.sm, marginTop: spacing.lg },
  date: { fontSize: fontSize.xs, fontWeight: '700', letterSpacing: 1.2, color: colors.ink3, marginBottom: spacing.md, textTransform: 'uppercase' },
  // Weekly chart
  chartCard: { backgroundColor: colors.layer1, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, padding: spacing.sm, paddingBottom: spacing.sm },
  chartHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  chartLbl: { fontSize: fontSize.xs, fontWeight: '700', letterSpacing: 1, color: colors.ink3, textTransform: 'uppercase' },
  weekBars: { flexDirection: 'row', alignItems: 'flex-end', height: 80, gap: 4 },
  weekBarCol: { flex: 1, justifyContent: 'flex-end' },
  weekBar: { borderRadius: 4, width: '100%' },
  weekLabels: { flexDirection: 'row', marginTop: spacing.xs },
  weekLabel: { flex: 1, textAlign: 'center', fontSize: fontSize.xs, color: colors.ink3, fontWeight: '700' },
  // Intake bars
  intakeRow: { marginBottom: spacing.sm },
  intakeMeta: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.xs },
  intakeLbl: { fontSize: fontSize.xs, fontWeight: '700', letterSpacing: 1, color: colors.ink2, textTransform: 'uppercase' },
  intakeVal: { fontSize: fontSize.xs, fontWeight: '700', color: colors.ink2 },
  intakeTrack: { height: 4, backgroundColor: colors.line, borderRadius: 4, overflow: 'hidden' },
  intakeFill: { height: '100%', borderRadius: 4 },
  // Donut card
  donutCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.layer1, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, padding: spacing.md },
  donutLegend: { gap: spacing.xs },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  legendDot: { width: spacing.sm, height: spacing.sm, borderRadius: radius.pill },
  legendTxt: { fontSize: fontSize.xs, fontWeight: '700', letterSpacing: 0.8, color: colors.ink2, textTransform: 'uppercase' },
  // Comparison
  compCard: { backgroundColor: colors.layer1, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, padding: spacing.md, paddingBottom: spacing.sm },
  compLegendRow: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.sm },
  compYLabel: { fontSize: fontSize.xs, color: colors.ink3, marginBottom: 4 },
  compBars: { flexDirection: 'row', justifyContent: 'space-around', height: 100, alignItems: 'flex-end', borderBottomWidth: 1, borderBottomColor: colors.line, marginBottom: spacing.xs },
  compBarGroup: { alignItems: 'center', gap: spacing.xs },
  compBarPair: { flexDirection: 'row', gap: 3, alignItems: 'flex-end' },
  compBar: { width: 18, borderRadius: 3, minHeight: 2 },
  compBarLabel: { fontSize: fontSize.xs, fontWeight: '700', letterSpacing: 0.8, color: colors.ink3, textTransform: 'uppercase' },
});

// ── Insight Detail Modal styles ───────────────────────────────────────────────
const ins = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.line2 },
  closeBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.layer2, borderWidth: 1, borderColor: colors.line2, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 16, fontWeight: '600', color: colors.ink },
  scroll: { padding: 18, gap: 16, paddingBottom: 48 },
  heroCard: { backgroundColor: colors.layer1, borderWidth: 1, borderColor: colors.line, borderRadius: 20, padding: 24, alignItems: 'center', gap: 10 },
  heroEmoji: { fontSize: 48 },
  heroTitle: { fontSize: 20, fontWeight: '800', color: colors.ink, textAlign: 'center' },
  heroBadge: { backgroundColor: 'rgba(124,77,255,0.15)', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 4 },
  heroBadgeTxt: { fontSize: 9, fontWeight: '700', color: colors.lavender, letterSpacing: 1.2 },
  section: { backgroundColor: colors.layer1, borderWidth: 1, borderColor: colors.line, borderRadius: 16, padding: 16, gap: 8 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sectionNum: { width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(124,77,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  sectionNumTxt: { fontSize: 12, fontWeight: '700', color: colors.lavender },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: colors.ink, flex: 1 },
  sectionBody: { fontSize: 14, color: colors.ink2, lineHeight: 22 },
  actionCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: 'rgba(74,222,128,0.1)', borderWidth: 1, borderColor: 'rgba(74,222,128,0.25)', borderRadius: 16, padding: 16 },
  actionTxt: { fontSize: 13, color: colors.ink2, flex: 1, lineHeight: 20 },
});
