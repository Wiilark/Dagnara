import { useState, useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Alert, TextInput, Modal, Switch, Image, Platform, Keyboard,
  Animated, Linking,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useAuthStore } from '../../src/store/authStore';
import { useAppStore, calcTDEE, macrosFor } from '../../src/store/appStore';
import { supabase } from '../../src/lib/supabase';
import { scheduleMealReminders, scheduleStreakReminder, scheduleWaterReminder, requestNotificationPermission } from '../../src/lib/notifications';
import { colors, spacing, fontSize, radius } from '../../src/theme';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { FloatingModalHeader } from '../../src/components/FloatingModalHeader';
import { formatWeight, weightUnit, heightUnit, lengthUnit, kgToInput, cmToInput, cmLenToInput, parseWeight, parseHeight, parseLength, UnitSystem } from '../../src/lib/units';
import { COUNTRIES, getCountry } from '../../src/lib/currency';
import { fmt } from '../../src/lib/format';
import { requestHealthPermissions, readHealthData, healthPlatformName, isHealthAvailable } from '../../src/lib/healthKit';
import { useDiaryStore } from '../../src/store/diaryStore';
import { usePremium } from '../../src/components/Premium';

const DIET_PLANS = ['Balanced', 'High Protein', 'Low Carb', 'Keto', 'Vegan', 'Mediterranean'];

export default function ProfileScreen() {
  const { email, profile, logout, setProfile } = useAuthStore();
  const { updateCaloriesBurned, logSleep } = useDiaryStore();
  const { streak, setGoals, activityLevel, weightGoal, calorieGoal: storeCalGoal, unitSystem, setUnitSystem, country, setCountry, setMessagesOpen, unreadCount, dietaryPreferences, setDietaryPreferences, setMacroPcts, addWeightEntry, setPremium } = useAppStore();
  const isPremium = usePremium();

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(profile);
  const [dietModal, setDietModal] = useState(false);
  const [measureModal, setMeasureModal] = useState(false);
  const [settingsModal, setSettingsModal] = useState(false);
  const [settingsPage, setSettingsPage] = useState<'' | 'account' | 'unitSystem' | 'language' | 'country' | 'notifications' | 'subscription' | 'health' | 'about'>('');
  // Plans page: which tier the user is *previewing*. Tapping a header tab only
  // changes this preview — it does NOT switch the active plan. The button below
  // is the only thing that commits a switch. Initialised to the current plan
  // each time the Plans page opens (see effect below).
  const [previewTier, setPreviewTier] = useState<boolean>(false);

  async function handleDeleteAccount() {
    Alert.alert('Delete Account', 'This permanently deletes your account and all data. This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete Everything', style: 'destructive', onPress: async () => {
        try {
          const { error } = await supabase.rpc('delete_user_data');
          if (error) throw error;
          await logout();
          router.replace('/(auth)/login');
        } catch {
          Alert.alert('Error', 'Could not delete account automatically. Please contact support.');
        }
      }}
    ]);
  }

  const [language, setLanguage] = useState('English');

  // Deep-link: a locked Premium tap from another screen passes ?plans=1 to open
  // the Plans screen directly (so "tap to unlock" lands where it promises).
  const params = useLocalSearchParams<{ plans?: string }>();
  useEffect(() => {
    if (params.plans === '1') {
      setSettingsPage('subscription');
      setSettingsModal(true);
      router.setParams({ plans: undefined });
    }
  }, [params.plans]);

  // Land the Plans preview on whatever the user is actually subscribed to each
  // time the page opens, so the header tab reflects their real current plan.
  useEffect(() => {
    if (settingsPage === 'subscription') setPreviewTier(isPremium);
  }, [settingsPage, isPremium]);

  const [editFirstName, setEditFirstName] = useState('');
  const [editLastName,  setEditLastName]  = useState('');
  const [editDob, setEditDob] = useState('');          // ISO YYYY-MM-DD
  const [dobPickerOpen, setDobPickerOpen] = useState(false);
  const [dietaryModal, setDietaryModal] = useState(false);
  const [tdeeModal, setTdeeModal] = useState(false);
  const [selectedFoodPref, setSelectedFoodPref] = useState('none');
  const [selectedDiet, setSelectedDiet] = useState('Balanced');
  const [selectedAllergies, setSelectedAllergies] = useState<string[]>([]);


  // Notification preferences
  const [notifCheckIn, setNotifCheckIn] = useState(false);
  const [notifMeals,   setNotifMeals]   = useState(false);
  const [notifStreak,  setNotifStreak]  = useState(false);
  const calorieGoal = storeCalGoal || 2000;
  const [sex, setSex] = useState<'male' | 'female'>((profile.sex as 'male' | 'female') ?? 'male');
  const [localActivity, setLocalActivity] = useState<typeof activityLevel>(activityLevel);
  const [localGoal, setLocalGoal] = useState<typeof weightGoal>(weightGoal);
  const [measurements, setMeasurements] = useState<Record<string, string>>({
    weight: '', height: '', waist: '', chest: '', hips: '', arms: '',
  });
  const [measureInputs, setMeasureInputs] = useState<Record<string, string>>({
    weight: '', height: '', waist: '', chest: '', hips: '', arms: '',
  });

  // Health sync state
  const [healthConnected, setHealthConnected] = useState(false);
  const [healthSyncSteps, setHealthSyncSteps] = useState(false);
  const [healthSyncCalories, setHealthSyncCalories] = useState(false);
  const [healthSyncSleep, setHealthSyncSleep] = useState(false);
  const [healthLastSync, setHealthLastSync] = useState<string | null>(null);
  const [healthSyncing, setHealthSyncing] = useState(false);

  // Load persisted measurements + prefs on mount (scoped to this user)
  const p = email ?? 'anon';
  useEffect(() => {
    AsyncStorage.multiGet([
      `${p}_body_measurements`,
      `${p}_notif_checkin`, `${p}_notif_meals`, `${p}_notif_streak`,
      `${p}_language`, `${p}_unit_system`, `${p}_plan`,
      `${p}_diet_plan`, `${p}_food_pref`, `${p}_allergies`,
    ]).then(pairs => {
      const m: Record<string, string | null> = Object.fromEntries(pairs);
      if (m[`${p}_body_measurements`]) {
        try { setMeasurements(JSON.parse(m[`${p}_body_measurements`]!)); }
        catch { void AsyncStorage.removeItem(`${p}_body_measurements`); }
      }
      if (m[`${p}_notif_checkin`]) setNotifCheckIn(m[`${p}_notif_checkin`] === 'true');
      if (m[`${p}_notif_meals`])   setNotifMeals(m[`${p}_notif_meals`] === 'true');
      if (m[`${p}_notif_streak`])  setNotifStreak(m[`${p}_notif_streak`] === 'true');
      if (m[`${p}_language`])      setLanguage(m[`${p}_language`]!);
      // Diet plan = the store's dietaryPreferences (set at onboarding / Diet Plan
      // save). Fall back to the legacy AsyncStorage key only if the store is null,
      // so an onboarded user's choice shows here instead of defaulting to Balanced.
      if (dietaryPreferences)      setSelectedDiet(dietaryPreferences);
      else if (m[`${p}_diet_plan`]) setSelectedDiet(m[`${p}_diet_plan`]!);
      if (m[`${p}_food_pref`])     setSelectedFoodPref(m[`${p}_food_pref`]!);
      if (m[`${p}_allergies`]) {
        try { setSelectedAllergies(JSON.parse(m[`${p}_allergies`]!)); } catch { /* ignore */ }
      }
      // Migrate old unit_system key to store (one-time, fire-and-forget)
      if (m[`${p}_unit_system`])   void setUnitSystem(m[`${p}_unit_system`] as UnitSystem);
    });
    // Load health sync prefs
    AsyncStorage.multiGet([
      `${p}_health_connected`, `${p}_health_steps`, `${p}_health_calories`,
      `${p}_health_sleep`, `${p}_health_last_sync`,
    ]).then(pairs => {
      const m: Record<string, string | null> = Object.fromEntries(pairs);
      if (m[`${p}_health_connected`]) setHealthConnected(m[`${p}_health_connected`] === 'true');
      if (m[`${p}_health_steps`])     setHealthSyncSteps(m[`${p}_health_steps`] === 'true');
      if (m[`${p}_health_calories`])  setHealthSyncCalories(m[`${p}_health_calories`] === 'true');
      if (m[`${p}_health_sleep`])     setHealthSyncSleep(m[`${p}_health_sleep`] === 'true');
      if (m[`${p}_health_last_sync`]) setHealthLastSync(m[`${p}_health_last_sync`]);
    });
    // `setUnitSystem` is a stable Zustand action — safe to omit. `p` already covers
    // email changes. `dietaryPreferences` is read once here to seed the Diet Plan row
    // from the already-hydrated store; it must NOT re-trigger this loader.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p]);

  // Reset local TDEE state when modal opens
  useEffect(() => {
    if (tdeeModal) {
      setSex((profile.sex as 'male' | 'female') ?? 'male');
      setLocalActivity(activityLevel);
      setLocalGoal(weightGoal);
    }
  }, [tdeeModal]);

  // Revert an unsaved Diet Plan pick when that sheet closes without saving, so the
  // menu row + next open reflect the persisted plan, not a dangling selection.
  // Precedence matches the seed: store dietaryPreferences → legacy key → Balanced.
  useEffect(() => {
    if (dietModal) return;
    if (dietaryPreferences) { setSelectedDiet(dietaryPreferences); return; }
    AsyncStorage.getItem(`${p}_diet_plan`).then(v => setSelectedDiet(v ?? 'Balanced'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dietModal]);

  // Revert unsaved dietary preference changes when the sheet closes without saving
  useEffect(() => {
    if (dietaryModal) return;
    // selectedDiet is owned by the Diet Plan sheet's own revert effect — only the
    // food-pref + allergies fields belong to this (Dietary Preferences) sheet.
    AsyncStorage.multiGet([`${p}_food_pref`, `${p}_allergies`]).then(pairs => {
      const m = Object.fromEntries(pairs);
      if (m[`${p}_food_pref`]) setSelectedFoodPref(m[`${p}_food_pref`]!);
      if (m[`${p}_allergies`]) {
        try { setSelectedAllergies(JSON.parse(m[`${p}_allergies`]!)); } catch { /* ignore */ }
      }
    });
  }, [dietaryModal]);

  // Populate display-unit inputs from stored metric values. Weight/height fall
  // back to the profile (set during onboarding) so the editor isn't blank for
  // users who never opened the standalone measurements sheet — the BMI card uses
  // the same fallback, keeping all three readers consistent.
  function seedMeasureInputs() {
    const wSrc = measurements.weight || (profile.weight != null ? String(profile.weight) : '');
    const hSrc = measurements.height || (profile.height != null ? String(profile.height) : '');
    setMeasureInputs({
      weight: wSrc ? kgToInput(parseFloat(wSrc), unitSystem) : '',
      height: hSrc ? cmToInput(parseFloat(hSrc), unitSystem) : '',
      waist:  measurements.waist  ? cmLenToInput(parseFloat(measurements.waist),  unitSystem) : '',
      chest:  measurements.chest  ? cmLenToInput(parseFloat(measurements.chest),  unitSystem) : '',
      hips:   measurements.hips   ? cmLenToInput(parseFloat(measurements.hips),   unitSystem) : '',
      arms:   measurements.arms   ? cmLenToInput(parseFloat(measurements.arms),   unitSystem) : '',
    });
  }

  // Populate display-unit inputs when the standalone measurements modal opens
  useEffect(() => {
    if (!measureModal) return;
    seedMeasureInputs();
  }, [measureModal]);

  useEffect(() => {
    if (!editing) return;
    const parts = (profile.name ?? '').trim().split(' ');
    setEditFirstName(parts[0] ?? '');
    setEditLastName(parts.slice(1).join(' '));
    setEditDob(profile.dob ?? '');
    seedMeasureInputs();
  }, [editing]);

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
      const today = new Date().toLocaleDateString('en-CA');
      const data = await readHealthData(today);
      if (healthSyncCalories && data.activeCalories > 0) {
        // Don't clobber manually logged workouts: keep whichever is higher.
        // This also makes re-syncing idempotent (max stays stable).
        const current = useDiaryStore.getState().entries[today]?.calories_burned ?? 0;
        await updateCaloriesBurned(today, Math.max(current, data.activeCalories));
      }
      if (healthSyncSleep && data.sleepMinutes > 0) {
        const hrs = Math.floor(data.sleepMinutes / 60);
        const mins = data.sleepMinutes % 60;
        await logSleep(today, {
          bedtime: '22:00',
          waketime: `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}`,
          quality: 2,
          duration: `${hrs}h ${mins}m`,
        });
      }
      const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      setHealthLastSync(now);
      await AsyncStorage.setItem(`${p}_health_last_sync`, now);
      Alert.alert('Synced', `Health data updated.\nSteps: ${fmt(data.steps)}${healthSyncCalories ? `\nCalories burned: ${fmt(data.activeCalories)} kcal` : ''}${healthSyncSleep ? `\nSleep: ${Math.floor(data.sleepMinutes / 60)}h ${data.sleepMinutes % 60}m` : ''}`);
    } catch {
      Alert.alert('Sync failed', 'Could not read health data. Try again.');
    } finally {
      setHealthSyncing(false);
    }
  }

  // Validate + persist body measurements (display-unit inputs → metric storage).
  // Returns the weight/height patch to merge into the profile, or null on a
  // validation failure (an alert is shown). Does not touch the profile or any
  // modal — callers decide how to apply the patch and what to close.
  async function saveMeasurementsCore(): Promise<{ weight?: string; height?: string } | null> {
    const wKg    = parseWeight(measureInputs.weight, unitSystem);
    const hCm    = parseHeight(measureInputs.height, unitSystem);
    const waistCm = parseLength(measureInputs.waist, unitSystem);
    const chestCm = parseLength(measureInputs.chest, unitSystem);
    const hipsCm  = parseLength(measureInputs.hips,  unitSystem);
    const armsCm  = parseLength(measureInputs.arms,  unitSystem);
    if (wKg != null && (wKg < 30 || wKg > 300)) {
      const bounds = unitSystem === 'Metric' ? '30–300 kg' : unitSystem === 'UK' ? '4 st 10 lb – 47 st 3 lb' : '66–661 lb';
      Alert.alert('Invalid weight', `Weight must be between ${bounds}.`);
      return null;
    }
    if (hCm != null && (hCm < 100 || hCm > 250)) {
      const bounds = unitSystem === 'Metric' ? '100–250 cm' : "3'4\"–8'2\"";
      Alert.alert('Invalid height', `Height must be between ${bounds}.`);
      return null;
    }
    if ((waistCm != null && (waistCm < 40 || waistCm > 200)) ||
        (chestCm != null && (chestCm < 40 || chestCm > 200)) ||
        (hipsCm  != null && (hipsCm  < 40 || hipsCm  > 200))) {
      Alert.alert('Invalid measurement', 'Waist, chest, and hips must be between 40–200 cm (16–79 in).');
      return null;
    }
    if (armsCm != null && (armsCm < 10 || armsCm > 100)) {
      Alert.alert('Invalid measurement', 'Arm circumference must be between 10–100 cm (4–39 in).');
      return null;
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
    return {
      ...(wKg != null ? { weight: String(Math.round(wKg * 10) / 10) } : {}),
      ...(hCm != null ? { height: String(Math.round(hCm)) } : {}),
    };
  }

  async function handleSave() {
    const age = ageFromDob(editDob);
    if (editDob && age != null && (age < 16 || age > 100)) {
      Alert.alert('Invalid date of birth', 'Age must be between 16 and 100 years.');
      return;
    }
    // Validate names: letters/spaces/hyphens/apostrophes/periods only (covers
    // "O'Brien", "Jean-Luc", "J.R."), 2–40 chars, no digits or symbols.
    const first = editFirstName.trim();
    const last  = editLastName.trim();
    const nameErr = validateName(first, true) ?? validateName(last, false);
    if (nameErr) { Alert.alert('Invalid name', nameErr); return; }
    const measurePatch = await saveMeasurementsCore();
    if (measurePatch === null) return; // validation failed — keep editor open
    const newName = [first, last].filter(Boolean).join(' ');
    // Persist in the background (setProfile updates state + local cache synchronously,
    // then upserts to Supabase). Don't block the close on the network round-trip.
    void setProfile({
      ...draft,
      ...measurePatch,
      sex,
      ...(newName ? { name: newName } : {}),
      ...(editDob ? { dob: editDob, age: age != null ? String(age) : draft.age } : {}),
    });
    // Recompute the daily calorie goal from the edited body data so the whole app
    // (diary/log/progress/recipes) stays in sync — Personal Info is a real input to
    // TDEE, not just display. weight/height are metric here; fall back to the stored
    // profile when a field wasn't touched. Activity level & weight goal are unchanged.
    const tdeeAge    = age ?? (parseInt(draft.age ?? '25', 10) || 25);
    const tdeeWeight = parseFloat(measurePatch.weight ?? draft.weight ?? '70') || 70;
    const tdeeHeight = parseFloat(measurePatch.height ?? draft.height ?? '170') || 170;
    const newCal = calcTDEE(tdeeAge, tdeeWeight, tdeeHeight, sex, activityLevel, weightGoal);
    void setGoals(activityLevel, weightGoal, newCal);
    // macrosFor is anchored to bodyweight + calories, so a weight edit must reshape
    // the split too — mirrors the TDEE/Diet modals, which were the only paths doing this.
    void setMacroPcts(macrosFor(weightGoal, dietaryPreferences, tdeeWeight, newCal));
    // Log the new weight to history so the Progress chart/trend reflects it.
    if (measurePatch.weight != null) void addWeightEntry(tdeeWeight);
    setEditing(false);
  }

  async function handleSaveMeasurements() {
    const measurePatch = await saveMeasurementsCore();
    if (measurePatch === null) return;
    await setProfile({ ...profile, ...measurePatch });
    // Keep the calorie goal in sync when weight/height change here too.
    const tdeeAge    = parseInt(profile.age ?? '25', 10) || 25;
    const tdeeWeight = parseFloat((measurePatch.weight ?? profile.weight) ?? '70') || 70;
    const tdeeHeight = parseFloat((measurePatch.height ?? profile.height) ?? '170') || 170;
    const curSex = (profile.sex as 'male' | 'female') ?? 'male';
    const newCal = calcTDEE(tdeeAge, tdeeWeight, tdeeHeight, curSex, activityLevel, weightGoal);
    void setGoals(activityLevel, weightGoal, newCal);
    // Keep the macro split and weight history in sync with the new bodyweight too.
    void setMacroPcts(macrosFor(weightGoal, dietaryPreferences, tdeeWeight, newCal));
    if (measurePatch.weight != null) void addWeightEntry(tdeeWeight);
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
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
      base64: true,
    });
    if (result.canceled || !result.assets[0].base64) return;
    const dataUri = `data:image/jpeg;base64,${result.assets[0].base64}`;
    await setProfile({ ...profile, photoUri: dataUri });
  }

  const nameParts = (profile.name ?? '').trim().split(/\s+/).filter(Boolean);
  const initials = nameParts.length >= 2
    ? (nameParts[0][0] + nameParts[nameParts.length - 1][0]).toUpperCase()
    : (nameParts[0]?.[0] ?? email?.[0] ?? '?').toUpperCase();

  async function handleSaveAccount() {
    await AsyncStorage.setItem(`${p}_language`, language);
    setSettingsPage('');
  }

  // Format an ISO date (YYYY-MM-DD) like "26 October 1994". Empty → placeholder.
  function formatDob(iso: string): string {
    if (!iso) return 'Not set';
    const d = new Date(`${iso}T00:00:00`);
    if (isNaN(d.getTime())) return 'Not set';
    return `${d.getDate()} ${d.toLocaleDateString('en-US', { month: 'long' })} ${d.getFullYear()}`;
  }

  // Whole-year age from an ISO date of birth.
  // Strip characters that aren't allowed in a name as the user types, so digits
  // and symbols never make it into the field in the first place.
  function sanitizeNameInput(value: string): string {
    return value.replace(/[^\p{L} '.-]/gu, '');
  }

  // Returns an error string if the name is invalid, or null if it's fine.
  // `required` first name must be present; surname may be empty but, if given,
  // must still pass the same character/length rules.
  function validateName(value: string, required: boolean): string | null {
    if (!value) return required ? 'Please enter your first name.' : null;
    if (value.length < 2) return 'Name must be at least 2 characters.';
    if (value.length > 40) return 'Name must be 40 characters or fewer.';
    // Letters (incl. accented), spaces, hyphens, apostrophes, periods.
    if (!/^[\p{L}][\p{L} '.-]*$/u.test(value)) {
      return 'Names can only contain letters, spaces, hyphens, and apostrophes.';
    }
    return null;
  }

  function ageFromDob(iso: string): number | null {
    if (!iso) return null;
    const d = new Date(`${iso}T00:00:00`);
    if (isNaN(d.getTime())) return null;
    const now = new Date();
    let age = now.getFullYear() - d.getFullYear();
    const m = now.getMonth() - d.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
    return age;
  }

  const insets = useSafeAreaInsets();
  const scrollY = useRef(new Animated.Value(0)).current;
  const firstNameRef = useRef<TextInput>(null);
  const lastNameRef = useRef<TextInput>(null);
  const measureRefs = useRef<Record<string, TextInput | null>>({});

  // Super-smoothed interpolation for high-end Revolut feel
  const headerNameOpacity = scrollY.interpolate({
    inputRange: [100, 170],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  const headerNameTranslateY = scrollY.interpolate({
    inputRange: [100, 170],
    outputRange: [15, 0],
    extrapolate: 'clamp',
  });

  const headerBlurOpacity = scrollY.interpolate({
    inputRange: [20, 120],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  // Edit Profile modal — its own scroll value so the floating header behaves
  // exactly like the profile header (blur + title fade-in on scroll).
  const editScrollY = useRef(new Animated.Value(0)).current;
  // Each sub-screen modal gets its own scroll value for the same floating header.
  const measureScrollY = useRef(new Animated.Value(0)).current;
  const dietScrollY = useRef(new Animated.Value(0)).current;
  const settingsScrollY = useRef(new Animated.Value(0)).current;
  const dietaryScrollY = useRef(new Animated.Value(0)).current;
  const tdeeScrollY = useRef(new Animated.Value(0)).current;

  return (
    <View style={styles.safe}>
      {/* ── Floating Header — blur + soft bottom fade, no hard edge ── */}
      <View style={[styles.fixedHeader, { paddingTop: insets.top, height: 50 + insets.top + 16 }]}>
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: headerBlurOpacity }]}>
          <BlurView
            tint="dark"
            intensity={Platform.OS === 'ios' ? 80 : 100}
            style={StyleSheet.absoluteFill}
          />
          {/* Fade blur into bg at the bottom so there's no hard clip line */}
          <LinearGradient
            colors={['transparent', colors.bg]}
            style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 18 }}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            pointerEvents="none"
          />
        </Animated.View>
        <View style={styles.headerContent}>
          <TouchableOpacity onPress={() => router.back()} style={styles.closeBtn}>
            <Ionicons name="close" size={26} color={colors.ink} />
          </TouchableOpacity>

          <Animated.View style={{
            opacity: headerNameOpacity,
            flex: 1,
            minWidth: 0,
            alignItems: 'flex-start',
            paddingLeft: spacing.sm,
            paddingRight: spacing.sm,
            transform: [{ translateY: headerNameTranslateY }]
          }}>
            <Text style={styles.headerNameText} numberOfLines={1}>{profile.name ?? 'Your Name'}</Text>
          </Animated.View>

          <TouchableOpacity
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setSettingsPage('subscription'); setSettingsModal(true); }}
            style={{ flexShrink: 0, borderRadius: radius.pill, overflow: 'hidden', shadowColor: colors.purple, shadowOpacity: 0.4, shadowRadius: 8 }}>
            <LinearGradient colors={[colors.purple, colors.purpleGlow]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.upgradeBtn}>
              <Ionicons name="diamond" size={18} color={colors.white} />
              <Text style={styles.upgradeTxt}>{isPremium ? 'Premium' : 'Upgrade'}</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>

      <Animated.ScrollView
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: true }
        )}
        scrollEventThrottle={16}
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + spacing.xl + spacing.md }]}
        showsVerticalScrollIndicator={false}
      >

        {/* ── Hero ── */}
        <View style={styles.hero}>
          <TouchableOpacity style={styles.avatarWrap} onPress={handlePickPhoto}>
            {profile.photoUri
              ? <Image source={{ uri: profile.photoUri }} style={styles.avatarImg} />
              : <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{initials}</Text>
                </View>
            }
            <View style={styles.avatarAdd}>
              <Ionicons name="camera" size={14} color={colors.white} />
            </View>
          </TouchableOpacity>
          <Text style={styles.heroName} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{profile.name ?? 'Your Name'}</Text>
          <Text style={styles.heroEmail} numberOfLines={1} ellipsizeMode="middle">{email}</Text>
        </View>

        {/* ── Quick cards ── */}
        <View style={styles.quickRow}>
          <TouchableOpacity activeOpacity={0.8} style={[styles.quickCard, { flex: 1 }]}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setSettingsPage('subscription'); setSettingsModal(true); }}>
            <View style={styles.quickIconWrap}>
              <Ionicons name="diamond-outline" size={20} color={colors.purple} />
            </View>
            <View style={styles.quickTexts}>
              <Text style={styles.quickVal}>{isPremium ? 'Premium' : 'Standard'}</Text>
              <Text style={styles.quickLbl}>Your plan</Text>
            </View>
          </TouchableOpacity>
          <View style={[styles.quickCard, { flex: 1 }]}>
            <View style={styles.quickIconWrap}>
              <Text style={{ fontSize: fontSize.lg }}>🔥</Text>
            </View>
            <View style={styles.quickTexts}>
              <Text style={styles.quickVal}>{streak} days</Text>
              <Text style={styles.quickLbl}>Current streak</Text>
            </View>
          </View>
        </View>

        {/* ── Customization ── */}
        <View style={styles.menuCard}>
          {[
            { icon: 'chatbubble-ellipses-outline', label: 'Help', color: colors.sky, value: '', onPress: () => Alert.alert('Help', 'Coming soon.') },
            { icon: 'person-outline', label: 'Personal Info', color: colors.lavender, value: `${profile.age ? profile.age + ' yrs' : '—'} · ${profile.weight ? formatWeight(parseFloat(profile.weight), unitSystem) : '—'}`, onPress: () => { setDraft(profile); setEditing(true); } },
            { icon: 'person-circle-outline', label: 'Account Details', color: colors.purple, value: email, onPress: () => { setSettingsPage('account'); setSettingsModal(true); } },
            { icon: 'restaurant-outline', label: 'Diet Plan', color: colors.green, value: selectedDiet, onPress: () => setDietModal(true) },
            { icon: 'flame-outline', label: 'Calorie & Activity Goals', color: colors.honey, value: `${fmt(calorieGoal)} kcal`, onPress: () => setTdeeModal(true) },
            { icon: 'leaf-outline', label: 'Dietary Preferences', color: colors.teal, value: (() => { const pref = selectedFoodPref === 'none' ? 'No food preferences' : selectedFoodPref; const allerg = selectedAllergies.length === 0 ? 'No allergies' : selectedAllergies.join(', '); return `${pref} · ${allerg}`; })(), onPress: () => setDietaryModal(true) },
            { icon: 'mail-outline', label: 'Inbox', color: colors.purple, value: '', badge: unreadCount, onPress: () => setMessagesOpen(true) },
          ].map(({ icon, label, color, value, badge, onPress }) => (
            <TouchableOpacity key={label} style={styles.menuRow} onPress={onPress}>
              <Ionicons name={icon as keyof typeof Ionicons.glyphMap} size={24} color={color} style={{ width: 32, textAlign: 'center' }} />
              <Text style={styles.menuLabel}>{label}</Text>
              {!!badge && badge > 0 && (
                <View style={styles.inboxBadge}>
                  <Text style={styles.inboxBadgeText}>{badge}</Text>
                </View>
              )}
              <Ionicons name="chevron-forward" size={16} color={colors.ink3} />
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Settings ── */}
        <View style={styles.menuCard}>
          {[
            { icon: 'fitness-outline', label: healthPlatformName(), color: colors.green, value: '', onPress: () => { setSettingsModal(true); setSettingsPage('health'); } },
            { icon: 'notifications-outline', label: 'Notification Settings', color: colors.purple, value: '', onPress: () => { setSettingsModal(true); setSettingsPage('notifications'); } },
            { icon: 'document-text-outline', label: 'Terms & Conditions', color: colors.ink2, value: '', onPress: () => Linking.openURL('https://www.dagnara.com/terms') },
            { icon: 'shield-checkmark-outline', label: 'Privacy Policy', color: colors.teal, value: '', onPress: () => Linking.openURL('https://www.dagnara.com/privacy') },
          ].map(({ icon, label, color, value, onPress }) => (
            <TouchableOpacity key={label} style={styles.menuRow} onPress={onPress}>
              <Ionicons name={icon as keyof typeof Ionicons.glyphMap} size={24} color={color} style={{ width: 32, textAlign: 'center' }} />
              <Text style={styles.menuLabel}>{label}</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.ink3} />
            </TouchableOpacity>
          ))}
        </View>

        {/* ── About & Account ── */}
        <View style={styles.menuCard}>
          <TouchableOpacity style={styles.menuRow} onPress={() => { setSettingsPage('about'); setSettingsModal(true); }}>
            <Ionicons name="information-circle-outline" size={24} color={colors.ink2} style={{ width: 32, textAlign: 'center' }} />
            <Text style={styles.menuLabel}>About Us</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.ink3} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.menuRow} onPress={handleLogout}>
            <Ionicons name="log-out-outline" size={24} color={colors.rose} style={{ width: 32, textAlign: 'center' }} />
            <Text style={[styles.menuLabel, { color: colors.rose }]}>Log out</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.ink3} />
          </TouchableOpacity>
        </View>

        <Text style={styles.footer}>Version 1.0.0 · Dagnara</Text>

        <View style={{ height: 40 }} />
      </Animated.ScrollView>

      {/* ── Measurements Modal ── */}
      <Modal visible={measureModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setMeasureModal(false)}>
        <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
          <FloatingModalHeader scrollY={measureScrollY} title="Body Measurements" onBack={() => setMeasureModal(false)} action={{ label: 'Save', onPress: handleSaveMeasurements }} />
          <Animated.ScrollView
            contentContainerStyle={[styles.modalScroll, { paddingTop: spacing.xl + spacing.xl }]}
            keyboardShouldPersistTaps="handled"
            automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
            showsVerticalScrollIndicator={false}
            scrollEventThrottle={16}
            onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: measureScrollY } } }], { useNativeDriver: true })}
          >
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
                  <Text style={[styles.bmiNum, { color: bmiColor }]}>{bmi ? fmt(bmi, 1) : '--'}</Text>
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
              { key: 'height', label: 'Height', unit: heightUnit(unitSystem),  keyboard: (unitSystem === 'Metric' ? 'decimal-pad' : 'default') as 'decimal-pad' | 'default' },
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
          </Animated.ScrollView>
        </SafeAreaView>
      </Modal>

      {/* ── Diet Plan Modal ── */}
      <Modal visible={dietModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setDietModal(false)}>
        <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
          <FloatingModalHeader scrollY={dietScrollY} title="Diet Plan" staticTitle onBack={() => setDietModal(false)} action={{ label: 'Save', onPress: () => {
            void AsyncStorage.setItem(`${p}_diet_plan`, selectedDiet);
            // The diet plan IS the dietary preference macrosFor reads. Persist it to
            // the store and re-derive the macro split so picking e.g. Keto here
            // actually reshapes macros (it was previously cosmetic-only). 'Balanced'
            // and 'Mediterranean' carry no macro override → treat as no preference.
            const pref = selectedDiet === 'Balanced' || selectedDiet === 'Mediterranean' ? null : selectedDiet;
            void setDietaryPreferences(pref);
            const weight = parseFloat(profile.weight ?? '70') || 70;
            void setMacroPcts(macrosFor(weightGoal, pref, weight, calorieGoal));
            setDietModal(false);
          } }} />
          <Animated.ScrollView
            contentContainerStyle={{ padding: spacing.md, paddingTop: spacing.xl + spacing.xl, gap: spacing.sm }}
            showsVerticalScrollIndicator={false}
            scrollEventThrottle={16}
            onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: dietScrollY } } }], { useNativeDriver: true })}
          >
            {DIET_PLANS.map((plan) => (
              <TouchableOpacity key={plan} style={[styles.dietOption, selectedDiet === plan && styles.dietOptionSel]} onPress={() => setSelectedDiet(plan)}>
                <Text style={[styles.dietOptionTxt, selectedDiet === plan && { color: colors.lavender }]}>{plan}</Text>
                {selectedDiet === plan && <Ionicons name="checkmark" size={18} color={colors.lavender} />}
              </TouchableOpacity>
            ))}
          </Animated.ScrollView>
        </SafeAreaView>
      </Modal>

      {/* ── Settings Modal ── */}
      <Modal visible={settingsModal} animationType="slide" presentationStyle="pageSheet" onDismiss={() => setSettingsPage('')} onRequestClose={() => { setSettingsPage(''); setSettingsModal(false); }}>
        <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
          <FloatingModalHeader
            scrollY={settingsScrollY}
            title={settingsPage === 'about' ? 'About Us' : settingsPage === 'account' ? 'Account Details' : settingsPage === 'unitSystem' ? 'Unit System' : settingsPage === 'country' ? 'Country' : settingsPage === 'language' ? 'Language' : settingsPage === 'notifications' ? 'Notification Settings' : settingsPage === 'subscription' ? 'Plans' : settingsPage === 'health' ? healthPlatformName() : 'Settings'}
            onBack={() => { if (settingsPage === 'unitSystem' || settingsPage === 'country' || settingsPage === 'language') { setSettingsPage('account'); } else { setSettingsPage(''); setSettingsModal(false); } }}
            staticTitle={settingsPage === 'notifications' || settingsPage === 'account' || settingsPage === 'health' || settingsPage === 'about'}
            action={
              settingsPage === 'account'
                ? { label: 'Save', onPress: async () => { await handleSaveAccount(); setSettingsPage(''); setSettingsModal(false); } }
                : settingsPage === 'notifications'
                ? { label: 'Save', onPress: () => { setSettingsPage(''); setSettingsModal(false); } }
                : settingsPage === 'health'
                ? { label: 'Save', onPress: async () => { if (healthConnected) await handleHealthSync(); setSettingsPage(''); setSettingsModal(false); } }
                : undefined
            }
          />

          <Animated.ScrollView
            style={{ flex: 1 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
            scrollEventThrottle={16}
            contentContainerStyle={{ paddingTop: spacing.xl + spacing.xl }}
            onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: settingsScrollY } } }], { useNativeDriver: true })}
          >
            {settingsPage === 'account' && (
              <View style={{ padding: spacing.md, gap: spacing.md }}>
                <Text style={{ color: colors.ink3, fontSize: fontSize.xs, fontWeight: '700', letterSpacing: 1 }}>PREFERENCES</Text>
                {[
                  { label: 'Unit System', value: unitSystem, icon: 'scale-outline', color: colors.sky, page: 'unitSystem' as const },
                  { label: 'Country', value: `${getCountry(country).flag}  ${getCountry(country).name}`, icon: 'globe-outline', color: colors.honey, page: 'country' as const },
                  { label: 'Language', value: language, icon: 'language-outline', color: colors.green, page: 'language' as const },
                ].map(({ label, value, icon, color, page }) => (
                  <TouchableOpacity key={label} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setSettingsPage(page); }}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, backgroundColor: colors.layer2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line2 }}>
                    <Ionicons name={icon as keyof typeof Ionicons.glyphMap} size={22} color={color} style={{ width: 28, textAlign: 'center' }} />
                    <Text style={{ color: colors.ink, fontSize: fontSize.base, fontWeight: '600', flex: 1 }}>{label}</Text>
                    <Text style={{ color: colors.ink3, fontSize: fontSize.sm }} numberOfLines={1}>{value}</Text>
                    <Ionicons name="chevron-forward" size={16} color={colors.ink3} />
                  </TouchableOpacity>
                ))}
                <TouchableOpacity onPress={handleDeleteAccount}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, backgroundColor: colors.layer2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.rose }}>
                  <Text style={{ fontSize: fontSize.xl, width: 28, textAlign: 'center' }}>💔</Text>
                  <Text style={{ color: colors.rose, fontSize: fontSize.base, fontWeight: '700', flex: 1 }}>Delete Account</Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.ink3} />
                </TouchableOpacity>
              </View>
            )}

            {settingsPage === 'unitSystem' && (
              <View style={{ padding: spacing.md }}>
                <Text style={{ color: colors.ink3, fontSize: fontSize.xs, fontWeight: '700', letterSpacing: 1, marginBottom: spacing.md }}>SELECT UNIT SYSTEM</Text>
                {[
                  { name: 'Metric',        subtitle: 'kg · cm · ml · °C' },
                  { name: 'Imperial (US)', subtitle: 'lb · ft/in · fl oz · °F' },
                  { name: 'UK',            subtitle: 'st/lb · ft/in · ml · °C' },
                  { name: 'US Customary',  subtitle: 'lb · in · cup · °F' },
                ].map(({ name, subtitle }) => (
                  <TouchableOpacity key={name} onPress={async () => {
                    setUnitSystem(name as UnitSystem);
                    setSettingsPage(''); setSettingsModal(false);
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  }}
                    style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.md, backgroundColor: colors.layer2, borderRadius: radius.md, marginBottom: spacing.sm, borderWidth: 1.5, borderColor: unitSystem === name ? colors.lavender : colors.line2 }}>
                    <View>
                      <Text style={{ color: unitSystem === name ? colors.lavender : colors.ink, fontWeight: '600', fontSize: fontSize.base }}>{name}</Text>
                      <Text style={{ color: colors.ink3, fontSize: fontSize.xs, marginTop: 2 }}>{subtitle}</Text>
                    </View>
                    {unitSystem === name && <Ionicons name="checkmark-circle" size={22} color={colors.lavender} />}
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {settingsPage === 'country' && (
              <View style={{ padding: spacing.md }}>
                 <Text style={{ color: colors.ink3, fontSize: fontSize.xs, fontWeight: '700', letterSpacing: 1, marginBottom: spacing.md }}>SELECT COUNTRY</Text>
                 {COUNTRIES.map(c => (
                   <TouchableOpacity key={c.code} onPress={() => { setCountry(c.code); setSettingsPage(''); setSettingsModal(false); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                     style={{ flexDirection: 'row', alignItems: 'center', padding: spacing.md, backgroundColor: colors.layer2, borderRadius: radius.md, marginBottom: spacing.sm, borderWidth: 1.5, borderColor: country === c.code ? colors.lavender : colors.line2 }}>
                     <Text style={{ fontSize: fontSize.lg, marginRight: spacing.sm }}>{c.flag}</Text>
                     <Text style={{ color: country === c.code ? colors.lavender : colors.ink, fontSize: fontSize.base, fontWeight: '600' }}>{c.name}</Text>
                   </TouchableOpacity>
                 ))}
              </View>
            )}

            {settingsPage === 'health' && (
              <View style={{ padding: spacing.md, gap: spacing.md }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, backgroundColor: colors.layer2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line2 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.ink, fontWeight: '700', marginBottom: 2 }}>{healthPlatformName()}</Text>
                    <Text style={{ color: healthConnected ? colors.green : colors.ink3, fontSize: fontSize.sm }}>{healthConnected ? 'Connected' : 'Not connected'}</Text>
                    {healthSyncing
                      ? <Text style={{ color: colors.purple2, fontSize: fontSize.xs, marginTop: 2 }}>Syncing…</Text>
                      : healthLastSync ? <Text style={{ color: colors.ink3, fontSize: fontSize.xs, marginTop: 2 }}>Last sync {healthLastSync}</Text> : null}
                  </View>
                  {!healthConnected && (
                    <TouchableOpacity onPress={handleHealthConnect} style={{ borderRadius: radius.md, overflow: 'hidden' }}>
                      <LinearGradient colors={[colors.purple, colors.purpleGlow]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ paddingHorizontal: spacing.md, paddingVertical: spacing.sm }}>
                        <Text style={{ color: colors.white, fontWeight: '700', fontSize: fontSize.sm }}>Connect</Text>
                      </LinearGradient>
                    </TouchableOpacity>
                  )}
                </View>

                {!isHealthAvailable() && (
                  <Text style={{ color: colors.ink3, fontSize: fontSize.xs }}>{healthPlatformName()} is not available on this device.</Text>
                )}

                <View style={sst.card}>
                  {([
                    { key: 'steps',     icon: '👟', label: 'Sync steps',          value: healthSyncSteps,    set: setHealthSyncSteps,    storeKey: `${p}_health_steps` },
                    { key: 'calories',  icon: '🔥', label: 'Sync calories burned', value: healthSyncCalories, set: setHealthSyncCalories, storeKey: `${p}_health_calories` },
                    { key: 'sleep',     icon: '😴', label: 'Sync sleep',          value: healthSyncSleep,    set: setHealthSyncSleep,    storeKey: `${p}_health_sleep` },
                  ] as const).map(({ key, icon, label, value, set, storeKey }, i, arr) => (
                    <View key={key} style={[sst.row, i === arr.length - 1 && { borderBottomWidth: 0 }]}>
                      <Text style={{ width: 28, textAlign: 'center', fontSize: fontSize.lg }}>{icon}</Text>
                      <Text style={[sst.label, { flex: 1 }]}>{label}</Text>
                      <Switch value={value} onValueChange={(v) => { set(v); void AsyncStorage.setItem(storeKey, String(v)); }}
                        trackColor={{ false: colors.layer3, true: colors.purple + '88' }}
                        thumbColor={value ? colors.purple : colors.ink3}
                        style={{ transform: [{ scaleX: 0.85 }, { scaleY: 0.85 }] }} />
                    </View>
                  ))}
                </View>
              </View>
            )}

            {settingsPage === 'notifications' && (
              <View style={{ padding: spacing.md }}>
                <View style={sst.card}>
                  {[
                    { icon: '🔔', label: 'Daily check-in reminder', value: notifCheckIn,
                      onToggle: async (v: boolean) => { if (v) { const ok = await requestNotificationPermission(); if (!ok) { Alert.alert('Permission required', 'Enable notifications in settings.'); return; } } setNotifCheckIn(v); AsyncStorage.setItem(`${p}_notif_checkin`, String(v)); scheduleWaterReminder(v); } },
                    { icon: '🥗', label: 'Meal reminders', value: notifMeals,
                      onToggle: async (v: boolean) => { if (v) { const ok = await requestNotificationPermission(); if (!ok) { Alert.alert('Permission required', 'Enable notifications in settings.'); return; } } setNotifMeals(v); AsyncStorage.setItem(`${p}_notif_meals`, String(v)); scheduleMealReminders(v); } },
                    { icon: '🔥', label: 'Streak protection', value: notifStreak,
                      onToggle: async (v: boolean) => { if (v) { const ok = await requestNotificationPermission(); if (!ok) { Alert.alert('Permission required', 'Enable notifications in settings.'); return; } } setNotifStreak(v); AsyncStorage.setItem(`${p}_notif_streak`, String(v)); scheduleStreakReminder(v); } },
                  ].map(({ icon, label, value, onToggle }, i, arr) => (
                    <TouchableOpacity key={label} style={[sst.row, i === arr.length - 1 && { borderBottomWidth: 0 }]}
                      activeOpacity={0.7} onPress={() => onToggle(!value)}>
                      <Text style={{ width: 28, textAlign: 'center', fontSize: fontSize.lg }}>{icon}</Text>
                      <Text style={[sst.label, { flex: 1 }]}>{label}</Text>
                      <View style={[dp.toggle, value && dp.toggleOn]}>
                        <View style={[dp.toggleThumb, value && { transform: [{ translateX: 22 }] }]} />
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {settingsPage === 'language' && (
              <View style={{ padding: spacing.md }}>
                <Text style={{ color: colors.ink3, fontSize: fontSize.xs, fontWeight: '700', letterSpacing: 1, marginBottom: spacing.md }}>SELECT LANGUAGE</Text>
                {['English'].map((lang) => (
                  <TouchableOpacity key={lang} onPress={() => { setLanguage(lang); AsyncStorage.setItem(`${p}_language`, lang); setSettingsPage(''); setSettingsModal(false); }}
                    style={{ flexDirection: 'row', alignItems: 'center', padding: spacing.md, backgroundColor: colors.layer2, borderRadius: radius.md, borderWidth: 1.5, borderColor: language === lang ? colors.lavender : colors.line2, marginBottom: spacing.sm }}>
                    <Text style={{ color: language === lang ? colors.lavender : colors.ink, fontWeight: '600', flex: 1 }}>{lang}</Text>
                    {language === lang && <Ionicons name="checkmark-circle" size={22} color={colors.lavender} />}
                  </TouchableOpacity>
                ))}
                <Text style={{ color: colors.ink3, fontSize: fontSize.xs, marginTop: spacing.xs, textAlign: 'center' }}>More languages coming soon.</Text>
              </View>
            )}

            {settingsPage === 'subscription' && (
              <View style={{ padding: spacing.md, gap: spacing.md }}>
                {/* Standard / Premium preview selector — tapping a tab only
                    changes which plan is *previewed* below; it does NOT switch
                    the active plan. The button at the bottom commits a switch. */}
                <View style={subst.selector}>
                  {([
                    { key: false, label: 'Standard' },
                    { key: true, label: 'Premium' },
                  ] as const).map((opt) => {
                    const active = previewTier === opt.key;
                    return (
                      <TouchableOpacity key={opt.label} activeOpacity={0.85} style={subst.selectorBtn}
                        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setPreviewTier(opt.key); }}>
                        {active && <LinearGradient colors={[colors.purple, colors.purpleGlow]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFillObject} />}
                        <Text style={[subst.selectorTxt, active && subst.selectorTxtActive]}>{opt.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Previewed plan hero — reflects the selected tab, with a chip
                    marking whichever tier is the user's current active plan. */}
                <View style={subst.proHero}>
                  <LinearGradient colors={['rgba(124,77,255,0.22)', 'transparent']} style={StyleSheet.absoluteFillObject} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} pointerEvents="none" />
                  <View style={subst.proBadge}>
                    <Ionicons name={previewTier ? 'diamond' : 'person'} size={28} color={previewTier ? colors.lavender : colors.ink2} />
                  </View>
                  <Text style={subst.proTitle}>{previewTier ? 'Premium' : 'Standard'}</Text>
                  {previewTier === isPremium ? (
                    <View style={subst.proFreePill}>
                      <Text style={subst.proFreePillTxt}>{isPremium ? 'YOUR PLAN · FREE DURING LAUNCH 🎉' : 'YOUR CURRENT PLAN'}</Text>
                    </View>
                  ) : previewTier ? (
                    <View style={subst.proFreePill}>
                      <Text style={subst.proFreePillTxt}>FREE DURING LAUNCH 🎉</Text>
                    </View>
                  ) : null}
                  <Text style={subst.proSub}>
                    {previewTier
                      ? 'Full access to every insight — on the house while we launch.'
                      : 'Everything you need to track daily. Switch to Premium for deeper analytics.'}
                  </Text>
                </View>

                {/* Feature list — shows what the *previewed* tier gives, not a
                    fixed Premium upsell. Standard lists its own included
                    features; Premium lists what it unlocks on top. Both shown
                    as checkmarks since they describe what that plan provides. */}
                <View style={[subst.planCard, previewTier && subst.planCardActive]}>
                  <Text style={subst.featHeading}>{previewTier ? 'What Premium unlocks' : 'What Standard gives you'}</Text>
                  {(previewTier
                    ? [
                        { icon: 'analytics-outline', t: 'Lifestyle Breakdown', d: 'Per-pillar scores for nutrition, sleep, activity & hydration' },
                        { icon: 'calendar-outline', t: 'Full progress history', d: 'See every day, not just the last 7' },
                        { icon: 'bulb-outline', t: 'AI Insights', d: 'Personalised guidance from your own data' },
                        { icon: 'stats-chart-outline', t: 'Advanced Stats', d: 'Trends, averages and deeper charts' },
                      ]
                    : [
                        { icon: 'restaurant-outline', t: 'Food & calorie diary', d: 'Log meals, macros and water every day' },
                        { icon: 'camera-outline', t: 'AI food photo scan', d: 'Snap a meal to estimate its nutrition' },
                        { icon: 'flame-outline', t: 'Goals & streaks', d: 'Calorie targets, weight tracking and daily streaks' },
                        { icon: 'bar-chart-outline', t: 'Last 7 days', d: 'Recent calorie and progress charts' },
                      ]
                  ).map((f) => (
                    <View key={f.t} style={subst.featCard}>
                      <View style={subst.featIcon}>
                        <Ionicons name={f.icon as keyof typeof Ionicons.glyphMap} size={20} color={previewTier ? colors.lavender : colors.ink2} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={subst.featTitle}>{f.t}</Text>
                        <Text style={subst.featDesc}>{f.d}</Text>
                      </View>
                      <Ionicons name="checkmark-circle" size={20} color={previewTier ? colors.lavender : colors.green} />
                    </View>
                  ))}
                </View>

                {/* Action — the ONLY control that actually switches plans. When
                    the previewed tier is already the active plan, it's a disabled
                    "Current plan" marker instead. */}
                {previewTier === isPremium ? (
                  <View style={[subst.secondaryBtn, subst.currentPlanBtn]}>
                    <Ionicons name="checkmark-circle" size={18} color={colors.green} />
                    <Text style={subst.currentPlanTxt}>Your current plan</Text>
                  </View>
                ) : previewTier ? (
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); setPremium(true); }}
                    style={{ borderRadius: radius.md, overflow: 'hidden', shadowColor: colors.purple, shadowOpacity: 0.4, shadowRadius: 14, shadowOffset: { width: 0, height: 6 } }}>
                    <LinearGradient colors={[colors.purple, colors.purpleGlow]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={subst.primaryBtn}>
                      <Ionicons name="diamond" size={18} color={colors.white} />
                      <Text style={subst.primaryBtnTxt}>Upgrade to Premium — Free</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setPremium(false); }}
                    style={subst.secondaryBtn}>
                    <Text style={subst.secondaryBtnTxt}>Switch to Standard</Text>
                  </TouchableOpacity>
                )}
                <Text style={subst.legal}>Premium is free for everyone during launch. Paid plans may arrive later — you’ll always be told before anything changes.</Text>
              </View>
            )}

            {settingsPage === 'about' && (
              <View style={{ padding: spacing.md }}>
                {/* Rate Us - Separate Card */}
                <View style={[sst.card, { marginBottom: spacing.md }]}>
                  <TouchableOpacity style={[sst.row, { borderBottomWidth: 0 }]} onPress={() => Alert.alert('Rate Us', 'Opening App Store...')}>
                    <Ionicons name="star" size={20} color={colors.honey} style={{ width: 28, textAlign: 'center' }} />
                    <Text style={sst.label}>Rate us on the App Store</Text>
                    <Ionicons name="chevron-forward" size={14} color={colors.ink3} />
                  </TouchableOpacity>
                </View>

                {/* Social Links - Grouped Card */}
                <View style={sst.card}>
                  {[
                    { icon: 'logo-x', label: 'Follow us on X', color: colors.ink, onPress: () => Alert.alert('Follow Us', 'Opening X...') },
                    { icon: 'logo-facebook', label: 'Like us on Facebook', color: colors.sky, onPress: () => Alert.alert('Facebook', 'Opening Facebook...') },
                    { icon: 'logo-instagram', label: 'Watch our stories on Instagram', color: colors.rose, onPress: () => Alert.alert('Instagram', 'Opening Instagram...') },
                    { icon: 'logo-tiktok', label: 'Keep up with us on TikTok', color: colors.teal, onPress: () => Alert.alert('TikTok', 'Opening TikTok...') },
                  ].map(({ icon, label, color, onPress }, i, arr) => (
                    <TouchableOpacity key={label} style={[sst.row, i === arr.length - 1 && { borderBottomWidth: 0 }]} onPress={onPress}>
                      <Ionicons name={icon as keyof typeof Ionicons.glyphMap} size={20} color={color} style={{ width: 28, textAlign: 'center' }} />
                      <Text style={sst.label}>{label}</Text>
                      <Ionicons name="chevron-forward" size={14} color={colors.ink3} />
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {/* If we end up with an empty page somehow, show nothing or return */}
            {settingsPage === '' && <View style={{ padding: spacing.xl, alignItems: 'center' }}><Text style={{ color: colors.ink3 }}>Select a setting to edit.</Text></View>}
          </Animated.ScrollView>
        </SafeAreaView>
      </Modal>

      {/* ── Dietary Preferences Modal ── */}
      <Modal visible={dietaryModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setDietaryModal(false)}>
        <SafeAreaView style={dp.safe} edges={['top', 'bottom']}>
          <FloatingModalHeader scrollY={dietaryScrollY} title="Food Preferences" staticTitle onBack={() => setDietaryModal(false)} action={{ label: 'Save', onPress: () => {
            AsyncStorage.multiSet([
              [`${p}_diet_plan`, selectedDiet],
              [`${p}_food_pref`, selectedFoodPref],
              [`${p}_allergies`, JSON.stringify(selectedAllergies)],
            ]);
            setDietaryModal(false);
          } }} />
          <Animated.ScrollView
            contentContainerStyle={[dp.scroll, { paddingTop: spacing.xl + spacing.xl }]}
            showsVerticalScrollIndicator={false}
            scrollEventThrottle={16}
            onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: dietaryScrollY } } }], { useNativeDriver: true })}
          >
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
              ].map(({ key, label }) => {
                const isOn = selectedFoodPref === key;
                return (
                  <TouchableOpacity key={key} style={dp.prefRow}
                    onPress={() => setSelectedFoodPref(key)}>
                    <Text style={dp.prefLabel}>{label}</Text>
                    <View style={[dp.toggle, isOn && dp.toggleOn]}>
                      <View style={[dp.toggleThumb, isOn && { transform: [{ translateX: 22 }] }]} />
                    </View>
                  </TouchableOpacity>
                );
              })}
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
              ].map(({ key, label }) => {
                const isOn = key === 'none' ? selectedAllergies.length === 0 : selectedAllergies.includes(key);
                return (
                  <TouchableOpacity key={key} style={dp.prefRow}
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
          </Animated.ScrollView>
        </SafeAreaView>
      </Modal>

      {/* ── TDEE Modal ── */}
      <Modal visible={tdeeModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setTdeeModal(false)}>
        <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
          <FloatingModalHeader scrollY={tdeeScrollY} title="Calorie & Goals" staticTitle onBack={() => setTdeeModal(false)} action={{ label: 'Save', onPress: () => {
            const age = parseInt(profile.age ?? '25', 10) || 25;
            const weight = parseFloat(profile.weight ?? '70') || 70;
            const height = parseFloat(profile.height ?? '170') || 170;
            const cal = calcTDEE(age, weight, height, sex, localActivity, localGoal);
            setGoals(localActivity, localGoal, cal);
            // Re-derive the macro split — changing the goal should reshape macros too.
            setMacroPcts(macrosFor(localGoal, dietaryPreferences, weight, cal));
            setProfile({ ...profile, sex });
            setTdeeModal(false);
          } }} />
          <Animated.ScrollView
            contentContainerStyle={[styles.modalScroll, { paddingTop: spacing.xl + spacing.xl }]}
            showsVerticalScrollIndicator={false}
            scrollEventThrottle={16}
            onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: tdeeScrollY } } }], { useNativeDriver: true })}
          >
            {/* Activity Level */}
            <Text style={[styles.inputLabel, { marginBottom: 4 }]}>Activity Level</Text>
            <View style={{ gap: spacing.xs, marginBottom: spacing.xs }}>
              {([
                { key: 'sedentary', label: 'Sedentary', desc: 'Little or no exercise' },
                { key: 'light', label: 'Lightly Active', desc: '1–3 days/week' },
                { key: 'moderate', label: 'Moderately Active', desc: '3–5 days/week' },
                { key: 'active', label: 'Very Active', desc: '6–7 days/week' },
                { key: 'very_active', label: 'Extra Active', desc: 'Physical job or 2x/day' },
              ] as const).map(({ key, label, desc }) => (
                <TouchableOpacity key={key} onPress={() => setLocalActivity(key)}
                  style={{ padding: spacing.sm, borderRadius: radius.sm + 2, borderWidth: 1.5, flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
                    borderColor: localActivity === key ? colors.lavender : colors.line2,
                    backgroundColor: localActivity === key ? colors.purple + '22' : colors.layer2 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: localActivity === key ? colors.lavender : colors.ink, fontWeight: '600', fontSize: fontSize.sm + 1 }}>{label}</Text>
                    <Text style={{ color: colors.ink3, fontSize: fontSize.xs }}>{desc}</Text>
                  </View>
                  {localActivity === key && <Ionicons name="checkmark-circle" size={20} color={colors.lavender} />}
                </TouchableOpacity>
              ))}
            </View>

            {/* Weight Goal */}
            <Text style={[styles.inputLabel, { marginBottom: 4 }]}>Weight Goal</Text>
            <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.xs }}>
              {([
                { key: 'lose', label: 'Lose', emoji: '📉' },
                { key: 'maintain', label: 'Maintain', emoji: '⚖️' },
                { key: 'gain', label: 'Gain', emoji: '📈' },
              ] as const).map(({ key, label, emoji }) => (
                <TouchableOpacity key={key} onPress={() => setLocalGoal(key)}
                  style={{ flex: 1, padding: spacing.sm, borderRadius: radius.sm + 2, borderWidth: 1.5, alignItems: 'center',
                    borderColor: localGoal === key ? colors.lavender : colors.line2,
                    backgroundColor: localGoal === key ? colors.purple + '22' : colors.layer2 }}>
                  <Text style={{ fontSize: fontSize.lg }}>{emoji}</Text>
                  <Text style={{ color: localGoal === key ? colors.lavender : colors.ink2, marginTop: 4, fontWeight: '600', fontSize: fontSize.sm }}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Calculated result */}
            {(() => {
              const age = parseInt(profile.age ?? '25', 10) || 25;
              const weight = parseFloat(profile.weight ?? '70') || 70;
              const height = parseFloat(profile.height ?? '170') || 170;
              const cal = calcTDEE(age, weight, height, sex, localActivity, localGoal);
              return (
                <View style={{ backgroundColor: colors.layer2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line2, padding: spacing.md, alignItems: 'center', gap: 4 }}>
                  <Text style={{ color: colors.ink3, fontSize: fontSize.xs, textTransform: 'uppercase', letterSpacing: 1 }}>Recommended Daily Calories</Text>
                  <Text style={{ color: colors.lavender, fontSize: fontSize['2xl'] - 2, fontWeight: '800' }}>{fmt(cal)}</Text>
                  <Text style={{ color: colors.ink2, fontSize: fontSize.sm }}>kcal / day</Text>
                </View>
              );
            })()}
          </Animated.ScrollView>
        </SafeAreaView>
      </Modal>

      {/* ── Edit Profile Modal (Revolut-style "Your profile") ── */}
      <Modal visible={editing} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setEditing(false)}>
        <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
          <FloatingModalHeader scrollY={editScrollY} title="Personal Info" onBack={() => setEditing(false)} action={{ label: 'Save', onPress: handleSave }} />

          <Animated.ScrollView
            contentContainerStyle={pf.scroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
            scrollEventThrottle={16}
            onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: editScrollY } } }], { useNativeDriver: true })}
          >
            {/* Title + avatar */}
            <View style={pf.titleRow}>
              <Text style={pf.bigTitle}>Personal Info</Text>
              <TouchableOpacity style={pf.avatarWrap} onPress={handlePickPhoto} activeOpacity={0.85}>
                {profile.photoUri
                  ? <Image source={{ uri: profile.photoUri }} style={pf.avatarImg} />
                  : <View style={pf.avatar}><Text style={pf.avatarText}>{initials}</Text></View>}
                <View style={pf.avatarCam}>
                  <Ionicons name="camera" size={13} color={colors.white} />
                </View>
              </TouchableOpacity>
            </View>

            <Text style={pf.sectionLbl}>PERSONAL</Text>
            <View style={pf.card}>
              {/* Name */}
              <View style={pf.field}>
                <View style={pf.fieldBody}>
                  <Text style={pf.label}>Name</Text>
                  <TextInput
                    ref={firstNameRef}
                    style={pf.input}
                    value={editFirstName}
                    onChangeText={(t) => setEditFirstName(sanitizeNameInput(t))}
                    placeholder="First name"
                    placeholderTextColor={colors.ink3}
                    autoCapitalize="words"
                    autoCorrect={false}
                    autoComplete="name-given"
                    textContentType="givenName"
                    maxLength={40}
                    returnKeyType="next"
                    blurOnSubmit={false}
                    onSubmitEditing={() => lastNameRef.current?.focus()}
                  />
                </View>
                <TouchableOpacity style={pf.pencil} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); firstNameRef.current?.focus(); }}>
                  <Ionicons name="pencil" size={16} color={colors.lavender} />
                </TouchableOpacity>
              </View>
              {/* Surname */}
              <View style={pf.field}>
                <View style={pf.fieldBody}>
                  <Text style={pf.label}>Surname</Text>
                  <TextInput
                    ref={lastNameRef}
                    style={pf.input}
                    value={editLastName}
                    onChangeText={(t) => setEditLastName(sanitizeNameInput(t))}
                    placeholder="Last name"
                    placeholderTextColor={colors.ink3}
                    autoCapitalize="words"
                    autoCorrect={false}
                    autoComplete="name-family"
                    textContentType="familyName"
                    maxLength={40}
                    returnKeyType="done"
                    onSubmitEditing={() => Keyboard.dismiss()}
                  />
                </View>
                <TouchableOpacity style={pf.pencil} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); lastNameRef.current?.focus(); }}>
                  <Ionicons name="pencil" size={16} color={colors.lavender} />
                </TouchableOpacity>
              </View>
              {/* Date of birth */}
              <TouchableOpacity style={pf.field} activeOpacity={0.7}
                onPress={() => { Keyboard.dismiss(); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setDobPickerOpen(true); }}>
                <View style={pf.fieldBody}>
                  <Text style={pf.label}>Date of birth</Text>
                  <Text style={[pf.value, !editDob && { color: colors.ink3 }]}>{formatDob(editDob)}</Text>
                </View>
                <View style={pf.pencil}>
                  <Ionicons name="pencil" size={16} color={colors.lavender} />
                </View>
              </TouchableOpacity>
              {/* Email (read-only) */}
              <View style={pf.field}>
                <View style={pf.fieldBody}>
                  <Text style={pf.label}>Email</Text>
                  <Text style={[pf.value, { color: colors.ink2 }]} numberOfLines={1}>{email}</Text>
                </View>
                <View style={pf.lockWrap}>
                  <Ionicons name="lock-closed" size={14} color={colors.ink3} />
                </View>
              </View>
              {/* Biological sex — two icon toggles under email */}
              <View style={[pf.field, { flexDirection: 'column', alignItems: 'stretch' }]}>
                <Text style={[pf.label, { marginBottom: spacing.sm }]}>Biological sex</Text>
                <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                  {(['male', 'female'] as const).map((s) => (
                    <TouchableOpacity key={s} activeOpacity={0.85}
                      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setSex(s); }}
                      style={{ flex: 1, padding: spacing.sm, borderRadius: radius.sm + 2, borderWidth: 1.5, alignItems: 'center',
                        borderColor: sex === s ? colors.lavender : colors.line2,
                        backgroundColor: sex === s ? colors.purple + '22' : colors.layer2 }}>
                      <Ionicons name={s === 'male' ? 'male' : 'female'} size={24} color={s === 'male' ? colors.sky : colors.rose} />
                      <Text style={{ color: sex === s ? colors.lavender : colors.ink2, marginTop: 4, fontWeight: '600', fontSize: fontSize.sm, textTransform: 'capitalize' }}>{s}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </View>

            <Text style={[pf.sectionLbl, { marginTop: spacing.lg }]}>BODY MEASUREMENTS</Text>
            {(() => {
              // Live input is in display units (lb/stone, ft'in") — parse to metric
              // before BMI, falling back to the stored metric measurements/profile.
              const w = parseWeight(measureInputs.weight, unitSystem)
                ?? parseFloat(measurements.weight || String(profile.weight ?? ''));
              const h = parseHeight(measureInputs.height, unitSystem)
                ?? parseFloat(measurements.height || String(profile.height ?? ''));
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
                  <Text style={[styles.bmiNum, { color: bmiColor }]}>{bmi ? fmt(bmi, 1) : '--'}</Text>
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
            <View style={pf.card}>
              {([
                { key: 'weight', label: 'Weight', unit: weightUnit(unitSystem), keyboard: 'decimal-pad' as const },
                { key: 'height', label: 'Height', unit: heightUnit(unitSystem), keyboard: (unitSystem === 'Metric' ? 'decimal-pad' : 'default') as 'decimal-pad' | 'default' },
                { key: 'waist',  label: 'Waist',  unit: lengthUnit(unitSystem), keyboard: 'decimal-pad' as const },
                { key: 'chest',  label: 'Chest',  unit: lengthUnit(unitSystem), keyboard: 'decimal-pad' as const },
                { key: 'hips',   label: 'Hips',   unit: lengthUnit(unitSystem), keyboard: 'decimal-pad' as const },
                { key: 'arms',   label: 'Arms',   unit: lengthUnit(unitSystem), keyboard: 'decimal-pad' as const },
              ]).map((f) => (
                <View style={pf.field} key={f.key}>
                  <View style={pf.fieldBody}>
                    <Text style={pf.label}>{f.label}</Text>
                    <View style={pf.measureLine}>
                      <TextInput
                        ref={(r) => { measureRefs.current[f.key] = r; }}
                        style={[pf.input, pf.measureInput]}
                        value={measureInputs[f.key] ?? ''}
                        onChangeText={(v) => setMeasureInputs((m) => ({ ...m, [f.key]: v }))}
                        placeholder="—"
                        placeholderTextColor={colors.ink3}
                        keyboardType={f.keyboard}
                        returnKeyType="done"
                        onSubmitEditing={() => Keyboard.dismiss()}
                      />
                      <Text style={pf.measureUnit}>{f.unit}</Text>
                    </View>
                  </View>
                  <TouchableOpacity style={pf.pencil} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); measureRefs.current[f.key]?.focus(); }}>
                    <Ionicons name="pencil" size={16} color={colors.lavender} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          </Animated.ScrollView>

          {/* ── Date of birth picker (nested inside the editor so iOS can present it) ── */}
          <DobPicker
            visible={dobPickerOpen}
            value={editDob}
            onClose={() => setDobPickerOpen(false)}
            onSelect={(iso) => { setEditDob(iso); setDobPickerOpen(false); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); }}
          />
        </SafeAreaView>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing.md, gap: spacing.lg, paddingBottom: spacing.xl + 4 },

  fixedHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    overflow: 'hidden',
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
    paddingBottom: spacing.lg,
    flex: 1,
  },
  headerNameText: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '700',
  },
  closeBtn: {
    width: spacing.xl + spacing.sm,
    height: spacing.xl + spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.layer2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.line2,
  },
  upgradeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    height: spacing.xl + spacing.sm,
    justifyContent: 'center',
  },
  upgradeTxt: { color: colors.white, fontSize: fontSize.sm, fontWeight: '700', letterSpacing: 0.4 },

  hero: { alignItems: 'center', gap: spacing.md - 2, paddingBottom: 2 },
  avatarWrap: { position: 'relative' },
  avatar: { width: 82, height: 82, borderRadius: radius.pill, backgroundColor: colors.purple, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.white, fontSize: fontSize.lg, fontWeight: '800' },
  avatarImg: { width: 82, height: 82, borderRadius: radius.pill },
  avatarAdd: { position: 'absolute', bottom: 2, right: 2, width: 28, height: 28, borderRadius: radius.pill, backgroundColor: colors.purple2, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: colors.bg },
  heroName: { color: colors.ink, fontSize: 32, fontWeight: '800', textAlign: 'center' },
  heroEmail: { color: colors.ink3, fontSize: 16, maxWidth: 280, textAlign: 'center', marginTop: 6, opacity: 0.7 },

  quickRow: { flexDirection: 'row', gap: 12 },
  quickCard: { backgroundColor: colors.layer1, borderRadius: radius.lg, padding: spacing.md, minHeight: 110, justifyContent: 'center', alignItems: 'flex-start', shadowColor: colors.purple, shadowOpacity: 0.1, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 4 },
  quickIconWrap: { width: 34, height: 34, borderRadius: radius.sm, backgroundColor: colors.purpleTint, alignItems: 'center', justifyContent: 'center' },
  quickTexts: { gap: 2, marginTop: 12 },
  quickVal: { fontSize: fontSize.md, fontWeight: '800', color: colors.ink },
  quickLbl: { fontSize: 12, color: colors.ink3, fontWeight: '600', opacity: 0.7 },


  menuCard: { backgroundColor: colors.layer1, borderRadius: radius.lg, overflow: 'hidden', shadowColor: colors.purple, shadowOpacity: 0.08, shadowRadius: 16, shadowOffset: { width: 0, height: 4 }, elevation: 4 },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm2, paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2 },
  menuLabel: { flex: 1, color: colors.ink, fontSize: fontSize.base, fontWeight: '600' },

  footer: { textAlign: 'center', color: colors.ink3, fontSize: 12, marginTop: 4, opacity: 0.4 },

  inboxBadge: { backgroundColor: colors.rose, borderRadius: radius.pill, minWidth: 20, height: 20, paddingHorizontal: spacing.xs, alignItems: 'center', justifyContent: 'center' },
  inboxBadgeText: { color: colors.white, fontSize: fontSize.xs, fontWeight: '800' },
  dietOption: { backgroundColor: colors.layer2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, padding: spacing.md, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dietOptionSel: { borderColor: colors.purple, backgroundColor: colors.purple + '11' },
  dietOptionTxt: { color: colors.ink, fontSize: fontSize.base, fontWeight: '500' },

  saveText: { color: colors.lavender, fontSize: fontSize.base, fontWeight: '700' },
  modalScroll: { padding: spacing.md, gap: spacing.sm },
  inputLabel: { color: colors.ink2, fontSize: fontSize.sm, marginBottom: spacing.xs },
  input: { backgroundColor: colors.layer2, borderWidth: 1, borderColor: colors.line2, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2, color: colors.ink, fontSize: fontSize.base },
  fieldRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.layer2, borderWidth: 1, borderColor: colors.line2, borderRadius: radius.md, paddingHorizontal: spacing.md },
  fieldIcon: { width: 26, textAlign: 'center' },
  fieldBody: { flex: 1, paddingVertical: spacing.xs },
  fieldLabel: { color: colors.ink3, fontSize: fontSize.xs, fontWeight: '700', letterSpacing: 0.5 },
  fieldInput: { color: colors.ink, fontSize: fontSize.base, paddingVertical: spacing.xs, paddingTop: 2 },
  bmiCard: { backgroundColor: colors.layer2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line2, padding: spacing.md, alignItems: 'center', gap: spacing.xs, marginBottom: spacing.xs + 2 },
  bmiSectionLbl: { fontSize: fontSize.xs, fontWeight: '700', letterSpacing: 1, color: colors.ink3, textTransform: 'uppercase' },
  bmiNum: { fontSize: fontSize['2xl'] + 10, fontWeight: '800', lineHeight: 52 },
  bmiLbl: { fontSize: fontSize.sm, color: colors.ink2, fontWeight: '500' },
  bmiScale: { flexDirection: 'row', height: 8, borderRadius: spacing.xs - 2, overflow: 'hidden', width: '100%', gap: 2, marginTop: 4 },
  bmiSeg: { flex: 1, height: '100%', borderRadius: spacing.xs / 3 },
  bmiScaleLbls: { flexDirection: 'row', justifyContent: 'space-between', width: '100%' },
  bmiScaleLbl: { fontSize: fontSize.xs, color: colors.ink3 },
  measureRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.layer2, borderWidth: 1, borderColor: colors.line2, borderRadius: radius.sm + 2, padding: spacing.sm + 2, marginBottom: 4 },
  measureLbl: { fontSize: fontSize.sm + 1, fontWeight: '500', color: colors.ink, flex: 1 },
  measureInput: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  measureField: { fontSize: fontSize.base, fontWeight: '700', color: colors.ink, minWidth: 60, textAlign: 'right' },
  measureUnit: { fontSize: fontSize.xs, color: colors.ink3, width: 24 },
  settingsBtn: { width: 36, height: 36, borderRadius: radius.pill, backgroundColor: colors.layer2, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.line2 },
});

// ── Settings modal styles ─────────────────────────────────────────────────────
const sst = StyleSheet.create({
  sectionLbl: { fontSize: fontSize.xs, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase', color: colors.ink3, paddingHorizontal: 2, paddingTop: spacing.md, paddingBottom: spacing.xs + 2 },
  card: { backgroundColor: colors.layer1, borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg, overflow: 'hidden', marginBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 4, padding: spacing.md - 1, borderBottomWidth: 1, borderBottomColor: colors.line },
  label: { flex: 1, fontSize: fontSize.sm + 1, fontWeight: '500', color: colors.ink },
  val: { fontSize: fontSize.xs, color: colors.ink3, fontWeight: '500', marginRight: 4 },
});

// ── Subscription modal styles ─────────────────────────────────────────────────
const subst = StyleSheet.create({
  selector: { flexDirection: 'row', backgroundColor: colors.layer2, borderWidth: 1, borderColor: colors.line2, borderRadius: radius.pill, padding: spacing.xs / 2, gap: spacing.xs / 2 },
  selectorBtn: { flex: 1, borderRadius: radius.pill, paddingVertical: spacing.sm, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  selectorTxt: { fontSize: fontSize.sm, fontWeight: '700', color: colors.ink2 },
  selectorTxtActive: { color: colors.white },
  planCardActive: { borderColor: colors.line3 },
  proHero: { backgroundColor: colors.layer1, borderWidth: 1, borderColor: colors.line2, borderRadius: radius.lg, padding: spacing.lg, alignItems: 'center', gap: spacing.sm, overflow: 'hidden' },
  proBadge: { width: 56, height: 56, borderRadius: radius.lg, backgroundColor: colors.purpleTint, borderWidth: 1, borderColor: colors.line3, alignItems: 'center', justifyContent: 'center' },
  proTitle: { fontSize: fontSize.xl, fontWeight: '800', color: colors.ink },
  proFreePill: { backgroundColor: colors.purpleTint, borderWidth: 1, borderColor: colors.line3, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  proFreePillTxt: { fontSize: fontSize.xs, fontWeight: '800', color: colors.lavender, letterSpacing: 0.6 },
  proSub: { fontSize: fontSize.sm, color: colors.ink2, textAlign: 'center', lineHeight: fontSize.lg },
  planCard: { backgroundColor: colors.layer1, borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg, padding: spacing.md, gap: spacing.sm, overflow: 'hidden' },
  featHeading: { fontSize: fontSize.xs, fontWeight: '700', letterSpacing: 1.1, textTransform: 'uppercase', color: colors.ink3, marginBottom: spacing.xs },
  featCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  featIcon: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.purpleTint, borderWidth: 1, borderColor: colors.line2, alignItems: 'center', justifyContent: 'center' },
  featTitle: { fontSize: fontSize.base, fontWeight: '700', color: colors.ink },
  featDesc: { fontSize: fontSize.xs, color: colors.ink3, marginTop: spacing.xs / 2 },
  primaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingVertical: spacing.md },
  primaryBtnTxt: { fontSize: fontSize.base, fontWeight: '800', color: colors.white },
  secondaryBtn: { backgroundColor: colors.layer2, borderWidth: 1, borderColor: colors.line2, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center' },
  secondaryBtnTxt: { fontSize: fontSize.base, fontWeight: '700', color: colors.ink2 },
  currentPlanBtn: { flexDirection: 'row', justifyContent: 'center', gap: spacing.xs },
  currentPlanTxt: { fontSize: fontSize.base, fontWeight: '700', color: colors.ink },
  legal: { fontSize: fontSize.xs, color: colors.ink3, textAlign: 'center', lineHeight: fontSize.md, marginTop: spacing.xs },
});

// ── Dietary preferences modal styles ──────────────────────────────────────────
const dp = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing.md, paddingBottom: spacing.xl * 3 },
  sectionLbl: { fontSize: fontSize.xs, fontWeight: '700', letterSpacing: 1.1, textTransform: 'uppercase', color: colors.ink3, marginBottom: spacing.sm, marginTop: spacing.xs },
  listCard: { backgroundColor: colors.layer1, borderRadius: radius.md, overflow: 'hidden', marginBottom: spacing.lg },
  prefRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.md },
  prefLabel: { fontSize: fontSize.base, color: colors.ink },
  toggle: { width: 50, height: 28, borderRadius: radius.pill, backgroundColor: colors.layer2, position: 'relative', overflow: 'hidden' },
  toggleOn: { backgroundColor: colors.purple },
  toggleThumb: { position: 'absolute', top: 3, left: 3, width: 22, height: 22, borderRadius: radius.pill, backgroundColor: colors.white },
});

// Revolut-style "Your profile" edit screen
const pf = StyleSheet.create({
  scroll: { paddingHorizontal: spacing.md, paddingTop: spacing.xl + spacing.xl, paddingBottom: spacing.xl * 3 },
  // Floating header overlay — sits above the scroll, blur + title fade in on scroll (mirrors profile header).
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.sm, marginBottom: spacing.lg },
  bigTitle: { fontSize: fontSize.xl, fontWeight: '800', color: colors.ink, flex: 1 },
  avatarWrap: { position: 'relative' },
  avatar: { width: 72, height: 72, borderRadius: radius.pill, backgroundColor: colors.purple, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.white, fontSize: fontSize.lg, fontWeight: '800' },
  avatarImg: { width: 72, height: 72, borderRadius: radius.pill },
  avatarCam: { position: 'absolute', bottom: -2, right: -2, width: 26, height: 26, borderRadius: radius.pill, backgroundColor: colors.purple2, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: colors.bg },
  sectionLbl: { fontSize: fontSize.xs, fontWeight: '700', letterSpacing: 1.1, textTransform: 'uppercase', color: colors.ink3, marginBottom: spacing.sm },
  card: { backgroundColor: colors.layer1, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line2, overflow: 'hidden' },
  field: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  fieldBody: { flex: 1 },
  pencil: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  lockWrap: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: fontSize.xs, fontWeight: '700', letterSpacing: 0.6, color: colors.ink3, marginBottom: 2 },
  input: { fontSize: fontSize.base, color: colors.ink, paddingVertical: spacing.xs },
  value: { fontSize: fontSize.base, color: colors.ink, paddingVertical: spacing.xs },
  measureLine: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.xs },
  measureInput: { flex: 1, paddingVertical: spacing.xs },
  measureUnit: { fontSize: fontSize.sm, fontWeight: '600', color: colors.ink3 },
  // DOB picker
  pickerBackdrop: { flex: 1, backgroundColor: colors.dim, justifyContent: 'flex-end' },
  pickerSheet: { backgroundColor: colors.layer3, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, paddingTop: spacing.md, paddingBottom: spacing.xl },
  pickerHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.line },
  pickerTitle: { fontSize: fontSize.md, fontWeight: '800', color: colors.ink },
  pickerDone: { fontSize: fontSize.base, fontWeight: '700', color: colors.lavender },
  pickerCols: { flexDirection: 'row' },
  pickerIndicator: {
    position: 'absolute',
    left: spacing.md, right: spacing.md,
    backgroundColor: colors.purpleTint,
    borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.line3,
  },
  pickerCol: { flex: 1 },
  pickerItem: { alignItems: 'center', justifyContent: 'center' },
  // Base style for every wheel row; per-row opacity/scale is animated from scroll.
  pickerItemTxt: { fontSize: fontSize.lg, fontWeight: '700', color: colors.ink },
});

const PF_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Wheel row height — shared by item, snap interval, padding, and indicator band.
const PICK_ITEM_H = 44;
const PICK_VISIBLE = 5; // rows visible in the wheel (must be odd to have a center)
const PF_MONTH_IDX = PF_MONTHS.map((_, i) => i); // stable [0..11] so the column never re-creates its data

// One wheel column. Hoisted to module scope so its identity is stable — the
// parent re-rendering on each snap won't unmount/remount it (the old jank).
// Active-row emphasis is driven by an Animated scroll value on the native
// thread, so scrolling never triggers a React re-render.
function PickerCol({ visible, data, selected, render, onPick }: {
  visible: boolean; data: number[]; selected: number; render: (n: number) => string; onPick: (n: number) => void;
}) {
  const ref = useRef<ScrollView>(null);
  const scrollY = useRef(new Animated.Value(0)).current;
  const selIdx = Math.max(0, data.indexOf(selected));

  // Center the current value only when the sheet (re)opens — never mid-scroll,
  // so it can't fight the user's gesture.
  useEffect(() => {
    if (!visible) return;
    const id = requestAnimationFrame(() =>
      ref.current?.scrollTo({ y: selIdx * PICK_ITEM_H, animated: false })
    );
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  return (
    <View style={pf.pickerCol}>
      <Animated.ScrollView
        ref={ref}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingVertical: PICK_ITEM_H * 2 }}
        snapToInterval={PICK_ITEM_H}
        disableIntervalMomentum
        decelerationRate="fast"
        scrollEventThrottle={16}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })}
        onMomentumScrollEnd={(e) => {
          const idx = Math.round(e.nativeEvent.contentOffset.y / PICK_ITEM_H);
          const clamped = Math.max(0, Math.min(idx, data.length - 1));
          if (data[clamped] !== selected) {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onPick(data[clamped]);
          }
        }}
      >
        {data.map((n, i) => {
          // Distance (in rows) of this item from the center band, as the user scrolls.
          const dist = Animated.divide(scrollY, PICK_ITEM_H).interpolate({
            inputRange: [i - 2, i, i + 2],
            outputRange: [2, 0, 2],
            extrapolate: 'clamp',
          });
          const scale = dist.interpolate({ inputRange: [0, 1, 2], outputRange: [1.18, 1, 0.9], extrapolate: 'clamp' });
          const opacity = dist.interpolate({ inputRange: [0, 1, 2], outputRange: [1, 0.5, 0.28], extrapolate: 'clamp' });
          return (
            <TouchableOpacity key={n} style={[pf.pickerItem, { height: PICK_ITEM_H }]} activeOpacity={0.8}
              onPress={() => ref.current?.scrollTo({ y: i * PICK_ITEM_H, animated: true })}>
              <Animated.Text style={[pf.pickerItemTxt, { opacity, transform: [{ scale }] }]}>{render(n)}</Animated.Text>
            </TouchableOpacity>
          );
        })}
      </Animated.ScrollView>
    </View>
  );
}

function DobPicker({ visible, value, onClose, onSelect }: {
  visible: boolean; value: string; onClose: () => void; onSelect: (iso: string) => void;
}) {
  const now = new Date();
  // Allowed DOB window: exactly 16 years ago (latest) back to exactly 100 years
  // ago (earliest), measured to the day so the picker can never offer a date
  // the Save validation would reject.
  const maxDob = new Date(now.getFullYear() - 16, now.getMonth(), now.getDate());
  const minDob = new Date(now.getFullYear() - 100, now.getMonth(), now.getDate());
  const init = value ? new Date(`${value}T00:00:00`) : new Date(now.getFullYear() - 25, 0, 1);
  const [day, setDay] = useState(init.getDate());
  const [month, setMonth] = useState(init.getMonth());
  const [year, setYear] = useState(init.getFullYear());

  // Re-seed columns whenever the sheet opens with the current stored value
  useEffect(() => {
    if (!visible) return;
    const d = value ? new Date(`${value}T00:00:00`) : new Date(now.getFullYear() - 25, 0, 1);
    setDay(d.getDate());
    setMonth(d.getMonth());
    setYear(d.getFullYear());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // Years 16→100 ago. The boundary years are partially valid (depends on the
  // month/day), so confirm() clamps the final date into [minDob, maxDob].
  const years: number[] = [];
  for (let y = maxDob.getFullYear(); y >= minDob.getFullYear(); y--) years.push(y);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const days: number[] = [];
  for (let dd = 1; dd <= daysInMonth; dd++) days.push(dd);
  const clampedDay = Math.min(day, daysInMonth);


  function confirm() {
    let picked = new Date(year, month, clampedDay);
    // Clamp into the 16–100 window: a boundary-year date can fall just outside
    // (e.g. born this year's month but 16 years ago → still 15 today).
    if (picked.getTime() > maxDob.getTime()) picked = maxDob;
    if (picked.getTime() < minDob.getTime()) picked = minDob;
    const iso = `${picked.getFullYear()}-${String(picked.getMonth() + 1).padStart(2, '0')}-${String(picked.getDate()).padStart(2, '0')}`;
    onSelect(iso);
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <TouchableOpacity style={pf.pickerBackdrop} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity style={pf.pickerSheet} activeOpacity={1} onPress={() => {}}>
          <View style={pf.pickerHead}>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Text style={[pf.pickerDone, { color: colors.ink3 }]}>Cancel</Text>
            </TouchableOpacity>
            <Text style={pf.pickerTitle}>Date of birth</Text>
            <TouchableOpacity onPress={confirm} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Text style={pf.pickerDone}>Done</Text>
            </TouchableOpacity>
          </View>
          <View style={[pf.pickerCols, { height: PICK_ITEM_H * PICK_VISIBLE }]}>
            {/* Center selection band — shows which row is the active pick */}
            <View pointerEvents="none" style={[pf.pickerIndicator, { top: PICK_ITEM_H * 2, height: PICK_ITEM_H }]} />
            <PickerCol visible={visible} data={days} selected={clampedDay} render={(n) => String(n)} onPick={setDay} />
            <PickerCol visible={visible} data={PF_MONTH_IDX} selected={month} render={(n) => PF_MONTHS[n]} onPick={setMonth} />
            <PickerCol visible={visible} data={years} selected={year} render={(n) => String(n)} onPick={setYear} />
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}
