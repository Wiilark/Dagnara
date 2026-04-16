import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';

interface Profile {
  name?: string;
  age?: string;
  weight?: string;
  height?: string;
  goal?: string;
  [key: string]: string | undefined;
}

interface AuthState {
  email: string | null;
  profile: Profile;
  isLoading: boolean;
  isPremium: boolean;
  setEmail: (email: string | null) => void;
  setProfile: (profile: Profile) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, profile: Profile) => Promise<void>;
  logout: () => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  loadSession: () => Promise<void>;
  checkSubscription: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  email: null,
  profile: {},
  isLoading: true,
  isPremium: false,

  setEmail: (email) => set({ email }),
  setProfile: async (profile) => {
    set({ profile });
    const email = get().email;
    if (email) {
      try {
        await supabase.from('dagnara_profiles').upsert(
          { email, profile_data: profile, updated_at: new Date().toISOString() },
          { onConflict: 'email' }
        );
      } catch {
        // Local update committed — cloud will sync on next save
      }
    }
  },

  loadSession: async () => {
    try {
      const timeout = new Promise<null>((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), 5000)
      );
      const sessionResult = await Promise.race([
        supabase.auth.getSession(),
        timeout,
      ]) as Awaited<ReturnType<typeof supabase.auth.getSession>>;

      const session = sessionResult?.data?.session;
      if (session?.user?.email) {
        const { data } = await supabase
          .from('dagnara_profiles')
          .select('profile_data')
          .eq('email', session.user.email)
          .maybeSingle();
        // Existing users are considered onboarded
        await AsyncStorage.setItem(`dagnara_onboarded_${session.user.email}`, 'true');
        const profileData = data?.profile_data ?? {};
        set({
          email: session.user.email,
          profile: profileData,
          isPremium: (profileData.subscriptionStatus as string | undefined) === 'active',
          isLoading: false,
        });
      } else {
        set({ isLoading: false });
      }
    } catch {
      // Timeout or network error — let the user proceed to login
      set({ isLoading: false });
    }
  },

  login: async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error('Incorrect email or password.');

    const { data } = await supabase
      .from('dagnara_profiles')
      .select('profile_data')
      .eq('email', email)
      .maybeSingle();
    await AsyncStorage.setItem(`dagnara_onboarded_${email}`, 'true');
    const profileData = data?.profile_data ?? {};
    set({
      email,
      profile: profileData,
      isPremium: (profileData.subscriptionStatus as string | undefined) === 'active',
    });
  },

  register: async (email, password, profile) => {
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;

    try {
      await supabase.from('dagnara_profiles').upsert(
        { email, profile_data: profile, updated_at: new Date().toISOString() },
        { onConflict: 'email' }
      );
    } catch {
      // Auth account created — profile will be saved on next write
    }
    set({ email, profile });
  },

  logout: async () => {
    await supabase.auth.signOut();
    // Reset all user-specific store state so next user starts clean
    require('./appStore').useAppStore.getState().reset();
    require('./diaryStore').useDiaryStore.getState().reset();
    set({ email: null, profile: {}, isPremium: false });
  },

  sendPasswordReset: async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    if (error) throw error;
  },

  checkSubscription: async () => {
    const email = get().email;
    if (!email) return;
    try {
      const { data } = await supabase
        .from('dagnara_profiles')
        .select('profile_data')
        .eq('email', email)
        .maybeSingle();
      if (data?.profile_data) {
        const status = data.profile_data.subscriptionStatus as string | undefined;
        set({
          isPremium: status === 'active',
          profile: { ...get().profile, subscriptionStatus: status ?? 'none' },
        });
      }
    } catch {
      // Network error — keep current state
    }
  },
}));
