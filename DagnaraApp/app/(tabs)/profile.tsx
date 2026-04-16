import { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Alert, TextInput, Modal, Switch, Image, Platform, KeyboardAvoidingView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAuthStore } from '../../src/store/authStore';
import { useAppStore, getXpLevel, calcTDEE } from '../../src/store/appStore';
import { supabase } from '../../src/lib/supabase';
import { scheduleMealReminders, scheduleStreakReminder, scheduleWaterReminder } from '../../src/lib/notifications';
import { colors, spacing, fontSize, radius } from '../../src/theme';
import { formatWeight, weightUnit, heightUnit, lengthUnit, kgToInput, cmToInput, cmLenToInput, parseWeight, parseHeight, parseLength, UnitSystem } from '../../src/lib/units';
import { requestHealthPermissions, readHealthData, healthPlatformName, isHealthAvailable } from '../../src/lib/healthKit';
import { useDiaryStore } from '../../src/store/diaryStore';

const DIET_PLANS = ['Balanced', 'High Protein', 'Low Carb', 'Keto', 'Vegan', 'Mediterranean'];
const ALLERGIES = ['Gluten', 'Dairy', 'Nuts', 'Eggs', 'Soy', 'Shellfish'];

export default function ProfileScreen() {
  const { email, profile, logout, setProfile } = useAuthStore();
  const { updateCaloriesBurned, logSleep, selectedDate } = useDiaryStore();
  const { xp, streak, setGoals, activityLevel, weightGoal, calorieGoal: storeCalGoal, unitSystem, setUnitSystem, macroPcts, setMacroPcts } = useAppStore();
  const xpInfo = getXpLevel(xp);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(profile);
  const [dietModal, setDietModal] = useState(false);
  const [macrosModal, setMacrosModal] = useState(false);
  const [measureModal, setMeasureModal] = useState(false);
  const [settingsModal, setSettingsModal] = useState(false);
  const [settingsPage, setSettingsPage] = useState<'' | 'account' | 'unitSystem' | 'language' | 'notifications' | 'subscription' | 'health'>('');
  const [language, setLanguage] = useState('English');
  const [selectedPlan, setSelectedPlan] = useState<'free' | 'premium'>('free');
  const [acFirstName, setAcFirstName] = useState('');
  const [acLastName,  setAcLastName]  = useState('');
  const [acEmail,     setAcEmail]     = useState('');
  const [acPassword,  setAcPassword]  = useState('');
  const [dietaryModal, setDietaryModal] = useState(false);
  const [tdeeModal, setTdeeModal] = useState(false);
  const [selectedFoodPref, setSelectedFoodPref] = useState('none');
  const [selectedDiet, setSelectedDiet] = useState('Balanced');
  const [selectedAllergies, setSelectedAllergies] = useState<string[]>([]);


  // Custom macro goals
  const [localCarbs,   setLocalCarbs]   = useState(String(macroPcts.carbs));
  const [localProtein, setLocalProtein] = useState(String(macroPcts.protein));
  const [localFat,     setLocalFat]     = useState(String(macroPcts.fat));

  // Notification preferences
  const [notifCheckIn, setNotifCheckIn] = useState(false);
  const [notifMeals,   setNotifMeals]   = useState(false);
  const [notifStreak,  setNotifStreak]  = useState(false);
  const calorieGoal = storeCalGoal || 2000;
  const [waterGoal, setWaterGoal] = useState('8');
  const [waterGoalModal, setWaterGoalModal] = useState(false);
  const [waterGoalInput, setWaterGoalInput] = useState('');
  const [sex, setSex] = useState<'male' | 'female'>((profile.sex as 'male' | 'female') ?? 'male');
  const [localActivity, setLocalActivity] = useState<typeof activityLevel>(activityLevel);
  const [localGoal, setLocalGoal] = useState<typeof weightGoal>(weightGoal);
  const [measurements, setMeasurements] = useState<Record<string, string>>({
    weight: '', height: '', waist: '', chest: '', hips: '', arms: '',
  });
  const [measureInputs, setMeasureInputs] = useState<Record<string, string>>({
    weight: '', height: '', waist: '', chest: '', hips: '', arms: '',
  });
  const [draftWeightInput, setDraftWeightInput] = useState('');
  const [draftHeightInput, setDraftHeightInput] = useState('');

  // Health sync state
  const [healthConnected, setHealthConnected] = useState(false);
  const [healthSyncSteps, setHealthSyncSteps] = useState(false);
  const [healthSyncCalories, setHealthSyncCalories] = useState(false);
  const [healthSyncSleep, setHealthSyncSleep] = useState(false);
  const [healthWriteBack, setHealthWriteBack] = useState(false);
  const [healthLastSync, setHealthLastSync] = useState<string | null>(null);
  const [healthSyncing, setHealthSyncing] = useState(false);

  // Load persisted measurements + prefs on mount (scoped to this user)
  const p = email ?? 'anon';
  useEffect(() => {
    AsyncStorage.multiGet([
      `${p}_body_measurements`,
      `${p}_notif_checkin`, `${p}_notif_meals`, `${p}_notif_streak`,
      `${p}_language`, `${p}_unit_system`, `${p}_water_goal`, `${p}_plan`,
    ]).then(pairs => {
      const m: Record<string, string | null> = Object.fromEntries(pairs);
      if (m[`${p}_body_measurements`]) setMeasurements(JSON.parse(m[`${p}_body_measurements`]!));
      if (m[`${p}_notif_checkin`]) setNotifCheckIn(m[`${p}_notif_checkin`] === 'true');
      if (m[`${p}_notif_meals`])   setNotifMeals(m[`${p}_notif_meals`] === 'true');
      if (m[`${p}_notif_streak`])  setNotifStreak(m[`${p}_notif_streak`] === 'true');
      if (m[`${p}_language`])      setLanguage(m[`${p}_language`]!);
      if (m[`${p}_plan`])          setSelectedPlan(m[`${p}_plan`] as 'free' | 'premium');
      if (m[`${p}_water_goal`])    setWaterGoal(m[`${p}_water_goal`]!);
      // Migrate old unit_system key to store (one-time, fire-and-forget)
      if (m[`${p}_unit_system`])   void setUnitSystem(m[`${p}_unit_system`] as UnitSystem);
    });
    // Load health sync prefs
    AsyncStorage.multiGet([
      `${p}_health_connected`, `${p}_health_steps`, `${p}_health_calories`,
      `${p}_health_sleep`, `${p}_health_writeback`, `${p}_health_last_sync`,
    ]).then(pairs => {
      const m: Record<string, string | null> = Object.fromEntries(pairs);
      if (m[`${p}_health_connected`]) setHealthConnected(m[`${p}_health_connected`] === 'true');
      if (m[`${p}_health_steps`])     setHealthSyncSteps(m[`${p}_health_steps`] === 'true');
      if (m[`${p}_health_calories`])  setHealthSyncCalories(m[`${p}_health_calories`] === 'true');
      if (m[`${p}_health_sleep`])     setHealthSyncSleep(m[`${p}_health_sleep`] === 'true');
      if (m[`${p}_health_writeback`]) setHealthWriteBack(m[`${p}_health_writeback`] === 'true');
      if (m[`${p}_health_last_sync`]) setHealthLastSync(m[`${p}_health_last_sync`]);
    });
  }, []);

  // Reset local TDEE state when modal opens
  useEffect(() => {
    if (tdeeModal) {
      setLocalActivity(activityLevel);
      setLocalGoal(weightGoal);
    }
  }, [tdeeModal]);

  // Sync macro inputs when modal opens
  useEffect(() => {
    if (macrosModal) {
      setLocalCarbs(String(macroPcts.carbs));
      setLocalProtein(String(macroPcts.protein));
      setLocalFat(String(macroPcts.fat));
    }
  }, [macrosModal]);

  // Populate display-unit weight/height inputs when Personal Details modal opens
  useEffect(() => {
    if (!editing) return;
    setDraftWeightInput(draft.weight ? kgToInput(parseFloat(draft.weight), unitSystem) : '');
    setDraftHeightInput(draft.height ? cmToInput(parseFloat(draft.height), unitSystem) : '');
  }, [editing]);

  // Populate display-unit inputs when measurements modal opens
  useEffect(() => {
    if (!measureModal) return;
    setMeasureInputs({
      weight: measurements.weight ? kgToInput(parseFloat(measurements.weight), unitSystem) : '',
      height: measurements.height ? cmToInput(parseFloat(measurements.height), unitSystem) : '',
      waist:  measurements.waist  ? cmLenToInput(parseFloat(measurements.waist),  unitSystem) : '',
      chest:  measurements.chest  ? cmLenToInput(parseFloat(measurements.chest),  unitSystem) : '',
      hips:   measurements.hips   ? cmLenToInput(parseFloat(measurements.hips),   unitSystem) : '',
      arms:   measurements.arms   ? cmLenToInput(parseFloat(measurements.arms),   unitSystem) : '',
    });
  }, [measureModal]);

  async function handleHealthConnect() {
    const granted = await requestHealthPermissions();
    if (!granted) {
      Alert.alert('Permission denied', `Could not access ${healthPlatformName()}. Check your device settings.`);
      return;
    }
    setHealthConnected(true);
    await AsyncStorage.setItem(`${p}_health_connected`, 'true');
  }

  async function handleHealthSync() {
    if (!healthConnected) { await handleHealthConnect(); return; }
    setHealthSyncing(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const data = await readHealthData(today);
      if (healthSyncCalories && data.activeCalories > 0) {
        await updateCaloriesBurned(today, data.activeCalories);
      }
      if (healthSyncSleep && data.sleepMinutes > 0) {
        const hrs = Math.floor(data.sleepMinutes / 60);
        const mins = data.sleepMinutes % 60;
        await logSleep(today, {
          bedtime: '22:00',
          waketime: `0${hrs}:${String(mins).padStart(2, '0')}`,
          quality: 2,
          duration: `${hrs}h ${mins}m`,
        });
      }
      const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      setHealthLastSync(now);
      await AsyncStorage.setItem(`${p}_health_last_sync`, now);
      Alert.alert('Synced', `Health data updated.\nSteps: ${data.steps.toLocaleString()}${healthSyncCalories ? `\nCalories burned: ${data.activeCalories} kcal` : ''}${healthSyncSleep ? `\nSleep: ${Math.floor(data.sleepMinutes / 60)}h ${data.sleepMinutes % 60}m` : ''}`);
    } catch {
      Alert.alert('Sync failed', 'Could not read health data. Try again.');
    } finally {
      setHealthSyncing(false);
    }
  }

  async function handleSave() {
    const wKg = parseWeight(draftWeightInput, unitSystem);
    const hCm = parseHeight(draftHeightInput, unitSystem);
    const ageNum = parseInt(draft.age ?? '');
    if (draft.age && !isNaN(ageNum) && (ageNum < 16 || ageNum > 100)) {
      Alert.alert('Invalid age', 'Age must be between 16 and 100 years.');
      return;
    }
    if (wKg != null && (wKg < 30 || wKg > 300)) {
      const bounds = unitSystem === 'Metric' ? '30–300 kg' : unitSystem === 'UK' ? '4 st 10 lb – 47 st 3 lb' : '66–661 lb';
      Alert.alert('Invalid weight', `Weight must be between ${bounds}.`);
      return;
    }
    if (hCm != null && (hCm < 100 || hCm > 250)) {
      const bounds = unitSystem === 'Metric' ? '100–250 cm' : "3'4\"–8'2\"";
      Alert.alert('Invalid height', `Height must be between ${bounds}.`);
      return;
    }
    await setProfile({
      ...draft,
      ...(wKg != null ? { weight: String(Math.round(wKg * 10) / 10) } : {}),
      ...(hCm != null ? { height: String(Math.round(hCm)) } : {}),
    });
    setEditing(false);
  }

  async function handleSaveMeasurements() {
    // Parse display-unit inputs back to metric for storage
    const wKg    = parseWeight(measureInputs.weight, unitSystem);
    const hCm    = parseHeight(measureInputs.height, unitSystem);
    const waistCm = parseLength(measureInputs.waist, unitSystem);
    const chestCm = parseLength(measureInputs.chest, unitSystem);
    const hipsCm  = parseLength(measureInputs.hips,  unitSystem);
    const armsCm  = parseLength(measureInputs.arms,  unitSystem);
    if (wKg != null && (wKg < 30 || wKg > 300)) {
      const bounds = unitSystem === 'Metric' ? '30–300 kg' : unitSystem === 'UK' ? '4 st 10 lb – 47 st 3 lb' : '66–661 lb';
      Alert.alert('Invalid weight', `Weight must be between ${bounds}.`);
      return;
    }
    if (hCm != null && (hCm < 100 || hCm > 250)) {
      const bounds = unitSystem === 'Metric' ? '100–250 cm' : "3'4\"–8'2\"";
      Alert.alert('Invalid height', `Height must be between ${bounds}.`);
      return;
    }
    if ((waistCm != null && (waistCm < 40 || waistCm > 200)) ||
        (chestCm != null && (chestCm < 40 || chestCm > 200)) ||
        (hipsCm  != null && (hipsCm  < 40 || hipsCm  > 200))) {
      Alert.alert('Invalid measurement', 'Waist, chest, and hips must be between 40–200 cm (16–79 in).');
      return;
    }
    if (armsCm != null && (armsCm < 10 || armsCm > 100)) {
      Alert.alert('Invalid measurement', 'Arm circumference must be between 10–100 cm (4–39 in).');
      return;
    }
    const newMeasurements = {
      weight: wKg    != null ? String(Math.round(wKg    * 10) / 10) : measurements.weight,
      height: hCm    != null ? String(Math.round(hCm))              : measurements.height,
      waist:  waistCm != null ? String(Math.round(waistCm))         : measurements.waist,
      chest:  chestCm != null ? String(Math.round(chestCm))         : measurements.chest,
      hips:   hipsCm  != null ? String(Math.round(hipsCm))          : measurements.hips,
      arms:   armsCm  != null ? String(Math.round(armsCm))          : measurements.arms,
    };
    setMeasurements(newMeasurements);
    await AsyncStorage.setItem(`${p}_body_measurements`, JSON.stringify(newMeasurements));
    // Sync weight & height (metric) back into the profile
    const updated = {
      ...profile,
      ...(wKg != null ? { weight: String(Math.round(wKg * 10) / 10) } : {}),
      ...(hCm != null ? { height: String(Math.round(hCm)) } : {}),
    };
    await setProfile(updated);
    setMeasureModal(false);
  }

  function handleLogout() {
    Alert.alert('Log out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log out', style: 'destructive', onPress: logout },
    ]);
  }


  async function handlePickPhoto() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission required', 'Allow photo library access to set a profile photo.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
      base64: true,
    });
    if (result.canceled || !result.assets[0].base64) return;
    const dataUri = `data:image/jpeg;base64,${result.assets[0].base64}`;
    await setProfile({ ...profile, photoUri: dataUri });
  }

  const initial = (profile.name ?? email ?? '?')[0].toUpperCase();

  async function handleSaveAccount() {
    const newName = [acFirstName.trim(), acLastName.trim()].filter(Boolean).join(' ');
    await setProfile({ ...profile, name: newName || profile.name });
    await AsyncStorage.setItem(`${p}_language`, language);
    if (acPassword.trim().length >= 6) {
      const { error } = await supabase.auth.updateUser({ password: acPassword.trim() });
      if (error) { Alert.alert('Password Error', error.message); return; }
    }
    setSettingsPage('');
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* ── Header ── */}
        <View style={styles.headerRow}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
              <Ionicons name="chevron-back" size={20} color={colors.ink2} />
            </TouchableOpacity>
            <Text style={styles.heading}>Profile</Text>
          </View>
          <TouchableOpacity style={styles.settingsBtn} onPress={() => setSettingsModal(true)}>
            <Ionicons name="settings-outline" size={18} color={colors.ink2} />
          </TouchableOpacity>
        </View>

        {/* ── Avatar card ── */}
        <View style={styles.avatarCard}>
          <TouchableOpacity style={styles.avatarWrap} onPress={handlePickPhoto}>
            {profile.photoUri
              ? <Image source={{ uri: profile.photoUri }} style={styles.avatarImg} />
              : <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{initial}</Text>
                </View>
            }
            <View style={styles.avatarAdd}>
              <Ionicons name="camera" size={13} color={colors.white} />
            </View>
          </TouchableOpacity>
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

        {/* ── Achievements ── */}
        <Text style={styles.sectionHdr}>ACHIEVEMENTS</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingBottom: spacing.sm, gap: spacing.sm }}>
          {([
            { id: 'streak3',   icon: '🔥', label: '3-day\nstreak',   unlocked: streak >= 3 },
            { id: 'streak7',   icon: '🔥', label: '7-day\nstreak',   unlocked: streak >= 7 },
            { id: 'streak30',  icon: '🏅', label: '30-day\nstreak',  unlocked: streak >= 30 },
            { id: 'streak100', icon: '👑', label: '100-day\nstreak', unlocked: streak >= 100 },
            { id: 'level5',  icon: '⭐', label: 'Level 5\nachiever', unlocked: xpInfo.level >= 5 },
            { id: 'level10', icon: '🎯', label: 'Level 10\nfocused',  unlocked: xpInfo.level >= 10 },
            { id: 'level15', icon: '🌟', label: 'Level 15\nall-star', unlocked: xpInfo.level >= 15 },
            { id: 'level20', icon: '🏆', label: 'Level 20\nchampion', unlocked: xpInfo.level >= 20 },
            { id: 'xp100',  icon: '💎', label: '100 XP\nearned',   unlocked: xp >= 100 },
            { id: 'xp500',  icon: '🚀', label: '500 XP\nearned',   unlocked: xp >= 500 },
            { id: 'xp2000', icon: '🌌', label: '2k XP\nearned',    unlocked: xp >= 2000 },
          ] as { id: string; icon: string; label: string; unlocked: boolean }[]).map(a => (
            <View key={a.id} style={[styles.achieveBadge, !a.unlocked && { opacity: 0.3 }]}>
              <Text style={{ fontSize: fontSize.xl }}>{a.icon}</Text>
              <Text style={styles.achieveLbl}>{a.label}</Text>
              {a.unlocked && <View style={styles.achieveDot} />}
            </View>
          ))}
        </ScrollView>

        {/* ── Customization ── */}
        <Text style={styles.sectionHdr}>CUSTOMIZATION</Text>
        <View style={styles.menuCard}>
          {[
            { icon: 'nutrition-outline', label: 'Diet Plan', color: colors.green, value: selectedDiet, onPress: () => setDietModal(true) },
            { icon: 'person-outline', label: 'Personal Details', color: colors.lavender, value: `${profile.age ? profile.age + ' yrs' : '—'} · ${profile.weight ? formatWeight(parseFloat(profile.weight), unitSystem) : '—'}`, onPress: () => { setDraft(profile); setEditing(true); } },
            { icon: 'bar-chart-outline', label: 'Adjust Macronutrients', color: colors.sky, value: '', onPress: () => setMacrosModal(true) },
            { icon: 'flame-outline', label: 'Calorie & Activity Goals', color: colors.honey, value: `${calorieGoal} kcal`, onPress: () => setTdeeModal(true) },
            { icon: 'leaf-outline', label: 'Dietary Needs & Preferences', color: colors.teal, value: (() => { const pref = selectedFoodPref === 'none' ? 'No food preferences' : selectedFoodPref; const allerg = selectedAllergies.length === 0 ? 'No allergies' : selectedAllergies.join(', '); return `${pref} · ${allerg}`; })(), onPress: () => setDietaryModal(true) },
            { icon: 'water-outline', label: 'Water Habits', color: colors.sky, value: `${waterGoal} glasses/day`, onPress: () => { setWaterGoalInput(waterGoal); setWaterGoalModal(true); } },
            { icon: 'body-outline', label: 'Body Measurements', color: colors.rose, value: measurements.weight ? formatWeight(parseFloat(measurements.weight), unitSystem) : 'Not set', onPress: () => setMeasureModal(true) },
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


        <View style={{ height: 40 }} />
      </ScrollView>

      {/* ── Measurements Modal ── */}
      <Modal visible={measureModal} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={styles.safe} edges={['bottom']}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setMeasureModal(false)}><Text style={styles.cancelText}>Close</Text></TouchableOpacity>
            <Text style={styles.modalTitle}>Body Measurements</Text>
            <TouchableOpacity onPress={handleSaveMeasurements}><Text style={styles.saveText}>Save</Text></TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.modalScroll} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}>
            {/* BMI Card */}
            {(() => {
              const w = parseFloat(measurements.weight || String(profile.weight ?? ''));
              const h = parseFloat(measurements.height || String(profile.height ?? ''));
              const bmi = w > 0 && h > 0 ? (w / ((h / 100) ** 2)) : null;
              const bmiLabel = bmi === null ? 'Log your weight & height' :
                bmi < 18.5 ? 'Underweight' : bmi < 25 ? 'Normal weight' :
                bmi < 30 ? 'Overweight' : 'Obese';
              const bmiColor = bmi === null ? colors.ink3 :
                bmi < 18.5 ? colors.sky : bmi < 25 ? colors.green :
                bmi < 30 ? colors.honey : colors.rose;
              return (
                <View style={styles.bmiCard}>
                  <Text style={styles.bmiSectionLbl}>Body Mass Index</Text>
                  <Text style={[styles.bmiNum, { color: bmiColor }]}>{bmi ? bmi.toFixed(1) : '--'}</Text>
                  <Text style={styles.bmiLbl}>{bmiLabel}</Text>
                  <View style={styles.bmiScale}>
                    <View style={[styles.bmiSeg, { backgroundColor: colors.sky }]} />
                    <View style={[styles.bmiSeg, { backgroundColor: colors.green, flex: 1.2 }]} />
                    <View style={[styles.bmiSeg, { backgroundColor: colors.honey }]} />
                    <View style={[styles.bmiSeg, { backgroundColor: colors.rose }]} />
                  </View>
                  <View style={styles.bmiScaleLbls}>
                    {['Under', 'Normal', 'Over', 'Obese'].map(l => <Text key={l} style={styles.bmiScaleLbl}>{l}</Text>)}
                  </View>
                </View>
              );
            })()}
            {/* Measurement inputs */}
            <Text style={styles.inputLabel}>Current Measurements</Text>
            {([
              { key: 'weight', label: 'Weight', unit: weightUnit(unitSystem),  keyboard: 'decimal-pad' as const },
              { key: 'height', label: 'Height', unit: heightUnit(unitSystem),  keyboard: (unitSystem === 'Metric' ? 'decimal-pad' : 'default') as any },
              { key: 'waist',  label: 'Waist',  unit: lengthUnit(unitSystem),  keyboard: 'decimal-pad' as const },
              { key: 'chest',  label: 'Chest',  unit: lengthUnit(unitSystem),  keyboard: 'decimal-pad' as const },
              { key: 'hips',   label: 'Hips',   unit: lengthUnit(unitSystem),  keyboard: 'decimal-pad' as const },
              { key: 'arms',   label: 'Arms',   unit: lengthUnit(unitSystem),  keyboard: 'decimal-pad' as const },
            ] as const).map(({ key, label, unit, keyboard }) => (
              <View key={key} style={styles.measureRow}>
                <Text style={styles.measureLbl}>{label}</Text>
                <View style={styles.measureInput}>
                  <TextInput
                    style={styles.measureField}
                    value={measureInputs[key]}
                    onChangeText={v => setMeasureInputs(m => ({ ...m, [key]: v }))}
                    keyboardType={keyboard}
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
        <SafeAreaView style={styles.safe} edges={['bottom']}>
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
        <SafeAreaView style={styles.safe} edges={['bottom']}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setMacrosModal(false)}><Text style={styles.cancelText}>Cancel</Text></TouchableOpacity>
            <Text style={styles.modalTitle}>Macro Goals</Text>
            <TouchableOpacity onPress={() => {
              const c = parseInt(localCarbs) || 0;
              const p = parseInt(localProtein) || 0;
              const f = parseInt(localFat) || 0;
              if (c + p + f !== 100) { Alert.alert('Invalid split', 'Carbs + Protein + Fat must equal 100%.'); return; }
              void setMacroPcts({ carbs: c, protein: p, fat: f });
              setMacrosModal(false);
            }}><Text style={styles.saveText}>Save</Text></TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.modalScroll} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}>
            <Text style={[styles.inputLabel, { marginBottom: spacing.md }]}>Enter the % of calories from each macro. Must total 100%.</Text>

            {([
              { key: 'carbs',   label: 'Carbohydrates', color: colors.sky,  val: localCarbs,   set: setLocalCarbs },
              { key: 'protein', label: 'Protein',        color: colors.rose, val: localProtein, set: setLocalProtein },
              { key: 'fat',     label: 'Fat',            color: colors.honey, val: localFat,    set: setLocalFat },
            ] as const).map(({ key, label, color, val, set }) => {
              const pct = parseInt(val) || 0;
              const grams = Math.round(calorieGoal * pct / 100 / (key === 'fat' ? 9 : 4));
              return (
                <View key={key} style={mst.macroRow}>
                  <View style={[mst.macroDot, { backgroundColor: color }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={mst.macroLabel}>{label}</Text>
                    <View style={mst.macroBar}><View style={[mst.macroFill, { width: `${Math.min(100, pct)}%` as any, backgroundColor: color + 'aa' }]} /></View>
                  </View>
                  <View style={mst.macroVals}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <TextInput
                        style={[mst.macroPct, { color, borderBottomWidth: 1, borderBottomColor: color + '55', minWidth: 32, textAlign: 'right' }]}
                        value={val}
                        onChangeText={set}
                        keyboardType="number-pad"
                        maxLength={3}
                      />
                      <Text style={[mst.macroPct, { color }]}>%</Text>
                    </View>
                    <Text style={mst.macroG}>{grams}g</Text>
                  </View>
                </View>
              );
            })}

            {(() => {
              const total = (parseInt(localCarbs) || 0) + (parseInt(localProtein) || 0) + (parseInt(localFat) || 0);
              const ok = total === 100;
              return (
                <View style={[mst.calCard, { borderColor: ok ? colors.line2 : colors.rose + '55' }]}>
                  <Text style={mst.calLbl}>Total</Text>
                  <Text style={[mst.calVal, { color: ok ? colors.green : colors.rose }]}>{total}%</Text>
                </View>
              );
            })()}

            <View style={mst.calCard}>
              <Text style={mst.calLbl}>Daily Calorie Goal</Text>
              <Text style={mst.calVal}>{calorieGoal} kcal</Text>
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* ── Settings Modal ── */}
      <Modal visible={settingsModal} animationType="slide" presentationStyle="pageSheet" onDismiss={() => setSettingsPage('')}>
        <SafeAreaView style={styles.safe} edges={['bottom']}>
          <View style={styles.modalHeader}>
            {settingsPage !== ''
              ? <TouchableOpacity onPress={() => setSettingsPage('')}><Text style={styles.cancelText}>← Back</Text></TouchableOpacity>
              : <TouchableOpacity onPress={() => { setSettingsPage(''); setSettingsModal(false); }}><Text style={styles.cancelText}>Close</Text></TouchableOpacity>
            }
            <Text style={styles.modalTitle}>
              {settingsPage === 'account' ? 'Account Settings' : settingsPage === 'unitSystem' ? 'Unit System' : settingsPage === 'language' ? 'Language' : settingsPage === 'notifications' ? 'Notification Settings' : settingsPage === 'subscription' ? 'Manage Subscriptions' : settingsPage === 'health' ? healthPlatformName() : 'Settings'}
            </Text>
            {settingsPage === 'account'
              ? <TouchableOpacity onPress={handleSaveAccount}><Text style={styles.saveText}>Save</Text></TouchableOpacity>
              : <View style={{ width: 40 }} />
            }
          </View>
          <ScrollView contentContainerStyle={[styles.modalScroll, { gap: 0 }]} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}>
            {settingsPage === 'account' ? (
              /* ── Account Settings page ── */
              <>
            <Text style={sst.sectionLbl}>PERSONAL</Text>
            <View style={sst.card}>
              <View style={[sst.row, { borderBottomWidth: 1, borderBottomColor: colors.line }]}>
                <View style={[sst.icon, { backgroundColor: colors.purple2 + '22' }]}>
                  <Ionicons name="mail-outline" size={16} color={colors.purple2} />
                </View>
                <Text style={act.fieldLbl}>Email</Text>
                <TextInput style={act.fieldInput} value={acEmail} onChangeText={setAcEmail}
                  keyboardType="email-address" autoCapitalize="none" placeholderTextColor={colors.ink3} placeholder="email@example.com" />
              </View>
              <View style={[sst.row, { borderBottomWidth: 1, borderBottomColor: colors.line }]}>
                <View style={[sst.icon, { backgroundColor: colors.lavender + '22' }]}>
                  <Ionicons name="person-outline" size={16} color={colors.lavender} />
                </View>
                <Text style={act.fieldLbl}>First Name</Text>
                <TextInput style={act.fieldInput} value={acFirstName} onChangeText={setAcFirstName}
                  placeholderTextColor={colors.ink3} placeholder="First name" />
              </View>
              <View style={[sst.row, { borderBottomWidth: 1, borderBottomColor: colors.line }]}>
                <View style={[sst.icon, { backgroundColor: colors.lavender + '22' }]}>
                  <Ionicons name="person-outline" size={16} color={colors.lavender} />
                </View>
                <Text style={act.fieldLbl}>Last Name</Text>
                <TextInput style={act.fieldInput} value={acLastName} onChangeText={setAcLastName}
                  placeholderTextColor={colors.ink3} placeholder="Last name" />
              </View>
              <View style={[sst.row, { borderBottomWidth: 0 }]}>
                <View style={[sst.icon, { backgroundColor: colors.ink3 + '22' }]}>
                  <Ionicons name="lock-closed-outline" size={16} color={colors.ink3} />
                </View>
                <Text style={act.fieldLbl}>Password</Text>
                <TextInput style={act.fieldInput} value={acPassword} onChangeText={setAcPassword}
                  secureTextEntry placeholder="New password" placeholderTextColor={colors.ink3} />
              </View>
            </View>
            <Text style={sst.sectionLbl}>PREFERENCES</Text>
            <View style={sst.card}>
              {[
                { icon: 'scale-outline', label: 'Unit System', value: unitSystem, color: colors.sky, onPress: () => setSettingsPage('unitSystem') },
                { icon: 'language-outline', label: 'Language', value: language, color: colors.green, onPress: () => setSettingsPage('language') },
              ].map(({ icon, label, value, color, onPress }, i, arr) => (
                <TouchableOpacity key={label} style={[sst.row, i === arr.length - 1 && { borderBottomWidth: 0 }]}
                  onPress={onPress}>
                  <View style={[sst.icon, { backgroundColor: color + '22' }]}>
                    <Ionicons name={icon as any} size={16} color={color} />
                  </View>
                  <Text style={sst.label}>{label}</Text>
                  <Text style={sst.val}>{value}</Text>
                  <Ionicons name="chevron-forward" size={14} color={colors.ink3} />
                </TouchableOpacity>
              ))}
            </View>
            <Text style={sst.sectionLbl}>PRIVACY</Text>
            <View style={sst.card}>
              <TouchableOpacity style={sst.row} onPress={() => Alert.alert('Data Consents', 'Coming soon.')}>
                <View style={[sst.icon, { backgroundColor: colors.teal + '22' }]}>
                  <Ionicons name="shield-checkmark-outline" size={16} color={colors.teal} />
                </View>
                <Text style={sst.label}>Data Consents</Text>
                <Ionicons name="chevron-forward" size={14} color={colors.ink3} />
              </TouchableOpacity>
            </View>
            <View style={[sst.card, { marginTop: spacing.lg }]}>
              <TouchableOpacity style={sst.row} onPress={() => Alert.alert('Unsubscribe', 'You will no longer receive marketing emails.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Unsubscribe', style: 'destructive', onPress: () => {} }])}>
                <View style={[sst.icon, { backgroundColor: colors.rose + '11' }]}>
                  <Ionicons name="mail-unread-outline" size={16} color={colors.rose} />
                </View>
                <Text style={[sst.label, { color: colors.rose }]}>Unsubscribe from marketing</Text>
                <Ionicons name="chevron-forward" size={14} color={colors.rose + '88'} />
              </TouchableOpacity>
              <TouchableOpacity style={[sst.row, { borderBottomWidth: 0 }]} onPress={() => Alert.alert('Delete Account', 'This permanently deletes your account and all data. This cannot be undone.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: logout }])}>
                <View style={[sst.icon, { backgroundColor: colors.rose + '11' }]}>
                  <Ionicons name="trash-outline" size={16} color={colors.rose} />
                </View>
                <Text style={[sst.label, { color: colors.rose }]}>Delete Account</Text>
                <Ionicons name="chevron-forward" size={14} color={colors.rose + '88'} />
              </TouchableOpacity>
            </View>
            <View style={{ height: spacing.xl }} />
              </>
            ) : settingsPage === 'unitSystem' ? (
              /* ── Unit System page ── */
              <View style={sst.card}>
                {[
                  { name: 'Metric',        subtitle: 'kg · cm · ml · °C  —  used by most of the world' },
                  { name: 'Imperial (US)', subtitle: 'lb · ft/in · fl oz · °F  —  used in the United States' },
                  { name: 'UK',            subtitle: 'st/lb · ft/in · ml · °C  —  used in the United Kingdom' },
                  { name: 'US Customary',  subtitle: 'lb · in · cup · °F  —  US cooking & informal measures' },
                ].map(({ name, subtitle }, i, arr) => (
                  <TouchableOpacity key={name} style={[sst.row, i === arr.length - 1 && { borderBottomWidth: 0 }]}
                    onPress={() => { void setUnitSystem(name as UnitSystem); setSettingsPage('account'); }}>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={sst.label}>{name}</Text>
                      <Text style={{ fontSize: fontSize.xs, color: colors.ink3 }}>{subtitle}</Text>
                    </View>
                    {unitSystem === name && <Ionicons name="checkmark" size={18} color={colors.purple} />}
                  </TouchableOpacity>
                ))}
              </View>
            ) : settingsPage === 'language' ? (
              /* ── Language page ── */
              <View style={sst.card}>
                {['English'].map((lang, i, arr) => (
                  <TouchableOpacity key={lang} style={[sst.row, i === arr.length - 1 && { borderBottomWidth: 0 }]}
                    onPress={() => { setLanguage(lang); AsyncStorage.setItem(`${p}_language`, lang); setSettingsPage('account'); }}>
                    <Text style={[sst.label, { flex: 1 }]}>{lang}</Text>
                    {language === lang && <Ionicons name="checkmark" size={18} color={colors.purple} />}
                  </TouchableOpacity>
                ))}
              </View>
            ) : settingsPage === 'subscription' ? (
              /* ── Subscription page ── */
              <View style={{ gap: spacing.md, paddingVertical: spacing.xs }}>
                {/* Free plan */}
                <TouchableOpacity
                  onPress={() => { setSelectedPlan('free'); void AsyncStorage.setItem(`${p}_plan`, 'free'); }}
                  style={[subst.planCard, selectedPlan === 'free' && subst.planCardSel]}>
                  <View style={subst.planHeader}>
                    <View style={[subst.planBadge, { backgroundColor: colors.ink3 + '22' }]}>
                      <Ionicons name="person-outline" size={18} color={colors.ink2} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={subst.planName}>Free</Text>
                      <Text style={subst.planPrice}>$0 / month</Text>
                    </View>
                    <View style={[subst.planRadio, selectedPlan === 'free' && subst.planRadioSel]}>
                      {selectedPlan === 'free' && <View style={subst.planRadioDot} />}
                    </View>
                  </View>
                  <View style={subst.divider} />
                  {[
                    'Log meals manually (unlimited)',
                    'Calories, protein, carbs & fat tracking',
                    'Daily diary & streak tracking',
                    'Body measurements & BMI',
                    '10 built-in recipes',
                  ].map(f => (
                    <View key={f} style={subst.featureRow}>
                      <Ionicons name="checkmark-circle-outline" size={16} color={colors.ink3} />
                      <Text style={subst.featureTxt}>{f}</Text>
                    </View>
                  ))}
                </TouchableOpacity>

                {/* Premium plan */}
                <TouchableOpacity
                  onPress={() => { setSelectedPlan('premium'); void AsyncStorage.setItem(`${p}_plan`, 'premium'); }}
                  style={[subst.planCard, subst.planCardPremium, selectedPlan === 'premium' && subst.planCardSel]}>
                  <LinearGradient colors={['rgba(124,77,255,0.18)', 'transparent']}
                    style={{ ...StyleSheet.absoluteFillObject as any, borderRadius: radius.lg }}
                    start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 0.5 }}
                    pointerEvents="none" />
                  <View style={subst.planHeader}>
                    <LinearGradient colors={[colors.purple, colors.purpleGlow]}
                      start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                      style={[subst.planBadge, { borderRadius: radius.sm }]}>
                      <Ionicons name="star" size={16} color={colors.white} />
                    </LinearGradient>
                    <View style={{ flex: 1 }}>
                      <Text style={[subst.planName, { color: colors.lavender }]}>Premium</Text>
                      <Text style={[subst.planPrice, { color: colors.purple2 }]}>$4.99 / month</Text>
                    </View>
                    <View style={[subst.planRadio, subst.planRadioPremium, selectedPlan === 'premium' && subst.planRadioSel]}>
                      {selectedPlan === 'premium' && <View style={[subst.planRadioDot, { backgroundColor: colors.purple }]} />}
                    </View>
                  </View>
                  <View style={[subst.divider, { borderColor: colors.line2 }]} />
                  {[
                    'Everything in Free',
                    'AI food scan — log by photo',
                    'AI recipe import from any URL',
                    '50+ full recipe library',
                    'Advanced micros: fiber, sugar, sodium, vitamins',
                    'Workout & nutrition programs',
                    'Full body progress analytics',
                    'Priority support',
                  ].map((f, i) => (
                    <View key={f} style={subst.featureRow}>
                      <Ionicons
                        name={i === 0 ? 'copy-outline' : 'checkmark-circle'}
                        size={16}
                        color={i === 0 ? colors.ink3 : colors.purple2}
                      />
                      <Text style={[subst.featureTxt, i !== 0 && { color: colors.ink }]}>{f}</Text>
                    </View>
                  ))}
                </TouchableOpacity>
              </View>
            ) : settingsPage === 'notifications' ? (
              /* ── Notification Settings page ── */
              <View style={sst.card}>
                {[
                  { icon: '🔔', label: 'Daily check-in reminder', bg: colors.purple + '1a', value: notifCheckIn,
                    onToggle: (v: boolean) => { setNotifCheckIn(v); AsyncStorage.setItem(`${p}_notif_checkin`, String(v)); scheduleWaterReminder(v); } },
                  { icon: '🥗', label: 'Meal reminders', bg: colors.green + '1a', value: notifMeals,
                    onToggle: (v: boolean) => { setNotifMeals(v); AsyncStorage.setItem(`${p}_notif_meals`, String(v)); scheduleMealReminders(v); } },
                  { icon: '🔥', label: 'Streak protection', bg: colors.honey + '1a', value: notifStreak,
                    onToggle: (v: boolean) => { setNotifStreak(v); AsyncStorage.setItem(`${p}_notif_streak`, String(v)); scheduleStreakReminder(v); } },
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
            ) : settingsPage === 'health' ? (
              /* ── Health Connect settings ── */
              <ScrollView contentContainerStyle={{ gap: spacing.sm, paddingBottom: spacing.xl }}>
                {!isHealthAvailable() && (
                  <Text style={[sst.sectionLbl, { color: colors.rose, paddingHorizontal: spacing.md }]}>
                    Health sync is not available on this platform.
                  </Text>
                )}
                <Text style={sst.sectionLbl}>CONNECTION</Text>
                <View style={sst.card}>
                  <View style={[sst.row, { borderBottomWidth: 0 }]}>
                    <View style={[sst.icon, { backgroundColor: Platform.OS === 'ios' ? colors.rose + '22' : colors.green + '22' }]}>
                      <Ionicons name={Platform.OS === 'ios' ? 'logo-apple' : 'fitness-outline'} size={16} color={Platform.OS === 'ios' ? colors.rose : colors.green} />
                    </View>
                    <Text style={[sst.label, { flex: 1 }]}>{healthPlatformName()}</Text>
                    {healthConnected
                      ? <Text style={{ fontSize: fontSize.xs, color: colors.green, fontWeight: '700' }}>Connected</Text>
                      : <TouchableOpacity onPress={handleHealthConnect} style={{ backgroundColor: colors.purple, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.xs }}>
                          <Text style={{ fontSize: fontSize.xs, color: colors.white, fontWeight: '700' }}>Connect</Text>
                        </TouchableOpacity>
                    }
                  </View>
                </View>

                <Text style={sst.sectionLbl}>SYNC DATA</Text>
                <View style={sst.card}>
                  {[
                    { key: 'steps',    icon: '👟', label: 'Steps',           value: healthSyncSteps,    onToggle: (v: boolean) => { setHealthSyncSteps(v);    AsyncStorage.setItem(`${p}_health_steps`, String(v)); } },
                    { key: 'calories', icon: '🔥', label: 'Active Calories', value: healthSyncCalories, onToggle: (v: boolean) => { setHealthSyncCalories(v); AsyncStorage.setItem(`${p}_health_calories`, String(v)); } },
                    { key: 'sleep',    icon: '🌙', label: 'Sleep',           value: healthSyncSleep,    onToggle: (v: boolean) => { setHealthSyncSleep(v);    AsyncStorage.setItem(`${p}_health_sleep`, String(v)); } },
                  ].map(({ key, icon, label, value, onToggle }, i, arr) => (
                    <View key={key} style={[sst.row, i === arr.length - 1 && { borderBottomWidth: 0 }]}>
                      <View style={[sst.icon, { backgroundColor: colors.layer3 }]}><Text>{icon}</Text></View>
                      <Text style={[sst.label, { flex: 1 }]}>{label}</Text>
                      <Switch value={value} onValueChange={onToggle}
                        disabled={!healthConnected}
                        trackColor={{ false: colors.layer3, true: colors.purple + '88' }}
                        thumbColor={value ? colors.purple : colors.ink3}
                        style={{ transform: [{ scaleX: 0.85 }, { scaleY: 0.85 }] }} />
                    </View>
                  ))}
                </View>

                <Text style={sst.sectionLbl}>WRITE BACK</Text>
                <View style={sst.card}>
                  <View style={[sst.row, { borderBottomWidth: 0 }]}>
                    <View style={[sst.icon, { backgroundColor: colors.honey + '1a' }]}><Text>💪</Text></View>
                    <View style={{ flex: 1 }}>
                      <Text style={sst.label}>Write Workouts</Text>
                      <Text style={{ fontSize: fontSize.xs, color: colors.ink3 }}>Log exercises back to {healthPlatformName()}</Text>
                    </View>
                    <Switch value={healthWriteBack} onValueChange={(v) => { setHealthWriteBack(v); AsyncStorage.setItem(`${p}_health_writeback`, String(v)); }}
                      disabled={!healthConnected}
                      trackColor={{ false: colors.layer3, true: colors.purple + '88' }}
                      thumbColor={healthWriteBack ? colors.purple : colors.ink3}
                      style={{ transform: [{ scaleX: 0.85 }, { scaleY: 0.85 }] }} />
                  </View>
                </View>

                <View style={{ paddingHorizontal: spacing.md, gap: spacing.sm }}>
                  {healthLastSync && (
                    <Text style={{ fontSize: fontSize.xs, color: colors.ink3, textAlign: 'center' }}>Last synced: {healthLastSync}</Text>
                  )}
                  <TouchableOpacity onPress={handleHealthSync} disabled={healthSyncing} style={{ borderRadius: radius.md, overflow: 'hidden' }}>
                    <LinearGradient colors={[colors.purple, colors.purpleGlow]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                      style={{ paddingVertical: spacing.sm + 2, alignItems: 'center' }}>
                      <Text style={{ color: colors.white, fontWeight: '700', fontSize: fontSize.sm, letterSpacing: 0.5 }}>
                        {healthSyncing ? 'Syncing…' : 'Sync Now'}
                      </Text>
                    </LinearGradient>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            ) : (
              /* ── Settings list page ── */
              <>
            {/* Account */}
            <Text style={sst.sectionLbl}>ACCOUNT</Text>
            <View style={sst.card}>
              <TouchableOpacity style={sst.row} onPress={() => {
                setAcFirstName(profile.name?.split(' ')[0] ?? '');
                setAcLastName(profile.name?.split(' ').slice(1).join(' ') ?? '');
                setAcEmail(email ?? '');
                setAcPassword('');
                setSettingsPage('account');
              }}>
                <View style={[sst.icon, { backgroundColor: colors.purple + '1a' }]}>
                  <Ionicons name="person-circle-outline" size={16} color={colors.purple2} />
                </View>
                <Text style={sst.label}>Account Settings</Text>
                <Ionicons name="chevron-forward" size={14} color={colors.ink3} />
              </TouchableOpacity>
              <TouchableOpacity style={[sst.row, { borderBottomWidth: 0 }]} onPress={() => setSettingsPage('subscription')}>
                <View style={[sst.icon, { backgroundColor: colors.honey + '1a' }]}>
                  <Ionicons name="card-outline" size={16} color={colors.honey} />
                </View>
                <Text style={sst.label}>Manage Subscriptions</Text>
                <Text style={[sst.val, { color: selectedPlan === 'premium' ? colors.honey : colors.ink3, textTransform: 'capitalize' }]}>{selectedPlan}</Text>
                <Ionicons name="chevron-forward" size={14} color={colors.ink3} />
              </TouchableOpacity>
            </View>


            {/* Notifications */}
            <Text style={sst.sectionLbl}>NOTIFICATIONS</Text>
            <View style={sst.card}>
              <TouchableOpacity style={[sst.row, { borderBottomWidth: 0 }]} onPress={() => setSettingsPage('notifications')}>
                <View style={[sst.icon, { backgroundColor: colors.purple + '1a' }]}>
                  <Ionicons name="notifications-outline" size={16} color={colors.purple2} />
                </View>
                <Text style={sst.label}>Notification Settings</Text>
                <Ionicons name="chevron-forward" size={14} color={colors.ink3} />
              </TouchableOpacity>
            </View>

            {/* Import Health Data */}
            <Text style={sst.sectionLbl}>IMPORT HEALTH DATA</Text>
            <View style={sst.card}>
              <TouchableOpacity style={[sst.row, { borderBottomWidth: 0 }]} onPress={() => setSettingsPage('health')}>
                <View style={[sst.icon, { backgroundColor: Platform.OS === 'ios' ? colors.rose + '22' : colors.green + '22' }]}>
                  <Ionicons name={Platform.OS === 'ios' ? 'logo-apple' : 'fitness-outline'} size={16} color={Platform.OS === 'ios' ? colors.rose : colors.green} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={sst.label}>{healthPlatformName()}</Text>
                  {healthConnected && <Text style={{ fontSize: fontSize.xs, color: colors.green }}>Connected{healthLastSync ? ` · ${healthLastSync}` : ''}</Text>}
                </View>
                <Ionicons name="chevron-forward" size={14} color={colors.ink3} />
              </TouchableOpacity>
            </View>

            {/* Help */}
            <Text style={sst.sectionLbl}>HELP</Text>
            <View style={sst.card}>
              {[
                { icon: 'chatbubble-ellipses-outline', label: 'Support', color: colors.sky, bg: colors.sky + '1a' },
                { icon: 'document-text-outline', label: 'Terms & Conditions', color: colors.ink2, bg: colors.layer3 },
                { icon: 'code-slash-outline', label: 'Open-source Licenses', color: colors.purple2, bg: colors.purple + '1a' },
                { icon: 'library-outline', label: 'Sources of recommendations', color: colors.green, bg: colors.green + '1a' },
              ].map(({ icon, label, color, bg }, i, arr) => (
                <TouchableOpacity key={label} style={[sst.row, i === arr.length - 1 && { borderBottomWidth: 0 }]}
                  onPress={() => Alert.alert(label, 'Coming soon.')}>
                  <View style={[sst.icon, { backgroundColor: bg }]}>
                    <Ionicons name={icon as any} size={16} color={color} />
                  </View>
                  <Text style={sst.label}>{label}</Text>
                  <Ionicons name="chevron-forward" size={14} color={colors.ink3} />
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity
              style={{ alignSelf: 'center', marginTop: spacing.xl, paddingHorizontal: spacing.xl, paddingVertical: spacing.sm + 4, borderRadius: radius.md, borderWidth: 1, borderColor: colors.rose + '55', backgroundColor: colors.rose + '11' }}
              onPress={() => { setSettingsModal(false); handleLogout(); }}>
              <Text style={{ color: colors.rose, fontSize: fontSize.sm, fontWeight: '700', letterSpacing: 1.1 }}>LOG OUT</Text>
            </TouchableOpacity>
            <Text style={{ textAlign: 'center', color: colors.ink3, fontSize: fontSize.xs, marginTop: spacing.sm }}>1.0.0</Text>
            <View style={{ height: spacing.xl }} />
              </>
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* ── Dietary Preferences Modal ── */}
      <Modal visible={dietaryModal} animationType="slide" presentationStyle="fullScreen">
        <SafeAreaView style={dp.safe} edges={['top', 'bottom']}>
          <View style={dp.header}>
            <TouchableOpacity onPress={() => setDietaryModal(false)} style={dp.backBtn}>
              <Ionicons name="chevron-back" size={18} color={colors.ink} />
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
                    {selectedFoodPref === key && <Text style={{ color: colors.white, fontSize: fontSize.xs, fontWeight: '700' }}>✓</Text>}
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
        <SafeAreaView style={styles.safe} edges={['bottom']}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setTdeeModal(false)}><Text style={styles.cancelText}>Cancel</Text></TouchableOpacity>
            <Text style={styles.modalTitle}>Calorie & Goals</Text>
            <TouchableOpacity onPress={() => {
              const age = parseInt(profile.age ?? '25') || 25;
              const weight = parseFloat(profile.weight ?? '70') || 70;
              const height = parseFloat(profile.height ?? '170') || 170;
              const cal = calcTDEE(age, weight, height, sex, localActivity, localGoal);
              setGoals(localActivity, localGoal, cal);
              setProfile({ ...profile, sex });
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
        <SafeAreaView style={styles.safe} edges={['bottom']}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setEditing(false)}><Text style={styles.cancelText}>Cancel</Text></TouchableOpacity>
            <Text style={styles.modalTitle}>Personal Details</Text>
            <TouchableOpacity onPress={handleSave}><Text style={styles.saveText}>Save</Text></TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.modalScroll} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}>
            {[
              { label: 'Name', key: 'name' },
              { label: 'Age', key: 'age', keyboard: 'numeric' as const },
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
            <View>
              <Text style={styles.inputLabel}>Weight ({weightUnit(unitSystem)})</Text>
              <TextInput
                style={styles.input}
                value={draftWeightInput}
                onChangeText={setDraftWeightInput}
                placeholderTextColor={colors.ink3}
                keyboardType="decimal-pad"
                autoCapitalize="none"
              />
            </View>
            <View>
              <Text style={styles.inputLabel}>Height ({heightUnit(unitSystem)})</Text>
              <TextInput
                style={styles.input}
                value={draftHeightInput}
                onChangeText={setDraftHeightInput}
                placeholderTextColor={colors.ink3}
                keyboardType={unitSystem === 'Metric' ? 'decimal-pad' : 'default'}
                autoCapitalize="none"
              />
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Water Goal modal — cross-platform replacement for Alert.prompt */}
      <Modal visible={waterGoalModal} transparent animationType="fade" onRequestClose={() => setWaterGoalModal(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={{ flex: 1, backgroundColor: colors.dim, justifyContent: 'center', alignItems: 'center', padding: spacing.lg }}>
          <View style={{ backgroundColor: colors.layer1, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line2, padding: spacing.lg, width: '100%', gap: spacing.md }}>
            <Text style={{ fontSize: fontSize.md, fontWeight: '700', color: colors.ink }}>Water Goal</Text>
            <Text style={{ fontSize: fontSize.sm, color: colors.ink3 }}>Glasses per day (1–20)</Text>
            <TextInput
              style={{ backgroundColor: colors.layer2, borderWidth: 1, borderColor: colors.line2, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, color: colors.ink, fontSize: fontSize.lg, fontWeight: '700', textAlign: 'center' }}
              value={waterGoalInput}
              onChangeText={setWaterGoalInput}
              keyboardType="numeric"
              autoFocus
              placeholder="8"
              placeholderTextColor={colors.ink3}
              returnKeyType="done"
              onSubmitEditing={() => {
                const n = parseInt(waterGoalInput);
                if (!isNaN(n) && n >= 1 && n <= 20) { setWaterGoal(String(n)); void AsyncStorage.setItem(`${p}_water_goal`, String(n)); }
                else Alert.alert('Invalid value', 'Water goal must be between 1 and 20 glasses.');
                setWaterGoalModal(false);
              }}
            />
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <TouchableOpacity onPress={() => setWaterGoalModal(false)}
                style={{ flex: 1, paddingVertical: spacing.sm, alignItems: 'center', borderWidth: 1, borderColor: colors.line2, borderRadius: radius.md }}>
                <Text style={{ color: colors.ink2, fontWeight: '600', fontSize: fontSize.sm }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  const n = parseInt(waterGoalInput);
                  if (!isNaN(n) && n >= 1 && n <= 20) { setWaterGoal(String(n)); void AsyncStorage.setItem(`${p}_water_goal`, String(n)); }
                  else Alert.alert('Invalid value', 'Water goal must be between 1 and 20 glasses.');
                  setWaterGoalModal(false);
                }}
                style={{ flex: 2, borderRadius: radius.md, overflow: 'hidden' }}>
                <LinearGradient colors={[colors.purple, colors.purpleGlow]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={{ paddingVertical: spacing.sm, alignItems: 'center' }}>
                  <Text style={{ color: colors.ink, fontWeight: '700', fontSize: fontSize.sm }}>Save</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </View>
        </KeyboardAvoidingView>
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

  avatarCard: { backgroundColor: colors.layer1, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: spacing.lg, alignItems: 'center', gap: spacing.sm },
  avatarWrap: { position: 'relative' },
  avatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: colors.purple, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.white, fontSize: 32, fontWeight: '800' },
  avatarImg: { width: 80, height: 80, borderRadius: radius.pill },
  avatarAdd: { position: 'absolute', bottom: 0, right: 0, width: 26, height: 26, borderRadius: radius.pill, backgroundColor: colors.purple2, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.layer1 },
  name: { color: colors.ink, fontSize: fontSize.lg, fontWeight: '700' },
  emailText: { color: colors.ink3, fontSize: fontSize.sm },

  xpRow: { flexDirection: 'row', alignItems: 'center', gap: 10, width: '100%', marginTop: 4 },
  xpBadge: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.purple, alignItems: 'center', justifyContent: 'center' },
  xpBadgeTxt: { fontSize: fontSize.base, fontWeight: '800', color: colors.white },
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

  achieveBadge: { alignItems: 'center', gap: spacing.xs, backgroundColor: colors.layer1, borderWidth: 1, borderColor: colors.line2, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  achieveLbl: { fontSize: fontSize.xs, color: colors.ink2, textAlign: 'center' },
  achieveDot: { width: spacing.xs, height: spacing.xs, borderRadius: spacing.xs, backgroundColor: colors.green },
  menuCard: { backgroundColor: colors.layer1, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.line },
  menuIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  menuLabel: { flex: 1, color: colors.ink, fontSize: fontSize.base },
  menuValue: { fontSize: fontSize.xs, color: colors.ink3, maxWidth: 100 },


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
});

// ── Subscription modal styles ─────────────────────────────────────────────────
const subst = StyleSheet.create({
  planCard: { backgroundColor: colors.layer1, borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg, padding: spacing.md, gap: spacing.sm, overflow: 'hidden' },
  planCardSel: { borderColor: colors.purple, borderWidth: 1.5 },
  planCardPremium: { borderColor: colors.line2 },
  planHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  planBadge: { width: 36, height: 36, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  planName: { fontSize: fontSize.base, fontWeight: '700', color: colors.ink },
  planPrice: { fontSize: fontSize.xs, color: colors.ink3, marginTop: 2 },
  planRadio: { width: 20, height: 20, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.line2, alignItems: 'center', justifyContent: 'center' },
  planRadioSel: { borderColor: colors.purple },
  planRadioPremium: { borderColor: colors.line3 },
  planRadioDot: { width: 10, height: 10, borderRadius: radius.pill, backgroundColor: colors.ink3 },
  divider: { borderTopWidth: 1, borderColor: colors.line, marginVertical: spacing.xs },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 2 },
  featureTxt: { fontSize: fontSize.sm, color: colors.ink2, flex: 1 },
});

// ── Account Settings modal styles ────────────────────────────────────────────
const act = StyleSheet.create({
  fieldLbl: { fontSize: fontSize.sm, color: colors.ink2, width: 90 },
  fieldInput: { flex: 1, fontSize: fontSize.sm, color: colors.ink, textAlign: 'right' },
});

// ── Dietary preferences modal styles ──────────────────────────────────────────
const dp = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.line },
  backBtn: { width: 36, height: 36, borderRadius: radius.pill, backgroundColor: colors.layer2, borderWidth: 1, borderColor: colors.line2, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: fontSize.base, fontWeight: '700', color: colors.ink },
  scroll: { padding: spacing.md, paddingBottom: spacing.xl * 3 },
  sectionLbl: { fontSize: fontSize.xs, fontWeight: '700', letterSpacing: 1.1, textTransform: 'uppercase', color: colors.ink3, marginBottom: spacing.sm, marginTop: spacing.xs },
  listCard: { backgroundColor: colors.layer1, borderRadius: radius.md, overflow: 'hidden', marginBottom: spacing.lg },
  prefRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.line },
  prefLabel: { fontSize: fontSize.base, color: colors.ink },
  radio: { width: 24, height: 24, borderRadius: radius.pill, borderWidth: 2, borderColor: colors.line3, alignItems: 'center', justifyContent: 'center' },
  radioSel: { backgroundColor: colors.green, borderColor: colors.green },
  toggle: { width: 50, height: 28, borderRadius: radius.pill, backgroundColor: colors.layer2, position: 'relative', overflow: 'hidden' },
  toggleOn: { backgroundColor: colors.green },
  toggleThumb: { position: 'absolute', top: 3, left: 3, width: 22, height: 22, borderRadius: radius.pill, backgroundColor: colors.white },
  footer: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: colors.bg, paddingHorizontal: spacing.md, paddingVertical: spacing.md, borderTopWidth: 1, borderTopColor: colors.line },
  saveBtn: { alignItems: 'center', paddingVertical: spacing.sm },
  saveBtnTxt: { fontSize: fontSize.sm, fontWeight: '700', letterSpacing: 1.4, color: colors.ink },
});
