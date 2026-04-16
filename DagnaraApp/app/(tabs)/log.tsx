import { useEffect, useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Rect, Line, Text as SvgText, Defs, LinearGradient as SvgGradient, Stop } from 'react-native-svg';
import { useShallow } from 'zustand/react/shallow';
import { useDiaryStore } from '../../src/store/diaryStore';
import { useAppStore } from '../../src/store/appStore';
import { colors, spacing, fontSize, radius } from '../../src/theme';

const DAYS = 7;
const SCREEN_W = Dimensions.get('window').width;
const CHART_H = 120;
const CHART_PAD_H = spacing.md;
const CHART_PAD_V = 16;
const BAR_AREA_W = SCREEN_W - spacing.md * 2 - CHART_PAD_H * 2;
const BAR_SLOT = BAR_AREA_W / DAYS;
const BAR_W = BAR_SLOT * 0.55;

function dateStr(d: Date) { return d.toISOString().split('T')[0]; }

function dayShort(iso: string) {
  return new Date(iso + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short' }).slice(0, 2);
}

export default function LogScreen() {
  const { entries, loadEntry } = useDiaryStore();
  const { calorieGoal: rawCalGoal, macroPcts } = useAppStore(
    useShallow((s) => ({ calorieGoal: s.calorieGoal, macroPcts: s.macroPcts }))
  );
  const calorieGoal = rawCalGoal || 2000;

  const dates = useMemo(() =>
    Array.from({ length: DAYS }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - i);
      return dateStr(d);
    }).reverse(),
  []);

  useEffect(() => {
    Promise.all(dates.map((d) => loadEntry(d)));
  }, []);

  const CARBS_GOAL   = Math.round(calorieGoal * (macroPcts.carbs   / 100) / 4);
  const PROTEIN_GOAL = Math.round(calorieGoal * (macroPcts.protein / 100) / 4);
  const FAT_GOAL     = Math.round(calorieGoal * (macroPcts.fat     / 100) / 9);

  function macroColor(val: number, goal: number) {
    const pct = goal > 0 ? val / goal : 0;
    if (pct >= 0.9) return colors.green;
    if (pct >= 0.6) return colors.honey;
    return colors.rose;
  }

  const dayData = useMemo(() => dates.map((date) => {
    const entry = entries[date];
    const foods = entry?.foods ?? [];
    const kcal = foods.reduce((s, f) => s + f.kcal, 0);
    const carbs = foods.reduce((s, f) => s + (f.carbs ?? 0), 0);
    const protein = foods.reduce((s, f) => s + (f.protein ?? 0), 0);
    const fat = foods.reduce((s, f) => s + (f.fat ?? 0), 0);
    return {
      date, foods, kcal, carbs, protein, fat,
      water: entry?.water ?? 0,
      burned: entry?.calories_burned ?? 0,
      sleep: entry?.sleep,
      cardioSessions: entry?.cardioSessions ?? [],
      strengthSessions: entry?.strengthSessions ?? [],
    };
  }), [dates, entries]);

  const loggedDays = dayData.filter((d) => d.kcal > 0).length;
  const avgKcal = loggedDays > 0
    ? Math.round(dayData.reduce((s, d) => s + d.kcal, 0) / loggedDays)
    : 0;
  const totalItems = dayData.reduce((s, d) => s + d.foods.length, 0);
  const proteinHitDays = dayData.filter((d) => d.protein > 0 && d.protein >= PROTEIN_GOAL * 0.9).length;

  const maxKcal = Math.max(...dayData.map((d) => d.kcal), calorieGoal * 1.1, 1);
  const chartInnerH = CHART_H - CHART_PAD_V * 2;
  const goalY = CHART_PAD_V + chartInnerH * (1 - calorieGoal / maxKcal);

  function label(date: string, idx: number) {
    const totalIdx = DAYS - 1 - idx;
    if (totalIdx === DAYS - 1) return 'Today';
    if (totalIdx === DAYS - 2) return 'Yesterday';
    return new Date(date + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
  }

  const listData = [...dayData].reverse();

  return (
    <SafeAreaView style={st.safe} edges={['top']}>
      <LinearGradient
        colors={['rgba(124,77,255,0.18)', 'transparent']}
        style={StyleSheet.absoluteFillObject}
        start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 0.35 }}
        pointerEvents="none"
      />

      <View style={st.header}>
        <Text style={st.title}>Activity Log</Text>
        <Text style={st.subtitle}>Last 7 days</Text>
      </View>

      <ScrollView contentContainerStyle={st.scroll} showsVerticalScrollIndicator={false}>

        {/* ── Calorie trend chart ─────────────────────────── */}
        <View style={st.chartCard}>
          <Text style={st.sectionLabel}>CALORIE TREND</Text>
          <Svg width={BAR_AREA_W} height={CHART_H} style={{ alignSelf: 'center', marginTop: spacing.xs }}>
            <Defs>
              <SvgGradient id="barGreen" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={colors.green} stopOpacity="1" />
                <Stop offset="1" stopColor={colors.green} stopOpacity="0.4" />
              </SvgGradient>
              <SvgGradient id="barHoney" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={colors.honey} stopOpacity="1" />
                <Stop offset="1" stopColor={colors.honey} stopOpacity="0.4" />
              </SvgGradient>
              <SvgGradient id="barRose" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={colors.rose} stopOpacity="1" />
                <Stop offset="1" stopColor={colors.rose} stopOpacity="0.4" />
              </SvgGradient>
              <SvgGradient id="barEmpty" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={colors.line2} stopOpacity="1" />
                <Stop offset="1" stopColor={colors.line2} stopOpacity="0.5" />
              </SvgGradient>
            </Defs>

            <Line
              x1={0} y1={goalY} x2={BAR_AREA_W} y2={goalY}
              stroke={colors.purple} strokeWidth={1} strokeDasharray="4,4" opacity={0.6}
            />
            <SvgText
              x={BAR_AREA_W - 2} y={goalY - 4}
              fontSize={9} fill={colors.purple} textAnchor="end" opacity={0.8}
            >
              Goal
            </SvgText>

            {dayData.map((d, i) => {
              const barH = d.kcal > 0
                ? Math.max(4, chartInnerH * (d.kcal / maxKcal))
                : 4;
              const x = i * BAR_SLOT + (BAR_SLOT - BAR_W) / 2;
              const y = CHART_PAD_V + chartInnerH - barH;
              const ratio = d.kcal / calorieGoal;
              const gradId = d.kcal === 0 ? 'barEmpty' : ratio > 1.1 ? 'barRose' : ratio >= 0.85 ? 'barGreen' : 'barHoney';
              return (
                <Rect key={d.date} x={x} y={y} width={BAR_W} height={barH} rx={4} ry={4} fill={`url(#${gradId})`} />
              );
            })}

            {dayData.map((d, i) => (
              <SvgText
                key={d.date + 'lbl'}
                x={i * BAR_SLOT + BAR_SLOT / 2}
                y={CHART_H - 2}
                fontSize={9}
                fill={colors.ink3}
                textAnchor="middle"
              >
                {dayShort(d.date)}
              </SvgText>
            ))}
          </Svg>

          <View style={st.legend}>
            <View style={st.legendItem}>
              <View style={[st.legendDot, { backgroundColor: colors.green }]} />
              <Text style={st.legendTxt}>On goal</Text>
            </View>
            <View style={st.legendItem}>
              <View style={[st.legendDot, { backgroundColor: colors.honey }]} />
              <Text style={st.legendTxt}>Under</Text>
            </View>
            <View style={st.legendItem}>
              <View style={[st.legendDot, { backgroundColor: colors.rose }]} />
              <Text style={st.legendTxt}>Over</Text>
            </View>
          </View>
        </View>

        {/* ── Weekly summary ───────────────────────────────── */}
        <View style={st.summaryRow}>
          <View style={st.summaryChip}>
            <Text style={st.summaryVal}>{avgKcal > 0 ? avgKcal : '—'}</Text>
            <Text style={st.summaryLbl}>avg kcal/day</Text>
          </View>
          <View style={st.summaryChip}>
            <Text style={st.summaryVal}>{loggedDays}/7</Text>
            <Text style={st.summaryLbl}>days logged</Text>
          </View>
          <View style={st.summaryChip}>
            <Text style={[st.summaryVal, { color: proteinHitDays >= 5 ? colors.green : proteinHitDays >= 3 ? colors.honey : colors.rose }]}>{proteinHitDays}/7</Text>
            <Text style={st.summaryLbl}>protein goals</Text>
          </View>
        </View>

        {/* ── Day cards ────────────────────────────────────── */}
        <Text style={st.sectionLabel}>DAILY BREAKDOWN</Text>
        {listData.map((d, idx) => {
          const isEmpty = d.foods.length === 0 && d.water === 0 && d.burned === 0 && !d.sleep;
          const kcalPct = Math.min(1, d.kcal / calorieGoal);
          const kcalColor = d.kcal === 0
            ? colors.line2
            : d.kcal / calorieGoal > 1.1
              ? colors.rose
              : d.kcal / calorieGoal >= 0.85
                ? colors.green
                : colors.honey;

          return (
            <View key={d.date} style={st.card}>
              <View style={st.cardHeader}>
                <Text style={st.dayLabel}>{label(d.date, idx)}</Text>
                <Text style={st.dateStr}>{d.date}</Text>
              </View>

              {isEmpty ? (
                <Text style={st.emptyTxt}>Nothing logged</Text>
              ) : (
                <>
                  {d.kcal > 0 && (
                    <View style={st.kcalRow}>
                      <Text style={[st.kcalNum, { color: kcalColor }]}>{d.kcal}</Text>
                      <Text style={st.kcalGoal}> / {calorieGoal} kcal</Text>
                    </View>
                  )}
                  {d.kcal > 0 && (
                    <View style={st.progressTrack}>
                      <View style={[st.progressFill, { width: `${Math.round(kcalPct * 100)}%`, backgroundColor: kcalColor }]} />
                    </View>
                  )}

                  <View style={st.statsRow}>
                    {d.kcal > 0 && (
                      <View style={st.chip}>
                        <Text style={st.chipIcon}>🍽️</Text>
                        <Text style={st.chipVal}>{d.foods.length}</Text>
                        <Text style={st.chipLbl}>items</Text>
                      </View>
                    )}
                    {d.water > 0 && (
                      <View style={st.chip}>
                        <Text style={st.chipIcon}>💧</Text>
                        <Text style={st.chipVal}>{d.water}</Text>
                        <Text style={st.chipLbl}>glasses</Text>
                      </View>
                    )}
                    {d.burned > 0 && (
                      <View style={st.chip}>
                        <Text style={st.chipIcon}>🔥</Text>
                        <Text style={st.chipVal}>{d.burned}</Text>
                        <Text style={st.chipLbl}>burned</Text>
                      </View>
                    )}
                    {d.sleep && (
                      <View style={st.chip}>
                        <Text style={st.chipIcon}>🌙</Text>
                        <Text style={st.chipVal}>{d.sleep.duration}</Text>
                        <Text style={st.chipLbl}>sleep</Text>
                      </View>
                    )}
                  </View>

                  {d.kcal > 0 && (d.carbs > 0 || d.protein > 0 || d.fat > 0) && (
                    <View style={st.macroRow}>
                      {[
                        { val: d.carbs,   goal: CARBS_GOAL,   label: 'C', fill: colors.sky },
                        { val: d.protein, goal: PROTEIN_GOAL, label: 'P', fill: colors.purple },
                        { val: d.fat,     goal: FAT_GOAL,     label: 'F', fill: colors.honey },
                      ].map(({ val, goal, label, fill }) => {
                        const dot = macroColor(val, goal);
                        return (
                          <View key={label} style={st.macroItem}>
                            <View style={st.macroTrack}>
                              <View style={[st.macroFill, { width: `${Math.min(100, (val / goal) * 100)}%`, backgroundColor: fill }]} />
                            </View>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 }}>
                              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: dot }} />
                              <Text style={[st.macroLbl, { color: dot }]}>{Math.round(val)}g {label}</Text>
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  )}

                  {(d.cardioSessions.length > 0 || d.strengthSessions.length > 0) && (
                    <View style={st.foodList}>
                      <Text style={[st.sectionLabel, { marginBottom: 2 }]}>ACTIVITY</Text>
                      {d.cardioSessions.map((s) => (
                        <Text key={s.id} style={st.foodItem} numberOfLines={1}>
                          {s.emoji} {s.name}{s.minutes > 0 ? ` · ${s.minutes} min` : ''}
                          <Text style={st.foodKcal}> · {s.kcal} kcal</Text>
                        </Text>
                      ))}
                      {d.strengthSessions.map((s) => (
                        <Text key={s.id} style={st.foodItem} numberOfLines={1}>
                          🏋️ {s.exercises.map((e) => e.name).join(', ')}
                          <Text style={st.foodKcal}> · {s.totalKcal} kcal</Text>
                        </Text>
                      ))}
                    </View>
                  )}

                  {d.foods.length > 0 && (
                    <View style={st.foodList}>
                      {d.foods.slice(0, 3).map((f) => (
                        <Text key={f.id} style={st.foodItem} numberOfLines={1}>
                          {f.icon} {f.name}
                          <Text style={st.foodKcal}> · {f.kcal} kcal</Text>
                        </Text>
                      ))}
                      {d.foods.length > 3 && (
                        <Text style={st.moreTxt}>+{d.foods.length - 3} more items</Text>
                      )}
                    </View>
                  )}
                </>
              )}
            </View>
          );
        })}

        <View style={{ height: spacing.lg }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  title: { fontSize: fontSize.xl, fontWeight: '700', color: colors.ink },
  subtitle: { fontSize: fontSize.xs, color: colors.ink3, marginTop: 2 },
  scroll: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.lg },

  sectionLabel: {
    fontSize: fontSize.xs, fontWeight: '700',
    letterSpacing: 1.1, textTransform: 'uppercase', color: colors.ink3,
  },

  chartCard: {
    backgroundColor: colors.layer1,
    borderWidth: 1, borderColor: colors.line2,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
    shadowColor: colors.purple, shadowOpacity: 0.18,
    shadowRadius: 24, shadowOffset: { width: 0, height: 8 }, elevation: 8,
  },
  legend: { flexDirection: 'row', gap: spacing.md, justifyContent: 'center' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendTxt: { fontSize: fontSize.xs, color: colors.ink3 },

  summaryRow: { flexDirection: 'row', gap: spacing.sm },
  summaryChip: {
    flex: 1,
    backgroundColor: colors.layer1,
    borderWidth: 1, borderColor: colors.line2,
    borderRadius: radius.md,
    padding: spacing.sm,
    alignItems: 'center', gap: 2,
  },
  summaryVal: { fontSize: fontSize.md, fontWeight: '800', color: colors.ink },
  summaryLbl: { fontSize: fontSize.xs, color: colors.ink3, textAlign: 'center' },

  card: {
    backgroundColor: colors.layer1,
    borderWidth: 1, borderColor: colors.line2,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dayLabel: { fontSize: fontSize.sm, fontWeight: '700', color: colors.ink },
  dateStr: { fontSize: fontSize.xs, color: colors.ink3 },
  emptyTxt: { fontSize: fontSize.xs, color: colors.ink3, fontStyle: 'italic' },

  kcalRow: { flexDirection: 'row', alignItems: 'baseline' },
  kcalNum: { fontSize: fontSize.md, fontWeight: '800' },
  kcalGoal: { fontSize: fontSize.sm, color: colors.ink3 },
  progressTrack: { height: 4, backgroundColor: colors.line, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: 4, borderRadius: 2 },

  statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: colors.line, borderRadius: radius.sm,
    paddingHorizontal: spacing.sm, paddingVertical: spacing.xs,
  },
  chipIcon: { fontSize: fontSize.sm },
  chipVal: { fontSize: fontSize.sm, fontWeight: '700', color: colors.ink },
  chipLbl: { fontSize: fontSize.xs, color: colors.ink3 },

  macroRow: { flexDirection: 'row', gap: spacing.sm },
  macroItem: { flex: 1, gap: 3 },
  macroTrack: { height: 3, backgroundColor: colors.line, borderRadius: 2, overflow: 'hidden' },
  macroFill: { height: 3, borderRadius: 2 },
  macroLbl: { fontSize: fontSize.xs, color: colors.ink3 },

  foodList: { borderTopWidth: 1, borderTopColor: colors.line, paddingTop: spacing.xs, gap: 4 },
  foodItem: { fontSize: fontSize.xs, color: colors.ink2 },
  foodKcal: { color: colors.ink3 },
  moreTxt: { fontSize: fontSize.xs, color: colors.ink3, fontStyle: 'italic' },
});
