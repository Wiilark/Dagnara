import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert, ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../../src/store/authStore';
import { colors, spacing, fontSize, radius } from '../../src/theme';

const FIELDS = [
  { key: 'name',     label: 'NAME',         placeholder: 'Your name',      auto: 'name'           as const, required: true },
  { key: 'email',    label: 'EMAIL',         placeholder: 'you@email.com',  auto: 'email'          as const, keyboard: 'email-address' as const, required: true },
  { key: 'password', label: 'PASSWORD',      placeholder: '••••••••',       auto: 'password'       as const, secure: true, required: true },
  { key: 'age',      label: 'AGE',           placeholder: 'e.g. 28',        keyboard: 'numeric'    as const },
  { key: 'weight',   label: 'WEIGHT (kg)',   placeholder: 'e.g. 72',        keyboard: 'numeric'    as const },
  { key: 'height',   label: 'HEIGHT (cm)',   placeholder: 'e.g. 175',       keyboard: 'numeric'    as const },
];

export default function RegisterScreen() {
  const router = useRouter();
  const { register } = useAuthStore();
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  function set(key: string, val: string) { setValues(p => ({ ...p, [key]: val })); }

  async function handleRegister() {
    if (!values.email || !values.password || !values.name) {
      Alert.alert('Required fields missing', 'Please fill in name, email and password.');
      return;
    }
    setLoading(true);
    try {
      await register(values.email.trim().toLowerCase(), values.password, {
        name: values.name,
        age: values.age,
        weight: values.weight,
        height: values.height,
      });
    } catch (e: any) {
      Alert.alert('Registration failed', e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      {/* Top glow */}
      <LinearGradient
        colors={['rgba(124,77,255,0.22)', 'transparent']}
        style={StyleSheet.absoluteFillObject}
        start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 0.4 }}
        pointerEvents="none"
      />

      <ScrollView contentContainerStyle={s.inner} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={s.header}>
          <Text style={s.wordmark}>Dagnara</Text>
          <Text style={s.subtitle}>Create your account</Text>
          <Text style={s.hint}>Age, weight & height help us personalise your calorie goals.</Text>
        </View>

        {/* Form card */}
        <View style={s.card}>
          {FIELDS.map(({ key, label, placeholder, auto, keyboard, secure, required }) => (
            <View key={key} style={s.fieldWrap}>
              <Text style={s.fieldLabel}>{label}{required && <Text style={{ color: colors.rose }}> *</Text>}</Text>
              <TextInput
                style={s.input}
                placeholder={placeholder}
                placeholderTextColor={colors.ink3}
                value={values[key] ?? ''}
                onChangeText={v => set(key, v)}
                autoCapitalize="none"
                autoComplete={auto}
                keyboardType={keyboard ?? 'default'}
                secureTextEntry={secure}
              />
            </View>
          ))}

          <TouchableOpacity onPress={handleRegister} disabled={loading} activeOpacity={0.8} style={s.btnWrap}>
            <LinearGradient colors={[colors.purple, '#9c27b0']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.btn}>
              {loading
                ? <ActivityIndicator color={colors.white} />
                : <Text style={s.btnTxt}>Create account</Text>}
            </LinearGradient>
          </TouchableOpacity>
        </View>

        <TouchableOpacity onPress={() => router.back()} style={s.loginLink} activeOpacity={0.75}>
          <Text style={s.loginTxt}>
            Already have an account?{'  '}
            <Text style={{ color: colors.lavender, fontWeight: '600' }}>Sign in →</Text>
          </Text>
        </TouchableOpacity>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  inner: { flexGrow: 1, paddingHorizontal: spacing.xl, paddingVertical: spacing.xl * 2, gap: spacing.lg },

  header: { alignItems: 'center', gap: spacing.sm },
  wordmark: { fontSize: fontSize['2xl'], fontWeight: '800', color: colors.lavender, letterSpacing: -0.5 },
  subtitle: { fontSize: fontSize.md, fontWeight: '600', color: colors.ink },
  hint: { fontSize: fontSize.xs, color: colors.ink3, textAlign: 'center', lineHeight: 18 },

  card: {
    backgroundColor: colors.layer1,
    borderWidth: 1, borderColor: colors.line2,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
    shadowColor: colors.purple,
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },

  fieldWrap: { gap: 6 },
  fieldLabel: { fontSize: fontSize.xs, fontWeight: '700', color: colors.ink3, letterSpacing: 1.1 },
  input: {
    backgroundColor: colors.layer2,
    borderWidth: 1, borderColor: colors.line2,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 4,
    color: colors.ink, fontSize: fontSize.base,
  },

  btnWrap: { borderRadius: radius.md, overflow: 'hidden', marginTop: spacing.xs },
  btn: { paddingVertical: spacing.sm + 6, alignItems: 'center', borderRadius: radius.md },
  btnTxt: { color: colors.white, fontSize: fontSize.base, fontWeight: '700', letterSpacing: 0.3 },

  loginLink: { alignItems: 'center', paddingVertical: spacing.xs },
  loginTxt: { color: colors.ink2, fontSize: fontSize.sm },
});
