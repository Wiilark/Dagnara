import { useEffect, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuthStore } from '../src/store/authStore';
import { useAppStore } from '../src/store/appStore';
import { useDiaryStore } from '../src/store/diaryStore';

export default function RootLayout() {
  const { email, isLoading, loadSession } = useAuthStore();
  const { loadApp, setUserEmail } = useAppStore();
  const { restoreFromCloud } = useDiaryStore();
  const segments = useSegments();
  const router = useRouter();
  const [onboarded, setOnboarded] = useState<boolean | null>(null);

  // Bootstrap auth on mount
  useEffect(() => {
    loadSession();
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
