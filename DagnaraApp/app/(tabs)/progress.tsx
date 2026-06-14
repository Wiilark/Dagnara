import { useState, useEffect, useMemo, useRef } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Modal, TextInput, Alert, Image, Dimensions, Animated, Platform } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Svg, { Circle, Defs, LinearGradient as SvgLinearGradient, Stop, G, Text as SvgText, Path, Line } from 'react-native-svg';
import { useDiaryStore, type DiaryEntry } from '../../src/store/diaryStore';
import { useAppStore } from '../../src/store/appStore';
import { useAuthStore } from '../../src/store/authStore';
import { formatWeight, parseWeight, weightUnit, type UnitSystem } from '../../src/lib/units';
import { colors, spacing, fontSize, radius } from '../../src/theme';
import { FloatingModalHeader } from '../../src/components/FloatingModalHeader';
import { fmt } from '../../src/lib/format';
import { usePremium, PremiumBadge, PremiumLock } from '../../src/components/Premium';

// ── Life Score Questions ──────────────────────────────────────────────────────
const LS_QUESTIONS = [
  { q: 'Whole fruit', hint: 'Fresh, frozen, or dried', emoji: '🍓', type: 'positive' },
  { q: 'Leafy green vegetables', hint: 'Spinach, kale, salad greens', emoji: '🥦', type: 'positive' },
  { q: 'Colourful vegetables', hint: 'Peppers, carrots, beetroot', emoji: '🫑', type: 'positive' },
  { q: 'Nuts and seeds', hint: 'Almonds, walnuts, chia', emoji: '🥜', type: 'positive' },
  { q: 'Healthy cooking oils', hint: 'Olive oil, avocado oil', emoji: '🫒', type: 'positive' },
  { q: 'Plain oats / whole grains', hint: 'Oatmeal, brown rice', emoji: '🌾', type: 'positive' },
  { q: 'Processed meat', hint: 'Sausages, bacon, deli meat', emoji: '🥩', type: 'negative' },
  { q: 'Fast food', hint: 'Takeaway, fried food', emoji: '🍔', type: 'negative' },
  { q: 'Sugary drinks', hint: 'Soda, juice, energy drinks', emoji: '🧃', type: 'negative' },
  { q: 'Plain water', hint: '8+ glasses per day', emoji: '💧', type: 'positive' },
  { q: 'Exercise (any)', hint: 'Walking, cycling, sports', emoji: '🚶', type: 'positive' },
  { q: 'Vigorous exercise', hint: 'Running, HIIT, intense gym', emoji: '💪', type: 'positive' },
  { q: 'Sitting >8 hours', hint: 'Desk work, screen time', emoji: '🛋️', type: 'negative' },
  { q: 'Sleep 7-9 hours', hint: 'Quality uninterrupted sleep', emoji: '😴', type: 'positive' },
  { q: 'Felt stressed', hint: 'Work, relationships, finances', emoji: '😤', type: 'negative' },
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

/**
 * The Life Score is a *weekly* check-in. It resets every Sunday at 22:00 local
 * time — once that boundary passes, the previous week's score is treated as
 * expired so the user is prompted to input the new week.
 *
 * Returns the most recent Sunday-22:00 instant at or before `now`.
 */
function lastWeeklyReset(now = new Date()): Date {
  const reset = new Date(now);
  reset.setHours(22, 0, 0, 0);
  // Step back to the most recent Sunday (getDay() === 0).
  reset.setDate(reset.getDate() - reset.getDay());
  // If that lands in the future (e.g. it's Sunday before 22:00), use last week's.
  if (reset > now) reset.setDate(reset.getDate() - 7);
  return reset;
}

/**
 * True when a check-in taken on `takenDate` (YYYY-MM-DD) predates this week's reset.
 *
 * Compares at *day* granularity: a check-in carries only a date (see setLifeScore),
 * so a score saved on the reset Sunday — even after 22:00 — belongs to the new week
 * and must not be marked expired. Comparing the stored noon instant against the
 * 22:00 reset instant would wrongly expire every Sunday-night check-in.
 */
function isLifeScoreExpired(takenDate: string | null, now = new Date()): boolean {
  if (!takenDate) return false;
  return takenDate < dateStr(lastWeeklyReset(now));
}

function scoreColor(s: number) {
  if (s >= 120) return colors.green;
  if (s >= 80) return colors.sky;
  if (s >= 50) return colors.honey;
  return colors.rose;
}

function dateStr(d: Date) { return d.toLocaleDateString('en-CA'); }

const PILLARS = [
  { key: 'nutrition', label: 'Nutrition', emoji: '🥗', color: colors.pillarNutrition, max: 40 },
  { key: 'sleep',     label: 'Sleep',     emoji: '😴', color: colors.pillarSleep, max: 30 },
  { key: 'activity',  label: 'Activity',  emoji: '🏃', color: colors.pillarActivity,  max: 30 },
  { key: 'hydration', label: 'Hydration', emoji: '💧', color: colors.pillarHydration,    max: 25 },
  { key: 'mindset',   label: 'Mindset',   emoji: '🧘', color: colors.pillarMindset,   max: 25 },
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

// ── Logging Calendar (Interactive Activity Hub) ──────────────────────────────
function LoggingCalendar({ entries }: { entries: Record<string, DiaryEntry> }) {
  const { unitSystem, weightHistory } = useAppStore();
  const [gridWidth, setGridWidth] = useState(0);
  const [viewDate, setViewDate] = useState(new Date());
  const [selectedDayKey, setSelectedDayKey] = useState(new Date().toLocaleDateString('en-CA'));

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const monthName = viewDate.toLocaleDateString('en-US', { month: 'long' }).toUpperCase();
  const now = new Date();
  const todayKey = now.toLocaleDateString('en-CA');

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = new Date(year, month, 1);
  const startPadding = (firstDayOfMonth.getDay() + 6) % 7;

  type DayCell = { day: number; date: string; kcal: number; weight?: number; status: 'future' | 'logged' | 'partial' | 'none' };
  const days: DayCell[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month, d);
    const key = date.toLocaleDateString('en-CA');
    const entry = entries[key];
    const weightEntry = weightHistory.find(w => w.date === key);
    const kcal = (entry?.foods ?? []).reduce((s: number, f) => s + f.kcal, 0);

    days.push({
      day: d,
      date: key,
      kcal,
      weight: weightEntry?.kg,
      status: key > todayKey ? 'future' : (kcal >= 1200 ? 'logged' : kcal > 0 ? 'partial' : 'none')
    });
  }

  const cells = [...Array(startPadding).fill(null), ...days];
  const loggedInMonth = days.filter(d => d.status === 'logged' || d.status === 'partial').length;
  const frequency = Math.round((loggedInMonth / daysInMonth) * 100);

  const selectedData = days.find(d => d.date === selectedDayKey);
  const CAL_GAP = 5;
  const cellSize = gridWidth > 0 ? Math.floor((gridWidth - CAL_GAP * 6) / 7) : 0;

  const changeMonth = (offset: number) => {
    const next = new Date(year, month + offset, 1);
    if (next.getFullYear() !== now.getFullYear()) return; // Lock to current year
    setViewDate(next);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const isFirstMonth = month === 0;
  const isLastMonth = month === 11;

  return (
    <View style={st.card}>
      <View style={st.calHeader}>
        <Text style={st.calMonthTitle}>{monthName} {year}</Text>
        <View style={st.calNavHorizontal}>
          <TouchableOpacity 
            onPress={() => changeMonth(-1)} 
            style={[st.calNavBtn, isFirstMonth && { opacity: 0.3 }]}
            disabled={isFirstMonth}
          >
            <Ionicons name="chevron-up" size={18} color={colors.ink2} />
          </TouchableOpacity>
          <TouchableOpacity 
            onPress={() => changeMonth(1)} 
            style={[st.calNavBtn, isLastMonth && { opacity: 0.3 }]}
            disabled={isLastMonth}
          >
            <Ionicons name="chevron-down" size={18} color={colors.ink2} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={st.calWeekRow}>
        {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((d, i) => (
          <Text key={i} style={st.calWeekDay}>{d}</Text>
        ))}
      </View>

      <View style={[st.calGrid, { gap: CAL_GAP }]}
        onLayout={e => setGridWidth(e.nativeEvent.layout.width)}>
        {cellSize > 0 && cells.map((cell, i) => {
          if (!cell) return <View key={`p${i}`} style={{ width: cellSize, height: cellSize }} />;

          const isToday = cell.date === todayKey;
          const isSelected = cell.date === selectedDayKey;
          const bg = cell.status === 'logged' ? colors.green
            : cell.status === 'partial' ? colors.honey
            : cell.status === 'future' ? colors.layer3 + '33'
            : colors.rose + '26';

          return (
            <TouchableOpacity
              key={cell.date}
              activeOpacity={0.7}
              onPress={() => { setSelectedDayKey(cell.date); Haptics.selectionAsync(); }}
              style={[
                st.calCell,
                { width: cellSize, height: cellSize, backgroundColor: bg },
                isToday && { borderWidth: 1.5, borderColor: colors.lavender },
                isSelected && !isToday && { borderWidth: 1.5, borderColor: colors.ink3 },
                cell.status === 'none' && { borderWidth: 1, borderColor: colors.rose + '30' }
              ]}
            >
              <Text style={[
                st.calDayNum,
                { fontSize: cellSize > 35 ? 10 : 9 },
                (cell.status === 'logged' || cell.status === 'partial') ? { color: colors.white } :
                cell.status === 'none' ? { color: colors.rose } : { color: colors.ink3 }
              ]}>{cell.day}</Text>
              {cell.weight && <View style={st.calWeightDot} />}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Consistency + Details Area */}
      <View style={st.calFooter}>
        <View style={st.calFreqRow}>
          <View style={st.calFreqBadge}>
            <Text style={st.calFreqTxt}>{frequency}% CONSISTENCY</Text>
          </View>
        </View>

        {selectedData && (
          <View style={st.calDetail}>
            <View style={st.calDetailHead}>
              <Text style={st.calDetailDate}>
                {new Date(selectedData.date + 'T12:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
              </Text>
              {selectedData.date === todayKey && <Text style={st.calTodayBadge}>TODAY</Text>}
            </View>
            <View style={st.calDetailGrid}>
              <View style={st.calDetailItem}>
                <Text style={st.calDetailVal}>{selectedData.kcal || '0'}</Text>
                <Text style={st.calDetailLbl}>kcal</Text>
              </View>
              <View style={[st.calDetailItem, { borderLeftWidth: 1, borderLeftColor: colors.line }]}>
                <Text style={st.calDetailVal}>{selectedData.weight ? formatWeight(selectedData.weight, unitSystem) : '—'}</Text>
                <Text style={st.calDetailLbl}>weight</Text>
              </View>
              <View style={[st.calDetailItem, { borderLeftWidth: 1, borderLeftColor: colors.line }]}>
                <Ionicons
                  name={selectedData.status === 'logged' ? 'checkmark-circle' : selectedData.status === 'partial' ? 'remove-circle' : 'close-circle'}
                  size={18}
                  color={selectedData.status === 'logged' ? colors.green : selectedData.status === 'partial' ? colors.honey : colors.rose}
                />
                <Text style={st.calDetailLbl}>{selectedData.status === 'logged' ? 'Complete' : selectedData.status === 'partial' ? 'Partial' : 'No Log'}</Text>
              </View>
            </View>
          </View>
        )}
      </View>

      <View style={st.calLegend}>
        {[[colors.green,'Goal met'],[colors.honey,'Partial'],[colors.rose + '66','Missed']].map(([c,l]) => (
          <View key={l} style={st.calLegendItem}>
            <View style={[st.calLegendDot, { backgroundColor: c }]} />
            <Text style={st.calLegendTxt}>{l}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ── Weight Chart ─────────────────────────────────────────────────────────────
function WeightChart({
  weightHistory,
  unitSystem,
}: {
  weightHistory: { date: string; kg: number }[];
  unitSystem: UnitSystem;
}) {
  const SCREEN_W = Dimensions.get('window').width;
  const CHART_W = SCREEN_W - spacing.md * 2 - spacing.lg * 2;
  const CHART_H = 160;
  const PAD_L = 38;
  const INNER_W = CHART_W - PAD_L;
  const today = new Date().toLocaleDateString('en-CA');
  const last = weightHistory.slice(-14);
  const hasToday = last.length > 0 && last[last.length - 1].date === today;

  const kgValues = last.map(w => w.kg);
  const dataMin = last.length ? Math.min(...kgValues) : 60;
  const dataMax = last.length ? Math.max(...kgValues) : 80;
  const spreadPad = Math.max(2, (dataMax - dataMin) * 0.4 + 1);
  const minKg = dataMin - spreadPad;
  const maxKg = dataMax + spreadPad;
  const range = maxKg - minKg;
  const midKg = (minKg + maxKg) / 2;

  const toY = (kg: number) => Math.max(4, Math.min(CHART_H - 4, CHART_H - ((kg - minKg) / range) * CHART_H));
  const toX = (i: number) => PAD_L + (last.length <= 1 ? INNER_W / 2 : (i / (last.length - 1)) * INNER_W);

  const points = last.map((w, i) => ({ x: toX(i), y: toY(w.kg), date: w.date }));
  const latestPt = points[points.length - 1] ?? { x: PAD_L + INNER_W / 2, y: CHART_H / 2 };
  const latestKg = last[last.length - 1]?.kg;

  const lineD = points.length >= 2
    ? points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
    : '';
  const fillD = lineD ? `${lineD} L ${latestPt.x} ${CHART_H} L ${PAD_L} ${CHART_H} Z` : '';

  return (
    <View style={{ marginTop: spacing.sm }}>
      <View style={{ width: CHART_W, height: CHART_H }}>
        <Svg width={CHART_W} height={CHART_H}>
          <Defs>
            <SvgLinearGradient id="wFill" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor={colors.sky} stopOpacity="0.2" />
              <Stop offset="100%" stopColor={colors.sky} stopOpacity="0" />
            </SvgLinearGradient>
            <SvgLinearGradient id="wLine" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0%" stopColor={colors.sky} stopOpacity="0.6" />
              <Stop offset="100%" stopColor={colors.lavender} stopOpacity="1" />
            </SvgLinearGradient>
          </Defs>
          {/* Grid lines */}
          {([0.25, 0.5, 0.75] as const).map(f => (
            <Line key={f} x1={PAD_L} y1={CHART_H * f} x2={CHART_W} y2={CHART_H * f}
              stroke={colors.line} strokeWidth={1} />
          ))}
          {/* Y-axis labels */}
          <SvgText x={PAD_L - 4} y={8} textAnchor="end" fill={colors.ink3} fontSize={fontSize.xs - 2}>{fmt(maxKg, 1)}</SvgText>
          <SvgText x={PAD_L - 4} y={CHART_H / 2 + 3} textAnchor="end" fill={colors.ink3} fontSize={fontSize.xs - 2}>{fmt(midKg, 1)}</SvgText>
          <SvgText x={PAD_L - 4} y={CHART_H - 2} textAnchor="end" fill={colors.ink3} fontSize={fontSize.xs - 2}>{fmt(minKg, 1)}</SvgText>
          {/* Fill */}
          {fillD !== '' && <Path d={fillD} fill="url(#wFill)" />}
          {/* Line */}
          {lineD !== '' && <Path d={lineD} fill="none" stroke="url(#wLine)" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />}
          {/* Historical dots */}
          {points.slice(0, -1).map((p, i) => (
            <Circle key={i} cx={p.x} cy={p.y} r={3} fill={colors.sky} opacity={0.55} />
          ))}
          {/* Latest dot — prominent glow ring + bright core + value label */}
          <Circle cx={latestPt.x} cy={latestPt.y} r={18} fill={hasToday ? colors.lavender : colors.sky} opacity={0.15} />
          <Circle cx={latestPt.x} cy={latestPt.y} r={10} fill={hasToday ? colors.lavender : colors.sky} opacity={0.3} />
          <Circle cx={latestPt.x} cy={latestPt.y} r={6} fill={hasToday ? colors.lavender : colors.sky} stroke={colors.layer1} strokeWidth={2.5} />
          {latestKg !== undefined && (
            <SvgText
              x={latestPt.x}
              y={latestPt.y - 14}
              textAnchor="middle"
              fill={hasToday ? colors.lavender : colors.sky}
              fontSize={fontSize.xs}
              fontWeight="700"
            >{formatWeight(latestKg, unitSystem)}</SvgText>
          )}
        </Svg>
      </View>
      {/* X-axis dates */}
      {last.length >= 2 && (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingLeft: PAD_L, marginTop: spacing.xs }}>
          <Text style={{ fontSize: fontSize.xs - 2, color: colors.ink3 }}>
            {new Date(last[0].date + 'T12:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </Text>
          <Text style={{ fontSize: fontSize.xs - 2, color: colors.lavender }}>
            {new Date(last[last.length - 1].date + 'T12:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </Text>
        </View>
      )}
    </View>
  );
}

// ── Statistics Modal ──────────────────────────────────────────────────────────
const STAT_PERIODS = ['Week', '1 Month', '3 Months', 'All'] as const;
type StatPeriod = typeof STAT_PERIODS[number];

function StatisticsModal({ visible, onClose, entries, lifestyle }: {
  visible: boolean; onClose: () => void; entries: Record<string, DiaryEntry>;
  lifestyle: { label: string; pct: number; color: string }[];
}) {
  const [period, setPeriod] = useState<StatPeriod>('Week');
  const scrollY = useRef(new Animated.Value(0)).current;

  const allDays = useMemo(() => {
    const keys = Object.keys(entries).sort();
    if (!keys.length) return 90;
    const earliest = new Date(keys[0] + 'T12:00');
    const span = Math.ceil((Date.now() - earliest.getTime()) / 86400000) + 1;
    return Math.max(7, Math.min(365, span));
  }, [entries]);
  const days = period === 'Week' ? 7 : period === '1 Month' ? 30 : period === '3 Months' ? 90 : allDays;
  const bars: { label: string; kcal: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const key = d.toLocaleDateString('en-CA');
    const kcal = (entries[key]?.foods ?? []).reduce((s: number, f) => s + f.kcal, 0);
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
        <FloatingModalHeader scrollY={scrollY} title="Statistics" onBack={onClose} staticTitle />

        <Animated.ScrollView
          contentContainerStyle={stat.scroll}
          showsVerticalScrollIndicator={false}
          scrollEventThrottle={16}
          onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })}
        >
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
              { label: 'Avg daily', val: avg > 0 ? fmt(avg) : '—', unit: 'kcal' },
              { label: 'Total', val: total > 0 ? `${fmt(total / 1000, 1)}k` : '—', unit: 'kcal' },
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
                    <View style={[stat.bar, { height: h, backgroundColor: b.kcal > 0 ? colors.lavender : colors.purple + '26' }]} />
                    {b.label ? <Text style={stat.barLbl}>{b.label}</Text> : null}
                  </View>
                );
              })}
            </View>
            {avg > 0 && (
              <View style={stat.avgLine}>
                <Text style={stat.avgTxt}>Daily avg: {fmt(avg)} kcal</Text>
              </View>
            )}
          </View>

          {/* Lifestyle breakdown */}
          <View style={stat.lifestyleCard}>
            <View style={stat.lifestyleHead}>
              <Text style={stat.cardLbl}>LIFESTYLE BREAKDOWN</Text>
              <PremiumBadge />
            </View>
            {lifestyle.every(r => r.pct === 0) ? (
              <Text style={stat.lsEmpty}>Take the Weekly Check-In to see your lifestyle breakdown.</Text>
            ) : lifestyle.map(r => (
              <View key={r.label} style={stat.lsRow}>
                <Text style={stat.lsLbl}>{r.label}</Text>
                <View style={stat.lsTrack}>
                  <View style={[stat.lsBar, { width: `${r.pct}%`, backgroundColor: r.color }]} />
                </View>
                <Text style={[stat.lsPct, { color: r.color }]}>{r.pct}%</Text>
              </View>
            ))}
          </View>
        </Animated.ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

// ── Daily Progress Modal ──────────────────────────────────────────────────────
function DailyProgressModal({ visible, onClose, entries }: {
  visible: boolean; onClose: () => void; entries: Record<string, DiaryEntry>;
}) {
  const { calorieGoal: storeCalGoal, macroPcts } = useAppStore();
  const scrollY = useRef(new Animated.Value(0)).current;
  const today = new Date().toLocaleDateString('en-CA');
  const todayEntry = entries[today];
  const foods = todayEntry?.foods ?? [];
  const kcal = foods.reduce((s: number, f) => s + f.kcal, 0);
  const carbs = foods.reduce((s: number, f) => s + f.carbs, 0);
  const protein = foods.reduce((s: number, f) => s + f.protein, 0);
  const fat = foods.reduce((s: number, f) => s + f.fat, 0);

  const KCAL_GOAL   = storeCalGoal || 2000;
  const CARBS_GOAL  = Math.round(KCAL_GOAL * (macroPcts.carbs / 100) / 4);
  const PROT_GOAL   = Math.round(KCAL_GOAL * (macroPcts.protein / 100) / 4);
  const FAT_GOAL    = Math.round(KCAL_GOAL * (macroPcts.fat / 100) / 9);
  // Cumulative arc offsets for the goal donut: each macro starts where the previous ended.
  const cPct = macroPcts.carbs / 100;
  const pPct = macroPcts.protein / 100;
  const fPct = macroPcts.fat / 100;
  const protOffset  = 0.25;                       // start at top (12 o'clock)
  const carbsOffset = 0.25 - pPct;
  const fatOffset   = 0.25 - pPct - cPct;
  const dateLabel = new Date().toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'short' }).toUpperCase();

  // 7-day bars
  const weekBars = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - i));
    const key = d.toLocaleDateString('en-CA');
    const dayKcal = (entries[key]?.foods ?? []).reduce((s: number, f) => s + f.kcal, 0);
    const label = d.toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 2);
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
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={dp2.safe} edges={['top', 'bottom']}>
        <FloatingModalHeader scrollY={scrollY} title="Daily progress" staticTitle onBack={onClose} />

        <Animated.ScrollView
          contentContainerStyle={dp2.scroll}
          showsVerticalScrollIndicator={false}
          onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })}
          scrollEventThrottle={16}
        >
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
            { lbl: 'PROTEIN', val: protein, goal: PROT_GOAL, unit: 'g', color: colors.macroProtein },
            { lbl: 'CARBS', val: carbs, goal: CARBS_GOAL, unit: 'g', color: colors.macroCarbs },
            { lbl: 'FAT', val: fat, goal: FAT_GOAL, unit: 'g', color: colors.macroFat },
          ].map(({ lbl, val, goal, unit, color }) => (
            <View key={lbl} style={dp2.intakeRow}>
              <View style={dp2.intakeMeta}>
                <Text style={dp2.intakeLbl}>{lbl}</Text>
                <Text style={dp2.intakeVal}>{fmt(val)} / {fmt(goal)} {unit.toUpperCase()}</Text>
              </View>
              <View style={dp2.intakeTrack}>
                <View style={[dp2.intakeFill, {
                  width: `${Math.min(100, goal > 0 ? (val / goal) * 100 : 0)}%`,
                  backgroundColor: color,
                }]} />
              </View>
            </View>
          ))}

          {/* Goal intake donut */}
          <Text style={dp2.h2}>Goal intake</Text>
          <View style={dp2.donutCard}>
            <View style={dp2.donutLegend}>
              {[
                [colors.macroProtein, `${macroPcts.protein}%`, 'PROTEIN'],
                [colors.macroCarbs,   `${macroPcts.carbs}%`,   'CARBS'],
                [colors.macroFat,     `${macroPcts.fat}%`,     'FAT'],
              ].map(([c, p, l]) => (
                <View key={l} style={dp2.legendItem}>
                  <View style={[dp2.legendDot, { backgroundColor: c }]} />
                  <Text style={dp2.legendTxt}>{p} {l}</Text>
                </View>
              ))}
            </View>
            <Svg width={72} height={72} viewBox="0 0 72 72">
              <Circle cx="36" cy="36" r="28" fill="none" stroke={colors.line} strokeWidth={10} />
              <Circle cx="36" cy="36" r="28" fill="none" stroke={colors.macroProtein} strokeWidth={10}
                strokeDasharray={`${CIRC * pPct} ${CIRC}`} strokeDashoffset={CIRC * protOffset}
                transform="rotate(-90 36 36)" />
              <Circle cx="36" cy="36" r="28" fill="none" stroke={colors.macroCarbs} strokeWidth={10}
                strokeDasharray={`${CIRC * cPct} ${CIRC}`} strokeDashoffset={CIRC * carbsOffset}
                transform="rotate(-90 36 36)" />
              <Circle cx="36" cy="36" r="28" fill="none" stroke={colors.macroFat} strokeWidth={10}
                strokeDasharray={`${CIRC * fPct} ${CIRC}`} strokeDashoffset={CIRC * fatOffset}
                transform="rotate(-90 36 36)" />
            </Svg>
          </View>

          {/* Your intake donut */}
          <Text style={dp2.h2}>Your intake</Text>
          <View style={dp2.donutCard}>
            <View style={dp2.donutLegend}>
              {[
                [colors.macroProtein, `${protPct}%`, 'PROTEIN'],
                [colors.macroCarbs, `${carbsPct}%`, 'CARBS'],
                [colors.macroFat, `${fatPct}%`, 'FAT'],
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
                  <Circle cx="36" cy="36" r="28" fill="none" stroke={colors.macroProtein} strokeWidth={10}
                    strokeDasharray={`${protArc} ${CIRC}`} strokeDashoffset={CIRC * 0.25}
                    transform="rotate(-90 36 36)" />
                  <Circle cx="36" cy="36" r="28" fill="none" stroke={colors.macroCarbs} strokeWidth={10}
                    strokeDasharray={`${carbsArc} ${CIRC}`} strokeDashoffset={-(protArc - CIRC * 0.25)}
                    transform="rotate(-90 36 36)" />
                  <Circle cx="36" cy="36" r="28" fill="none" stroke={colors.macroFat} strokeWidth={10}
                    strokeDasharray={`${fatArc} ${CIRC}`} strokeDashoffset={-(protArc + carbsArc - CIRC * 0.25)}
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
        </Animated.ScrollView>
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
          <TouchableOpacity style={ins.closeBtn} onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="close" size={22} color={colors.ink2} />
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
  entries: Record<string, DiaryEntry>,
  calorieGoal: number,
  weightGoal: string,
  weightHistory: { date: string; kg: number }[],
  proteinPct: number
): Insight[] {
  const insights: Insight[] = [];
  const today = new Date();

  const last14 = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(today); d.setDate(today.getDate() - (13 - i));
    const key = d.toLocaleDateString('en-CA');
    const foods = entries[key]?.foods ?? [];
    const dow = d.getDay();
    return {
      date: key,
      kcal:    foods.reduce((s: number, f) => s + f.kcal, 0),
      protein: foods.reduce((s: number, f) => s + f.protein, 0),
      carbs:   foods.reduce((s: number, f) => s + f.carbs, 0),
      fat:     foods.reduce((s: number, f) => s + f.fat, 0),
      isWeekend: dow === 0 || dow === 6,
    };
  });

  const last7    = last14.slice(7);
  const logged7  = last7.filter(d => d.kcal > 0);
  if (logged7.length < 2) return [];

  const PROTEIN_GOAL = Math.round(calorieGoal * (proteinPct / 100) / 4);
  const avg7kcal    = Math.round(logged7.reduce((s, d) => s + d.kcal, 0) / logged7.length);
  const avg7protein = Math.round(logged7.reduce((s, d) => s + d.protein, 0) / logged7.length);
  const kcalDiff    = avg7kcal - calorieGoal;

  // 1 — Calorie vs goal
  if (kcalDiff > 200) {
    insights.push({
      id: 'kcal_over', emoji: '⚡',
      title: `${kcalDiff} kcal above goal daily`,
      body: `7-day average: ${avg7kcal} kcal vs ${calorieGoal} goal. ${weightGoal === 'lose' ? 'This slows fat loss — try cutting one snack.' : weightGoal === 'maintain' ? 'Eating above maintenance — watch the trend if you want to stay steady.' : 'Supports your muscle-gain goal.'}`,
      color: kcalDiff > 400 ? colors.rose : colors.honey,
    });
  } else if (kcalDiff < -250) {
    insights.push({
      id: 'kcal_under', emoji: '📉',
      title: `${Math.abs(kcalDiff)} kcal under goal daily`,
      body: `Averaging ${avg7kcal} kcal vs ${calorieGoal} goal. ${weightGoal === 'lose' ? 'Healthy deficit — stay consistent.' : weightGoal === 'maintain' ? 'Slightly under maintenance — fine short-term, but avoid under-fuelling consistently.' : 'Under-eating stunts muscle growth and energy.'}`,
      color: weightGoal === 'lose' ? colors.green : weightGoal === 'maintain' ? colors.sky : colors.honey,
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
          ? `Weekday avg ${fmt(wdAvg)} kcal → weekend avg ${fmt(weAvg)}. Social eating and late-night snacking are the usual culprits.`
          : `Weekday avg ${fmt(wdAvg)} kcal → weekend avg ${fmt(weAvg)}. Make sure you're fuelling rest-day recovery properly.`,
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
      const rate = fmt(Math.abs(kgPerWeek), 2);
      const healthy = Math.abs(kgPerWeek) <= 0.75;
      insights.push({
        id: 'weight_rate', emoji: '⚖️',
        title: `${dir === 'losing' ? '↓' : '↑'} ${rate} kg/week`,
        body: weightGoal === 'maintain'
          ? (healthy
            ? `Trending ${dir === 'losing' ? 'down' : 'up'} — adjust intake slightly to stay at maintenance.`
            : `${fmt(Math.abs(kgPerWeek), 1)} kg/week is too fast a ${dir === 'losing' ? 'drop' : 'gain'} — recalibrate your calorie intake.`)
          : (healthy
            ? `${dir === 'losing' ? 'Healthy loss rate' : 'Solid lean-gain pace'} — keep your current intake and activity level.`
            : `${fmt(Math.abs(kgPerWeek), 1)} kg/week is ${dir === 'losing' ? 'aggressive — monitor energy and muscle retention' : 'fast — some may be fat, not muscle'}.`),
        color: weightGoal === 'maintain' ? colors.honey : (healthy ? colors.green : colors.honey),
      });
    }
  }

  return insights.slice(0, 4);
}

interface ProgressPhoto { uri: string; date: string; }

export default function ProgressScreen() {
  const { entries, selectedDate } = useDiaryStore();
  const { lifeScore: rawLifeScore, lifeScoreDate, streak, weightHistory, addWeightEntry, setLifeScore, calorieGoal, weightGoal, hasUnread, addXp, unitSystem, macroPcts } = useAppStore();
  const { email, profile } = useAuthStore();
  // Life Score resets every Sunday 22:00 — once expired it reads as "not taken"
  // so the card prompts a fresh weekly check-in. The stored number is untouched.
  const lifeScore = isLifeScoreExpired(lifeScoreDate) ? null : rawLifeScore;

  const [lsVisible, setLsVisible] = useState(false);
  const lsScrollY = useRef(new Animated.Value(0)).current;
  const [statsVisible, setStatsVisible] = useState(false);
  const [dailyProgressVisible, setDailyProgressVisible] = useState(false);
  const [insightDetailVisible, setInsightDetailVisible] = useState(false);
  const isPremium = usePremium();
  // Premium features (analytics depth). Free during launch ⇒ isPremium is true
  // for everyone today; when billing ships, a locked tap deep-links to the Plans
  // screen so "tap to unlock" lands exactly where it promises.
  const openPro = (open: () => void) => () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (isPremium) open();
    else router.push('/(tabs)/profile?plans=1');
  };
  const [lsStep, setLsStep] = useState(0);
  const [lsAnswers, setLsAnswers] = useState<number[]>(Array(LS_QUESTIONS.length).fill(0));
  const [lsResult, setLsResult] = useState<number | null>(null);
  const [weightInput, setWeightInput] = useState('');
  const [progressPhotos, setProgressPhotos] = useState<ProgressPhoto[]>([]);
  const PHOTOS_KEY = `${email ?? 'anon'}_progress_photos`;

  useEffect(() => {
    AsyncStorage.getItem(PHOTOS_KEY).then(raw => {
      if (!raw) return;
      try { setProgressPhotos(JSON.parse(raw)); }
      catch { AsyncStorage.removeItem(PHOTOS_KEY); }
    });
  }, [PHOTOS_KEY]);

  async function addProgressPhoto() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission needed', 'Allow photo library access to add progress photos.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7, base64: false });
    if (result.canceled || !result.assets[0]) return;
    const photo: ProgressPhoto = { uri: result.assets[0].uri, date: new Date().toLocaleDateString('en-CA') };
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
  const today = new Date().toLocaleDateString('en-CA');
  const hasLoggedToday = weightHistory.some(w => w.date === today);

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
    return { val: fmt(val, 1), category, color };
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

  // Lifestyle breakdown for the Statistics modal: real per-pillar % (0 until checked in).
  const lifestyle = pillarScores
    .filter((p) => p.key !== 'mindset')
    .map((p) => ({ label: p.label, pct: p.max > 0 ? Math.round((p.score / p.max) * 100) : 0, color: p.color }));

  const insights = useMemo(
    () => generateInsights(entries, calorieGoal || 2000, weightGoal || 'maintain', weightHistory, macroPcts.protein),
    [entries, calorieGoal, weightGoal, weightHistory, macroPcts.protein]
  );

  const insets = useSafeAreaInsets();
  const scrollY = useRef(new Animated.Value(0)).current;
  const headerBlurOpacity = scrollY.interpolate({ inputRange: [20, 120], outputRange: [0, 1], extrapolate: 'clamp' });
  const headerH = 50 + insets.top + 16;
  const scrollPaddingTop = 60 + insets.top;

  return (
    <View style={st.safe}>
      <View style={[st.fixedHeader, { paddingTop: insets.top, height: headerH }]}>
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: headerBlurOpacity }]}>
          <BlurView tint="dark" intensity={Platform.OS === 'ios' ? 80 : 100} style={StyleSheet.absoluteFill} />
          <LinearGradient colors={['transparent', colors.bg]} style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 18 }} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} pointerEvents="none" />
        </Animated.View>
        <View style={st.appHeader}>
          <TouchableOpacity onPress={() => router.push('/(tabs)/profile')} style={st.avatarBtn}>
            <View style={st.avatarThumb}>
              <Text style={st.avatarInitial}>{(() => { const p = (profile?.name ?? '').trim().split(/\s+/).filter(Boolean); return p.length >= 2 ? (p[0][0] + p[p.length-1][0]).toUpperCase() : (p[0]?.[0] ?? email?.[0] ?? '?').toUpperCase(); })()}</Text>
            </View>
            {hasUnread && <View style={st.avatarDot} />}
          </TouchableOpacity>
          <View style={st.appTitleWrap} pointerEvents="none"><Text style={st.appTitle}>Progress</Text></View>
          <View style={st.headerRight}>
            <TouchableOpacity style={st.iconBtn} onPress={openPro(() => setStatsVisible(true))}>
              <Ionicons name={isPremium ? 'stats-chart-outline' : 'lock-closed-outline'} size={22} color={colors.ink2} />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <Animated.ScrollView
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })}
        scrollEventThrottle={16}
        contentContainerStyle={[st.scroll, { paddingTop: scrollPaddingTop }]}
        showsVerticalScrollIndicator={false}>
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
                <Text style={{ fontSize: fontSize.lg - 2 }}>{nextMilestone.emoji}</Text>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={st.milestoneName}>{nextMilestone.label}</Text>
                    <Text style={st.milestoneProg}>{streak} / {nextMilestone.days} days</Text>
                  </View>
                  <View style={st.milestoneTrack}>
                    <View style={[st.milestoneBar, { width: `${Math.min(milestoneProgress, 1) * 100}%` }]} />
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

          {/* Pillars breakdown — premium (Lifestyle Breakdown) */}
          {lifeScore !== null && (
            <PremiumLock unlocked={isPremium} onLockedPress={openPro(() => {})} label="Unlock breakdown with Premium">
              <View style={st.pillarsWrap}>
                {pillarScores.map((p) => (
                  <View key={p.key} style={st.pillarRow}>
                    <Text style={{ fontSize: fontSize.base + 1 }}>{p.emoji}</Text>
                    <Text style={st.pillarLabel}>{p.label}</Text>
                    <View style={st.pillarTrack}>
                      <View style={[st.pillarBar, { width: `${(p.score / p.max) * 100}%`, backgroundColor: p.color }]} />
                    </View>
                    <Text style={[st.pillarScore, { color: p.color }]}>{p.score}/{p.max}</Text>
                  </View>
                ))}
              </View>
            </PremiumLock>
          )}

          <TouchableOpacity style={st.lsBtn} onPress={startQuiz}>
            <Text style={st.lsBtnTxt}>✨ Weekly Check-In</Text>
          </TouchableOpacity>

          {/* AI Insights — premium */}
          {lifeScore !== null && (
            isPremium ? (
              <TouchableOpacity style={st.insightLocked} activeOpacity={0.8}
                onPress={openPro(() => setInsightDetailVisible(true))}>
                <View>
                  <Text style={st.insightBlurText}>Your weekly insight is ready</Text>
                  <Text style={st.insightBlurSub}>Tap to read today&apos;s insight</Text>
                </View>
                <PremiumBadge />
              </TouchableOpacity>
            ) : (
              <PremiumLock unlocked={false} onLockedPress={openPro(() => setInsightDetailVisible(true))} label="Unlock insight with Premium">
                <View style={st.insightLocked}>
                  <Text style={st.insightBlurText}>Your weekly insight is ready</Text>
                  <Text style={st.insightBlurSub}>Personalised guidance from your own data</Text>
                </View>
              </PremiumLock>
            )
          )}
        </View>

        {/* 7-day calorie chart */}
        <View style={st.card}>
          <Text style={st.cardLabel}>CALORIES — LAST 7 DAYS</Text>
          <View style={st.chart}>
            {days.map(({ label, kcal }, i) => (
              <View key={`${label}_${i}`} style={st.barCol}>
                {kcal > 0 && <Text style={st.barVal}>{kcal}</Text>}
                <View style={st.barTrack}>
                  <View style={[st.bar, { height: `${(kcal / maxKcal) * 100}%` }]} />
                </View>
                <Text style={st.barLabel}>{label}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Macros today */}
        <View style={st.card}>
          <Text style={st.cardLabel}>TODAY'S MACROS</Text>
          {[{ label: 'Protein', val: totalProtein, color: colors.macroProtein }, { label: 'Carbs', val: totalCarbs, color: colors.macroCarbs }, { label: 'Fat', val: totalFat, color: colors.macroFat }].map(({ label, val, color }) => (
            <View key={label} style={st.macroRow}>
              <Text style={st.macroLabel}>{label}</Text>
              <View style={st.macroTrack}>
                <View style={[st.macroBar, { width: `${(val / totalMacros) * 100}%`, backgroundColor: color }]} />
              </View>
              <Text style={[st.macroVal, { color }]}>{fmt(val)}g</Text>
            </View>
          ))}
        </View>

        {/* Weight tracker + trend (unified) */}
        <View style={st.card}>
          <Text style={st.cardLabel}>WEIGHT TREND</Text>
          <View style={st.weightRow}>
            <View style={{ flex: 1 }}>
              <Text style={[st.weightNum, { color: colors.sky }]}>{latestWeight ? formatWeight(latestWeight, unitSystem) : '—'}</Text>
              <Text style={st.weightLbl}>{hasLoggedToday ? 'Logged today' : 'Not logged today'}</Text>
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
          {weightHistory.length >= 1
            ? <WeightChart weightHistory={weightHistory} unitSystem={unitSystem} />
            : <Text style={{ fontSize: fontSize.sm, color: colors.ink3, textAlign: 'center', paddingVertical: spacing.md }}>Log your first weight to start tracking.</Text>
          }
          {weightHistory.length > 1 && (
            <View style={st.weightHistory}>
              {weightHistory.slice(-4).reverse().map((w, i) => (
                <View key={w.date} style={st.weightEntry}>
                  <Text style={st.weightEntryDate}>{new Date(w.date + 'T12:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</Text>
                  <Text style={[st.weightEntryVal, { color: i === 0 ? colors.sky : colors.ink3 }]}>{formatWeight(w.kg, unitSystem)}</Text>
                </View>
              ))}
            </View>
          )}
          {(() => {
            const tgt = parseFloat(profile?.targetWeight ?? '');
            const latest = weightHistory[weightHistory.length - 1]?.kg;
            if (!tgt || !latest) return null;
            const diff = tgt - latest;
            const absDiff = Math.abs(diff);
            if (absDiff < 0.1) return (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingTop: spacing.sm }}>
                <Text style={{ fontSize: fontSize.sm }}>🏆</Text>
                <Text style={{ fontSize: fontSize.sm, fontWeight: '700', color: colors.green }}>Goal reached! Target {formatWeight(tgt, unitSystem)}</Text>
              </View>
            );
            const label = unitSystem !== 'Metric' ? `${(absDiff * 2.205).toFixed(1)} lb` : `${absDiff.toFixed(1)} kg`;
            const arrow = diff > 0 ? '↑' : '↓';
            const color = weightGoal === 'gain' ? (diff > 0 ? colors.green : colors.honey) : (diff < 0 ? colors.green : colors.honey);
            return (
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.line, marginTop: spacing.sm }}>
                <Text style={{ fontSize: fontSize.xs, color: colors.ink3, fontWeight: '700', letterSpacing: 1.1, textTransform: 'uppercase' }}>Goal</Text>
                <Text style={{ fontSize: fontSize.sm, fontWeight: '700', color }}>{arrow} {label} to {formatWeight(tgt, unitSystem)}</Text>
              </View>
            );
          })()}
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
            { label: 'Kcal today', value: totalKcal, unit: 'kcal', color: colors.lavender, tap: openPro(() => setDailyProgressVisible(true)) },
            { label: 'Water', value: entry?.water ?? 0, unit: 'glasses', color: colors.metricWater, tap: undefined },
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

        <View style={{ height: 40 }} />
      </Animated.ScrollView>

      <StatisticsModal visible={statsVisible} onClose={() => setStatsVisible(false)} entries={entries} lifestyle={lifestyle} />
      <DailyProgressModal visible={dailyProgressVisible} onClose={() => setDailyProgressVisible(false)} entries={entries} />
      <InsightDetailModal visible={insightDetailVisible} onClose={() => setInsightDetailVisible(false)} />

      {/* Life Score Quiz Modal */}
      <Modal visible={lsVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setLsVisible(false)}>
        <SafeAreaView style={st.lsModal} edges={['top', 'bottom']}>
          <FloatingModalHeader
            scrollY={lsScrollY}
            title={lsResult === null ? 'Weekly Check-In' : 'Your Life Score'}
            onBack={() => setLsVisible(false)}
            staticTitle
          />

          {lsResult === null ? (
            <>
              <View style={st.lsProgressTrack}>
                <View style={[st.lsProgressBar, { width: `${progress}%` }]} />
              </View>

              <Animated.ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={st.lsContent}
                showsVerticalScrollIndicator={false}
                scrollEventThrottle={16}
                onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: lsScrollY } } }], { useNativeDriver: true })}
              >
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
              </Animated.ScrollView>

              <View style={st.lsNav}>
                {lsStep > 0 && (
                  <TouchableOpacity style={st.lsBackBtn} onPress={() => setLsStep(s => s - 1)}>
                    <Text style={{ color: colors.ink2, fontSize: fontSize.base }}>← Back</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={st.lsNextBtn}
                  onPress={() => { if (lsStep < LS_QUESTIONS.length - 1) setLsStep(s => s + 1); else finishQuiz(); }}
                >
                  <Text style={st.lsNextTxt}>{lsStep < LS_QUESTIONS.length - 1 ? 'Next →' : 'See Results ✨'}</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <ScrollView contentContainerStyle={st.lsResultWrap} showsVerticalScrollIndicator={false}>
              <Text style={st.lsResultEmoji}>🏆</Text>
              <Text style={[st.lsResultScore, { color: scoreColor(lsResult) }]}>{lsResult}</Text>
              <Text style={st.lsResultMax}>/ 150</Text>
              <Text style={[st.lsResultGrade, { color: scoreColor(lsResult) }]}>
                {lsResult >= 120 ? 'Excellent! Keep it up 🌟' : lsResult >= 80 ? 'Good job! Room to grow 💪' : lsResult >= 50 ? 'Fair — small changes help 🌱' : 'Start your journey today ❤️'}
              </Text>
              <TouchableOpacity style={st.lsDoneBtn} onPress={() => setLsVisible(false)}>
                <Text style={st.lsDoneTxt}>Done</Text>
              </TouchableOpacity>
            </ScrollView>
          )}
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  fixedHeader: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10, overflow: 'hidden' },
  scroll: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.lg },
  appHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingTop: spacing.xs, paddingBottom: spacing.lg, flex: 1 },
  iconBtn: { width: spacing.xl + spacing.sm, height: spacing.xl + spacing.sm, borderRadius: radius.pill, backgroundColor: colors.layer2, borderWidth: 1.5, borderColor: colors.line2, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  notifDot: { position: 'absolute', top: 8, right: 6, width: 6, height: 6, borderRadius: 3, backgroundColor: colors.rose },
  avatarDot: { position: 'absolute', top: -2, right: -2, width: 9, height: 9, borderRadius: radius.pill, backgroundColor: colors.rose, borderWidth: 1.5, borderColor: colors.bg },
  appTitleWrap: { position: 'absolute', left: 0, right: 0, top: spacing.xs, bottom: spacing.lg, alignItems: 'center', justifyContent: 'center', zIndex: 0 },
  appTitle: { fontSize: fontSize.xl, fontWeight: '800', color: colors.ink, textAlign: 'center' },
  headerRight: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4, width: spacing.xl + spacing.sm, zIndex: 1 },
  avatarBtn: { width: spacing.xl + spacing.sm, height: spacing.xl + spacing.sm, zIndex: 1 },
  avatarThumb: { width: spacing.xl + spacing.sm, height: spacing.xl + spacing.sm, borderRadius: radius.pill, backgroundColor: colors.purple, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: colors.purple2 },
  avatarInitial: { color: colors.white, fontSize: fontSize.sm + 1, fontWeight: '800' },
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
  milestoneRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  milestoneName: { fontSize: fontSize.sm, fontWeight: '700', color: colors.ink },
  milestoneProg: { fontSize: fontSize.xs, color: colors.ink3 },
  milestoneTrack: { height: 4, backgroundColor: colors.layer3, borderRadius: 2, marginTop: 6, overflow: 'hidden' },
  milestoneBar: { height: 4, backgroundColor: colors.honey, borderRadius: 2 },
  // Pillars
  pillarsWrap: { marginBottom: spacing.md, gap: spacing.xs },
  pillarRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs + 2 },
  pillarLabel: { width: 62, fontSize: fontSize.xs, color: colors.ink2 },
  pillarTrack: { flex: 1, height: 5, backgroundColor: colors.layer3, borderRadius: 3, overflow: 'hidden' },
  pillarBar: { height: 5, borderRadius: 3 },
  pillarScore: { width: 36, textAlign: 'right', fontSize: fontSize.xs, fontWeight: '600' },
  // Insight locked
  insightRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, paddingVertical: spacing.md, paddingLeft: spacing.sm, borderRadius: radius.sm, marginLeft: -spacing.sm },
  insightTitle: { fontSize: fontSize.sm, fontWeight: '700' },
  insightBody: { fontSize: fontSize.xs, color: colors.ink2, lineHeight: fontSize.xs * 1.55 },
  insightLocked: { marginTop: spacing.sm, backgroundColor: colors.layer2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line2, padding: spacing.md, overflow: 'hidden', position: 'relative' },
  insightBlurText: { fontSize: fontSize.sm, fontWeight: '700', color: colors.ink },
  insightBlurSub: { fontSize: fontSize.xs, color: colors.ink3, marginTop: 3 },
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
  barVal: { color: colors.ink3, fontSize: fontSize.xs },
  barTrack: { flex: 1, width: '70%', justifyContent: 'flex-end' },
  bar: { width: '100%', backgroundColor: colors.purple, borderRadius: 4, minHeight: 2 },
  barLabel: { color: colors.ink3, fontSize: fontSize.xs },
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
  lsProgressTrack: { height: 3, backgroundColor: colors.layer2, marginTop: spacing.xl + spacing.xl },
  lsProgressBar: { height: 3, backgroundColor: colors.purple },
  lsContent: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, alignItems: 'center' },
  lsEmoji: { fontSize: fontSize['2xl'] + 26, marginBottom: spacing.md, marginTop: spacing.lg },
  lsQuestion: { fontSize: fontSize.lg, fontWeight: '800', color: colors.ink, textAlign: 'center', marginBottom: spacing.xs },
  lsHint: { fontSize: fontSize.sm, color: colors.ink3, textAlign: 'center', marginBottom: spacing.lg },
  lsOptions: { width: '100%', gap: spacing.xs, marginTop: spacing.md },
  lsOption: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.layer1, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, padding: spacing.md },
  lsOptionSelected: { borderColor: colors.purple, backgroundColor: colors.purple + '11' },
  lsRadio: { width: 20, height: 20, borderRadius: radius.sm, borderWidth: 2, borderColor: colors.line3, alignItems: 'center', justifyContent: 'center' },
  lsRadioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.white },
  lsOptionTxt: { color: colors.ink2, fontSize: fontSize.base },
  lsNav: { flexDirection: 'row', gap: spacing.sm, padding: spacing.md },
  lsBackBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.layer2, borderRadius: radius.md, paddingVertical: spacing.sm },
  lsNextBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.purple, borderRadius: radius.md, paddingVertical: spacing.sm },
  lsNextTxt: { color: colors.white, fontWeight: '700', fontSize: fontSize.base },
  // Result
  lsResultWrap: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg, paddingTop: spacing.xl + spacing.xl, gap: spacing.md },
  lsResultEmoji: { fontSize: fontSize['2xl'] + 12 },
  lsResultScore: { fontSize: fontSize['2xl'] + 20, fontWeight: '800' },
  lsResultMax: { fontSize: fontSize.lg, color: colors.ink3, marginTop: -16 },
  lsResultGrade: { fontSize: fontSize.base, fontWeight: '600', textAlign: 'center' },
  lsDoneBtn: { backgroundColor: colors.purple, borderRadius: radius.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.xl, marginTop: spacing.md },
  lsDoneTxt: { color: colors.white, fontWeight: '700', fontSize: fontSize.base },
  // Statistics modal extra styles (stat.* used inline)

  // Calendar
  calHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md, height: 32 },
  calNavHorizontal: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  calNavBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.layer2, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.line2 },
  calFooter: { marginTop: spacing.md },
  calFreqRow: { alignItems: 'center', marginBottom: spacing.sm },
  calCount: { fontSize: fontSize.xs, color: colors.ink3, fontFamily: 'monospace' },
  calWeekRow: { flexDirection: 'row', marginBottom: spacing.xs / 2 },
  calWeekDay: { flex: 1, textAlign: 'center', fontSize: fontSize.xs, color: colors.ink3, fontFamily: 'monospace' },
  calGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  calCell: { borderRadius: 3, backgroundColor: colors.layer2 },
  calLegend: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
  calLegendItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs / 2 },
  calLegendDot: { width: spacing.xs + 2, height: spacing.xs + 2, borderRadius: 2 },
  calLegendTxt: { fontSize: fontSize.xs, color: colors.ink3 },
  calMonthTitle: { fontSize: fontSize.lg, fontWeight: '800', color: colors.ink, marginTop: -2 },
  calSubLabel: { fontSize: 10, fontWeight: '600', color: colors.ink3, textTransform: 'uppercase', letterSpacing: 0.5 },
  calDayNum: { fontWeight: '700', position: 'absolute', top: 2, left: 3 },
  calFreqBadge: { backgroundColor: colors.purple + '1a', paddingHorizontal: spacing.xs + 2, paddingVertical: 2, borderRadius: 4, borderWidth: 1, borderColor: colors.purple + '33' },
  calFreqTxt: { fontSize: 9, fontWeight: '800', color: colors.lavender, letterSpacing: 0.5 },
  calWeightDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: colors.sky, position: 'absolute', bottom: 3, right: 3 },
  calDetail: { backgroundColor: colors.layer2, borderRadius: radius.md, padding: spacing.sm, borderWidth: 1, borderColor: colors.line2 },
  calDetailHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm, paddingHorizontal: 4 },
  calDetailDate: { fontSize: fontSize.xs, fontWeight: '700', color: colors.ink2, textTransform: 'uppercase' },
  calTodayBadge: { fontSize: 9, fontWeight: '800', color: colors.white, backgroundColor: colors.lavender, paddingHorizontal: 4, paddingVertical: 1, borderRadius: 3 },
  calDetailGrid: { flexDirection: 'row', alignItems: 'center' },
  calDetailItem: { flex: 1, alignItems: 'center', gap: 2 },
  calDetailVal: { fontSize: fontSize.sm, fontWeight: '800', color: colors.ink },
  calDetailLbl: { fontSize: 9, fontWeight: '600', color: colors.ink3, textTransform: 'uppercase' },
  // Weight chart
  weightChartWrap: { gap: spacing.sm },
  weightChartLabels: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  weightChartLbl: { fontSize: fontSize.xs, color: colors.ink3 },
});

const stat = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing.md, gap: spacing.sm + 4, paddingTop: spacing.xl + spacing.xl, paddingBottom: spacing.xl + 4 },
  tabs: { flexDirection: 'row', backgroundColor: colors.layer2, borderRadius: radius.sm + 2, padding: 3, gap: 2 },
  tab: { flex: 1, paddingVertical: spacing.xs + 2, borderRadius: radius.sm, alignItems: 'center' },
  tabActive: { backgroundColor: colors.purple },
  tabTxt: { fontSize: fontSize.xs, fontWeight: '600', color: colors.ink3 },
  tabTxtActive: { color: colors.ink },
  summaryRow: { flexDirection: 'row', gap: spacing.sm },
  summaryTile: { flex: 1, backgroundColor: colors.layer2, borderWidth: 1, borderColor: colors.line2, borderRadius: radius.md, padding: spacing.sm + 2, alignItems: 'center', gap: 2 },
  summaryVal: { fontSize: fontSize.lg, fontWeight: '800', color: colors.ink },
  summaryUnit: { fontSize: fontSize.xs, color: colors.ink3 },
  summaryLbl: { fontSize: fontSize.xs, color: colors.ink3, textAlign: 'center' },
  chartCard: { backgroundColor: colors.layer2, borderWidth: 1, borderColor: colors.line2, borderRadius: radius.md, padding: spacing.sm + 4, gap: spacing.sm },
  cardLbl: { fontSize: fontSize.xs, fontWeight: '700', letterSpacing: 1, color: colors.ink3, textTransform: 'uppercase' },
  chartBars: { flexDirection: 'row', alignItems: 'flex-end', height: 128, gap: 2 },
  barCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: '100%', gap: 3 },
  bar: { width: '90%', borderRadius: spacing.xs / 2, minHeight: 2 },
  barLbl: { fontSize: fontSize.xs, color: colors.ink3, textAlign: 'center' },
  avgLine: { borderTopWidth: 1, borderTopColor: colors.line2, paddingTop: spacing.xs + 2 },
  avgTxt: { fontSize: fontSize.xs, color: colors.lavender, fontWeight: '600' },
  lifestyleCard: { backgroundColor: colors.layer2, borderWidth: 1, borderColor: colors.line2, borderRadius: radius.md, padding: spacing.sm + 4, gap: spacing.sm, position: 'relative', overflow: 'hidden' },
  lifestyleHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  lsRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs + 2 },
  lsLbl: { fontSize: fontSize.xs, color: colors.ink2, width: 110 },
  lsTrack: { flex: 1, height: 5, backgroundColor: colors.layer3, borderRadius: spacing.xs / 2, overflow: 'hidden' },
  lsBar: { height: '100%', borderRadius: spacing.xs / 2 },
  lsPct: { fontSize: fontSize.xs, fontWeight: '700', width: 34, textAlign: 'right' },
  lsEmpty: { fontSize: fontSize.sm, color: colors.ink3, textAlign: 'center', paddingVertical: spacing.md },
});

// ── Daily Progress Modal styles ────────────────────────────────────────────────
const dp2 = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing.md, paddingTop: spacing.xl + spacing.xl },
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
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md + 2, paddingVertical: spacing.sm + 2, borderBottomWidth: 1, borderBottomColor: colors.line2 },
  closeBtn: { width: 34, height: 34, borderRadius: radius.pill, backgroundColor: colors.layer2, borderWidth: 1, borderColor: colors.line2, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: fontSize.base, fontWeight: '600', color: colors.ink },
  scroll: { padding: spacing.md + 2, gap: spacing.md, paddingBottom: spacing.xl + 12 },
  heroCard: { backgroundColor: colors.layer1, borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg - 2, padding: spacing.lg, alignItems: 'center', gap: spacing.sm },
  heroEmoji: { fontSize: fontSize['2xl'] + 10 },
  heroTitle: { fontSize: fontSize.lg, fontWeight: '800', color: colors.ink, textAlign: 'center' },
  heroBadge: { backgroundColor: colors.purple + '26', borderRadius: radius.pill, paddingHorizontal: spacing.sm + 2, paddingVertical: 4 },
  heroBadgeTxt: { fontSize: fontSize.xs, fontWeight: '700', color: colors.lavender, letterSpacing: 1.2 },
  section: { backgroundColor: colors.layer1, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, padding: spacing.md, gap: spacing.xs + 2 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  sectionNum: { width: 26, height: 26, borderRadius: radius.pill, backgroundColor: colors.purple + '26', alignItems: 'center', justifyContent: 'center' },
  sectionNumTxt: { fontSize: fontSize.xs, fontWeight: '700', color: colors.lavender },
  sectionTitle: { fontSize: fontSize.base, fontWeight: '700', color: colors.ink, flex: 1 },
  sectionBody: { fontSize: fontSize.sm + 1, color: colors.ink2, lineHeight: 22 },
  actionCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 2, backgroundColor: colors.green + '1a', borderWidth: 1, borderColor: colors.green + '40', borderRadius: radius.md, padding: spacing.md },
  actionTxt: { fontSize: fontSize.sm, color: colors.ink2, flex: 1, lineHeight: 20 },
});
