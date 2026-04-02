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
  setEmail: (email: string | null) => void;
  setProfile: (profile: Profile) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, profile: Profile) => Promise<void>;
  logout: () => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  loadSession: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  email: null,
  profile: {},
  isLoading: true,

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
        set({ email: session.user.email, profile: data?.profile_data ?? {}, isLoading: false });
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
    set({ email, profile: data?.profile_data ?? {} });
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
    set({ email: null, profile: {} });
  },

  sendPasswordReset: async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    if (error) throw error;
  },
}));
