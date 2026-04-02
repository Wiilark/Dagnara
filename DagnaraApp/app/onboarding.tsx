import { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  TextInput, Dimensions, ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuthStore } from '../src/store/authStore';
import { useAppStore, calcTDEE } from '../src/store/appStore';
import { colors, spacing, fontSize, radius } from '../src/theme';

const { width } = Dimensions.get('window');

const STEPS = 5;

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
  const { setGoals } = useAppStore();

  const [step, setStep] = useState(0);
  const [goal, setGoal] = useState<Goal>('maintain');
  const [activity, setActivity] = useState<Activity>('moderate');
  const [sex, setSex] = useState<Sex>('male');
  const [age, setAge] = useState(profile.age ?? '');
  const [weight, setWeight] = useState(profile.weight ?? '');
  const [height, setHeight] = useState(profile.height ?? '');
  const [saving, setSaving] = useState(false);

  const calorieGoal = (() => {
    const a = parseInt(age), w = parseInt(weight), h = parseInt(height);
    if (!a || !w || !h) return 2000;
    return calcTDEE(a, w, h, sex, activity, goal);
  })();

  async function finish() {
    setSaving(true);
    try {
      await setGoals(activity, goal, calorieGoal);
      // Update profile with body stats if changed
      if (age || weight || height) {
        await setProfile({ ...profile, age, weight, height });
      }
      await AsyncStorage.setItem(`dagnara_onboarded_${email ?? 'anon'}`, 'true');
      router.replace('/(tabs)/diary');
    } finally {
      setSaving(false);
    }
  }

  function next() { if (step < STEPS - 1) setStep(s => s + 1); else finish(); }
  function back() { if (step > 0) setStep(s => s - 1); }

  const canAdvance = () => {
    if (step === 3) {
      return !!age && !!weight && !!height;
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
            <Text style={s.stepLabel}>STEP 1 OF 4</Text>
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
            <Text style={s.stepLabel}>STEP 2 OF 4</Text>
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

        {/* Step 3: Body stats */}
        {step === 3 && (
          <View style={s.section}>
            <Text style={s.stepLabel}>STEP 3 OF 4</Text>
            <Text style={s.heading}>Your body stats</Text>
            <Text style={s.body}>Used in the Harris-Benedict formula to calculate your BMR.</Text>

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

            {[
              { key: 'age', label: 'AGE', value: age, set: setAge, placeholder: 'e.g. 28', unit: 'years' },
              { key: 'weight', label: 'WEIGHT', value: weight, set: setWeight, placeholder: 'e.g. 72', unit: 'kg' },
              { key: 'height', label: 'HEIGHT', value: height, set: setHeight, placeholder: 'e.g. 175', unit: 'cm' },
            ].map(f => (
              <View key={f.key} style={s.inputWrap}>
                <Text style={s.fieldLabel}>{f.label}</Text>
                <View style={s.inputRow}>
                  <TextInput
                    style={[s.input, { flex: 1 }]}
                    placeholder={f.placeholder}
                    placeholderTextColor={colors.ink3}
                    value={f.value}
                    onChangeText={f.set}
                    keyboardType="numeric"
                  />
                  <Text style={s.unit}>{f.unit}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Step 4: Summary */}
        {step === 4 && (
          <View style={s.section}>
            <Text style={s.stepLabel}>STEP 4 OF 4</Text>
            <Text style={s.heading}>Your personal plan</Text>
            <Text style={s.body}>Based on your stats, here's what we recommend:</Text>

            <LinearGradient
              colors={['rgba(124,77,255,0.18)', 'rgba(124,77,255,0.06)']}
              style={s.summaryCard}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            >
              <Text style={s.calNum}>{calorieGoal.toLocaleString()}</Text>
              <Text style={s.calLabel}>kcal / day</Text>
              <View style={s.macroRow}>
                <View style={s.macroBox}>
                  <Text style={s.macroVal}>{Math.round(calorieGoal * 0.5 / 4)}g</Text>
                  <Text style={s.macroName}>Carbs</Text>
                </View>
                <View style={s.macroBox}>
                  <Text style={s.macroVal}>{Math.round(calorieGoal * 0.3 / 4)}g</Text>
                  <Text style={s.macroName}>Protein</Text>
                </View>
                <View style={s.macroBox}>
                  <Text style={s.macroVal}>{Math.round(calorieGoal * 0.293 / 9)}g</Text>
                  <Text style={s.macroName}>Fat</Text>
                </View>
              </View>
            </LinearGradient>

            <View style={s.summaryList}>
              {[
                ['🎯 Goal',     GOALS.find(g => g.key === goal)?.label ?? goal],
                ['⚡ Activity', ACTIVITIES.find(a => a.key === activity)?.label ?? activity],
                ['👤 Sex',      sex === 'male' ? 'Male' : 'Female'],
                ['📅 Age',      age ? `${age} years` : '—'],
                ['⚖️ Weight',   weight ? `${weight} kg` : '—'],
                ['📏 Height',   height ? `${height} cm` : '—'],
              ].map(([label, value]) => (
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
            colors={[colors.purple, '#9c27b0']}
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

  big: { fontSize: 56, textAlign: 'center', marginBottom: spacing.xs },
  stepLabel: { fontSize: fontSize.xs, fontWeight: '700', color: colors.ink3, letterSpacing: 1.5 },
  heading: { fontSize: fontSize.xl, fontWeight: '800', color: colors.ink, lineHeight: 32 },
  body: { fontSize: fontSize.sm, color: colors.ink2, lineHeight: 22 },

  featureList: { gap: spacing.sm, marginTop: spacing.sm },
  featureRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, backgroundColor: colors.layer1, borderWidth: 1, borderColor: colors.line2, borderRadius: radius.md, padding: spacing.md },
  featureIcon: { fontSize: 22 },
  featureTitle: { fontSize: fontSize.sm, fontWeight: '700', color: colors.ink },
  featureDesc: { fontSize: fontSize.xs, color: colors.ink3, marginTop: 2 },

  optionList: { gap: spacing.sm },
  option: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.layer1, borderWidth: 1, borderColor: colors.line2,
    borderRadius: radius.md, padding: spacing.md,
  },
  optionSelected: { borderColor: colors.purple, backgroundColor: 'rgba(124,77,255,0.08)' },
  optionIcon: { fontSize: 24 },
  optionLabel: { fontSize: fontSize.base, fontWeight: '600', color: colors.ink },
  optionLabelSelected: { color: colors.lavender },
  optionDesc: { fontSize: fontSize.xs, color: colors.ink3, marginTop: 2 },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: colors.line2 },
  radioSelected: { borderColor: colors.purple, backgroundColor: colors.purple },

  fieldLabel: { fontSize: fontSize.xs, fontWeight: '700', color: colors.ink3, letterSpacing: 1.1 },
  sexRow: { flexDirection: 'row', gap: spacing.sm },
  sexBtn: {
    flex: 1, paddingVertical: spacing.sm + 4, alignItems: 'center',
    borderWidth: 1, borderColor: colors.line2, borderRadius: radius.md,
    backgroundColor: colors.layer1,
  },
  sexBtnSelected: { borderColor: colors.purple, backgroundColor: 'rgba(124,77,255,0.1)' },
  sexBtnTxt: { fontSize: fontSize.base, fontWeight: '600', color: colors.ink2 },
  sexBtnTxtSelected: { color: colors.lavender },

  inputWrap: { gap: 6 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  input: {
    backgroundColor: colors.layer2, borderWidth: 1, borderColor: colors.line2,
    borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 4,
    color: colors.ink, fontSize: fontSize.base,
  },
  unit: { fontSize: fontSize.sm, color: colors.ink3, width: 40 },

  summaryCard: {
    borderRadius: radius.lg, padding: spacing.xl,
    alignItems: 'center', gap: spacing.sm,
    borderWidth: 1, borderColor: 'rgba(124,77,255,0.2)',
  },
  calNum: { fontSize: 56, fontWeight: '900', color: colors.lavender, lineHeight: 64 },
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
    paddingHorizontal: spacing.md, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: colors.line2,
  },
  summaryLabel: { fontSize: fontSize.sm, color: colors.ink2 },
  summaryValue: { fontSize: fontSize.sm, fontWeight: '600', color: colors.ink },

  nav: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.xl, paddingBottom: 36, paddingTop: spacing.md,
    backgroundColor: colors.bg,
    borderTopWidth: 1, borderTopColor: colors.line2,
    gap: spacing.md,
  },
  backBtn: { flex: 1, paddingVertical: spacing.sm + 6, alignItems: 'center' },
  backTxt: { fontSize: fontSize.base, color: colors.ink2, fontWeight: '600' },
  nextBtnWrap: { flex: 2, borderRadius: radius.md, overflow: 'hidden' },
  nextBtn: { paddingVertical: spacing.sm + 6, alignItems: 'center', borderRadius: radius.md },
  nextTxt: { color: colors.white, fontSize: fontSize.base, fontWeight: '700', letterSpacing: 0.3 },
});
