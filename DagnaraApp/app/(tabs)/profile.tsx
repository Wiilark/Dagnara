import { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Alert, TextInput, Modal, Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAuthStore } from '../../src/store/authStore';
import { useAppStore, getXpLevel, calcTDEE } from '../../src/store/appStore';
import { supabase } from '../../src/lib/supabase';
import { colors, spacing, fontSize, radius } from '../../src/theme';

const DIET_PLANS = ['Balanced', 'High Protein', 'Low Carb', 'Keto', 'Vegan', 'Mediterranean'];
const ALLERGIES = ['Gluten', 'Dairy', 'Nuts', 'Eggs', 'Soy', 'Shellfish'];

export default function ProfileScreen() {
  const { email, profile, logout, setProfile } = useAuthStore();
  const { xp, streak, setGoals, activityLevel, weightGoal, calorieGoal: storeCalGoal } = useAppStore();
  const xpInfo = getXpLevel(xp);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(profile);
  const [dietModal, setDietModal] = useState(false);
  const [macrosModal, setMacrosModal] = useState(false);
  const [measureModal, setMeasureModal] = useState(false);
  const [settingsModal, setSettingsModal] = useState(false);
  const [dietaryModal, setDietaryModal] = useState(false);
  const [tdeeModal, setTdeeModal] = useState(false);
  const [selectedFoodPref, setSelectedFoodPref] = useState('none');
  const [selectedDiet, setSelectedDiet] = useState('Balanced');
  const [selectedAllergies, setSelectedAllergies] = useState<string[]>([]);

  // Unit preferences
  const [unitWeight, setUnitWeight] = useState<'kg' | 'lbs'>('kg');
  const [unitHeight, setUnitHeight] = useState<'cm' | 'm'>('cm');
  const [unitWater,  setUnitWater]  = useState<'ml' | 'fl oz'>('ml');
  const [unitEnergy, setUnitEnergy] = useState<'kcal' | 'kJ'>('kcal');

  // Notification preferences
  const [notifCheckIn, setNotifCheckIn] = useState(false);
  const [notifMeals,   setNotifMeals]   = useState(false);
  const [notifStreak,  setNotifStreak]  = useState(false);
  const calorieGoal = storeCalGoal || 2000;
  const [waterGoal, setWaterGoal] = useState('8');
  const [sex, setSex] = useState<'male' | 'female'>('male');
  const [localActivity, setLocalActivity] = useState<typeof activityLevel>(activityLevel);
  const [localGoal, setLocalGoal] = useState<typeof weightGoal>(weightGoal);
  const [measurements, setMeasurements] = useState<Record<string, string>>({
    weight: '', height: '', waist: '', chest: '', hips: '', arms: '',
  });

  // Load persisted measurements + prefs on mount
  useEffect(() => {
    AsyncStorage.multiGet([
      'body_measurements', 'unit_weight', 'unit_height', 'unit_water', 'unit_energy',
      'notif_checkin', 'notif_meals', 'notif_streak',
    ]).then(pairs => {
      const m: Record<string, string | null> = Object.fromEntries(pairs);
      if (m['body_measurements']) setMeasurements(JSON.parse(m['body_measurements']));
      if (m['unit_weight'])  setUnitWeight(m['unit_weight'] as any);
      if (m['unit_height'])  setUnitHeight(m['unit_height'] as any);
      if (m['unit_water'])   setUnitWater(m['unit_water'] as any);
      if (m['unit_energy'])  setUnitEnergy(m['unit_energy'] as any);
      if (m['notif_checkin']) setNotifCheckIn(m['notif_checkin'] === 'true');
      if (m['notif_meals'])   setNotifMeals(m['notif_meals'] === 'true');
      if (m['notif_streak'])  setNotifStreak(m['notif_streak'] === 'true');
    });
  }, []);

  // Reset local TDEE state when modal opens
  useEffect(() => {
    if (tdeeModal) {
      setLocalActivity(activityLevel);
      setLocalGoal(weightGoal);
    }
  }, [tdeeModal]);

  async function handleSave() {
    setProfile(draft);
    await supabase.from('dagnara_profiles').upsert(
      { email, profile_data: draft, updated_at: new Date().toISOString() },
      { onConflict: 'email' }
    );
    setEditing(false);
  }

  async function handleSaveMeasurements() {
    await AsyncStorage.setItem('body_measurements', JSON.stringify(measurements));
    // Sync weight & height back into the profile
    const updated = {
      ...profile,
      ...(measurements.weight ? { weight: measurements.weight } : {}),
      ...(measurements.height ? { height: measurements.height } : {}),
    };
    setProfile(updated);
    try {
      await supabase.from('dagnara_profiles').upsert(
        { email, profile_data: updated, updated_at: new Date().toISOString() },
        { onConflict: 'email' }
      );
    } catch {}
    setMeasureModal(false);
  }

  function handleLogout() {
    Alert.alert('Sign out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: logout },
    ]);
  }

  function handleDeleteData() {
    Alert.alert(
      'Delete all data',
      'This will permanently delete all your health data. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete everything', style: 'destructive', onPress: async () => {
            try {
              // Wipe all local storage
              const keys = await AsyncStorage.getAllKeys();
              await AsyncStorage.multiRemove(keys as string[]);
              // Wipe Supabase data for this user
              if (email) {
                await Promise.allSettled([
                  supabase.from('dagnara_diary').delete().eq('email', email),
                  supabase.from('dagnara_app_state').delete().eq('email', email),
                  supabase.from('dagnara_profiles').delete().eq('email', email),
                ]);
              }
            } catch {}
            logout();
          },
        },
      ]
    );
  }

  const initial = (profile.name ?? email ?? '?')[0].toUpperCase();

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* ── Header ── */}
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={20} color={colors.ink2} />
          </TouchableOpacity>
          <Text style={styles.heading}>Profile</Text>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <TouchableOpacity style={styles.settingsBtn} onPress={() => setSettingsModal(true)}>
              <Ionicons name="settings-outline" size={18} color={colors.ink2} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.editBtn} onPress={() => { setDraft(profile); setEditing(true); }}>
              <Ionicons name="pencil-outline" size={16} color={colors.lavender} />
              <Text style={styles.editBtnText}>Edit</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Avatar card ── */}
        <View style={styles.avatarCard}>
          <View style={styles.avatarWrap}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initial}</Text>
            </View>
            <TouchableOpacity style={styles.avatarAdd} onPress={() => Alert.alert('Photo upload', 'Avatar upload coming soon.')}>
              <Ionicons name="add" size={14} color="#fff" />
            </TouchableOpacity>
          </View>
          <Text style={styles.name}>{profile.name ?? 'Your Name'}</Text>
          <Text style={styles.emailText}>{email}</Text>
          {/* XP level */}
          <View style={styles.xpRow}>
            <View style={styles.xpBadge}><Text style={styles.xpBadgeTxt}>{xpInfo.level}</Text></View>
            <View style={{ flex: 1 }}>
              <View style={styles.xpMeta}>
                <Text style={styles.xpName}>{xpInfo.name}</Text>
                <Text style={styles.xpPts}>{xp} XP</Text>
              </View>
              <View style={styles.xpTrack}><View style={[styles.xpFill, { width: `${xpInfo.progress * 100}%` as any }]} /></View>
            </View>
          </View>
          {/* Stats row */}
          <View style={styles.statsRow}>
            {[
              { val: streak, lbl: 'Day streak', color: colors.honey },
              { val: selectedDiet, lbl: 'Active diet', color: colors.lavender },
              { val: calorieGoal, lbl: 'kcal goal', color: colors.green },
            ].map(({ val, lbl, color }) => (
              <View key={lbl} style={styles.statChip}>
                <Text style={[styles.statChipVal, { color }]}>{val}</Text>
                <Text style={styles.statChipLbl}>{lbl}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* ── Customization ── */}
        <Text style={styles.sectionHdr}>CUSTOMIZATION</Text>
        <View style={styles.menuCard}>
          {[
            { icon: 'nutrition-outline', label: 'Diet Plan', color: colors.green, value: selectedDiet, onPress: () => setDietModal(true) },
            { icon: 'person-outline', label: 'Personal Details', color: colors.lavender, value: `${profile.age ? profile.age + ' yrs' : '—'} · ${profile.weight ? profile.weight + ' kg' : '—'}`, onPress: () => { setDraft(profile); setEditing(true); } },
            { icon: 'bar-chart-outline', label: 'Adjust Macronutrients', color: colors.sky, value: '', onPress: () => setMacrosModal(true) },
            { icon: 'flame-outline', label: 'Calorie & Activity Goals', color: colors.honey, value: `${calorieGoal} kcal`, onPress: () => setTdeeModal(true) },
            { icon: 'leaf-outline', label: 'Dietary Needs & Preferences', color: colors.teal, value: (() => { const pref = selectedFoodPref === 'none' ? 'No food preferences' : selectedFoodPref; const allerg = selectedAllergies.length === 0 ? 'No allergies' : selectedAllergies.join(', '); return `${pref} · ${allerg}`; })(), onPress: () => setDietaryModal(true) },
            { icon: 'water-outline', label: 'Water Habits', color: colors.sky, value: `${waterGoal} glasses/day`, onPress: () => Alert.prompt?.('Water goal', 'Glasses per day', (v) => v && setWaterGoal(v), 'plain-text', waterGoal, 'numeric') },
            { icon: 'body-outline', label: 'Body Measurements', color: colors.rose, value: measurements.weight ? `${measurements.weight} kg` : 'Not set', onPress: () => setMeasureModal(true) },
          ].map(({ icon, label, color, value, onPress }) => (
            <TouchableOpacity key={label} style={styles.menuRow} onPress={onPress}>
              <View style={[styles.menuIcon, { backgroundColor: color + '22' }]}>
                <Ionicons name={icon as any} size={16} color={color} />
              </View>
              <Text style={styles.menuLabel}>{label}</Text>
              {value ? <Text style={styles.menuValue}>{value}</Text> : null}
              <Ionicons name="chevron-forward" size={16} color={colors.ink3} />
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Health Sync ── */}
        <Text style={styles.sectionHdr}>HEALTH SYNC</Text>
        <View style={styles.menuCard}>
          {[
            { icon: '❤️', label: 'Apple Health', desc: 'Import steps, sleep, workouts', color: '#ff2d55' },
            { icon: '💚', label: 'Google Fit / Health Connect', desc: 'Sync steps, calories, activity', color: '#4285f4' },
          ].map(({ icon, label, desc, color }) => (
            <TouchableOpacity key={label} style={styles.healthRow} onPress={() => Alert.alert('Coming soon', `${label} integration coming soon.`)}>
              <View style={[styles.healthIcon, { backgroundColor: color + '22' }]}>
                <Text style={{ fontSize: 22 }}>{icon}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.menuLabel}>{label}</Text>
                <Text style={styles.healthDesc}>{desc}</Text>
              </View>
              <Text style={styles.connectTxt}>Connect</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Account ── */}
        <Text style={styles.sectionHdr}>ACCOUNT</Text>
        <View style={styles.menuCard}>
          {[
            { icon: 'shield-outline', label: 'Privacy & Security', color: colors.lavender },
            { icon: 'help-circle-outline', label: 'Help & Support', color: colors.sky },
          ].map(({ icon, label, color }) => (
            <TouchableOpacity key={label} style={styles.menuRow} onPress={() => Alert.alert(label, 'Coming soon.')}>
              <View style={[styles.menuIcon, { backgroundColor: color + '22' }]}>
                <Ionicons name={icon as any} size={16} color={color} />
              </View>
              <Text style={styles.menuLabel}>{label}</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.ink3} />
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={styles.menuRow} onPress={handleLogout}>
            <View style={[styles.menuIcon, { backgroundColor: colors.rose + '22' }]}>
              <Ionicons name="log-out-outline" size={16} color={colors.rose} />
            </View>
            <Text style={[styles.menuLabel, { color: colors.rose }]}>Sign out</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.ink3} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.menuRow} onPress={handleDeleteData}>
            <View style={[styles.menuIcon, { backgroundColor: colors.rose + '11' }]}>
              <Ionicons name="trash-outline" size={16} color={colors.rose + 'aa'} />
            </View>
            <Text style={[styles.menuLabel, { color: colors.rose + 'aa' }]}>Delete all my data</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.ink3} />
          </TouchableOpacity>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* ── Measurements Modal ── */}
      <Modal visible={measureModal} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={styles.safe}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setMeasureModal(false)}><Text style={styles.cancelText}>Close</Text></TouchableOpacity>
            <Text style={styles.modalTitle}>Body Measurements</Text>
            <TouchableOpacity onPress={handleSaveMeasurements}><Text style={styles.saveText}>Save</Text></TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.modalScroll}>
            {/* BMI Card */}
            {(() => {
              const w = parseFloat(measurements.weight || String(profile.weight ?? ''));
              const h = parseFloat(measurements.height || String(profile.height ?? ''));
              const bmi = w > 0 && h > 0 ? (w / ((h / 100) ** 2)) : null;
              const bmiLabel = bmi === null ? 'Log your weight & height' :
                bmi < 18.5 ? 'Underweight' : bmi < 25 ? 'Normal weight' :
                bmi < 30 ? 'Overweight' : 'Obese';
              const bmiColor = bmi === null ? colors.ink3 :
                bmi < 18.5 ? '#38bdf8' : bmi < 25 ? '#4ade80' :
                bmi < 30 ? '#f59e0b' : '#ef4444';
              return (
                <View style={styles.bmiCard}>
                  <Text style={styles.bmiSectionLbl}>Body Mass Index</Text>
                  <Text style={[styles.bmiNum, { color: bmiColor }]}>{bmi ? bmi.toFixed(1) : '--'}</Text>
                  <Text style={styles.bmiLbl}>{bmiLabel}</Text>
                  <View style={styles.bmiScale}>
                    <View style={[styles.bmiSeg, { backgroundColor: '#38bdf8' }]} />
                    <View style={[styles.bmiSeg, { backgroundColor: '#4ade80', flex: 1.2 }]} />
                    <View style={[styles.bmiSeg, { backgroundColor: '#f59e0b' }]} />
                    <View style={[styles.bmiSeg, { backgroundColor: '#ef4444' }]} />
                  </View>
                  <View style={styles.bmiScaleLbls}>
                    {['Under', 'Normal', 'Over', 'Obese'].map(l => <Text key={l} style={styles.bmiScaleLbl}>{l}</Text>)}
                  </View>
                </View>
              );
            })()}
            {/* Measurement inputs */}
            <Text style={styles.inputLabel}>Current Measurements</Text>
            {[
              { key: 'weight', label: 'Weight', unit: 'kg' },
              { key: 'height', label: 'Height', unit: 'cm' },
              { key: 'waist',  label: 'Waist',  unit: 'cm' },
              { key: 'chest',  label: 'Chest',  unit: 'cm' },
              { key: 'hips',   label: 'Hips',   unit: 'cm' },
              { key: 'arms',   label: 'Arms',   unit: 'cm' },
            ].map(({ key, label, unit }) => (
              <View key={key} style={styles.measureRow}>
                <Text style={styles.measureLbl}>{label}</Text>
                <View style={styles.measureInput}>
                  <TextInput
                    style={styles.measureField}
                    value={measurements[key]}
                    onChangeText={v => setMeasurements(m => ({ ...m, [key]: v }))}
                    keyboardType="decimal-pad"
                    placeholder="—"
                    placeholderTextColor={colors.ink3}
                  />
                  <Text style={styles.measureUnit}>{unit}</Text>
                </View>
              </View>
            ))}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* ── Diet Plan Modal ── */}
      <Modal visible={dietModal} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={styles.safe}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setDietModal(false)}><Text style={styles.cancelText}>Cancel</Text></TouchableOpacity>
            <Text style={styles.modalTitle}>Diet Plan</Text>
            <TouchableOpacity onPress={() => setDietModal(false)}><Text style={styles.saveText}>Done</Text></TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: spacing.md, gap: spacing.sm }}>
            {DIET_PLANS.map((plan) => (
              <TouchableOpacity key={plan} style={[styles.dietOption, selectedDiet === plan && styles.dietOptionSel]} onPress={() => setSelectedDiet(plan)}>
                <Text style={[styles.dietOptionTxt, selectedDiet === plan && { color: colors.lavender }]}>{plan}</Text>
                {selectedDiet === plan && <Ionicons name="checkmark" size={18} color={colors.lavender} />}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* ── Macros Modal ── */}
      <Modal visible={macrosModal} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={styles.safe}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setMacrosModal(false)}><Text style={styles.cancelText}>Close</Text></TouchableOpacity>
            <Text style={styles.modalTitle}>Macronutrients</Text>
            <TouchableOpacity onPress={() => setMacrosModal(false)}><Text style={styles.saveText}>Save</Text></TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.modalScroll}>
            <Text style={[styles.inputLabel, { marginBottom: 16 }]}>Set your daily macro targets. Percentages must add up to 100%.</Text>
            {[
              { key: 'protein', label: 'Protein', color: colors.rose, pct: '30', g: '150' },
              { key: 'carbs',   label: 'Carbohydrates', color: colors.honey, pct: '45', g: '225' },
              { key: 'fat',     label: 'Fat', color: colors.sky, pct: '25', g: '55' },
            ].map(({ key, label, color, pct, g }) => (
              <View key={key} style={mst.macroRow}>
                <View style={[mst.macroDot, { backgroundColor: color }]} />
                <View style={{ flex: 1 }}>
                  <Text style={mst.macroLabel}>{label}</Text>
                  <View style={mst.macroBar}><View style={[mst.macroFill, { width: `${pct}%` as any, backgroundColor: color + 'aa' }]} /></View>
                </View>
                <View style={mst.macroVals}>
                  <Text style={[mst.macroPct, { color }]}>{pct}%</Text>
                  <Text style={mst.macroG}>{g}g</Text>
                </View>
              </View>
            ))}
            <View style={mst.calCard}>
              <Text style={mst.calLbl}>Daily Calorie Goal</Text>
              <Text style={mst.calVal}>{calorieGoal} kcal</Text>
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* ── Settings Modal ── */}
      <Modal visible={settingsModal} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={styles.safe}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setSettingsModal(false)}><Text style={styles.cancelText}>Close</Text></TouchableOpacity>
            <Text style={styles.modalTitle}>Settings</Text>
            <View style={{ width: 40 }} />
          </View>
          <ScrollView contentContainerStyle={[styles.modalScroll, { gap: 0 }]} showsVerticalScrollIndicator={false}>
            {/* Account */}
            <Text style={sst.sectionLbl}>ACCOUNT</Text>
            <View style={sst.card}>
              <TouchableOpacity style={sst.row} onPress={() => setSettingsModal(false)}>
                <View style={[sst.icon, { backgroundColor: colors.purple + '1a' }]}><Text>👤</Text></View>
                <Text style={sst.label}>Profile</Text>
                <Ionicons name="chevron-forward" size={14} color={colors.ink3} />
              </TouchableOpacity>
              <TouchableOpacity style={[sst.row, { borderBottomWidth: 0 }]} onPress={() => Alert.alert('Premium', '🌟 Premium upgrade coming soon!')}>
                <View style={[sst.icon, { backgroundColor: colors.honey + '1a' }]}><Text>⭐</Text></View>
                <Text style={sst.label}>Upgrade to Premium</Text>
                <Ionicons name="chevron-forward" size={14} color={colors.ink3} />
              </TouchableOpacity>
            </View>

            {/* Units */}
            <Text style={sst.sectionLbl}>UNITS & PREFERENCES</Text>
            <View style={sst.card}>
              {[
                { icon: '⚖️', label: 'Weight unit', current: unitWeight, options: ['kg', 'lbs'] as const, bg: colors.sky + '1a',
                  onToggle: () => { const v = unitWeight === 'kg' ? 'lbs' : 'kg'; setUnitWeight(v); AsyncStorage.setItem('unit_weight', v); } },
                { icon: '📏', label: 'Height unit', current: unitHeight, options: ['cm', 'm'] as const, bg: colors.green + '1a',
                  onToggle: () => { const v = unitHeight === 'cm' ? 'm' : 'cm'; setUnitHeight(v); AsyncStorage.setItem('unit_height', v); } },
                { icon: '💧', label: 'Water unit', current: unitWater, options: ['ml', 'fl oz'] as const, bg: colors.sky + '1a',
                  onToggle: () => { const v = unitWater === 'ml' ? 'fl oz' : 'ml'; setUnitWater(v); AsyncStorage.setItem('unit_water', v); } },
                { icon: '🔥', label: 'Energy unit', current: unitEnergy, options: ['kcal', 'kJ'] as const, bg: colors.honey + '1a',
                  onToggle: () => { const v = unitEnergy === 'kcal' ? 'kJ' : 'kcal'; setUnitEnergy(v); AsyncStorage.setItem('unit_energy', v); } },
              ].map(({ icon, label, current, options, bg, onToggle }, i, arr) => (
                <TouchableOpacity key={label} style={[sst.row, i === arr.length - 1 && { borderBottomWidth: 0 }]} onPress={onToggle}>
                  <View style={[sst.icon, { backgroundColor: bg }]}><Text>{icon}</Text></View>
                  <Text style={sst.label}>{label}</Text>
                  <View style={sst.unitToggle}>
                    {options.map(opt => (
                      <Text key={opt} style={[sst.unitOpt, current === opt && sst.unitOptActive]}>{opt}</Text>
                    ))}
                  </View>
                </TouchableOpacity>
              ))}
            </View>

            {/* Notifications */}
            <Text style={sst.sectionLbl}>NOTIFICATIONS</Text>
            <View style={sst.card}>
              {[
                { icon: '🔔', label: 'Daily check-in reminder', bg: colors.purple + '1a', value: notifCheckIn,
                  onToggle: (v: boolean) => { setNotifCheckIn(v); AsyncStorage.setItem('notif_checkin', String(v)); } },
                { icon: '🥗', label: 'Meal reminders', bg: colors.green + '1a', value: notifMeals,
                  onToggle: (v: boolean) => { setNotifMeals(v); AsyncStorage.setItem('notif_meals', String(v)); } },
                { icon: '🔥', label: 'Streak protection', bg: colors.honey + '1a', value: notifStreak,
                  onToggle: (v: boolean) => { setNotifStreak(v); AsyncStorage.setItem('notif_streak', String(v)); } },
              ].map(({ icon, label, bg, value, onToggle }, i, arr) => (
                <View key={label} style={[sst.row, i === arr.length - 1 && { borderBottomWidth: 0 }]}>
                  <View style={[sst.icon, { backgroundColor: bg }]}><Text>{icon}</Text></View>
                  <Text style={[sst.label, { flex: 1 }]}>{label}</Text>
                  <Switch value={value} onValueChange={onToggle}
                    trackColor={{ false: colors.layer3, true: colors.purple + '88' }}
                    thumbColor={value ? colors.purple : colors.ink3}
                    style={{ transform: [{ scaleX: 0.85 }, { scaleY: 0.85 }] }} />
                </View>
              ))}
            </View>

            {/* Goals */}
            <Text style={sst.sectionLbl}>GOALS</Text>
            <View style={sst.card}>
              {[
                { icon: '🏃', label: 'Daily steps', val: '8,000', bg: colors.honey + '1a' },
                { icon: '💧', label: 'Water intake', val: `${waterGoal} glasses`, bg: colors.sky + '1a' },
                { icon: '😴', label: 'Sleep goal', val: '8h', bg: colors.purple + '1a' },
                { icon: '🍎', label: 'Calorie goal', val: `${calorieGoal} kcal`, bg: colors.green + '1a' },
              ].map(({ icon, label, val, bg }, i, arr) => (
                <TouchableOpacity key={label} style={[sst.row, i === arr.length - 1 && { borderBottomWidth: 0 }]}
                  onPress={() => Alert.alert(label, 'Tap to edit this goal.')}>
                  <View style={[sst.icon, { backgroundColor: bg }]}><Text>{icon}</Text></View>
                  <Text style={sst.label}>{label}</Text>
                  <Text style={sst.val}>{val}</Text>
                  <Ionicons name="chevron-forward" size={14} color={colors.ink3} />
                </TouchableOpacity>
              ))}
            </View>

            {/* Support */}
            <Text style={sst.sectionLbl}>SUPPORT</Text>
            <View style={sst.card}>
              <TouchableOpacity style={sst.row} onPress={() => Alert.alert('Help & Support', 'Coming soon.')}>
                <View style={[sst.icon, { backgroundColor: colors.sky + '1a' }]}><Text>💬</Text></View>
                <Text style={sst.label}>Help & Support</Text>
                <Ionicons name="chevron-forward" size={14} color={colors.ink3} />
              </TouchableOpacity>
              <TouchableOpacity style={sst.row} onPress={() => Alert.alert('Privacy Policy', 'Coming soon.')}>
                <View style={[sst.icon, { backgroundColor: colors.green + '1a' }]}><Text>🔒</Text></View>
                <Text style={sst.label}>Privacy Policy</Text>
                <Ionicons name="chevron-forward" size={14} color={colors.ink3} />
              </TouchableOpacity>
              <View style={[sst.row, { borderBottomWidth: 0 }]}>
                <View style={[sst.icon, { backgroundColor: colors.layer3 }]}><Text>ℹ️</Text></View>
                <Text style={sst.label}>App version</Text>
                <Text style={sst.val}>1.0.0</Text>
              </View>
            </View>
            <View style={{ height: 20 }} />
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* ── Dietary Preferences Modal ── */}
      <Modal visible={dietaryModal} animationType="slide" presentationStyle="fullScreen">
        <SafeAreaView style={dp.safe}>
          <View style={dp.header}>
            <TouchableOpacity onPress={() => setDietaryModal(false)} style={dp.backBtn}>
              <Ionicons name="chevron-back" size={18} color="#f0ecff" />
            </TouchableOpacity>
            <Text style={dp.title}>Food Preferences</Text>
            <View style={{ width: 36 }} />
          </View>
          <ScrollView contentContainerStyle={dp.scroll} showsVerticalScrollIndicator={false}>
            {/* Food preferences — single select */}
            <Text style={dp.sectionLbl}>FOOD PREFERENCES</Text>
            <View style={dp.listCard}>
              {[
                { key: 'none', label: 'No food preferences' },
                { key: 'vegetarian', label: 'Vegetarian' },
                { key: 'vegan', label: 'Vegan' },
                { key: 'pescetarian', label: 'Pescetarian' },
                { key: 'keto', label: 'Keto' },
                { key: 'paleo', label: 'Paleo' },
                { key: 'halal', label: 'Halal' },
                { key: 'kosher', label: 'Kosher' },
              ].map(({ key, label }, i, arr) => (
                <TouchableOpacity key={key} style={[dp.prefRow, i === arr.length - 1 && { borderBottomWidth: 0 }]}
                  onPress={() => setSelectedFoodPref(key)}>
                  <Text style={dp.prefLabel}>{label}</Text>
                  <View style={[dp.radio, selectedFoodPref === key && dp.radioSel]}>
                    {selectedFoodPref === key && <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>✓</Text>}
                  </View>
                </TouchableOpacity>
              ))}
            </View>
            {/* Allergies — multi select */}
            <Text style={dp.sectionLbl}>ALLERGIES</Text>
            <View style={dp.listCard}>
              {[
                { key: 'none', label: 'No allergies' },
                { key: 'Gluten', label: 'Gluten intolerant' },
                { key: 'Dairy', label: 'Lactose intolerant' },
                { key: 'Nuts', label: 'Allergic to nuts' },
                { key: 'Eggs', label: 'Allergic to egg' },
                { key: 'Shellfish', label: 'Allergic to shellfish' },
                { key: 'Soy', label: 'Allergic to soy' },
              ].map(({ key, label }, i, arr) => {
                const isOn = key === 'none' ? selectedAllergies.length === 0 : selectedAllergies.includes(key);
                return (
                  <TouchableOpacity key={key} style={[dp.prefRow, i === arr.length - 1 && { borderBottomWidth: 0 }]}
                    onPress={() => {
                      if (key === 'none') { setSelectedAllergies([]); return; }
                      setSelectedAllergies(prev =>
                        prev.includes(key) ? prev.filter(a => a !== key) : [...prev, key]
                      );
                    }}>
                    <Text style={dp.prefLabel}>{label}</Text>
                    <View style={[dp.toggle, isOn && dp.toggleOn]}>
                      <View style={[dp.toggleThumb, isOn && { transform: [{ translateX: 22 }] }]} />
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>
          {/* Save footer */}
          <View style={dp.footer}>
            <TouchableOpacity style={dp.saveBtn} onPress={() => setDietaryModal(false)}>
              <Text style={dp.saveBtnTxt}>SAVE SETTINGS</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>

      {/* ── TDEE Modal ── */}
      <Modal visible={tdeeModal} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={styles.safe}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setTdeeModal(false)}><Text style={styles.cancelText}>Cancel</Text></TouchableOpacity>
            <Text style={styles.modalTitle}>Calorie & Goals</Text>
            <TouchableOpacity onPress={() => {
              const age = parseInt(profile.age ?? '25') || 25;
              const weight = parseFloat(profile.weight ?? '70') || 70;
              const height = parseFloat(profile.height ?? '170') || 170;
              const cal = calcTDEE(age, weight, height, sex, localActivity, localGoal);
              setGoals(localActivity, localGoal, cal);
              setTdeeModal(false);
            }}><Text style={styles.saveText}>Save</Text></TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.modalScroll}>
            {/* Sex selector */}
            <Text style={[styles.inputLabel, { marginBottom: 8 }]}>Biological Sex</Text>
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
              {(['male', 'female'] as const).map(s => (
                <TouchableOpacity key={s} onPress={() => setSex(s)}
                  style={{ flex: 1, padding: 12, borderRadius: 12, borderWidth: 1.5, alignItems: 'center',
                    borderColor: sex === s ? colors.lavender : colors.line2,
                    backgroundColor: sex === s ? colors.purple + '22' : colors.layer2 }}>
                  <Text style={{ fontSize: 22 }}>{s === 'male' ? '♂️' : '♀️'}</Text>
                  <Text style={{ color: sex === s ? colors.lavender : colors.ink2, marginTop: 4, fontWeight: '600', fontSize: 13, textTransform: 'capitalize' }}>{s}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Activity Level */}
            <Text style={[styles.inputLabel, { marginBottom: 8 }]}>Activity Level</Text>
            <View style={{ gap: 8, marginBottom: 16 }}>
              {([
                { key: 'sedentary', label: 'Sedentary', desc: 'Little or no exercise' },
                { key: 'light', label: 'Lightly Active', desc: '1–3 days/week' },
                { key: 'moderate', label: 'Moderately Active', desc: '3–5 days/week' },
                { key: 'active', label: 'Very Active', desc: '6–7 days/week' },
                { key: 'very_active', label: 'Extra Active', desc: 'Physical job or 2x/day' },
              ] as const).map(({ key, label, desc }) => (
                <TouchableOpacity key={key} onPress={() => setLocalActivity(key)}
                  style={{ padding: 12, borderRadius: 12, borderWidth: 1.5, flexDirection: 'row', alignItems: 'center', gap: 10,
                    borderColor: localActivity === key ? colors.lavender : colors.line2,
                    backgroundColor: localActivity === key ? colors.purple + '22' : colors.layer2 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: localActivity === key ? colors.lavender : colors.ink, fontWeight: '600', fontSize: 14 }}>{label}</Text>
                    <Text style={{ color: colors.ink3, fontSize: 12 }}>{desc}</Text>
                  </View>
                  {localActivity === key && <Ionicons name="checkmark-circle" size={20} color={colors.lavender} />}
                </TouchableOpacity>
              ))}
            </View>

            {/* Weight Goal */}
            <Text style={[styles.inputLabel, { marginBottom: 8 }]}>Weight Goal</Text>
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
              {([
                { key: 'lose', label: 'Lose', emoji: '📉' },
                { key: 'maintain', label: 'Maintain', emoji: '⚖️' },
                { key: 'gain', label: 'Gain', emoji: '📈' },
              ] as const).map(({ key, label, emoji }) => (
                <TouchableOpacity key={key} onPress={() => setLocalGoal(key)}
                  style={{ flex: 1, padding: 12, borderRadius: 12, borderWidth: 1.5, alignItems: 'center',
                    borderColor: localGoal === key ? colors.lavender : colors.line2,
                    backgroundColor: localGoal === key ? colors.purple + '22' : colors.layer2 }}>
                  <Text style={{ fontSize: 22 }}>{emoji}</Text>
                  <Text style={{ color: localGoal === key ? colors.lavender : colors.ink2, marginTop: 4, fontWeight: '600', fontSize: 13 }}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Calculated result */}
            {(() => {
              const age = parseInt(profile.age ?? '25') || 25;
              const weight = parseFloat(profile.weight ?? '70') || 70;
              const height = parseFloat(profile.height ?? '170') || 170;
              const cal = calcTDEE(age, weight, height, sex, localActivity, localGoal);
              return (
                <View style={{ backgroundColor: colors.layer2, borderRadius: 16, borderWidth: 1, borderColor: colors.line2, padding: 16, alignItems: 'center', gap: 4 }}>
                  <Text style={{ color: colors.ink3, fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 }}>Recommended Daily Calories</Text>
                  <Text style={{ color: colors.lavender, fontSize: 36, fontWeight: '800' }}>{cal}</Text>
                  <Text style={{ color: colors.ink2, fontSize: 13 }}>kcal / day</Text>
                </View>
              );
            })()}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* ── Edit Profile Modal ── */}
      <Modal visible={editing} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={styles.safe}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setEditing(false)}><Text style={styles.cancelText}>Cancel</Text></TouchableOpacity>
            <Text style={styles.modalTitle}>Personal Details</Text>
            <TouchableOpacity onPress={handleSave}><Text style={styles.saveText}>Save</Text></TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.modalScroll}>
            {[
              { label: 'Name', key: 'name' },
              { label: 'Age', key: 'age', keyboard: 'numeric' as const },
              { label: 'Weight (kg)', key: 'weight', keyboard: 'numeric' as const },
              { label: 'Height (cm)', key: 'height', keyboard: 'numeric' as const },
              { label: 'Goal', key: 'goal' },
            ].map(({ label, key, keyboard }) => (
              <View key={key}>
                <Text style={styles.inputLabel}>{label}</Text>
                <TextInput
                  style={styles.input}
                  value={draft[key] ?? ''}
                  onChangeText={(v) => setDraft((d) => ({ ...d, [key]: v }))}
                  placeholderTextColor={colors.ink3}
                  keyboardType={keyboard ?? 'default'}
                  autoCapitalize="none"
                />
              </View>
            ))}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing.md, gap: spacing.md, paddingBottom: 24 },

  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.layer2, alignItems: 'center', justifyContent: 'center' },
  heading: { fontSize: fontSize.xl, fontWeight: '800', color: colors.ink },
  editBtn: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, backgroundColor: colors.purple + '22', borderRadius: radius.xl, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  editBtnText: { color: colors.lavender, fontSize: fontSize.sm },

  avatarCard: { backgroundColor: colors.layer1, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: spacing.lg, alignItems: 'center', gap: spacing.sm },
  avatarWrap: { position: 'relative' },
  avatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: colors.purple, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.white, fontSize: 32, fontWeight: '800' },
  avatarAdd: { position: 'absolute', bottom: 0, right: 0, width: 26, height: 26, borderRadius: 13, backgroundColor: colors.purple2, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.layer1 },
  name: { color: colors.ink, fontSize: fontSize.lg, fontWeight: '700' },
  emailText: { color: colors.ink3, fontSize: fontSize.sm },

  xpRow: { flexDirection: 'row', alignItems: 'center', gap: 10, width: '100%', marginTop: 4 },
  xpBadge: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.purple, alignItems: 'center', justifyContent: 'center' },
  xpBadgeTxt: { fontSize: 16, fontWeight: '800', color: '#fff' },
  xpMeta: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  xpName: { fontSize: 12, fontWeight: '600', color: colors.ink },
  xpPts: { fontSize: 11, color: colors.ink3 },
  xpTrack: { height: 4, backgroundColor: colors.layer2, borderRadius: 2, overflow: 'hidden' },
  xpFill: { height: 4, backgroundColor: colors.purple, borderRadius: 2 },

  statsRow: { flexDirection: 'row', width: '100%', gap: spacing.xs },
  statChip: { flex: 1, backgroundColor: colors.layer2, borderRadius: radius.md, padding: spacing.sm, alignItems: 'center' },
  statChipVal: { fontSize: fontSize.base, fontWeight: '700' },
  statChipLbl: { fontSize: fontSize.xs, color: colors.ink3, marginTop: 2 },

  sectionHdr: { fontSize: 10, fontWeight: '700', letterSpacing: 1.4, textTransform: 'uppercase', color: colors.ink3, marginBottom: -6 },

  menuCard: { backgroundColor: colors.layer1, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.line },
  menuIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  menuLabel: { flex: 1, color: colors.ink, fontSize: fontSize.base },
  menuValue: { fontSize: fontSize.xs, color: colors.ink3, maxWidth: 100 },

  healthRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.line },
  healthIcon: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  healthDesc: { fontSize: fontSize.xs, color: colors.ink3, marginTop: 2 },
  connectTxt: { fontSize: 12, fontWeight: '600', color: colors.purple2 },

  dietOption: { backgroundColor: colors.layer2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, padding: spacing.md, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dietOptionSel: { borderColor: colors.purple, backgroundColor: colors.purple + '11' },
  dietOptionTxt: { color: colors.ink, fontSize: fontSize.base, fontWeight: '500' },

  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.line },
  cancelText: { color: colors.ink2, fontSize: fontSize.base },
  modalTitle: { color: colors.ink, fontSize: fontSize.base, fontWeight: '700' },
  saveText: { color: colors.lavender, fontSize: fontSize.base, fontWeight: '700' },
  modalScroll: { padding: spacing.md, gap: spacing.sm },
  inputLabel: { color: colors.ink2, fontSize: fontSize.sm, marginBottom: spacing.xs },
  input: { backgroundColor: colors.layer2, borderWidth: 1, borderColor: colors.line2, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2, color: colors.ink, fontSize: fontSize.base },
  // BMI card
  bmiCard: { backgroundColor: colors.layer2, borderRadius: 16, borderWidth: 1, borderColor: colors.line2, padding: 16, alignItems: 'center', gap: 6, marginBottom: 8 },
  bmiSectionLbl: { fontSize: 10, fontWeight: '700', letterSpacing: 1, color: colors.ink3, textTransform: 'uppercase' },
  bmiNum: { fontSize: 48, fontWeight: '800', lineHeight: 52 },
  bmiLbl: { fontSize: 13, color: colors.ink2, fontWeight: '500' },
  bmiScale: { flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden', width: '100%', gap: 2, marginTop: 4 },
  bmiSeg: { flex: 1, height: '100%', borderRadius: 2 },
  bmiScaleLbls: { flexDirection: 'row', justifyContent: 'space-between', width: '100%' },
  bmiScaleLbl: { fontSize: 9, color: colors.ink3 },
  // Measurement rows
  measureRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.layer2, borderWidth: 1, borderColor: colors.line2, borderRadius: 12, padding: 12, marginBottom: 4 },
  measureLbl: { fontSize: 14, fontWeight: '500', color: colors.ink, flex: 1 },
  measureInput: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  measureField: { fontSize: 16, fontWeight: '700', color: colors.ink, minWidth: 60, textAlign: 'right' },
  measureUnit: { fontSize: 12, color: colors.ink3, width: 24 },
  // Settings button
  settingsBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.layer2, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.line2 },
});

// ── Macros modal styles ──────────────────────────────────────────────────────
const mst = StyleSheet.create({
  macroRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.layer2, borderWidth: 1, borderColor: colors.line2, borderRadius: 14, padding: 14, marginBottom: 8 },
  macroDot: { width: 12, height: 12, borderRadius: 6, flexShrink: 0 },
  macroLabel: { fontSize: 14, fontWeight: '600', color: colors.ink, marginBottom: 6 },
  macroBar: { height: 6, backgroundColor: colors.layer3, borderRadius: 3, overflow: 'hidden' },
  macroFill: { height: '100%', borderRadius: 3 },
  macroVals: { alignItems: 'flex-end', gap: 2 },
  macroPct: { fontSize: 16, fontWeight: '800' },
  macroG: { fontSize: 11, color: colors.ink3 },
  calCard: { backgroundColor: colors.layer2, borderWidth: 1, borderColor: colors.line2, borderRadius: 14, padding: 16, alignItems: 'center', gap: 4, marginTop: 4 },
  calLbl: { fontSize: 11, fontWeight: '700', letterSpacing: 1, color: colors.ink3, textTransform: 'uppercase' },
  calVal: { fontSize: 28, fontWeight: '800', color: colors.honey },
});

// ── Settings modal styles ─────────────────────────────────────────────────────
const sst = StyleSheet.create({
  sectionLbl: { fontSize: 10, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase', color: colors.ink3, paddingHorizontal: 2, paddingTop: 16, paddingBottom: 8 },
  card: { backgroundColor: colors.layer1, borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg, overflow: 'hidden', marginBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 15, borderBottomWidth: 1, borderBottomColor: colors.line },
  icon: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  label: { flex: 1, fontSize: 14, fontWeight: '500', color: colors.ink },
  val: { fontSize: 12, color: colors.ink3, fontWeight: '500', marginRight: 4 },
  unitToggle: { flexDirection: 'row', backgroundColor: colors.layer2, borderRadius: 8, overflow: 'hidden', borderWidth: 1, borderColor: colors.line2 },
  unitOpt: { paddingHorizontal: 10, paddingVertical: 5, fontSize: 11, fontWeight: '600', color: colors.ink3 },
  unitOptActive: { backgroundColor: colors.purple + '44', color: colors.lavender },
});

// ── Dietary preferences modal styles ──────────────────────────────────────────
const dp = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0c0818' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(124,77,255,0.12)' },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 16, fontWeight: '700', color: '#f0ecff' },
  scroll: { padding: 16, paddingBottom: 120 },
  sectionLbl: { fontSize: 11, fontWeight: '700', letterSpacing: 0.1 * 10, textTransform: 'uppercase', color: 'rgba(196,181,255,0.45)', marginBottom: 12, marginTop: 8 },
  listCard: { backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 16, overflow: 'hidden', marginBottom: 24 },
  prefRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  prefLabel: { fontSize: 15, color: '#f0ecff' },
  radio: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: 'rgba(196,181,255,0.3)', alignItems: 'center', justifyContent: 'center' },
  radioSel: { backgroundColor: '#22c55e', borderColor: '#22c55e' },
  toggle: { width: 50, height: 28, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.12)', position: 'relative', overflow: 'hidden' },
  toggleOn: { backgroundColor: '#22c55e' },
  toggleThumb: { position: 'absolute', top: 3, left: 3, width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff' },
  footer: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(12,8,24,0.95)', paddingHorizontal: 16, paddingVertical: 16, borderTopWidth: 1, borderTopColor: 'rgba(124,77,255,0.1)' },
  saveBtn: { alignItems: 'center', paddingVertical: 14 },
  saveBtnTxt: { fontSize: 13, fontWeight: '700', letterSpacing: 1.4, color: '#f0ecff' },
});
