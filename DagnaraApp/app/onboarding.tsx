import { useState, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  TextInput, Dimensions, ActivityIndicator, Alert,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuthStore } from '../src/store/authStore';
import { useAppStore, calcTDEE, macrosFor } from '../src/store/appStore';
import { weightUnit, heightUnit, weightPlaceholder, heightPlaceholder, parseWeight, parseHeight, formatWeight, formatHeight, kgToInput, cmToInput, type UnitSystem } from '../src/lib/units';
import { scheduleMealReminders, scheduleStreakReminder, scheduleWaterReminder, scheduleDailySummaryReminder } from '../src/lib/notifications';
import { COUNTRIES, getCountry } from '../src/lib/currency';
import { fmt } from '../src/lib/format';
import { colors, spacing, fontSize, radius } from '../src/theme';

const { width } = Dimensions.get('window');

const STEPS = 8;

type Goal = 'lose' | 'maintain' | 'gain';
type Activity = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';
type Sex = 'male' | 'female';

const GOALS: { key: Goal; label: string; desc: string; icon: string }[] = [
  { key: 'lose',     label: 'Lose weight',     desc: 'Calorie deficit of ~500 kcal/day', icon: '📉' },
  { key: 'maintain', label: 'Stay healthy',     desc: 'Maintain current weight & energy', icon: '⚖️' },
  { key: 'gain',     label: 'Build muscle',     desc: 'Calorie surplus of ~300 kcal/day', icon: '💪' },
];

const ACTIVITIES: { key: Activity; label: string; desc: string }[] = [
  { key: 'sedentary',   label: 'Sedentary',     desc: 'Little or no exercise' },
  { key: 'light',       label: 'Light',          desc: '1–3 days/week' },
  { key: 'moderate',    label: 'Moderate',       desc: '3–5 days/week' },
  { key: 'active',      label: 'Active',         desc: '6–7 days/week' },
  { key: 'very_active', label: 'Very active',    desc: 'Physical job or 2x training' },
];

export default function OnboardingScreen() {
  const router = useRouter();
  const { email, profile, setProfile } = useAuthStore();
  const { setGoals, unitSystem, setUnitSystem, country: persistedCountry, setCountry,
          setDietaryPreferences, setPillDefaultTime, setMacroPcts } = useAppStore();

  const [step, setStep] = useState(0);
  const [goal, setGoal] = useState<Goal>('maintain');
  const [activity, setActivity] = useState<Activity>('moderate');
  const [sex, setSex] = useState<Sex>('male');
  const [age, setAge] = useState(profile.age ?? '');
  const [weight, setWeight] = useState(profile.weight ?? '');
  const [height, setHeight] = useState(profile.height ?? '');
  const [targetWeight, setTargetWeight] = useState('');
  const [country, setCountryState] = useState(persistedCountry || 'US');
  const [countrySearch, setCountrySearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [pillDefaultTime, setPillDefaultTimeLocal] = useState('07:30');
  const [dietaryPref, setDietaryPref] = useState<string | null>(null);
  // `saving` state updates async — a ref blocks synchronous double-taps between
  // the press handler and the next render.
  const submittingRef = useRef(false);

  // Parse weight/height from display unit to metric for TDEE calc
  const wKg = parseWeight(weight, unitSystem) ?? (parseFloat(weight) || 0);
  const hCm = parseHeight(height, unitSystem) ?? (parseFloat(height) || 0);
  const tgtKg = parseWeight(targetWeight, unitSystem) ?? (parseFloat(targetWeight) || 0);

  const calorieGoal = (() => {
    const a = parseInt(age, 10);
    if (!a || !wKg || !hCm) return 2000;
    return calcTDEE(a, wKg, hCm, sex, activity, goal);
  })();

  // Personalised macro split from the goal + diet + bodyweight the user gives us —
  // keeps the summary preview and the persisted value identical.
  const macros = macrosFor(goal, dietaryPref, wKg, calorieGoal);

  async function finish() {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSaving(true);
    let navigated = false;
    const doNavigate = () => { if (!navigated) { navigated = true; router.replace('/(tabs)/diary'); } };

    // Hard 15-second timeout — navigate regardless if something stalls
    const timer = setTimeout(doNavigate, 15_000);

    try {
      await setGoals(activity, goal, calorieGoal);
      await setMacroPcts(macros);
      await setDietaryPreferences(dietaryPref);
      await setPillDefaultTime(pillDefaultTime);
      // Persist country selection — drives currency in Programs (money saved, etc.)
      await setCountry(country);
      // Update profile with body stats — always stored in metric (kg, cm)
      if (age || weight || height || targetWeight) {
        await setProfile({
          ...profile, age,
          weight: wKg > 0 ? String(Math.round(wKg * 10) / 10) : profile.weight,
          height: hCm > 0 ? String(Math.round(hCm)) : profile.height,
          sex,
          ...(tgtKg > 0 ? { targetWeight: String(Math.round(tgtKg * 10) / 10) } : {}),
        });
      }
      await AsyncStorage.setItem(`dagnara_onboarded_${email ?? 'anon'}`, 'true');
      // Enable all notifications by default — user can toggle in Profile > Notifications
      const p = `dagnara_${email ?? 'anon'}`;
      await AsyncStorage.multiSet([
        [`${p}_notif_meals`,   'true'],
        [`${p}_notif_streak`,  'true'],
        [`${p}_notif_checkin`, 'true'],
        [`${p}_notif_summary`, 'true'],
      ]);
      // Notifications — best-effort; never block navigation if OS denies permission
      try {
        await scheduleMealReminders(true);
        await scheduleStreakReminder(true);
        await scheduleWaterReminder(true);
        await scheduleDailySummaryReminder(true);
      } catch {}
      doNavigate();
    } catch (e: any) {
      Alert.alert('Setup error', e?.message ?? 'Something went wrong. Please try again.');
    } finally {
      clearTimeout(timer);
      setSaving(false);
      submittingRef.current = false;
    }
  }

  function next() { if (step < STEPS - 1) setStep(s => s + 1); else finish(); }
  function back() { if (step > 0) setStep(s => s - 1); }

  const ageNum    = age ? parseInt(age, 10) : NaN;
  const ageErr    = age && !isNaN(ageNum)
    ? (ageNum < 16 ? 'Minimum age is 16' : ageNum > 100 ? 'Maximum age is 100' : null)
    : null;
  const weightErr = weight
    ? (wKg < 30
        ? `Too low – min ${unitSystem === 'Metric' ? '30 kg' : unitSystem === 'UK' ? '4 st 10 lb' : '66 lb'}`
        : wKg > 300
          ? `Too high – max ${unitSystem === 'Metric' ? '300 kg' : unitSystem === 'UK' ? '47 st 3 lb' : '661 lb'}`
          : null)
    : null;
  const heightErr = height
    ? (hCm < 100
        ? `Too low – min ${unitSystem === 'Metric' ? '100 cm' : "3'4\""}`
        : hCm > 250
          ? `Too high – max ${unitSystem === 'Metric' ? '250 cm' : "8'2\""}`
          : null)
    : null;

  const canAdvance = () => {
    if (step === 6) {
      if (!age || !weight || !height) return false;
      if (isNaN(ageNum) || ageNum < 16 || ageNum > 100) return false;
      if (!wKg || wKg < 30 || wKg > 300) return false;
      if (!hCm || hCm < 100 || hCm > 250) return false;
      return true;
    }
    return true;
  };

  return (
    <View style={s.root}>
      <LinearGradient
        colors={['rgba(124,77,255,0.25)', 'transparent']}
        style={StyleSheet.absoluteFillObject}
        start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 0.5 }}
        pointerEvents="none"
      />

      {/* Progress bar */}
      <View style={s.progressRow}>
        {Array.from({ length: STEPS }).map((_, i) => (
          <View key={i} style={[s.dot, i <= step && s.dotActive]} />
        ))}
      </View>

      <ScrollView contentContainerStyle={s.inner} showsVerticalScrollIndicator={false}>

        {/* Step 0: Welcome */}
        {step === 0 && (
          <View style={s.section}>
            <Text style={s.big}>👋</Text>
            <Text style={s.heading}>
              Welcome{profile.name ? `, ${profile.name}` : ''}!
            </Text>
            <Text style={s.body}>
              Let's personalise Dagnara for you. This quick setup takes about 60 seconds and unlocks your personal calorie goal, progress tracking, and health programs.
            </Text>
            <View style={s.featureList}>
              {[
                ['🎯', 'Personal calorie target', 'Calculated from your body stats'],
                ['📊', 'Progress tracking', 'Weight, streaks, XP, and life score'],
                ['💊', 'Health programs', 'Quit smoking, medication reminders & more'],
              ].map(([icon, title, desc]) => (
                <View key={title} style={s.featureRow}>
                  <Text style={s.featureIcon}>{icon}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={s.featureTitle}>{title}</Text>
                    <Text style={s.featureDesc}>{desc}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Step 1: Goal */}
        {step === 1 && (
          <View style={s.section}>
            <Text style={s.stepLabel}>STEP 1 OF 8</Text>
            <Text style={s.heading}>What's your main goal?</Text>
            <Text style={s.body}>This sets your daily calorie target.</Text>
            <View style={s.optionList}>
              {GOALS.map(g => (
                <TouchableOpacity
                  key={g.key}
                  style={[s.option, goal === g.key && s.optionSelected]}
                  onPress={() => setGoal(g.key)}
                  activeOpacity={0.75}
                >
                  <Text style={s.optionIcon}>{g.icon}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.optionLabel, goal === g.key && s.optionLabelSelected]}>{g.label}</Text>
                    <Text style={s.optionDesc}>{g.desc}</Text>
                  </View>
                  <View style={[s.radio, goal === g.key && s.radioSelected]} />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Step 2: Activity */}
        {step === 2 && (
          <View style={s.section}>
            <Text style={s.stepLabel}>STEP 2 OF 8</Text>
            <Text style={s.heading}>How active are you?</Text>
            <Text style={s.body}>Used to calculate your energy expenditure.</Text>
            <View style={s.optionList}>
              {ACTIVITIES.map(a => (
                <TouchableOpacity
                  key={a.key}
                  style={[s.option, activity === a.key && s.optionSelected]}
                  onPress={() => setActivity(a.key)}
                  activeOpacity={0.75}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[s.optionLabel, activity === a.key && s.optionLabelSelected]}>{a.label}</Text>
                    <Text style={s.optionDesc}>{a.desc}</Text>
                  </View>
                  <View style={[s.radio, activity === a.key && s.radioSelected]} />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Step 3: Pill / Medication Timing */}
        {step === 3 && (
          <View style={s.section}>
            <Text style={s.stepLabel}>STEP 3 OF 7</Text>
            <Text style={s.heading}>Do you take a daily pill or supplement?</Text>
            <Text style={s.body}>
              Set a default reminder time — we'll prompt you on the diary dashboard to mark it taken. Skip if not applicable.
            </Text>
            <View style={s.optionList}>
              {([
                { key: '07:00', label: '7:00 AM',  desc: 'Morning with breakfast' },
                { key: '08:00', label: '8:00 AM',  desc: 'After breakfast' },
                { key: '12:00', label: '12:00 PM', desc: 'Lunchtime' },
                { key: '21:00', label: '9:00 PM',  desc: 'Evening before bed' },
              ] as const).map(opt => (
                <TouchableOpacity
                  key={opt.key}
                  style={[s.option, pillDefaultTime === opt.key && s.optionSelected]}
                  onPress={() => setPillDefaultTimeLocal(opt.key)}
                  activeOpacity={0.75}
                >
                  <Text style={s.optionIcon}>💊</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.optionLabel, pillDefaultTime === opt.key && s.optionLabelSelected]}>{opt.label}</Text>
                    <Text style={s.optionDesc}>{opt.desc}</Text>
                  </View>
                  <View style={[s.radio, pillDefaultTime === opt.key && s.radioSelected]} />
                </TouchableOpacity>
              ))}
            </View>
            <Text style={[s.body, { marginTop: spacing.sm }]}>
              You can configure your exact medications in the Programs tab after onboarding.
            </Text>
          </View>
        )}

        {/* Step 4: Dietary Preferences */}
        {step === 4 && (
          <View style={s.section}>
            <Text style={s.stepLabel}>STEP 4 OF 7</Text>
            <Text style={s.heading}>Any dietary preferences?</Text>
            <Text style={s.body}>
              We'll filter recipes to match your style by default. You can always browse everything.
            </Text>
            <View style={s.optionList}>
              {([
                { key: 'High Protein',  label: 'High Protein',  icon: '💪', desc: 'Prioritise protein at every meal' },
                { key: 'Low Carb',      label: 'Low Carb',      icon: '🥩', desc: 'Reduce carbohydrates and grains' },
                { key: 'Vegan',         label: 'Vegan',         icon: '🌱', desc: 'No animal products' },
                { key: 'Vegetarian',    label: 'Vegetarian',    icon: '🥦', desc: 'No meat — dairy and eggs OK' },
                { key: 'Keto',          label: 'Keto',          icon: '🥑', desc: 'Very low carb, high fat' },
                { key: 'Mediterranean', label: 'Mediterranean', icon: '🫒', desc: 'Olive oil, fish, legumes, whole grains' },
              ] as const).map(opt => (
                <TouchableOpacity
                  key={opt.key}
                  style={[s.option, dietaryPref === opt.key && s.optionSelected]}
                  onPress={() => setDietaryPref(dietaryPref === opt.key ? null : opt.key)}
                  activeOpacity={0.75}
                >
                  <Text style={s.optionIcon}>{opt.icon}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.optionLabel, dietaryPref === opt.key && s.optionLabelSelected]}>{opt.label}</Text>
                    <Text style={s.optionDesc}>{opt.desc}</Text>
                  </View>
                  <View style={[s.radio, dietaryPref === opt.key && s.radioSelected]} />
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={[s.option, dietaryPref === null && s.optionSelected]}
                onPress={() => setDietaryPref(null)}
                activeOpacity={0.75}
              >
                <Text style={s.optionIcon}>🍽️</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[s.optionLabel, dietaryPref === null && s.optionLabelSelected]}>No preference</Text>
                  <Text style={s.optionDesc}>Show me everything</Text>
                </View>
                <View style={[s.radio, dietaryPref === null && s.radioSelected]} />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Step 5: Country (drives currency + locale across the app) */}
        {step === 5 && (
          <View style={s.section}>
            <Text style={s.stepLabel}>STEP 5 OF 7</Text>
            <Text style={s.heading}>Where are you based?</Text>
            <Text style={s.body}>
              Sets your currency in Programs (e.g. money saved when quitting smoking). You can change it any time in Preferences.
            </Text>

            {/* Current selection preview — confirms what was tapped */}
            <View style={s.countryPreview}>
              <Text style={{ fontSize: fontSize.xl }}>{getCountry(country).flag}</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.countryPreviewName}>{getCountry(country).name}</Text>
                <Text style={s.countryPreviewCur}>
                  {getCountry(country).currency} · {getCountry(country).symbol}
                </Text>
              </View>
            </View>

            {/* Search field — filters by country name */}
            <View style={s.searchWrap}>
              <Ionicons name="search" size={16} color={colors.ink3} />
              <TextInput
                style={s.searchInput}
                placeholder="Search country…"
                placeholderTextColor={colors.ink3}
                value={countrySearch}
                onChangeText={setCountrySearch}
                autoCapitalize="words"
                autoCorrect={false}
              />
              {countrySearch ? (
                <TouchableOpacity onPress={() => setCountrySearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="close-circle" size={16} color={colors.ink3} />
                </TouchableOpacity>
              ) : null}
            </View>

            {/* Country rows — flag · name · currency · checkmark when selected */}
            <View style={s.countryList}>
              {(() => {
                const q = countrySearch.trim().toLowerCase();
                const list = q ? COUNTRIES.filter(c => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q)) : COUNTRIES;
                if (list.length === 0) {
                  return <Text style={s.countryEmpty}>No matches.</Text>;
                }
                return list.map((c, i, arr) => (
                  <TouchableOpacity
                    key={c.code}
                    style={[s.countryRow, i === arr.length - 1 && { borderBottomWidth: 0 }, country === c.code && s.countryRowSelected]}
                    onPress={() => setCountryState(c.code)}
                    activeOpacity={0.7}
                  >
                    <Text style={s.countryFlag}>{c.flag}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={s.countryName}>{c.name}</Text>
                      <Text style={s.countryCurrency}>{c.currency} · {c.symbol}</Text>
                    </View>
                    {country === c.code && <Ionicons name="checkmark" size={18} color={colors.purple} />}
                  </TouchableOpacity>
                ));
              })()}
            </View>
          </View>
        )}

        {/* Step 6: Body stats */}
        {step === 6 && (
          <View style={s.section}>
            <Text style={s.stepLabel}>STEP 6 OF 7</Text>
            <Text style={s.heading}>Your body stats</Text>
            <Text style={s.body}>Used in the Harris-Benedict formula to calculate your BMR.</Text>

            {/* Unit system toggle */}
            <View style={s.unitToggleRow}>
              {(['Metric', 'Imperial (US)', 'UK', 'US Customary'] as const).map(u => (
                <TouchableOpacity
                  key={u}
                  style={[s.unitToggleBtn, unitSystem === u && s.unitToggleBtnActive]}
                  onPress={() => {
                    if (weight) { const kg = parseWeight(weight, unitSystem); setWeight(kg != null ? kgToInput(kg, u) : ''); }
                    if (height) { const cm = parseHeight(height, unitSystem); setHeight(cm != null ? cmToInput(cm, u) : ''); }
                    if (targetWeight) { const kg = parseWeight(targetWeight, unitSystem); setTargetWeight(kg != null ? kgToInput(kg, u) : ''); }
                    void setUnitSystem(u);
                  }}
                  activeOpacity={0.75}
                >
                  <Text style={[s.unitToggleTxt, unitSystem === u && s.unitToggleTxtActive]}>
                    {u === 'Metric' ? '🌍 Metric' : u === 'Imperial (US)' ? '🇺🇸 Imperial' : u === 'UK' ? '🇬🇧 UK' : '🫙 US Custom'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={s.fieldLabel}>BIOLOGICAL SEX</Text>
            <View style={s.sexRow}>
              {(['male', 'female'] as Sex[]).map(v => (
                <TouchableOpacity
                  key={v}
                  style={[s.sexBtn, sex === v && s.sexBtnSelected]}
                  onPress={() => setSex(v)}
                  activeOpacity={0.75}
                >
                  <Text style={[s.sexBtnTxt, sex === v && s.sexBtnTxtSelected]}>
                    {v === 'male' ? '♂ Male' : '♀ Female'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={s.sexHint}>Used in the BMR formula — affects calorie goal by ~150 kcal/day</Text>

            {[
              { key: 'age',    label: 'AGE',    value: age,    set: setAge,    placeholder: 'e.g. 28', unit: 'years', keyboard: 'numeric' as const,    error: ageErr },
              { key: 'weight', label: 'WEIGHT', value: weight, set: setWeight, placeholder: weightPlaceholder(unitSystem), unit: weightUnit(unitSystem), keyboard: 'decimal-pad' as const, error: weightErr },
              { key: 'height', label: 'HEIGHT', value: height, set: setHeight, placeholder: heightPlaceholder(unitSystem), unit: heightUnit(unitSystem), keyboard: (unitSystem === 'Metric' ? 'decimal-pad' : 'default') as any, error: heightErr },
            ].map(f => (
              <View key={f.key} style={s.inputWrap}>
                <Text style={s.fieldLabel}>{f.label}</Text>
                <View style={s.inputRow}>
                  <TextInput
                    style={[s.input, { flex: 1 }, !!f.error && { borderColor: colors.rose }]}
                    placeholder={f.placeholder}
                    placeholderTextColor={colors.ink3}
                    value={f.value}
                    onChangeText={f.set}
                    keyboardType={f.keyboard}
                  />
                  <Text style={s.unit}>{f.unit}</Text>
                </View>
                {f.error ? <Text style={s.inputError}>{f.error}</Text> : null}
              </View>
            ))}

            {goal !== 'maintain' && (
              <View style={s.inputWrap}>
                <Text style={s.fieldLabel}>TARGET WEIGHT</Text>
                <View style={s.inputRow}>
                  <TextInput
                    style={[s.input, { flex: 1 }]}
                    placeholder={weightPlaceholder(unitSystem)}
                    placeholderTextColor={colors.ink3}
                    value={targetWeight}
                    onChangeText={setTargetWeight}
                    keyboardType="decimal-pad"
                  />
                  <Text style={s.unit}>{weightUnit(unitSystem)}</Text>
                </View>
                <Text style={s.sexHint}>Optional — your goal weight</Text>
              </View>
            )}
          </View>
        )}

        {/* Step 7: Summary */}
        {step === 7 && (
          <View style={s.section}>
            <Text style={s.stepLabel}>STEP 7 OF 7</Text>
            <Text style={s.heading}>Your personal plan</Text>
            <Text style={s.body}>Based on your stats, here's what we recommend:</Text>

            <LinearGradient
              colors={['rgba(124,77,255,0.18)', 'rgba(124,77,255,0.06)']}
              style={s.summaryCard}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            >
              <Text style={s.calNum}>{fmt(calorieGoal)}</Text>
              <Text style={s.calLabel}>kcal / day</Text>
              <View style={s.macroRow}>
                <View style={s.macroBox}>
                  <Text style={s.macroVal}>{Math.round(calorieGoal * macros.carbs / 100 / 4)}g</Text>
                  <Text style={s.macroName}>Carbs</Text>
                </View>
                <View style={s.macroBox}>
                  <Text style={s.macroVal}>{Math.round(calorieGoal * macros.protein / 100 / 4)}g</Text>
                  <Text style={s.macroName}>Protein</Text>
                </View>
                <View style={s.macroBox}>
                  <Text style={s.macroVal}>{Math.round(calorieGoal * macros.fat / 100 / 9)}g</Text>
                  <Text style={s.macroName}>Fat</Text>
                </View>
              </View>
            </LinearGradient>

            <View style={s.summaryList}>
              {([
                ['🎯 Goal',          GOALS.find(g => g.key === goal)?.label ?? goal],
                ['⚡ Activity',      ACTIVITIES.find(a => a.key === activity)?.label ?? activity],
                ['💊 Pill reminder',  pillDefaultTime ? `Daily at ${pillDefaultTime}` : 'Not set'],
                ['🥗 Diet',           dietaryPref ?? 'No preference'],
                ['🌍 Country',        `${getCountry(country).flag}  ${getCountry(country).name} · ${getCountry(country).currency}`],
                ['👤 Sex',           sex === 'male' ? 'Male' : 'Female'],
                ['📅 Age',           age ? `${age} years` : '—'],
                ['⚖️ Weight',        wKg > 0 ? formatWeight(wKg, unitSystem) : '—'],
                ['📏 Height',        hCm > 0 ? formatHeight(hCm, unitSystem) : '—'],
                ...(tgtKg > 0 ? [['🏁 Target weight', formatWeight(tgtKg, unitSystem)]] : []),
              ] as [string, string][]).map(([label, value]) => (
                <View key={label} style={s.summaryRow}>
                  <Text style={s.summaryLabel}>{label}</Text>
                  <Text style={s.summaryValue}>{value}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

      </ScrollView>

      {/* Navigation */}
      <View style={s.nav}>
        {step > 0 ? (
          <TouchableOpacity onPress={back} style={s.backBtn} activeOpacity={0.7}>
            <Text style={s.backTxt}>← Back</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ flex: 1 }} />
        )}

        <TouchableOpacity
          onPress={next}
          disabled={!canAdvance() || saving}
          activeOpacity={0.8}
          style={[s.nextBtnWrap, (!canAdvance() || saving) && { opacity: 0.5 }]}
        >
          <LinearGradient
            colors={[colors.purple, colors.purpleGlow]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={s.nextBtn}
          >
            {saving
              ? <ActivityIndicator color={colors.white} />
              : <Text style={s.nextTxt}>{step === STEPS - 1 ? 'Start journey 🚀' : 'Continue →'}</Text>}
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },

  progressRow: {
    flexDirection: 'row', justifyContent: 'center', gap: 8,
    paddingTop: 56, paddingBottom: 8,
  },
  dot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: colors.line2,
  },
  dotActive: { backgroundColor: colors.purple, width: 20 },

  inner: { paddingHorizontal: spacing.xl, paddingBottom: 120, paddingTop: spacing.lg },

  section: { gap: spacing.md },

  big: { fontSize: fontSize['2xl'] + 18, textAlign: 'center', marginBottom: spacing.xs },
  stepLabel: { fontSize: fontSize.xs, fontWeight: '700', color: colors.ink3, letterSpacing: 1.5 },
  heading: { fontSize: fontSize.xl, fontWeight: '800', color: colors.ink, lineHeight: 32 },
  body: { fontSize: fontSize.sm, color: colors.ink2, lineHeight: 22 },

  featureList: { gap: spacing.sm, marginTop: spacing.sm },
  featureRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, backgroundColor: colors.layer1, borderWidth: 1, borderColor: colors.line2, borderRadius: radius.md, padding: spacing.md },
  featureIcon: { fontSize: fontSize.lg },
  featureTitle: { fontSize: fontSize.sm, fontWeight: '700', color: colors.ink },
  featureDesc: { fontSize: fontSize.xs, color: colors.ink3, marginTop: 2 },

  optionList: { gap: spacing.sm },
  option: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.layer1, borderWidth: 1, borderColor: colors.line2,
    borderRadius: radius.md, padding: spacing.md,
  },
  optionSelected: { borderColor: colors.purple, backgroundColor: colors.purpleTint },
  optionIcon: { fontSize: fontSize.lg + 2 },
  optionLabel: { fontSize: fontSize.base, fontWeight: '600', color: colors.ink },
  optionLabelSelected: { color: colors.lavender },
  optionDesc: { fontSize: fontSize.xs, color: colors.ink3, marginTop: 2 },
  radio: { width: spacing.lg - 4, height: spacing.lg - 4, borderRadius: radius.pill, borderWidth: 2, borderColor: colors.line2 },
  radioSelected: { borderColor: colors.purple, backgroundColor: colors.purple },

  unitToggleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  unitToggleBtn: {
    width: '48%', paddingVertical: spacing.sm + 2, alignItems: 'center',
    borderWidth: 1, borderColor: colors.line2, borderRadius: radius.md,
    backgroundColor: colors.layer1,
  },
  unitToggleBtnActive: { borderColor: colors.purple, backgroundColor: colors.purpleTint },
  unitToggleTxt: { fontSize: fontSize.sm, fontWeight: '600', color: colors.ink2 },
  unitToggleTxtActive: { color: colors.lavender },

  fieldLabel: { fontSize: fontSize.xs, fontWeight: '700', color: colors.ink3, letterSpacing: 1.1 },
  sexRow: { flexDirection: 'row', gap: spacing.sm },
  sexBtn: {
    flex: 1, paddingVertical: spacing.sm + 4, alignItems: 'center',
    borderWidth: 1, borderColor: colors.line2, borderRadius: radius.md,
    backgroundColor: colors.layer1,
  },
  sexBtnSelected: { borderColor: colors.purple, backgroundColor: colors.purpleTint },
  sexBtnTxt: { fontSize: fontSize.base, fontWeight: '600', color: colors.ink2 },
  sexBtnTxtSelected: { color: colors.lavender },
  sexHint: { fontSize: fontSize.xs, color: colors.ink3, marginTop: -2, lineHeight: 16 },

  // Country picker — flag · name · currency, with search filter above
  countryPreview: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.purpleTint,
    borderWidth: 1, borderColor: colors.line3,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2,
    marginTop: spacing.xs,
  },
  countryPreviewName: { fontSize: fontSize.base, fontWeight: '700', color: colors.ink },
  countryPreviewCur:  { fontSize: fontSize.xs, color: colors.ink3, marginTop: 2 },

  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.layer2,
    borderWidth: 1, borderColor: colors.line2,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2,
  },
  searchInput: { flex: 1, color: colors.ink, fontSize: fontSize.base, paddingVertical: 0 },

  countryList: {
    backgroundColor: colors.layer1,
    borderWidth: 1, borderColor: colors.line2,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  countryRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2,
    borderBottomWidth: 1, borderBottomColor: colors.line,
  },
  countryRowSelected: { backgroundColor: colors.purpleTint },
  countryFlag: { fontSize: fontSize.lg },
  countryName: { fontSize: fontSize.base, color: colors.ink, fontWeight: '600' },
  countryCurrency: { fontSize: fontSize.xs, color: colors.ink3, marginTop: 2 },
  countryEmpty: { textAlign: 'center', color: colors.ink3, fontSize: fontSize.sm, padding: spacing.lg },

  inputWrap: { gap: 6 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  input: {
    backgroundColor: colors.layer2, borderWidth: 1, borderColor: colors.line2,
    borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 4,
    color: colors.ink, fontSize: fontSize.base,
  },
  unit: { fontSize: fontSize.sm, color: colors.ink3, width: 40 },
  inputError: { fontSize: fontSize.xs, color: colors.rose, marginTop: 2 },

  summaryCard: {
    borderRadius: radius.lg, padding: spacing.xl,
    alignItems: 'center', gap: spacing.sm,
    borderWidth: 1, borderColor: colors.line2,
  },
  calNum: { fontSize: fontSize['2xl'] + 18, fontWeight: '900', color: colors.lavender, lineHeight: 64 },
  calLabel: { fontSize: fontSize.sm, color: colors.ink2, fontWeight: '600', marginBottom: spacing.sm },
  macroRow: { flexDirection: 'row', gap: spacing.xl },
  macroBox: { alignItems: 'center' },
  macroVal: { fontSize: fontSize.md, fontWeight: '700', color: colors.ink },
  macroName: { fontSize: fontSize.xs, color: colors.ink3 },

  summaryList: {
    backgroundColor: colors.layer1, borderWidth: 1, borderColor: colors.line2,
    borderRadius: radius.md, overflow: 'hidden',
  },
  summaryRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderBottomWidth: 1, borderBottomColor: colors.line2,
  },
  summaryLabel: { fontSize: fontSize.sm, color: colors.ink2 },
  summaryValue: { fontSize: fontSize.sm, fontWeight: '600', color: colors.ink },

  nav: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.xl, paddingBottom: spacing.xl, paddingTop: spacing.md,
    backgroundColor: colors.bg,
    borderTopWidth: 1, borderTopColor: colors.line2,
    gap: spacing.md,
  },
  backBtn: { flex: 1, paddingVertical: spacing.md, alignItems: 'center' },
  backTxt: { fontSize: fontSize.base, color: colors.ink2, fontWeight: '600' },
  nextBtnWrap: { flex: 2, borderRadius: radius.md, overflow: 'hidden' },
  nextBtn: { paddingVertical: spacing.md, alignItems: 'center', borderRadius: radius.md },
  nextTxt: { color: colors.white, fontSize: fontSize.base, fontWeight: '700', letterSpacing: 0.3 },
});
