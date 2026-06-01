import { useState, useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Alert, TextInput, Modal, Switch, Image, Platform, KeyboardAvoidingView, Keyboard,
  Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAuthStore } from '../../src/store/authStore';
import { useAppStore, calcTDEE } from '../../src/store/appStore';
import { supabase } from '../../src/lib/supabase';
import { scheduleMealReminders, scheduleStreakReminder, scheduleWaterReminder, requestNotificationPermission } from '../../src/lib/notifications';
import { colors, spacing, fontSize, radius } from '../../src/theme';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { BackChevron } from '../../src/components/BackChevron';
import { formatWeight, weightUnit, heightUnit, lengthUnit, kgToInput, cmToInput, cmLenToInput, parseWeight, parseHeight, parseLength, UnitSystem } from '../../src/lib/units';
import { COUNTRIES, getCountry } from '../../src/lib/currency';
import { fmt } from '../../src/lib/format';
import { requestHealthPermissions, readHealthData, healthPlatformName, isHealthAvailable } from '../../src/lib/healthKit';
import { useDiaryStore } from '../../src/store/diaryStore';

const DIET_PLANS = ['Balanced', 'High Protein', 'Low Carb', 'Keto', 'Vegan', 'Mediterranean'];

export default function ProfileScreen() {
  const { email, profile, logout, setProfile } = useAuthStore();
  const { updateCaloriesBurned, logSleep } = useDiaryStore();
  const { streak, setGoals, activityLevel, weightGoal, calorieGoal: storeCalGoal, unitSystem, setUnitSystem, country, setCountry, setMessagesOpen, unreadCount } = useAppStore();

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(profile);
  const [dietModal, setDietModal] = useState(false);
  const [measureModal, setMeasureModal] = useState(false);
  const [settingsModal, setSettingsModal] = useState(false);
  const [settingsPage, setSettingsPage] = useState<'' | 'account' | 'unitSystem' | 'language' | 'country' | 'notifications' | 'subscription' | 'health' | 'about'>('');

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
  const [selectedPlan, setSelectedPlan] = useState<'free' | 'premium'>('free');
  const [acFirstName, setAcFirstName] = useState('');
  const [acLastName,  setAcLastName]  = useState('');
  const [acEmail,     setAcEmail]     = useState('');
  const [acPassword,  setAcPassword]  = useState('');
  const [editFirstName, setEditFirstName] = useState('');
  const [editLastName,  setEditLastName]  = useState('');
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
  const [healthLastSync, setHealthLastSync] = useState<string | null>(null);
  const [healthSyncing, setHealthSyncing] = useState(false);

  // Load persisted measurements + prefs on mount (scoped to this user)
  const p = email ?? 'anon';
  useEffect(() => {
    AsyncStorage.multiGet([
      `${p}_body_measurements`,
      `${p}_notif_checkin`, `${p}_notif_meals`, `${p}_notif_streak`,
      `${p}_language`, `${p}_unit_system`, `${p}_water_goal`, `${p}_plan`,
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
      if (m[`${p}_plan`])          setSelectedPlan(m[`${p}_plan`] as 'free' | 'premium');
      if (m[`${p}_water_goal`])    setWaterGoal(m[`${p}_water_goal`]!);
      if (m[`${p}_diet_plan`])     setSelectedDiet(m[`${p}_diet_plan`]!);
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
    // `setUnitSystem` is a stable Zustand action — safe to omit. `p` already covers email changes.
  }, [p]);

  // Reset local TDEE state when modal opens
  useEffect(() => {
    if (tdeeModal) {
      setSex((profile.sex as 'male' | 'female') ?? 'male');
      setLocalActivity(activityLevel);
      setLocalGoal(weightGoal);
    }
  }, [tdeeModal]);

  // Reset water goal input when dialog closes
  useEffect(() => {
    if (!waterGoalModal) setWaterGoalInput('');
  }, [waterGoalModal]);

  // Revert unsaved dietary preference changes when the sheet closes without saving
  useEffect(() => {
    if (dietaryModal) return;
    AsyncStorage.multiGet([`${p}_diet_plan`, `${p}_food_pref`, `${p}_allergies`]).then(pairs => {
      const m = Object.fromEntries(pairs);
      if (m[`${p}_diet_plan`]) setSelectedDiet(m[`${p}_diet_plan`]!);
      if (m[`${p}_food_pref`]) setSelectedFoodPref(m[`${p}_food_pref`]!);
      if (m[`${p}_allergies`]) {
        try { setSelectedAllergies(JSON.parse(m[`${p}_allergies`]!)); } catch { /* ignore */ }
      }
    });
  }, [dietaryModal]);

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

  useEffect(() => {
    if (!editing) return;
    const parts = (profile.name ?? '').trim().split(' ');
    setEditFirstName(parts[0] ?? '');
    setEditLastName(parts.slice(1).join(' '));
    setDraftWeightInput(profile.weight ? kgToInput(parseFloat(profile.weight), unitSystem) : '');
    setDraftHeightInput(profile.height ? cmToInput(parseFloat(profile.height), unitSystem) : '');
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

  async function handleSave() {
    const wKg = parseWeight(draftWeightInput, unitSystem);
    const hCm = parseHeight(draftHeightInput, unitSystem);
    const ageNum = parseInt(draft.age ?? '', 10);
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
    const newName = [editFirstName.trim(), editLastName.trim()].filter(Boolean).join(' ');
    await setProfile({
      ...draft,
      ...(newName ? { name: newName } : {}),
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
    const newName = [acFirstName.trim(), acLastName.trim()].filter(Boolean).join(' ');
    await setProfile({ ...profile, name: newName || profile.name });
    await AsyncStorage.setItem(`${p}_language`, language);
    if (acPassword.trim().length >= 6) {
      const { error } = await supabase.auth.updateUser({ password: acPassword.trim() });
      if (error) { Alert.alert('Password Error', error.message); return; }
    }
    setSettingsPage('');
  }

  const insets = useSafeAreaInsets();
  const scrollY = useRef(new Animated.Value(0)).current;

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

  // Reusable Back Button component for modals
  const ModalBackBtn = ({ onPress }: { onPress: () => void }) => (
    <TouchableOpacity onPress={onPress} style={styles.closeBtn}>
      <Ionicons name="chevron-back" size={22} color={colors.ink} />
    </TouchableOpacity>
  );

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
            <Ionicons name="close" size={22} color={colors.ink} />
          </TouchableOpacity>

          <Animated.View style={{
            opacity: headerNameOpacity,
            flex: 1,
            alignItems: 'center',
            paddingHorizontal: 8,
            transform: [{ translateY: headerNameTranslateY }]
          }}>
            <Text style={styles.headerNameText} numberOfLines={1}>{profile.name ?? 'Your Name'}</Text>
          </Animated.View>

          <TouchableOpacity
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setSettingsPage('subscription'); setSettingsModal(true); }}
            style={{ borderRadius: radius.pill, overflow: 'hidden', shadowColor: colors.purple, shadowOpacity: 0.4, shadowRadius: 8 }}>
            <LinearGradient colors={[colors.purple, colors.purpleGlow]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.upgradeBtn}>
              <Ionicons name="diamond" size={16} color={colors.white} />
              <Text style={styles.upgradeTxt}>{selectedPlan === 'premium' ? 'Premium' : 'Upgrade'}</Text>
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
        contentContainerStyle={[styles.scroll, { paddingTop: 60 + insets.top }]}
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
          <View style={[styles.quickCard, { flex: 1 }]}>
            <View style={styles.quickIconWrap}>
              <Ionicons name="diamond-outline" size={20} color={colors.purple} />
            </View>
            <View style={styles.quickTexts}>
              <Text style={styles.quickVal}>{selectedPlan === 'premium' ? 'Premium' : 'Free'}</Text>
              <Text style={styles.quickLbl}>Your plan</Text>
            </View>
          </View>
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
            { icon: 'restaurant-outline', label: 'Diet Plan', color: colors.green, value: selectedDiet, onPress: () => setDietModal(true) },
            { icon: 'person-outline', label: 'Personal Details', color: colors.lavender, value: `${profile.age ? profile.age + ' yrs' : '—'} · ${profile.weight ? formatWeight(parseFloat(profile.weight), unitSystem) : '—'}`, onPress: () => { setDraft(profile); setEditing(true); } },
            { icon: 'flame-outline', label: 'Calorie & Activity Goals', color: colors.honey, value: `${fmt(calorieGoal)} kcal`, onPress: () => setTdeeModal(true) },
            { icon: 'water-outline', label: 'Water Goal', color: colors.sky, value: `${waterGoal} glasses`, onPress: () => { setWaterGoalInput(waterGoal); setWaterGoalModal(true); } },
            { icon: 'leaf-outline', label: 'Dietary Preferences', color: colors.teal, value: (() => { const pref = selectedFoodPref === 'none' ? 'No food preferences' : selectedFoodPref; const allerg = selectedAllergies.length === 0 ? 'No allergies' : selectedAllergies.join(', '); return `${pref} · ${allerg}`; })(), onPress: () => setDietaryModal(true) },
            { icon: 'mail-outline', label: 'Inbox', color: colors.purple, value: '', badge: unreadCount, onPress: () => setMessagesOpen(true) },
            { icon: 'body-outline', label: 'Body Measurements', color: colors.rose, value: measurements.weight ? formatWeight(parseFloat(measurements.weight), unitSystem) : 'Not set', onPress: () => setMeasureModal(true) },
          ].map(({ icon, label, color, value, badge, onPress }) => (
            <TouchableOpacity key={label} style={styles.menuRow} onPress={onPress}>
              <Ionicons name={icon as any} size={24} color={color} style={{ width: 32, textAlign: 'center' }} />
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
            { icon: 'person-circle-outline', label: 'Account Details', color: colors.purple, value: email, onPress: () => { setAcFirstName(profile.name?.split(' ')[0] ?? ''); setAcLastName(profile.name?.split(' ').slice(1).join(' ') ?? ''); setAcEmail(email ?? ''); setAcPassword(''); setSettingsPage('account'); setSettingsModal(true); } },
            { icon: 'notifications-outline', label: 'Notifications', color: colors.purple, value: '', onPress: () => { setSettingsModal(true); setSettingsPage('notifications'); } },
            { icon: 'fitness-outline', label: healthPlatformName(), color: colors.green, value: '', onPress: () => { setSettingsModal(true); setSettingsPage('health'); } },
            { icon: 'chatbubble-ellipses-outline', label: 'Support', color: colors.sky, value: '', onPress: () => Alert.alert('Support', 'Coming soon.') },
            { icon: 'document-text-outline', label: 'Terms & Conditions', color: colors.ink2, value: '', onPress: () => Alert.alert('Terms & Conditions', 'Coming soon.') },
            { icon: 'shield-checkmark-outline', label: 'Data Consents', color: colors.teal, value: '', onPress: () => Alert.alert('Data Consents', 'Coming soon.') },
          ].map(({ icon, label, color, value, onPress }) => (
            <TouchableOpacity key={label} style={styles.menuRow} onPress={onPress}>
              <Ionicons name={icon as any} size={24} color={color} style={{ width: 32, textAlign: 'center' }} />
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
          <TouchableOpacity style={styles.menuRow} onPress={handleDeleteAccount}>
            <Ionicons name="trash-outline" size={24} color={colors.rose} style={{ width: 32, textAlign: 'center' }} />
            <Text style={[styles.menuLabel, { color: colors.rose }]}>Delete Account</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.ink3} />
          </TouchableOpacity>
        </View>

        <Text style={styles.footer}>Version 1.0.0 · Dagnara</Text>

        <View style={{ height: 40 }} />
      </Animated.ScrollView>

      {/* ── Measurements Modal ── */}
      <Modal visible={measureModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setMeasureModal(false)}>
        <SafeAreaView style={styles.safe} edges={['bottom']}>
          <View style={styles.modalHeader}>
            <ModalBackBtn onPress={() => setMeasureModal(false)} />
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
      <Modal visible={dietModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setDietModal(false)}>
        <SafeAreaView style={styles.safe} edges={['bottom']}>
          <View style={styles.modalHeader}>
            <ModalBackBtn onPress={() => setDietModal(false)} />
            <Text style={styles.modalTitle}>Diet Plan</Text>
            <TouchableOpacity onPress={() => { void AsyncStorage.setItem(`${p}_diet_plan`, selectedDiet); setDietModal(false); }}><Text style={styles.saveText}>Done</Text></TouchableOpacity>
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

      {/* ── Settings Modal ── */}
      <Modal visible={settingsModal} animationType="slide" presentationStyle="pageSheet" onDismiss={() => setSettingsPage('')} onRequestClose={() => { setSettingsPage(''); setSettingsModal(false); }}>
        <SafeAreaView style={styles.safe} edges={['bottom']}>
          <View style={styles.modalHeader}>
            <ModalBackBtn onPress={() => { if (settingsPage === 'unitSystem' || settingsPage === 'country' || settingsPage === 'language') { setSettingsPage('account'); } else { setSettingsPage(''); setSettingsModal(false); } }} />
            <Text style={styles.modalTitle}>
              {settingsPage === 'about' ? 'About Us' : settingsPage === 'account' ? 'Account Details' : settingsPage === 'unitSystem' ? 'Unit System' : settingsPage === 'country' ? 'Country' : settingsPage === 'language' ? 'Language' : settingsPage === 'notifications' ? 'Notifications' : settingsPage === 'subscription' ? 'Subscription' : settingsPage === 'health' ? healthPlatformName() : 'Settings'}
            </Text>
            {settingsPage === 'account'
              ? <TouchableOpacity onPress={async () => { await handleSaveAccount(); setSettingsPage(''); setSettingsModal(false); }}><Text style={styles.saveText}>Save</Text></TouchableOpacity>
              : <View style={{ width: 40 }} />
            }
          </View>

          <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}>
            {settingsPage === 'account' && (
              <View style={{ padding: spacing.md, gap: spacing.md }}>
                <View>
                  <Text style={styles.inputLabel}>First Name</Text>
                  <TextInput style={styles.input} value={acFirstName} onChangeText={setAcFirstName} placeholder="Enter first name" placeholderTextColor={colors.ink3} />
                </View>
                <View>
                  <Text style={styles.inputLabel}>Last Name</Text>
                  <TextInput style={styles.input} value={acLastName} onChangeText={setAcLastName} placeholder="Enter last name" placeholderTextColor={colors.ink3} />
                </View>
                <View style={{ marginTop: spacing.md, padding: spacing.md, backgroundColor: colors.layer2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line2 }}>
                  <Text style={{ color: colors.ink2, fontSize: fontSize.xs, fontWeight: '700', marginBottom: 4 }}>EMAIL</Text>
                  <Text style={{ color: colors.ink3, fontSize: fontSize.sm }}>{acEmail}</Text>
                </View>
                <Text style={{ color: colors.ink3, fontSize: fontSize.xs, fontWeight: '700', letterSpacing: 1, marginTop: spacing.sm }}>PREFERENCES</Text>
                {[
                  { label: 'Unit System', value: unitSystem, icon: 'scale-outline', color: colors.sky, page: 'unitSystem' as const },
                  { label: 'Country', value: `${getCountry(country).flag}  ${getCountry(country).name}`, icon: 'globe-outline', color: colors.honey, page: 'country' as const },
                  { label: 'Language', value: language, icon: 'language-outline', color: colors.green, page: 'language' as const },
                ].map(({ label, value, icon, color, page }) => (
                  <TouchableOpacity key={label} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setSettingsPage(page); }}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, backgroundColor: colors.layer2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line2 }}>
                    <Ionicons name={icon as any} size={22} color={color} style={{ width: 28, textAlign: 'center' }} />
                    <Text style={{ color: colors.ink, fontSize: fontSize.base, fontWeight: '600', flex: 1 }}>{label}</Text>
                    <Text style={{ color: colors.ink3, fontSize: fontSize.sm }} numberOfLines={1}>{value}</Text>
                    <Ionicons name="chevron-forward" size={16} color={colors.ink3} />
                  </TouchableOpacity>
                ))}
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
                    {healthLastSync ? <Text style={{ color: colors.ink3, fontSize: fontSize.xs, marginTop: 2 }}>Last sync {healthLastSync}</Text> : null}
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

                <TouchableOpacity onPress={handleHealthSync} disabled={healthSyncing}
                  style={{ borderRadius: radius.md, overflow: 'hidden', opacity: healthSyncing ? 0.6 : 1 }}>
                  <LinearGradient colors={[colors.purple, colors.purpleGlow]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ padding: spacing.md, alignItems: 'center' }}>
                    <Text style={{ color: colors.white, fontWeight: '700' }}>{healthSyncing ? 'Syncing…' : healthConnected ? 'Sync now' : 'Connect & sync'}</Text>
                  </LinearGradient>
                </TouchableOpacity>
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
                    <View key={label} style={[sst.row, i === arr.length - 1 && { borderBottomWidth: 0 }]}>
                      <Text style={{ width: 28, textAlign: 'center', fontSize: 20 }}>{icon}</Text>
                      <Text style={[sst.label, { flex: 1 }]}>{label}</Text>
                      <Switch value={value} onValueChange={onToggle}
                        trackColor={{ false: colors.layer3, true: colors.purple + '88' }}
                        thumbColor={value ? colors.purple : colors.ink3}
                        style={{ transform: [{ scaleX: 0.85 }, { scaleY: 0.85 }] }} />
                    </View>
                  ))}
                </View>
                <TouchableOpacity onPress={() => { setSettingsPage(''); setSettingsModal(false); }}
                  style={{ backgroundColor: colors.purple, padding: spacing.md, borderRadius: radius.md, alignItems: 'center', marginTop: spacing.md }}>
                  <Text style={{ color: colors.white, fontWeight: '700' }}>Done</Text>
                </TouchableOpacity>
              </View>
            )}

            {settingsPage === 'language' && (
              <View style={{ padding: spacing.md }}>
                <Text style={{ color: colors.ink3, fontSize: fontSize.xs, fontWeight: '700', letterSpacing: 1, marginBottom: spacing.md }}>SELECT LANGUAGE</Text>
                {['English'].map((lang) => (
                  <TouchableOpacity key={lang} onPress={() => { setLanguage(lang); AsyncStorage.setItem(`${p}_language`, lang); setSettingsPage(''); setSettingsModal(false); }}
                    style={{ padding: spacing.md, backgroundColor: colors.layer2, borderRadius: radius.md, borderWidth: 1.5, borderColor: language === lang ? colors.lavender : colors.line2, marginBottom: spacing.sm }}>
                    <Text style={{ color: language === lang ? colors.lavender : colors.ink, fontWeight: '600' }}>{lang}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {settingsPage === 'subscription' && (
              <View style={{ padding: spacing.md, gap: spacing.md }}>
                {[
                  { key: 'free', name: 'Free', price: '$0 / mo', icon: 'person-outline', color: colors.ink2 },
                  { key: 'premium', name: 'Premium', price: '$4.99 / mo', icon: 'star', color: colors.lavender },
                ].map((plan) => (
                  <TouchableOpacity key={plan.key} onPress={() => { setSelectedPlan(plan.key as 'free' | 'premium'); AsyncStorage.setItem(`${p}_plan`, plan.key); setSettingsPage(''); setSettingsModal(false); }}
                    style={[subst.planCard, selectedPlan === plan.key && { borderColor: colors.purple, borderWidth: 2 }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                      <Ionicons name={plan.icon as any} size={24} color={plan.color} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: colors.ink, fontWeight: '700' }}>{plan.name}</Text>
                        <Text style={{ color: colors.ink3, fontSize: fontSize.xs }}>{plan.price}</Text>
                      </View>
                      {selectedPlan === plan.key && <Ionicons name="checkmark-circle" size={24} color={colors.purple} />}
                    </View>
                  </TouchableOpacity>
                ))}
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
                    { icon: 'logo-facebook', label: 'Like us on Facebook', color: '#1877F2', onPress: () => Alert.alert('Facebook', 'Opening Facebook...') },
                    { icon: 'logo-instagram', label: 'Watch our stories on Instagram', color: colors.rose, onPress: () => Alert.alert('Instagram', 'Opening Instagram...') },
                  ].map(({ icon, label, color, onPress }, i, arr) => (
                    <TouchableOpacity key={label} style={[sst.row, i === arr.length - 1 && { borderBottomWidth: 0 }]} onPress={onPress}>
                      <Ionicons name={icon as any} size={20} color={color} style={{ width: 28, textAlign: 'center' }} />
                      <Text style={sst.label}>{label}</Text>
                      <Ionicons name="chevron-forward" size={14} color={colors.ink3} />
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {/* If we end up with an empty page somehow, show nothing or return */}
            {settingsPage === '' && <View style={{ padding: spacing.xl, alignItems: 'center' }}><Text style={{ color: colors.ink3 }}>Select a setting to edit.</Text></View>}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* ── Dietary Preferences Modal ── */}
      <Modal visible={dietaryModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setDietaryModal(false)}>
        <SafeAreaView style={dp.safe} edges={['top', 'bottom']}>
          <View style={dp.header}>
            <ModalBackBtn onPress={() => setDietaryModal(false)} />
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
              ].map(({ key, label }, i, arr) => {
                const isOn = selectedFoodPref === key;
                return (
                  <TouchableOpacity key={key} style={[dp.prefRow, i === arr.length - 1 && { borderBottomWidth: 0 }]}
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
            <TouchableOpacity style={dp.saveBtn} onPress={() => {
              AsyncStorage.multiSet([
                [`${p}_diet_plan`, selectedDiet],
                [`${p}_food_pref`, selectedFoodPref],
                [`${p}_allergies`, JSON.stringify(selectedAllergies)],
              ]);
              setDietaryModal(false);
            }}>
              <Text style={dp.saveBtnTxt}>SAVE SETTINGS</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>

      {/* ── TDEE Modal ── */}
      <Modal visible={tdeeModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setTdeeModal(false)}>
        <SafeAreaView style={styles.safe} edges={['bottom']}>
          <View style={styles.modalHeader}>
            <ModalBackBtn onPress={() => setTdeeModal(false)} />
            <Text style={styles.modalTitle}>Calorie & Goals</Text>
            <TouchableOpacity onPress={() => {
              const age = parseInt(profile.age ?? '25', 10) || 25;
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
            <Text style={[styles.inputLabel, { marginBottom: 4 }]}>Biological Sex</Text>
            <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.xs }}>
              {(['male', 'female'] as const).map(s => (
                <TouchableOpacity key={s} onPress={() => setSex(s)}
                  style={{ flex: 1, padding: spacing.sm, borderRadius: radius.sm + 2, borderWidth: 1.5, alignItems: 'center',
                    borderColor: sex === s ? colors.lavender : colors.line2,
                    backgroundColor: sex === s ? colors.purple + '22' : colors.layer2 }}>
                  <Ionicons name={s === 'male' ? 'male' : 'female'} size={24} color={s === 'male' ? colors.sky : colors.rose} />
                  <Text style={{ color: sex === s ? colors.lavender : colors.ink2, marginTop: 4, fontWeight: '600', fontSize: fontSize.sm, textTransform: 'capitalize' }}>{s}</Text>
                </TouchableOpacity>
              ))}
            </View>

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
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* ── Edit Profile Modal ── */}
      <Modal visible={editing} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setEditing(false)}>
        <SafeAreaView style={styles.safe} edges={['bottom']}>
          <View style={styles.modalHeader}>
            <ModalBackBtn onPress={() => setEditing(false)} />
            <Text style={styles.modalTitle}>Personal Details</Text>
            <TouchableOpacity onPress={handleSave}><Text style={styles.saveText}>Save</Text></TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.modalScroll} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}>
            <View>
              <Text style={styles.inputLabel}>First Name</Text>
              <TextInput
                style={styles.input}
                value={editFirstName}
                onChangeText={setEditFirstName}
                placeholderTextColor={colors.ink3}
                placeholder="First name"
                autoCapitalize="words"
                returnKeyType="next"
              />
            </View>
            <View>
              <Text style={styles.inputLabel}>Last Name</Text>
              <TextInput
                style={styles.input}
                value={editLastName}
                onChangeText={setEditLastName}
                placeholderTextColor={colors.ink3}
                placeholder="Last name"
                autoCapitalize="words"
                returnKeyType="next"
              />
            </View>
            {[
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
                  returnKeyType="done"
                  onSubmitEditing={() => Keyboard.dismiss()}
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
                returnKeyType="done"
                onSubmitEditing={() => Keyboard.dismiss()}
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
                returnKeyType="done"
                onSubmitEditing={() => Keyboard.dismiss()}
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
                const n = parseInt(waterGoalInput, 10);
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
                  const n = parseInt(waterGoalInput, 10);
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
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: 16, gap: 24, paddingBottom: 40 },

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
    shadowColor: colors.purpleGlow,
    shadowOpacity: 0.5,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
    elevation: 15,
  },
  upgradeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    height: spacing.xl + spacing.sm,
    justifyContent: 'center',
  },
  upgradeTxt: { color: colors.white, fontSize: fontSize.sm, fontWeight: '700', letterSpacing: 0.4 },

  hero: { alignItems: 'center', gap: 14, paddingBottom: 8 },
  avatarWrap: { position: 'relative' },
  avatar: { width: 110, height: 110, borderRadius: radius.pill, backgroundColor: colors.purple, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.white, fontSize: 40, fontWeight: '800' },
  avatarImg: { width: 110, height: 110, borderRadius: radius.pill },
  avatarAdd: { position: 'absolute', bottom: 2, right: 2, width: 34, height: 34, borderRadius: radius.pill, backgroundColor: colors.purple2, alignItems: 'center', justifyContent: 'center', borderWidth: 3.5, borderColor: colors.bg },
  heroName: { color: colors.ink, fontSize: 32, fontWeight: '800', textAlign: 'center' },
  heroEmail: { color: colors.ink3, fontSize: 16, maxWidth: 280, textAlign: 'center', marginTop: 6, opacity: 0.7 },

  quickRow: { flexDirection: 'row', gap: 12 },
  quickCard: { backgroundColor: colors.layer1, borderRadius: 20, padding: 16, minHeight: 110, justifyContent: 'center', alignItems: 'flex-start', shadowColor: colors.purple, shadowOpacity: 0.1, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 4 },
  quickIconWrap: { width: 34, height: 34, borderRadius: 10, backgroundColor: colors.purpleTint, alignItems: 'center', justifyContent: 'center' },
  quickTexts: { gap: 2, marginTop: 12 },
  quickVal: { fontSize: 17, fontWeight: '800', color: colors.ink },
  quickLbl: { fontSize: 12, color: colors.ink3, fontWeight: '600', opacity: 0.7 },


  menuCard: { backgroundColor: colors.layer1, borderRadius: 20, overflow: 'hidden', shadowColor: colors.purple, shadowOpacity: 0.08, shadowRadius: 16, shadowOffset: { width: 0, height: 4 }, elevation: 4 },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 12 },
  menuLabel: { flex: 1, color: colors.ink, fontSize: 15, fontWeight: '600' },

  footer: { textAlign: 'center', color: colors.ink3, fontSize: 12, marginTop: 4, opacity: 0.4 },

  inboxBadge: { backgroundColor: colors.rose, borderRadius: radius.pill, minWidth: 20, height: 20, paddingHorizontal: spacing.xs, alignItems: 'center', justifyContent: 'center' },
  inboxBadgeText: { color: colors.white, fontSize: fontSize.xs, fontWeight: '800' },
  dietOption: { backgroundColor: colors.layer2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, padding: spacing.md, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dietOptionSel: { borderColor: colors.purple, backgroundColor: colors.purple + '11' },
  dietOptionTxt: { color: colors.ink, fontSize: fontSize.base, fontWeight: '500' },

  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.line },
  modalTitle: { color: colors.ink, fontSize: fontSize.base, fontWeight: '700' },
  saveText: { color: colors.lavender, fontSize: fontSize.base, fontWeight: '700' },
  modalScroll: { padding: spacing.md, gap: spacing.sm },
  inputLabel: { color: colors.ink2, fontSize: fontSize.sm, marginBottom: spacing.xs },
  input: { backgroundColor: colors.layer2, borderWidth: 1, borderColor: colors.line2, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2, color: colors.ink, fontSize: fontSize.base },
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
