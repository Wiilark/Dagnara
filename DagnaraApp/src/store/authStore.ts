import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';

interface Profile {
  name?: string;
  age?: string;
  dob?: string;        // ISO date string (YYYY-MM-DD)
  weight?: string;
  height?: string;
  goal?: string;
  photoUri?: string;
  [key: string]: string | undefined;
}

// Local cache so the profile (incl. date of birth) survives restarts and is
// available instantly/offline before the Supabase fetch resolves.
const profileCacheKey = (email: string) => `dagnara_profile_cache_${email}`;

async function cacheProfile(email: string, profile: Profile): Promise<void> {
  try { await AsyncStorage.setItem(profileCacheKey(email), JSON.stringify(profile)); }
  catch { /* non-fatal */ }
}

async function readCachedProfile(email: string): Promise<Profile | null> {
  try {
    const raw = await AsyncStorage.getItem(profileCacheKey(email));
    return raw ? (JSON.parse(raw) as Profile) : null;
  } catch { return null; }
}

interface AuthState {
  email: string | null;
  profile: Profile;
  isLoading: boolean;
  // SECURITY — fix before enabling real billing: isPremium is derived from
  // profile_data.subscriptionStatus, which lives in dagnara_profiles. The RLS
  // policy ("Users manage own profile", cmd ALL) lets a user UPDATE their own
  // row, so a determined user could set subscriptionStatus:'active' and unlock
  // Pro for free. Harmless today (premium is free for everyone during launch),
  // but the day billing goes live, gate premium features behind a server-side
  // entitlement check (e.g. GET /api/entitlement that verifies Stripe via the
  // service-role client) instead of trusting this client-writable field.
  isPremium: boolean;
  setEmail: (email: string | null) => void;
  setProfile: (profile: Profile) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  // Returns 'active' when sign-up created a usable session (email confirmation
  // OFF) and the user is logged in, or 'confirm' when Supabase requires email
  // confirmation first (no session yet — the UI must tell the user to check
  // their inbox rather than treat them as signed in).
  register: (email: string, password: string, profile: Profile) => Promise<'active' | 'confirm'>;
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
      await cacheProfile(email, profile);
      try {
        const { error } = await supabase.from('dagnara_profiles').upsert(
          { email, profile_data: profile, updated_at: new Date().toISOString() },
          { onConflict: 'email' }
        );
        if (error) {
           
          console.error('[authStore.setProfile] supabase upsert failed:', error.message);
        }
      } catch (e) {

        console.error('[authStore.setProfile] network error:', e instanceof Error ? e.message : e);
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
        const email = session.user.email;
        // Show the cached profile immediately so DOB/name/etc. are present even
        // before (or without) a successful Supabase fetch.
        const cached = await readCachedProfile(email);
        if (cached) {
          set({
            email,
            profile: cached,
            isPremium: (cached.subscriptionStatus as string | undefined) === 'active',
          });
        }
        const { data } = await supabase
          .from('dagnara_profiles')
          .select('profile_data')
          .eq('email', email)
          .maybeSingle();
        // Existing users are considered onboarded
        await AsyncStorage.setItem(`dagnara_onboarded_${email}`, 'true');
        // Prefer remote data when present; otherwise keep the cached profile.
        const profileData = (data?.profile_data ?? cached ?? {}) as Profile;
        if (data?.profile_data) await cacheProfile(email, profileData);
        set({
          email,
          profile: profileData,
          isPremium: (profileData.subscriptionStatus as string | undefined) === 'active',
          isLoading: false,
        });
      } else {
        set({ isLoading: false });
      }
    } catch {
      // Timeout or network error — keep whatever cached profile we already set.
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
    // If the row is empty this may be the first confirmed login after a
    // confirmation-gated sign-up (profile was cached locally but never written
    // because there was no session yet). Recover the cached profile and persist
    // it now that we have an authenticated session.
    let profileData = (data?.profile_data ?? {}) as Profile;
    if (!data?.profile_data) {
      const cached = await readCachedProfile(email);
      if (cached && Object.keys(cached).length > 0) {
        profileData = cached;
        try {
          await supabase.from('dagnara_profiles').upsert(
            { email, profile_data: cached, updated_at: new Date().toISOString() },
            { onConflict: 'email' }
          );
        } catch { /* non-fatal — cached copy still drives the UI */ }
      }
    }
    await cacheProfile(email, profileData);
    set({
      email,
      profile: profileData,
      isPremium: (profileData.subscriptionStatus as string | undefined) === 'active',
    });
  },

  register: async (email, password, profile) => {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;

    // When email confirmation is ON, signUp returns a user but NO session, so
    // we have no access token. Writing the profile would silently fail RLS and
    // marking the user "logged in" would leave them stranded (bounced to login
    // on next launch, AI calls 401). Cache the profile locally so it survives
    // until first real login, then tell the caller to show a confirm-email
    // screen instead of entering the app.
    await cacheProfile(email, profile);
    if (!data.session) return 'confirm';

    try {
      const { error: upErr } = await supabase.from('dagnara_profiles').upsert(
        { email, profile_data: profile, updated_at: new Date().toISOString() },
        { onConflict: 'email' }
      );
      if (upErr) {

        console.error('[authStore.register] profile upsert failed:', upErr.message);
      }
    } catch (e) {

      console.error('[authStore.register] profile upsert network error:', e instanceof Error ? e.message : e);
    }
    set({ email, profile });
    return 'active';
  },

  logout: async () => {
    const email = get().email;
    await supabase.auth.signOut();
    if (email) { try { await AsyncStorage.removeItem(profileCacheKey(email)); } catch { /* non-fatal */ } }
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
