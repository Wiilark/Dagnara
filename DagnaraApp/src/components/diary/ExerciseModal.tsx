import { useState, useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Modal, Alert, TextInput, Platform, Keyboard, Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient as ExpoLinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, fontSize, radius } from '../../theme';
import { useAppStore } from '../../store/appStore';
import { StrengthSession, StrengthExercise } from '../../store/diaryStore';
import { STRENGTH_EXERCISES, estimateStrengthKcal } from '../../lib/strengthExercises';

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

export function ExerciseModal({ visible, onClose, onAddCalories, onAddStrengthSession }: {
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
  const unitSystem = useAppStore(s => s.unitSystem);
  const [weightUnit, setWeightUnit] = useState<'kg' | 'lbs'>(unitSystem === 'Metric' ? 'kg' : 'lbs');

  useEffect(() => {
    if (strengthExercises.length === 0) {
      setWeightUnit(unitSystem === 'Metric' ? 'kg' : 'lbs');
    }
  }, [unitSystem, strengthExercises.length]);

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
      if (setIdx === -1) return null as unknown as StrengthExercise;
      const sets = ex.sets.filter((_, si) => si !== setIdx);
      return sets.length === 0 ? null as unknown as StrengthExercise : { ...ex, sets };
    }).filter(Boolean) as StrengthExercise[]);
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
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <SafeAreaView style={ex.safe} edges={['top', 'bottom']}>
        {/* Header */}
        <View style={ex.header}>
          <TouchableOpacity onPress={() => { Keyboard.dismiss(); onClose(); }} style={ex.closeBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="close" size={22} color={colors.ink2} />
          </TouchableOpacity>
          <Text style={ex.title}>Exercise</Text>
          <TouchableOpacity onPress={() => setTab('calories')}>
            <Text style={ex.addTxt}>+ Add</Text>
          </TouchableOpacity>
        </View>
        {/* Search */}
        <View style={ex.searchRow}>
          <Ionicons name="search-outline" size={16} color={colors.ink2} />
          <TextInput
            style={ex.searchInput}
            placeholder="Search Exercise"
            placeholderTextColor={colors.ink3}
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
            onSubmitEditing={() => Keyboard.dismiss()}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => { setSearch(''); Keyboard.dismiss(); }} hitSlop={10}>
              <Ionicons name="close-circle" size={18} color={colors.ink3} />
            </TouchableOpacity>
          )}
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
          <ScrollView contentContainerStyle={{ paddingBottom: 100 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
            <Text style={ex.sectionHdr}>All Exercises</Text>
            {filtered.map((e) => (
              <TouchableOpacity key={e.name} style={[ex.exRow, selectedExercise?.name === e.name && ex.exRowSelected]} onPress={() => {
                if ((e as any).isStrength) {
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
              <TextInput style={ex.calFieldInput} placeholder="Required" placeholderTextColor={colors.ink3} value={manualKcal} onChangeText={setManualKcal} keyboardType="numeric" />
            </TouchableOpacity>
            <TouchableOpacity style={ex.calField} onPress={() => {}}>
              <Text style={ex.calFieldLbl}>Title</Text>
              <TextInput style={ex.calFieldInput} placeholder="Optional" placeholderTextColor={colors.ink3} value={manualTitle} onChangeText={setManualTitle} />
            </TouchableOpacity>
            <View style={{ flex: 1 }} />
            <View style={ex.doneWrap}>
              <TouchableOpacity style={ex.doneBtn} onPress={() => {
                const k = parseInt(manualKcal, 10);
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
        {selectedExercise && tab === 'list' && (() => {
          const mins = parseInt(duration, 10) || 30;
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
                <TouchableOpacity style={ex.durLogBtn} activeOpacity={0.85} onPress={() => { onAddCalories(kcal, selectedExercise.name, selectedExercise.emoji, mins); setSelectedExercise(null); onClose(); }}>
                  <ExpoLinearGradient colors={[colors.purple, colors.purpleGlow]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={ex.durLogGrad}>
                    <Text style={ex.durLogTxt}>LOG</Text>
                  </ExpoLinearGradient>
                </TouchableOpacity>
              </View>
            </Animated.View>
          );
        })()}
        {strengthMode && (
          <Animated.View style={[ex.durPanel, { height: '100%', bottom: kbBottom }]}>
            <View style={ex.header}>
              <TouchableOpacity onPress={() => setStrengthMode(false)} style={ex.closeBtn} hitSlop={12}>
                <Ionicons name="chevron-back" size={22} color={colors.ink2} />
              </TouchableOpacity>
              <Text style={ex.title}>Strength Training</Text>
              <TouchableOpacity onPress={logStrengthWorkout}>
                <Text style={[ex.addTxt, { color: colors.green }]}>Log</Text>
              </TouchableOpacity>
            </View>
            <View style={[ex.searchRow, { marginHorizontal: 0 }]}>
              <Ionicons name="search-outline" size={16} color={colors.ink2} />
              <TextInput style={ex.searchInput} placeholder="Search exercises..." placeholderTextColor={colors.ink3} value={strengthSearch} onChangeText={setStrengthSearch} />
            </View>
            <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled">
              {strengthSearch.length > 0 && filteredStrength.length > 0 && (
                <View style={{ backgroundColor: colors.layer2, borderRadius: radius.md, marginBottom: spacing.md }}>
                  {filteredStrength.slice(0, 5).map(name => (
                    <TouchableOpacity key={name} style={{ padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.line }} onPress={() => addStrengthExercise(name)}>
                      <Text style={{ color: colors.ink }}>{name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
              {strengthExercises.map((exer, exIdx) => (
                <View key={exIdx} style={{ marginBottom: spacing.lg, backgroundColor: colors.layer2, borderRadius: radius.md, padding: spacing.md }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm }}>
                    <Text style={{ fontSize: fontSize.md, fontWeight: '700', color: colors.ink }}>{exer.name}</Text>
                    <TouchableOpacity onPress={() => removeSet(exIdx, -1)} hitSlop={10}>
                      <Ionicons name="trash-outline" size={18} color={colors.rose} />
                    </TouchableOpacity>
                  </View>
                  {exer.sets.map((set, setIdx) => (
                    <View key={setIdx} style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center', marginBottom: spacing.xs }}>
                      <Text style={{ width: 24, color: colors.ink3, fontWeight: '600' }}>{setIdx + 1}</Text>
                      <View style={{ flex: 1, flexDirection: 'row', gap: spacing.xs, alignItems: 'center' }}>
                        <TextInput style={ex.setIn} value={String(set.weight)} onChangeText={v => updateSet(exIdx, setIdx, 'weight', v)} keyboardType="numeric" />
                        <Text style={{ color: colors.ink3, fontSize: fontSize.xs }}>{set.unit}</Text>
                      </View>
                      <View style={{ flex: 1, flexDirection: 'row', gap: spacing.xs, alignItems: 'center' }}>
                        <TextInput style={ex.setIn} value={String(set.reps)} onChangeText={v => updateSet(exIdx, setIdx, 'reps', v)} keyboardType="numeric" />
                        <Text style={{ color: colors.ink3, fontSize: fontSize.xs }}>reps</Text>
                      </View>
                      <TouchableOpacity onPress={() => removeSet(exIdx, setIdx)} hitSlop={10}>
                        <Ionicons name="close-circle-outline" size={18} color={colors.ink3} />
                      </TouchableOpacity>
                    </View>
                  ))}
                  <TouchableOpacity style={{ marginTop: spacing.sm, paddingVertical: spacing.xs, alignItems: 'center', borderWidth: 1, borderColor: colors.line3, borderStyle: 'dashed', borderRadius: radius.sm }} onPress={() => addSet(exIdx)}>
                    <Text style={{ color: colors.ink3, fontSize: fontSize.xs }}>+ Add Set</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          </Animated.View>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const ex = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.md, paddingTop: spacing.sm },
  closeBtn: { width: 40, height: 40, borderRadius: radius.lg, backgroundColor: colors.layer2, borderWidth: 1, borderColor: colors.line2, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: fontSize.md, fontWeight: '700', color: colors.ink },
  addTxt: { fontSize: fontSize.sm, fontWeight: '600', color: colors.purple2 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginHorizontal: spacing.md, marginBottom: spacing.sm, backgroundColor: colors.layer2, borderWidth: 1.5, borderColor: colors.line2, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  searchInput: { flex: 1, color: colors.ink, fontSize: fontSize.sm, fontWeight: '300' },
  tabRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.line2, marginHorizontal: spacing.md },
  tabBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: colors.bg },
  tabBtnActive: { borderBottomColor: colors.purple2 },
  tabLbl: { fontSize: fontSize.xs, fontWeight: '600', color: colors.ink3 },
  tabLblActive: { color: colors.lavender },
  sectionHdr: { paddingHorizontal: spacing.md, paddingTop: spacing.md, paddingBottom: spacing.sm, fontSize: fontSize.xs, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase', color: colors.ink3 },
  exRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.md, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.line },
  exName: { fontSize: fontSize.base, fontWeight: '500', color: colors.ink },
  exMeta: { fontSize: fontSize.xs, color: colors.ink2, marginTop: 2 },
  calField: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.line },
  calFieldLbl: { fontSize: fontSize.md, fontWeight: '500', color: colors.ink },
  calFieldInput: { fontSize: fontSize.md, color: colors.ink, textAlign: 'right', width: '55%' },
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
  durLogBtn: { flex: 2, borderRadius: radius.md, overflow: 'hidden' },
  durLogGrad: { paddingVertical: spacing.sm + 2, alignItems: 'center' },
  durLogTxt: { fontSize: fontSize.sm, fontWeight: '700', color: colors.white, letterSpacing: 0.5 },
  setIn: { backgroundColor: colors.layer3, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 4, color: colors.ink, fontWeight: '700', width: 60, textAlign: 'center' },
});
