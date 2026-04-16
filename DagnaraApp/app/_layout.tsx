import { useEffect, useState, Component, ReactNode } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { useAuthStore } from '../src/store/authStore';
import { useAppStore } from '../src/store/appStore';
import { useDiaryStore } from '../src/store/diaryStore';
import { scheduleMealReminders, scheduleStreakReminder, scheduleWaterReminder, scheduleDailySummaryReminder } from '../src/lib/notifications';
import { colors, spacing, fontSize, radius } from '../src/theme';

// ── Error boundary — catches JS crashes and shows a recovery screen ──────────
class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(err: Error) { console.error('[ErrorBoundary]', err.message); }
  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <View style={eb.root}>
        <Text style={eb.emoji}>⚠️</Text>
        <Text style={eb.title}>Something went wrong</Text>
        <Text style={eb.body}>The app encountered an unexpected error.</Text>
        <TouchableOpacity style={eb.btn} onPress={() => this.setState({ hasError: false })}>
          <Text style={eb.btnTxt}>Try again</Text>
        </TouchableOpacity>
      </View>
    );
  }
}

const eb = StyleSheet.create({
  root:   { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.sm },
  emoji:  { fontSize: fontSize['2xl'] },
  title:  { fontSize: fontSize.lg, fontWeight: '700', color: colors.ink, textAlign: 'center' },
  body:   { fontSize: fontSize.sm, color: colors.ink3, textAlign: 'center' },
  btn:    { marginTop: spacing.sm, backgroundColor: colors.purple, paddingHorizontal: spacing.xl, paddingVertical: spacing.sm, borderRadius: radius.md },
  btnTxt: { color: colors.white, fontWeight: '700', fontSize: fontSize.base },
});

// ─────────────────────────────────────────────────────────────────────────────

function RootLayout() {
  const { email, isLoading, loadSession } = useAuthStore();
  const { loadApp, setUserEmail, setHasUnread } = useAppStore();
  const { restoreFromCloud } = useDiaryStore();
  const segments = useSegments();
  const router = useRouter();
  const [onboarded, setOnboarded] = useState<boolean | null>(null);

  // Bootstrap auth on mount
  useEffect(() => {
    loadSession();
  }, []);

  // Show red dot whenever a notification is received while the app is open
  useEffect(() => {
    const sub = Notifications.addNotificationReceivedListener(() => setHasUnread(true));
    return () => sub.remove();
  }, []);

  // Re-check onboarding flag whenever email or segments change (covers finishing onboarding)
  useEffect(() => {
    if (email) {
      AsyncStorage.getItem(`dagnara_onboarded_${email}`).then(v => setOnboarded(v === 'true'));
    } else {
      setOnboarded(null);
    }
  }, [email, segments]);

  // Whenever email becomes available (login or session restore), sync cloud data
  useEffect(() => {
    if (email) {
      setUserEmail(email);
      loadApp(email);
      restoreFromCloud(email);
      // Restore scheduled notifications (may have been cleared after reinstall / OS reboot)
      const p = `dagnara_${email}`;
      AsyncStorage.multiGet([`${p}_notif_meals`, `${p}_notif_streak`, `${p}_notif_checkin`, `${p}_notif_summary`]).then(pairs => {
        const m = Object.fromEntries(pairs);
        if (m[`${p}_notif_meals`]   === 'true') scheduleMealReminders(true);
        if (m[`${p}_notif_streak`]  === 'true') scheduleStreakReminder(true);
        if (m[`${p}_notif_checkin`] === 'true') scheduleWaterReminder(true);
        if (m[`${p}_notif_summary`] === 'true') scheduleDailySummaryReminder(true);
      });
    } else {
      setUserEmail(null);
    }
  }, [email]);

  // Route guard
  useEffect(() => {
    if (isLoading || onboarded === null) return;
    const inAuth = segments[0] === '(auth)';
    const inOnboarding = segments[0] === 'onboarding';

    if (!email && !inAuth) {
      router.replace('/(auth)/login');
    } else if (email && !onboarded && !inOnboarding) {
      router.replace('/onboarding');
    } else if (email && onboarded && (inAuth || inOnboarding)) {
      router.replace('/(tabs)/diary');
    }
  }, [email, isLoading, onboarded, segments]);

  return (
    <>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }} />
    </>
  );
}

export default function Root() {
  return (
    <ErrorBoundary>
      <RootLayout />
    </ErrorBoundary>
  );
}
