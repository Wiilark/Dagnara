import { useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useDiaryStore } from '../../src/store/diaryStore';
import { colors, spacing, fontSize, radius } from '../../src/theme';

const DAYS = 7;

export default function LogScreen() {
  const { entries, loadEntry } = useDiaryStore();

  // Build last N days in descending order
  const dates = Array.from({ length: DAYS }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - i);
    return d.toISOString().split('T')[0];
  });

  useEffect(() => {
    Promise.all(dates.map((d) => loadEntry(d)));
  }, []);

  function label(dateStr: string, idx: number) {
    if (idx === 0) return 'Today';
    if (idx === 1) return 'Yesterday';
    return new Date(dateStr + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
  }

  return (
    <SafeAreaView style={st.safe} edges={['top']}>
      <View style={st.header}>
        <Text style={st.title}>Activity Log</Text>
        <Text style={st.subtitle}>Last 7 days</Text>
      </View>
      <ScrollView contentContainerStyle={st.scroll} showsVerticalScrollIndicator={false}>
        {dates.map((date, idx) => {
          const entry = entries[date];
          const foods = entry?.foods ?? [];
          const kcal = foods.reduce((s, f) => s + f.kcal, 0);
          const water = entry?.water ?? 0;
          const burned = entry?.calories_burned ?? 0;
          const sleep = entry?.sleep;
          const isEmpty = foods.length === 0 && water === 0 && burned === 0 && !sleep;

          return (
            <View key={date} style={st.card}>
              <View style={st.cardHeader}>
                <Text style={st.dayLabel}>{label(date, idx)}</Text>
                <Text style={st.dateStr}>{date}</Text>
              </View>

              {isEmpty ? (
                <Text style={st.emptyTxt}>Nothing logged</Text>
              ) : (
                <View style={st.statsRow}>
                  {kcal > 0 && (
                    <View style={st.chip}>
                      <Text style={st.chipIcon}>🍽️</Text>
                      <Text style={st.chipVal}>{kcal}</Text>
                      <Text style={st.chipLbl}>kcal</Text>
                    </View>
                  )}
                  {water > 0 && (
                    <View style={st.chip}>
                      <Text style={st.chipIcon}>💧</Text>
                      <Text style={st.chipVal}>{water}</Text>
                      <Text style={st.chipLbl}>glasses</Text>
                    </View>
                  )}
                  {burned > 0 && (
                    <View style={st.chip}>
                      <Text style={st.chipIcon}>🔥</Text>
                      <Text style={st.chipVal}>{burned}</Text>
                      <Text style={st.chipLbl}>burned</Text>
                    </View>
                  )}
                  {sleep && (
                    <View style={st.chip}>
                      <Text style={st.chipIcon}>🌙</Text>
                      <Text style={st.chipVal}>{sleep.duration}</Text>
                      <Text style={st.chipLbl}>sleep</Text>
                    </View>
                  )}
                </View>
              )}

              {foods.length > 0 && (
                <View style={st.foodList}>
                  {foods.slice(0, 4).map((f) => (
                    <Text key={f.id} style={st.foodItem} numberOfLines={1}>
                      {f.icon} {f.name}
                      <Text style={st.foodKcal}> · {f.kcal} kcal</Text>
                    </Text>
                  ))}
                  {foods.length > 4 && (
                    <Text style={st.moreTxt}>+{foods.length - 4} more items</Text>
                  )}
                </View>
              )}
            </View>
          );
        })}
        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  title: { fontSize: fontSize.xl, fontWeight: '700', color: colors.ink },
  subtitle: { fontSize: fontSize.xs, color: colors.ink3, marginTop: 2 },
  scroll: { padding: spacing.md, gap: spacing.sm },
  card: { backgroundColor: colors.layer1, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', borderRadius: radius.lg, padding: spacing.md, gap: 10 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dayLabel: { fontSize: fontSize.sm, fontWeight: '700', color: colors.ink },
  dateStr: { fontSize: fontSize.xs, color: colors.ink3 },
  emptyTxt: { fontSize: fontSize.xs, color: colors.ink3, fontStyle: 'italic' },
  statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 5 },
  chipIcon: { fontSize: 13 },
  chipVal: { fontSize: fontSize.sm, fontWeight: '700', color: colors.ink },
  chipLbl: { fontSize: 10, color: colors.ink3 },
  foodList: { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)', paddingTop: 8, gap: 4 },
  foodItem: { fontSize: fontSize.xs, color: colors.ink2 },
  foodKcal: { color: colors.ink3 },
  moreTxt: { fontSize: fontSize.xs, color: colors.ink3, fontStyle: 'italic' },
});
