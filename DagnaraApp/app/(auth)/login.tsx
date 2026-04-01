import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert, ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Line } from 'react-native-svg';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../../src/store/authStore';
import { colors, spacing, fontSize, radius } from '../../src/theme';

function LogoMark({ size = 48 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Circle cx="24" cy="24" r="20" stroke={colors.purple} strokeWidth="1.5" fill="none" opacity="0.4" />
      <Circle cx="24" cy="24" r="13" stroke={colors.lavender} strokeWidth="1.5" fill="none" opacity="0.6" />
      <Circle cx="24" cy="24" r="4" fill={colors.lavender} />
      <Line x1="24" y1="4" x2="24" y2="11" stroke={colors.lavender} strokeWidth="2.5" strokeLinecap="round" />
      <Line x1="24" y1="37" x2="24" y2="44" stroke={colors.lavender} strokeWidth="2.5" strokeLinecap="round" />
      <Line x1="4" y1="24" x2="11" y2="24" stroke={colors.lavender} strokeWidth="2.5" strokeLinecap="round" />
      <Line x1="37" y1="24" x2="44" y2="24" stroke={colors.lavender} strokeWidth="2.5" strokeLinecap="round" />
      <Line x1="24" y1="4" x2="24" y2="44" stroke={colors.lavender} strokeWidth="0.5" opacity="0.25" />
      <Line x1="4" y1="24" x2="44" y2="24" stroke={colors.lavender} strokeWidth="0.5" opacity="0.25" />
    </Svg>
  );
}

export default function LoginScreen() {
  const router = useRouter();
  const { login, sendPasswordReset } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    if (!email || !password) return;
    setLoading(true);
    try {
      await login(email.trim().toLowerCase(), password);
    } catch (e: any) {
      Alert.alert('Login failed', e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleForgot() {
    if (!email) { Alert.alert('Enter your email first'); return; }
    try {
      await sendPasswordReset(email.trim().toLowerCase());
      Alert.alert('Check your email', 'A password reset link has been sent.');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  }

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      {/* Top glow */}
      <LinearGradient
        colors={['rgba(124,77,255,0.22)', 'transparent']}
        style={StyleSheet.absoluteFillObject}
        start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 0.55 }}
        pointerEvents="none"
      />

      <ScrollView contentContainerStyle={s.inner} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

        {/* Brand */}
        <View style={s.brand}>
          <LogoMark size={56} />
          <Text style={s.wordmark}>Dagnara</Text>
          <Text style={s.tagline}>Your personal health command center</Text>
        </View>

        {/* Feature pills */}
        <View style={s.pills}>
          {['🥗 Nutrition', '📈 Progress', '💊 Programs'].map(p => (
            <View key={p} style={s.pill}>
              <Text style={s.pillTxt}>{p}</Text>
            </View>
          ))}
        </View>

        {/* Form card */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Sign in</Text>

          <View style={s.fieldWrap}>
            <Text style={s.fieldLabel}>EMAIL</Text>
            <TextInput
              style={s.input}
              placeholder="you@email.com"
              placeholderTextColor={colors.ink3}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
            />
          </View>

          <View style={s.fieldWrap}>
            <Text style={s.fieldLabel}>PASSWORD</Text>
            <TextInput
              style={s.input}
              placeholder="••••••••"
              placeholderTextColor={colors.ink3}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="password"
            />
          </View>

          <TouchableOpacity onPress={handleForgot} style={s.forgotRow}>
            <Text style={s.forgotTxt}>Forgot password?</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={handleLogin} disabled={loading} activeOpacity={0.8} style={s.btnWrap}>
            <LinearGradient colors={[colors.purple, '#9c27b0']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.btn}>
              {loading
                ? <ActivityIndicator color={colors.white} />
                : <Text style={s.btnTxt}>Sign in</Text>}
            </LinearGradient>
          </TouchableOpacity>
        </View>

        <TouchableOpacity onPress={() => router.push('/(auth)/register')} style={s.registerLink} activeOpacity={0.75}>
          <Text style={s.registerTxt}>
            No account?{'  '}
            <Text style={{ color: colors.lavender, fontWeight: '600' }}>Create one →</Text>
          </Text>
        </TouchableOpacity>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  inner: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: spacing.xl, paddingVertical: spacing.xl * 2, gap: spacing.lg },

  // Brand
  brand: { alignItems: 'center', gap: spacing.sm },
  wordmark: { fontSize: fontSize['2xl'], fontWeight: '800', color: colors.lavender, letterSpacing: -0.5 },
  tagline: { fontSize: fontSize.sm, color: colors.ink2, textAlign: 'center' },

  // Pills
  pills: { flexDirection: 'row', justifyContent: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  pill: {
    backgroundColor: 'rgba(124,77,255,0.12)',
    borderWidth: 1, borderColor: 'rgba(124,77,255,0.25)',
    borderRadius: 20, paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
  },
  pillTxt: { fontSize: fontSize.xs, color: colors.lavender, fontWeight: '600' },

  // Card
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
  cardTitle: { fontSize: fontSize.md, fontWeight: '700', color: colors.ink, marginBottom: spacing.xs },

  // Fields
  fieldWrap: { gap: 6 },
  fieldLabel: { fontSize: fontSize.xs, fontWeight: '700', color: colors.ink3, letterSpacing: 1.1 },
  input: {
    backgroundColor: colors.layer2,
    borderWidth: 1, borderColor: colors.line2,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 4,
    color: colors.ink, fontSize: fontSize.base,
  },

  // Forgot
  forgotRow: { alignSelf: 'flex-end', marginTop: -spacing.xs },
  forgotTxt: { fontSize: fontSize.xs, color: colors.ink3 },

  // Button
  btnWrap: { borderRadius: radius.md, overflow: 'hidden' },
  btn: { paddingVertical: spacing.sm + 6, alignItems: 'center', borderRadius: radius.md },
  btnTxt: { color: colors.white, fontSize: fontSize.base, fontWeight: '700', letterSpacing: 0.3 },

  // Register link
  registerLink: { alignItems: 'center', paddingVertical: spacing.xs },
  registerTxt: { color: colors.ink2, fontSize: fontSize.sm },
});
