import { useEffect, useState, useCallback, useMemo, memo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, TextInput, Modal, FlatList,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle, G } from 'react-native-svg';
import { LinearGradient as ExpoLinearGradient } from 'expo-linear-gradient';

// Stores
import { useDiaryStore, FoodItem, StrengthSession, CardioSession } from '../../src/store/diaryStore';
import { useAuthStore } from '../../src/store/authStore';
import { useAppStore } from '../../src/store/appStore';

// Libs
import { analyzeFood, estimateNutrition, getBarcodeProduct } from '../../src/lib/api';
import { searchLocalRestaurants, type RestaurantItem } from '../../src/lib/restaurants';
import { searchLocalFoods, type LocalFood } from '../../src/lib/foodDatabase';
import { colors, spacing, fontSize, radius } from '../../src/theme';
import { fmt } from '../../src/lib/format';

// Components
import { ClockPickerModal } from '../../src/components/ClockPickerModal';
import { SleepModal } from '../../src/components/diary/SleepModal';
import { ExerciseModal } from '../../src/components/diary/ExerciseModal';
import { StressBreathingModal } from '../../src/components/diary/StressBreathingModal';
import { MoodModal } from '../../src/components/diary/MoodModal';
import { AiConfirmModal, type AiItem } from '../../src/components/diary/AiConfirmModal';

const MEALS = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
type Meal = typeof MEALS[number];

const MEAL_ICONS: Record<string, string> = { breakfast: '🍳', lunch: '🥗', dinner: '🍝', snack: '🍌' };
const MEAL_ACCENT: Record<string, string> = { breakfast: colors.honey, lunch: colors.violet, dinner: colors.sky, snack: colors.rose };
const MEAL_LABEL: Record<string, string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack' };
const MEAL_SUGGESTED: Record<string, string> = { breakfast: '~550 kcal suggested', lunch: '~650 kcal suggested', dinner: '~750 kcal suggested', snack: '~150 kcal suggested' };

function dateStr(d: Date) { return d.toLocaleDateString('en-CA'); }
function addDays(date: string, days: number) { const d = new Date(date); d.setDate(d.getDate() + days); return dateStr(d); }
function clamp(v: number, lo: number, hi: number) { return Math.min(hi, Math.max(lo, v)); }

function gradeFoodItem(f: { kcal: number; protein?: number; fiber?: number; sugar?: number; sodium?: number }) {
  if (!f.kcal || f.kcal <= 0) return { grade: '?', color: colors.ink3 };
  const pPct = ((f.protein ?? 0) * 4 / f.kcal) * 100;
  let score = 42;
  score += Math.min(30, pPct * 0.7);
  if ((f.fiber ?? 0) > 0) score += Math.min(10, (f.fiber ?? 0) * 3);
  if (f.kcal < 150) score += Math.min(8, (150 - f.kcal) / 12);
  if ((f.sugar ?? 0) > 15) score -= Math.min(15, ((f.sugar ?? 0) - 15) * 0.5);
  if ((f.sodium ?? 0) > 500) score -= Math.min(10, ((f.sodium ?? 0) - 500) / 100);
  score -= Math.min(10, Math.max(0, (f.kcal - 400) / 50));
  if (score >= 70) return { grade: 'A', color: colors.nutriA };
  if (score >= 57) return { grade: 'B', color: colors.nutriB };
  if (score >= 43) return { grade: 'C', color: colors.nutriC };
  if (score >= 30) return { grade: 'D', color: colors.nutriD };
  return { grade: 'E', color: colors.nutriE };
}

const FoodRow = memo(({ food, onDelete }: { food: FoodItem; onDelete: () => void }) => {
  const grade = gradeFoodItem(food);
  return (
    <TouchableOpacity style={fr.row} onLongPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); Alert.alert(food.name, undefined, [{ text: 'Delete', style: 'destructive', onPress: onDelete }, { text: 'Cancel', style: 'cancel' }]); }} activeOpacity={0.7}>
      <Text style={fr.icon}>{food.icon ?? '🍽️'}</Text>
      <View style={fr.info}>
        <Text style={fr.name} numberOfLines={1}>{food.name}</Text>
        <View style={fr.pills}>
          {food.protein > 0 && <Text style={[fr.pill, fr.pillP]}>P {fmt(food.protein, 1)}g</Text>}
          {food.carbs > 0 && <Text style={[fr.pill, fr.pillC]}>C {fmt(food.carbs, 1)}g</Text>}
          {food.fat > 0 && <Text style={[fr.pill, fr.pillF]}>F {fmt(food.fat, 1)}g</Text>}
        </View>
      </View>
      <View style={fr.kcalWrap}>
        <Text style={[fr.kcal, { color: grade.color, backgroundColor: grade.color + '18', borderColor: grade.color + '44' }]}>+{fmt(food.kcal)} kcal</Text>
      </View>
      <TouchableOpacity style={fr.trash} onPress={onDelete} hitSlop={12}>
        <Ionicons name="trash-outline" size={16} color={colors.rose} />
      </TouchableOpacity>
    </TouchableOpacity>
  );
});

// ── Main Screen ──

export default function DiaryScreen() {
  const insets = useSafeAreaInsets();
  const { selectedDate, entries, setSelectedDate, loadEntry, addFood, removeFood, updateCaloriesBurned, addStrengthSession, logSleep, logMood } = useDiaryStore();
  const { addXp, checkAndUpdateStreak, calorieGoal, macroPcts, setMessagesOpen, hasUnread } = useAppStore();
  
  const KCAL_GOAL = calorieGoal || 2000;
  const [isSettled, setIsSettled] = useState(false);

  // Modal States
  const [searchVisible, setSearchVisible] = useState(false);
  const [searchMeal, setSearchMeal] = useState<Meal>('breakfast');
  const [searchQuery, setSearchQuery] = useState('');
  const [exerciseVisible, setExerciseVisible] = useState(false);
  const [aiConfirmVisible, setAiConfirmVisible] = useState(false);
  const [sleepVisible, setSleepVisible] = useState(false);
  const [moodVisible, setMoodVisible] = useState(false);
  const [stressVisible, setStressVisible] = useState(false);
  const [barcodeVisible, setBarcodeVisible] = useState(false);

  // Search States
  const [pendingAiItems, setPendingAiItems] = useState<AiItem[]>([]);
  const [aiEstimating, setAiEstimating] = useState(false);
  const [aiEstimateQuery, setAiEstimateQuery] = useState('');
  const [searchMode, setSearchMode] = useState<'database' | 'restaurant' | 'custom'>('database');
  
  // Custom Food States
  const [customName, setCustomName] = useState('');
  const [customKcal, setCustomKcal] = useState('');
  const [customProtein, setCustomProtein] = useState('');
  const [customCarbs, setCustomCarbs] = useState('');
  const [customFat, setCustomFat] = useState('');

  const [permission, requestPermission] = useCameraPermissions();

  const entry = useMemo(() => entries[selectedDate] || {}, [entries, selectedDate]);
  const foods = useMemo(() => entry.foods || [], [entry.foods]);
  const caloriesBurned = useMemo(() => entry.calories_burned || 0, [entry.calories_burned]);
  
  const totals = useMemo(() => {
    return foods.reduce((acc, f) => ({
      kcal: acc.kcal + f.kcal,
      carbs: acc.carbs + f.carbs,
      protein: acc.protein + f.protein,
      fat: acc.fat + f.fat,
    }), { kcal: 0, carbs: 0, protein: 0, fat: 0 });
  }, [foods]);

  const netKcal = totals.kcal - caloriesBurned;
  const remaining = Math.max(0, KCAL_GOAL - netKcal);
  const isToday = selectedDate === dateStr(new Date());

  const goals = useMemo(() => ({
    carbs: Math.round(KCAL_GOAL * (macroPcts.carbs / 100) / 4),
    protein: Math.round(KCAL_GOAL * (macroPcts.protein / 100) / 4),
    fat: Math.round(KCAL_GOAL * (macroPcts.fat / 100) / 9),
  }), [KCAL_GOAL, macroPcts]);

  useEffect(() => {
    loadEntry(selectedDate).finally(() => setIsSettled(true));
  }, [selectedDate, loadEntry]);

  const handleAiEstimate = useCallback(async () => {
    const q = aiEstimateQuery.trim();
    if (!q) return;
    setAiEstimating(true);
    try {
      const data = await estimateNutrition(q);
      const items: any[] = Array.isArray(data?.items) ? data.items : [];
      if (items.length === 0) {
        Alert.alert('No estimate', 'Could not estimate nutrition.');
        return;
      }
      for (const item of items) {
        await addFood(selectedDate, {
          id: `${Date.now()}_${Math.random()}`,
          icon: item.icon || '🍽️',
          name: item.name || q,
          kcal: item.kcal || 0,
          carbs: item.carbs || 0,
          protein: item.protein || 0,
          fat: item.fat || 0,
          unit: item.unit || 'serving',
          meal: searchMeal
        });
      }
      setAiEstimateQuery('');
      setSearchVisible(false);
      await addXp(items.length * 10);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      Alert.alert('Estimate failed', 'Check your connection.');
    } finally {
      setAiEstimating(false);
    }
  }, [aiEstimateQuery, searchMeal, selectedDate, addFood, addXp]);

  const handleCamera = useCallback(async () => {
    const result = await ImagePicker.launchCameraAsync({ base64: true, quality: 0.5 });
    if (result.canceled || !result.assets[0].base64) return;
    setSearchVisible(false);
    setAiEstimating(true);
    try {
      const data = await analyzeFood(result.assets[0].base64, 'image/jpeg');
      const raw: any[] = data?.items || [];
      if (raw.length === 0) {
        Alert.alert('No food detected', 'Try a clearer photo.');
        return;
      }
      setPendingAiItems(raw.map(i => ({ ...i, multiplier: 1 })));
      setAiConfirmVisible(true);
    } catch (err) {
      Alert.alert('Analysis failed', 'Could not analyse photo.');
    } finally {
      setAiEstimating(false);
    }
  }, []);

  const handleBarcodeScanned = useCallback(async ({ data: code }: { data: string }) => {
    setBarcodeVisible(false);
    setAiEstimating(true); // Show spinner
    try {
      const res = await getBarcodeProduct(code);
      if (!res?.product) {
        Alert.alert('Not found', 'Product not found in database.');
        return;
      }
      const p = res.product;
      const nut = p.nutriments || {};
      
      await addFood(selectedDate, {
        id: `${Date.now()}`,
        name: p.product_name || 'Scanned Product',
        icon: '📦',
        kcal: Math.round(nut['energy-kcal_serving'] || nut['energy-kcal_100g'] || 0),
        protein: nut.proteins_serving || nut.proteins_100g || 0,
        carbs: nut.carbohydrates_serving || nut.carbohydrates_100g || 0,
        fat: nut.fat_serving || nut.fat_100g || 0,
        meal: searchMeal,
        unit: p.serving_size || '1 serving'
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSearchVisible(false);
    } catch (err) {
      Alert.alert('Scan failed', 'Could not fetch product details.');
    } finally {
      setAiEstimating(false);
    }
  }, [searchMeal, selectedDate, addFood]);

  const handleAddCustomFood = useCallback(async () => {
    const kcal = parseFloat(customKcal);
    if (!customName || isNaN(kcal)) {
      Alert.alert('Missing Info', 'Please provide a name and calories.');
      return;
    }
    await addFood(selectedDate, {
      id: `${Date.now()}`,
      name: customName,
      icon: '🍽️',
      kcal,
      protein: parseFloat(customProtein) || 0,
      carbs: parseFloat(customCarbs) || 0,
      fat: parseFloat(customFat) || 0,
      meal: searchMeal,
      unit: 'serving'
    });
    setSearchVisible(false);
    setCustomName(''); setCustomKcal(''); setCustomProtein(''); setCustomCarbs(''); setCustomFat('');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [customName, customKcal, customProtein, customCarbs, customFat, searchMeal, selectedDate, addFood]);

  const filteredFoods = useMemo(() => {
    if (!searchQuery) return [];
    if (searchMode === 'database') return searchLocalFoods(searchQuery);
    if (searchMode === 'restaurant') return searchLocalRestaurants(searchQuery);
    return [];
  }, [searchQuery, searchMode]);

  if (!isSettled) {
    return <View style={[st.safe, { justifyContent: 'center', alignItems: 'center' }]}><ActivityIndicator color={colors.purple} /></View>;
  }

  return (
    <SafeAreaView style={st.safe} edges={['top']}>
      <View style={st.appHeader}>
        <Text style={st.appTitle}>Diary</Text>
        <View style={st.headerRight}>
          <TouchableOpacity style={st.iconBtn} onPress={() => setMessagesOpen(true)}>
            <Ionicons name="notifications-outline" size={22} color={colors.ink2} />
            {hasUnread && <View style={st.notifDot} />}
          </TouchableOpacity>
          <TouchableOpacity style={st.iconBtn} onPress={() => router.push('/(tabs)/profile')}>
            <Ionicons name="person-outline" size={22} color={colors.ink2} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={st.dateBar}>
        <TouchableOpacity onPress={() => setSelectedDate(addDays(selectedDate, -1))} style={st.navBtn}>
          <Ionicons name="chevron-back" size={20} color={colors.ink2} />
        </TouchableOpacity>
        <Text style={st.dateText}>{isToday ? "Today" : selectedDate}</Text>
        <TouchableOpacity onPress={() => setSelectedDate(addDays(selectedDate, 1))} style={st.navBtn} disabled={isToday}>
          <Ionicons name="chevron-forward" size={20} color={isToday ? colors.ink3 : colors.ink2} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={st.scroll} showsVerticalScrollIndicator={false}>
        <ExpoLinearGradient colors={[colors.purple + '15', colors.green + '05', 'transparent']} style={st.calCard}>
          <View style={st.calSection}>
            <View style={st.ringWrap}>
              <Svg width={180} height={180} viewBox="0 0 200 200">
                <Circle cx={100} cy={100} r={90} fill="none" stroke={colors.line} strokeWidth={10} />
                <G rotation="-90" origin="100, 100">
                  <Circle
                    cx={100} cy={100} r={90} fill="none"
                    stroke={colors.purple} strokeWidth={10} strokeLinecap="round"
                    strokeDasharray={`${clamp(netKcal / KCAL_GOAL, 0, 1) * 2 * Math.PI * 90} ${2 * Math.PI * 90}`}
                  />
                </G>
              </Svg>
              <View style={st.ringCenter}>
                <Text style={st.ringNum}>{fmt(remaining)}</Text>
                <Text style={st.ringLbl}>kcal left</Text>
              </View>
            </View>
            <View style={st.calStatsRow}>
              <View style={st.calStat}>
                <Text style={[st.calStatVal, { color: colors.lavender }]}>{fmt(totals.kcal)}</Text>
                <Text style={st.calStatLbl}>Eaten</Text>
              </View>
              <View style={st.calStat}>
                <Text style={[st.calStatVal, { color: colors.honey }]}>{fmt(caloriesBurned)}</Text>
                <Text style={st.calStatLbl}>Burned</Text>
              </View>
              <View style={st.calStat}>
                <Text style={[st.calStatVal, { color: colors.green }]}>{fmt(netKcal)}</Text>
                <Text style={st.calStatLbl}>Net</Text>
              </View>
            </View>
          </View>
        </ExpoLinearGradient>

        <View style={st.macroStrip}>
          <View style={st.macroTile}>
            <Text style={st.macroName}>Carbs</Text>
            <Text style={[st.macroVal, { color: colors.sky }]}>{fmt(totals.carbs)} / {fmt(goals.carbs)}g</Text>
            <View style={st.macroTrack}><View style={[st.macroFill, { width: `${clamp(totals.carbs / goals.carbs, 0, 1) * 100}%` as any, backgroundColor: colors.sky }]} /></View>
          </View>
          <View style={st.macroTile}>
            <Text style={st.macroName}>Protein</Text>
            <Text style={[st.macroVal, { color: colors.rose }]}>{fmt(totals.protein)} / {fmt(goals.protein)}g</Text>
            <View style={st.macroTrack}><View style={[st.macroFill, { width: `${clamp(totals.protein / goals.protein, 0, 1) * 100}%` as any, backgroundColor: colors.rose }]} /></View>
          </View>
          <View style={st.macroTile}>
            <Text style={st.macroName}>Fat</Text>
            <Text style={[st.macroVal, { color: colors.violet }]}>{fmt(totals.fat)} / {fmt(goals.fat)}g</Text>
            <View style={st.macroTrack}><View style={[st.macroFill, { width: `${clamp(totals.fat / goals.fat, 0, 1) * 100}%` as any, backgroundColor: colors.violet }]} /></View>
          </View>
        </View>

        <Text style={st.sectionHdr}>Meals</Text>
        {MEALS.map(meal => {
          const mealFoods = foods.filter(f => f.meal === meal);
          const mealKcal = mealFoods.reduce((s, f) => s + f.kcal, 0);
          const accent = MEAL_ACCENT[meal];
          return (
            <View key={meal} style={st.mealCard}>
              <TouchableOpacity style={st.mealHeader} onPress={() => { setSearchMeal(meal); setSearchVisible(true); }}>
                <View style={st.mealIconWrap}><Text style={st.mealEmoji}>{MEAL_ICONS[meal]}</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={st.mealName}>{MEAL_LABEL[meal]}</Text>
                  <Text style={st.mealRec}>{mealKcal > 0 ? `${fmt(mealKcal)} kcal logged` : MEAL_SUGGESTED[meal]}</Text>
                </View>
                <View style={[st.mealAddBtn, { borderColor: accent + '55' }]}><Text style={{ fontSize: fontSize.lg, color: accent }}>+</Text></View>
              </TouchableOpacity>
              {mealFoods.map(f => (<FoodRow key={f.id} food={f} onDelete={() => removeFood(selectedDate, f.id)} />))}
            </View>
          );
        })}

        <Text style={st.sectionHdr}>Wellness & Activity</Text>
        <View style={st.wellGrid}>
          <TouchableOpacity style={st.wellBtn} onPress={() => setExerciseVisible(true)}>
            <View style={[st.wellIcon, { backgroundColor: colors.teal + '15' }]}><Text style={{fontSize: 20}}>🔥</Text></View>
            <Text style={st.wellLbl}>Exercise</Text>
            <Text style={st.wellVal}>{caloriesBurned > 0 ? `-${fmt(caloriesBurned)}` : 'Log'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={st.wellBtn} onPress={() => setSleepVisible(true)}>
            <View style={[st.wellIcon, { backgroundColor: colors.teal + '15' }]}><Text style={{fontSize: fontSize.md}}>🌙</Text></View>
            <Text style={st.wellLbl}>Sleep</Text>
            <Text style={st.wellVal}>Log</Text>
          </TouchableOpacity>
          <TouchableOpacity style={st.wellBtn} onPress={() => setMoodVisible(true)}>
            <View style={[st.wellIcon, { backgroundColor: colors.honey + '15' }]}><Text style={{fontSize: 20}}>😊</Text></View>
            <Text style={st.wellLbl}>Mood</Text>
            <Text style={st.wellVal}>Log</Text>
          </TouchableOpacity>
          <TouchableOpacity style={st.wellBtn} onPress={() => setStressVisible(true)}>
            <View style={[st.wellIcon, { backgroundColor: colors.rose + '15' }]}><Text style={{fontSize: 20}}>🌬️</Text></View>
            <Text style={st.wellLbl}>Stress</Text>
            <Text style={st.wellVal}>Log</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* Food Search Modal */}
      <Modal visible={searchVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setSearchVisible(false)}>
        <SafeAreaView style={st.safe} edges={['bottom']}>
          <View style={st.modalHdr}>
            <Text style={st.modalTitle}>Add to {MEAL_LABEL[searchMeal]}</Text>
            <TouchableOpacity onPress={() => setSearchVisible(false)} style={st.closeBtn}><Ionicons name="close" size={22} color={colors.ink2} /></TouchableOpacity>
          </View>
          
          <View style={{ padding: spacing.md, gap: spacing.sm }}>
            <View style={st.aiInputRow}>
              <TextInput style={st.aiInput} placeholder="✨ Describe meal (e.g. '2 eggs and toast')" placeholderTextColor={colors.ink3} value={aiEstimateQuery} onChangeText={setAiEstimateQuery} onSubmitEditing={handleAiEstimate} />
              <TouchableOpacity onPress={handleAiEstimate} style={st.aiGoBtn}>
                {aiEstimating ? <ActivityIndicator size="small" color={colors.white} /> : <Text style={st.aiGoTxt}>GO</Text>}
              </TouchableOpacity>
            </View>

            <View style={st.modeTabs}>
              {(['database', 'restaurant', 'custom'] as const).map(mode => (
                <TouchableOpacity key={mode} onPress={() => setSearchMode(mode)} style={[st.modeTab, searchMode === mode && st.modeTabActive]}>
                  <Text style={[st.modeTabTxt, searchMode === mode && st.modeTabTxtActive]}>{mode.charAt(0).toUpperCase() + mode.slice(1)}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {searchMode !== 'custom' ? (
              <>
                <View style={st.searchRow}>
                  <Ionicons name="search-outline" size={18} color={colors.ink3} />
                  <TextInput style={{ flex: 1, color: colors.ink }} placeholder={`Search ${searchMode}...`} placeholderTextColor={colors.ink3} value={searchQuery} onChangeText={setSearchQuery} />
                </View>
                <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                  <TouchableOpacity style={st.actionBtn} onPress={handleCamera}><Ionicons name="camera" size={18} color={colors.ink2} /><Text style={st.actionBtnTxt}>Photo</Text></TouchableOpacity>
                  <TouchableOpacity style={st.actionBtn} onPress={async () => {
                    if (!permission?.granted) {
                      const res = await requestPermission();
                      if (!res.granted) return;
                    }
                    setBarcodeVisible(true);
                  }}><Ionicons name="barcode" size={18} color={colors.ink2} /><Text style={st.actionBtnTxt}>Barcode</Text></TouchableOpacity>
                </View>
              </>
            ) : (
              <View style={st.customForm}>
                <TextInput style={st.customInput} placeholder="Food name" value={customName} onChangeText={setCustomName} />
                <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                  <TextInput style={[st.customInput, { flex: 1 }]} placeholder="Calories" keyboardType="numeric" value={customKcal} onChangeText={setCustomKcal} />
                  <TextInput style={[st.customInput, { flex: 1 }]} placeholder="Protein (g)" keyboardType="numeric" value={customProtein} onChangeText={setCustomProtein} />
                </View>
                <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                  <TextInput style={[st.customInput, { flex: 1 }]} placeholder="Carbs (g)" keyboardType="numeric" value={customCarbs} onChangeText={setCustomCarbs} />
                  <TextInput style={[st.customInput, { flex: 1 }]} placeholder="Fat (g)" keyboardType="numeric" value={customFat} onChangeText={setCustomFat} />
                </View>
                <TouchableOpacity style={st.customAddBtn} onPress={handleAddCustomFood}>
                  <Text style={st.customAddBtnTxt}>Add Custom Food</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {searchMode !== 'custom' && (
            <FlatList
              data={filteredFoods as LocalFood[]}
              keyExtractor={f => f.id}
              contentContainerStyle={{ paddingBottom: 40 }}
              renderItem={({ item: f }) => (
                <TouchableOpacity style={st.foodResult} onPress={async () => {
                  await addFood(selectedDate, {
                    id: `${Date.now()}`,
                    name: f.name,
                    icon: (f as any).icon || '🍽️',
                    kcal: f.kcal,
                    protein: f.protein,
                    carbs: f.carbs,
                    fat: f.fat,
                    meal: searchMeal,
                    unit: (f as any).serving || '100g'
                  });
                  setSearchVisible(false);
                  setSearchQuery('');
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                }}>
                  <Text style={{ fontSize: 22 }}>{(f as any).icon || '🍴'}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={st.foodResultName}>{f.name}</Text>
                    <Text style={st.foodResultBrand}>{(f as any).brand || 'Database'}</Text>
                  </View>
                  <Text style={st.foodResultKcal}>{fmt(f.kcal)} kcal</Text>
                </TouchableOpacity>
              )}
            />
          )}
        </SafeAreaView>
      </Modal>

      {/* Barcode Modal */}
      <Modal visible={barcodeVisible} animationType="fade" onRequestClose={() => setBarcodeVisible(false)}>
        <CameraView style={StyleSheet.absoluteFill} onBarcodeScanned={handleBarcodeScanned}>
          <SafeAreaView style={{ flex: 1, justifyContent: 'space-between' }}>
            <TouchableOpacity onPress={() => setBarcodeVisible(false)} style={[st.closeBtn, { margin: 20 }]}>
              <Ionicons name="close" size={24} color={colors.ink} />
            </TouchableOpacity>
            <View style={st.barcodeOverlay}>
              <View style={st.barcodeTarget} />
              <Text style={st.barcodeTxt}>Align barcode within the frame</Text>
            </View>
            <View style={{ height: 100 }} />
          </SafeAreaView>
        </CameraView>
      </Modal>

      <AiConfirmModal 
        visible={aiConfirmVisible} 
        items={pendingAiItems} 
        onConfirm={async items => {
          setAiConfirmVisible(false);
          for (const it of items) {
            await addFood(selectedDate, {
              id: `${Date.now()}_${Math.random()}`,
              icon: it.icon,
              name: it.name,
              kcal: it.kcal,
              carbs: it.carbs,
              protein: it.protein,
              fat: it.fat,
              unit: it.unit,
              meal: searchMeal
            });
          }
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          await addXp(items.length * 10);
        }} 
        onClose={() => setAiConfirmVisible(false)} 
      />

      <ExerciseModal 
        visible={exerciseVisible} 
        onClose={() => setExerciseVisible(false)} 
        onAddCalories={(kcal) => updateCaloriesBurned(selectedDate, caloriesBurned + kcal)} 
        onAddStrengthSession={(session) => addStrengthSession(selectedDate, session)}
      />
      
      <SleepModal 
        visible={sleepVisible} 
        onClose={() => setSleepVisible(false)} 
        onSave={async (data) => {
          await logSleep(selectedDate, data);
          await addXp(20);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }} 
      />
      <MoodModal 
        visible={moodVisible} 
        onClose={() => setMoodVisible(false)} 
        onSave={async (val, notes) => {
          await logMood(selectedDate, val);
          await addXp(10);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }} 
      />
      <StressBreathingModal 
        visible={stressVisible} 
        onClose={() => setStressVisible(false)} 
        onSave={async (level) => {
          // Assuming a setStress store method
          await addXp(15);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }} 
      />
    </SafeAreaView>
  );
}

const fr = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 12, paddingHorizontal: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.line, backgroundColor: colors.layer1 },
  icon: { fontSize: 24 },
  info: { flex: 1, gap: 2 },
  name: { fontSize: fontSize.sm, color: colors.ink, fontWeight: '600' },
  pills: { flexDirection: 'row', gap: 4 },
  pill: { fontSize: 10, fontWeight: '700', paddingHorizontal: 4, borderRadius: 4, borderWidth: 1 },
  pillP: { color: colors.rose, backgroundColor: colors.rose + '10', borderColor: colors.rose + '30' },
  pillC: { color: colors.sky, backgroundColor: colors.sky + '10', borderColor: colors.sky + '30' },
  pillF: { color: colors.violet, backgroundColor: colors.violet + '10', borderColor: colors.violet + '30' },
  kcalWrap: { alignItems: 'flex-end' },
  kcal: { fontSize: 12, fontWeight: '800', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, borderWidth: 1, overflow: 'hidden' },
  trash: { padding: 4, marginLeft: 4 },
});

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  appHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingTop: 8, paddingBottom: 12 },
  appTitle: { fontSize: 28, fontWeight: '900', color: colors.ink, letterSpacing: -0.5 },
  headerRight: { flexDirection: 'row', gap: 12 },
  iconBtn: { width: 44, height: 44, backgroundColor: colors.layer2, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  notifDot: { position: 'absolute', top: 12, right: 12, width: 8, height: 8, borderRadius: 4, backgroundColor: colors.rose, borderWidth: 2, borderColor: colors.layer2 },
  dateBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingVertical: 8, backgroundColor: colors.layer1, borderBottomWidth: 1, borderBottomColor: colors.line },
  navBtn: { padding: 8 },
  dateText: { color: colors.ink, fontWeight: '800', fontSize: fontSize.md },
  scroll: { paddingBottom: 40 },
  calCard: { margin: spacing.md, borderRadius: 24, borderWidth: 1, borderColor: colors.line2, overflow: 'hidden' },
  calSection: { alignItems: 'center', paddingVertical: 24 },
  ringWrap: { position: 'relative', alignItems: 'center', justifyContent: 'center' },
  ringCenter: { position: 'absolute', alignItems: 'center' },
  ringNum: { fontSize: 36, fontWeight: '900', color: colors.ink },
  ringLbl: { fontSize: 12, color: colors.ink3, fontWeight: '600', marginTop: -2 },
  calStatsRow: { flexDirection: 'row', gap: 32, marginTop: 24 },
  calStat: { alignItems: 'center' },
  calStatVal: { fontSize: 18, fontWeight: '800' },
  calStatLbl: { fontSize: 11, color: colors.ink3, fontWeight: '700', textTransform: 'uppercase', marginTop: 2 },
  macroStrip: { flexDirection: 'row', gap: 10, paddingHorizontal: spacing.md },
  macroTile: { flex: 1, backgroundColor: colors.layer1, borderRadius: 16, padding: 12, borderWidth: 1, borderColor: colors.line },
  macroName: { fontSize: 11, color: colors.ink3, marginBottom: 4, fontWeight: '800', textTransform: 'uppercase' },
  macroVal: { fontSize: 12, fontWeight: '800' },
  macroTrack: { height: 6, backgroundColor: colors.layer2, borderRadius: 3, marginTop: 8, overflow: 'hidden' },
  macroFill: { height: '100%', borderRadius: 3 },
  sectionHdr: { paddingHorizontal: spacing.md, paddingTop: 24, paddingBottom: 12, fontSize: 13, fontWeight: '900', color: colors.ink, textTransform: 'uppercase', letterSpacing: 1 },
  mealCard: { marginHorizontal: spacing.md, marginBottom: 12, backgroundColor: colors.layer1, borderRadius: 20, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' },
  mealHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  mealIconWrap: { width: 48, height: 48, borderRadius: 16, backgroundColor: colors.layer2, alignItems: 'center', justifyContent: 'center' },
  mealEmoji: { fontSize: 24 },
  mealName: { fontSize: 17, fontWeight: '800', color: colors.ink },
  mealRec: { fontSize: 12, color: colors.ink3, marginTop: 2, fontWeight: '500' },
  mealAddBtn: { width: 32, height: 32, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  wellGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingHorizontal: spacing.md },
  wellBtn: { width: '48.5%', backgroundColor: colors.layer1, borderRadius: 20, padding: 16, borderWidth: 1, borderColor: colors.line, alignItems: 'center' },
  wellIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  wellLbl: { fontSize: 14, fontWeight: '700', color: colors.ink },
  wellVal: { fontSize: 12, fontWeight: '600', color: colors.ink3, marginTop: 4 },
  modalHdr: { padding: spacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: colors.line },
  modalTitle: { color: colors.ink, fontSize: 18, fontWeight: '800' },
  closeBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.layer2, borderRadius: 14 },
  aiInputRow: { flexDirection: 'row', gap: 8, backgroundColor: colors.layer2, borderRadius: 16, padding: 6 },
  aiInput: { flex: 1, paddingHorizontal: 12, color: colors.ink, fontSize: 15, fontWeight: '500' },
  aiGoBtn: { backgroundColor: colors.purple, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12 },
  aiGoTxt: { color: colors.white, fontWeight: '900', fontSize: 13 },
  modeTabs: { flexDirection: 'row', gap: 8, marginTop: 8 },
  modeTab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 12, backgroundColor: colors.layer2, borderWidth: 1, borderColor: colors.line2 },
  modeTabActive: { backgroundColor: colors.purple, borderColor: colors.purple },
  modeTabTxt: { fontSize: 13, fontWeight: '700', color: colors.ink2 },
  modeTabTxtActive: { color: colors.white },
  searchRow: { flexDirection: 'row', gap: 10, backgroundColor: colors.layer2, borderRadius: 16, padding: 14, alignItems: 'center', marginTop: 8 },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.layer2, paddingVertical: 14, borderRadius: 16, borderWidth: 1, borderColor: colors.line2 },
  actionBtnTxt: { color: colors.ink, fontWeight: '700', fontSize: 14 },
  customForm: { gap: 10, marginTop: 8 },
  customInput: { backgroundColor: colors.layer2, borderRadius: 12, padding: 14, color: colors.ink, fontSize: 15, fontWeight: '500' },
  customAddBtn: { backgroundColor: colors.purple, borderRadius: 14, padding: 16, alignItems: 'center', marginTop: 4 },
  customAddBtnTxt: { color: colors.white, fontWeight: '800', fontSize: 16 },
  foodResult: { flexDirection: 'row', alignItems: 'center', gap: 16, padding: 16, borderBottomWidth: 1, borderBottomColor: colors.line },
  foodResultName: { color: colors.ink, fontSize: 15, fontWeight: '700' },
  foodResultBrand: { color: colors.ink3, fontSize: 12, fontWeight: '500', marginTop: 2 },
  foodResultKcal: { color: colors.lavender, fontSize: 15, fontWeight: '900' },
  barcodeOverlay: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  barcodeTarget: { width: 250, height: 250, borderWidth: 2, borderColor: colors.purple, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.1)' },
  barcodeTxt: { color: colors.white, marginTop: 24, fontWeight: '700', fontSize: 16, textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 4, textShadowOffset: { width: 0, height: 2 } },
});
