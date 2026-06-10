import { useState, useEffect, useRef, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Modal, Alert, TextInput, Platform, Share, Animated, Linking, Easing,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle, Line, Path, Polygon } from 'react-native-svg';
import { colors, spacing, fontSize, radius } from '../../theme';
import { useAppStore } from '../../store/appStore';
import { useAuthStore } from '../../store/authStore';
import { scheduleQdNotifications } from '../../lib/notifications';
import { formatMoneyFromUsd, currencySymbol, usdToLocal, localToUsd, minorUnits } from '../../lib/currency';
import { fmt } from '../../lib/format';
import {
  Craving, DEFAULT_TIP_PREFS, MeditationArt, ProgramSheetHeader, ProgressSceneArt, QD_ACHIEVEMENTS, QD_CRAVING_COPING, QD_CRAVING_TRIGGERS, QD_MILESTONES, QD_QUITLINES, QD_SUPPORT, QdData, QsAchBadge, QsIllo, QuitlinePhoneArt, TipBulbArt, TipPrefs, formatDuration, makeKeys, pickDailyQdTip, prevQdUnlockedRefGlobal, m,
} from './shared';

// ── Quit Drinking Modal ───────────────────────────────────────────────────────
export function QuitDrinkingModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { email } = useAuthStore();
  const country = useAppStore((s) => s.country);
  const KEYS = makeKeys(email ?? 'anon');
  const [data, setData] = useState<QdData | null>(null);
  const [slips, setSlips] = useState<string[]>([]);
  const [bestHours, setBestHours] = useState<number>(0);
  const [elapsed, setElapsed] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [showSetup, setShowSetup] = useState(false);
  const [formDate, setFormDate] = useState('');
  const [formDpd, setFormDpd] = useState('2');
  const [formCpd, setFormCpd] = useState('5');
  // UI: which detail view is showing inside the modal (mirrors QuitSmokingModal).
  // 'support' replaces QS's 'nrt' — alcohol recovery uses programs (AA/SMART/etc.)
  // instead of nicotine replacement therapy.
  const [qdView, setQdView] = useState<'main' | 'progress' | 'achievements' | 'achievement' | 'health' | 'cravings' | 'tip' | 'quitline' | 'breathing' | 'reasons' | 'support'>('main');
  // UI: which achievement is selected for the detail screen
  const [selectedAch, setSelectedAch] = useState<typeof QD_ACHIEVEMENTS[number] | null>(null);
  const qdScrollRef = useRef<ScrollView>(null);
  // Craving logger state — modal visibility + form fields. Mirrors QS exactly so
  // the UI/UX is identical between the two programs. Default intensity 6 matches
  // the natural midpoint of "definitely noticeable" on the 1-10 scale.
  const [cravings, setCravings] = useState<Craving[]>([]);
  const [cravingFormOpen, setCravingFormOpen] = useState(false);
  const [cravingIntensity, setCravingIntensity] = useState<number>(6);
  const [cravingTrigger, setCravingTrigger] = useState<string | null>(null);
  const [cravingCoping, setCravingCoping] = useState<string | null>(null);
  const [cravingGaveIn, setCravingGaveIn] = useState(false);
  // Tip personalization — liked / skipped tip IDs persist to KEYS.QD_TIP and
  // bias pickDailyQdTip() so a skipped tip is rotated past on the next pull.
  const [tipPrefs, setTipPrefs] = useState<TipPrefs>(DEFAULT_TIP_PREFS);
  // Reasons-I'm-quitting anchor. Strongest evidence-based craving tool — reading
  // these back beats any tip or breathing exercise. Surfaced as a reminder banner
  // on the cravings view (once populated) and as a dedicated detail view.
  const [reasons, setReasons]               = useState<string[]>([]);
  const [reasonsDraft, setReasonsDraft]     = useState<string[]>([]);
  const [reasonsEditing, setReasonsEditing] = useState(false);
  const [reasonsInput, setReasonsInput]     = useState('');
  const [isSettled, setIsSettled] = useState(false);

  // Scroll to top whenever we change views — same UX as the QS modal.
  useEffect(() => {
    qdScrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [qdView]);

  // Reset detail-view state any time the modal closes so the next open lands on
  // the main view — mirrors QS, prevents resuming half-finished reasons-editor.
  useEffect(() => {
    if (!visible) { setQdView('main'); setSelectedAch(null); setReasonsEditing(false); setCravingFormOpen(false); }
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    Promise.all([
      AsyncStorage.getItem(KEYS.QD),
      AsyncStorage.getItem(KEYS.QD_SLIPS),
      AsyncStorage.getItem(KEYS.QD_BEST),
      AsyncStorage.getItem(KEYS.QD_CRAVE),
      AsyncStorage.getItem(KEYS.QD_TIP),
      AsyncStorage.getItem(KEYS.QD_REASONS),
      AsyncStorage.getItem(KEYS.QD_COST_PROMPT),
    ]).then(([raw, rawSlips, rawBest, rawCrave, rawTip, rawReasons, rawCostPrompt]) => {
      if (raw) {
        try {
          const d: QdData = JSON.parse(raw);
          setData(d);
          setShowSetup(false);
          // Re-arm milestone notifications every modal open — cheap insurance against
          // OS drops (app updates, force-stops, permission toggles). The schedule fn
          // de-dupes by tag so this is a no-op when nothing has changed.
          scheduleQdNotifications(new Date(d.quitDate)).catch(() => {});
          // Yearly cost-update prompt — keeps money-saved numbers accurate as drink
          // prices rise over time. Skips if prompted within the last 365 days.
          try {
            const lastPrompt = rawCostPrompt ? new Date(rawCostPrompt).getTime() : 0;
            const setupAge   = Date.now() - new Date(d.quitDate).getTime();
            const promptAge  = Date.now() - lastPrompt;
            const YEAR_MS = 365 * 86_400_000;
            if (setupAge > YEAR_MS && (lastPrompt === 0 || promptAge > YEAR_MS)) {
              const formattedCpd = formatMoneyFromUsd(d.costPerDrink, country, 2);
              setTimeout(() => {
                Alert.alert(
                  'Update your numbers?',
                  `It's been a while since you set up your tracker. Has your cost per drink changed from ${formattedCpd}? Updating keeps "money saved" accurate.`,
                  [
                    { text: 'Looks right', style: 'cancel', onPress: () => {
                      AsyncStorage.setItem(KEYS.QD_COST_PROMPT, new Date().toISOString());
                    } },
                    { text: 'Update now', onPress: () => {
                      setFormDate(d.quitDate.slice(0, 10));
                      setFormDpd(String(d.drinksPerDay));
                      setFormCpd(usdToLocal(d.costPerDrink, country).toFixed(minorUnits(country)));
                      setShowSetup(true);
                      AsyncStorage.setItem(KEYS.QD_COST_PROMPT, new Date().toISOString());
                    } },
                  ],
                );
              }, 600);
            }
          } catch { /* prompt is best-effort */ }
        } catch {
          void AsyncStorage.removeItem(KEYS.QD);
          setData(null);
          setShowSetup(true);
        }
      } else {
        setData(null);
        setShowSetup(true);
      }
      try { setSlips(rawSlips ? (JSON.parse(rawSlips) as string[]) : []); } catch { setSlips([]); }
      try {
        const parsed = rawBest ? parseFloat(rawBest) : 0;
        setBestHours(Number.isFinite(parsed) ? parsed : 0);
      } catch { setBestHours(0); }
      try { setCravings(rawCrave ? (JSON.parse(rawCrave) as Craving[]) : []); } catch { setCravings([]); }
      // Defensive parse — guard against malformed JSON, missing keys, and non-array
      // values so a corrupted store can never throw or feed pickDailyQdTip junk.
      try {
        if (rawTip) {
          const parsed = JSON.parse(rawTip) as Partial<TipPrefs>;
          const liked   = Array.isArray(parsed?.liked)   ? parsed.liked.filter((x): x is string => typeof x === 'string')   : [];
          const skipped = Array.isArray(parsed?.skipped) ? parsed.skipped.filter((x): x is string => typeof x === 'string') : [];
          setTipPrefs({ liked, skipped });
        } else {
          setTipPrefs(DEFAULT_TIP_PREFS);
        }
      } catch { setTipPrefs(DEFAULT_TIP_PREFS); }
      // Reasons list — string[] persisted to KEYS.QD_REASONS. Defensive parse so
      // a corrupted store can't crash or surface garbage in the reasons view.
      try {
        if (rawReasons) {
          const parsed = JSON.parse(rawReasons);
          setReasons(Array.isArray(parsed)
            ? parsed.filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
            : []);
        } else {
          setReasons([]);
        }
      } catch { setReasons([]); }
    });
  }, [visible]);

  useEffect(() => {
    if (!data) { if (intervalRef.current) clearInterval(intervalRef.current); return; }
    function tick() {
      // Guard a corrupt persisted quitDate (NaN → 0) and clamp negatives so a
      // bad or future date can never produce negative stats.
      const t = new Date(data!.quitDate).getTime();
      setElapsed(Number.isFinite(t) ? Math.max(0, Date.now() - t) : 0);
    }
    tick();
    intervalRef.current = setInterval(tick, 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [data]);

  function saveSetup() {
    const dpd = parseFloat(formDpd) || 2;
    // User types in local currency; persist in USD via exchange rate.
    const cpdLocal = parseFloat(formCpd) || 5;
    const cpdUsd = localToUsd(cpdLocal, country);
    if (dpd < 0.1 || dpd > 50) { Alert.alert('Invalid value', 'Drinks per day must be between 0.1 and 50.'); return; }
    if (cpdUsd < 0 || cpdUsd > 500) { Alert.alert('Invalid value', `Cost per drink must be between ${formatMoneyFromUsd(0, country, 0)} and ${formatMoneyFromUsd(500, country, 0)}.`); return; }
    // Validate the quit date — an invalid string would crash .toISOString() with
    // a RangeError, and a future date would render every stat negative. Reject
    // both before persisting.
    const dateStr = formDate.trim();
    let quitDate: string;
    if (dateStr) {
      const parsed = new Date(dateStr + 'T00:00:00');
      if (!Number.isFinite(parsed.getTime())) {
        Alert.alert('Invalid date', 'Enter your quit date as YYYY-MM-DD.');
        return;
      }
      if (parsed.getTime() > Date.now()) {
        Alert.alert('Invalid date', 'Your quit date can\'t be in the future.');
        return;
      }
      quitDate = parsed.toISOString();
    } else {
      quitDate = new Date().toISOString();
    }
    const d: QdData = { quitDate, drinksPerDay: dpd, costPerDrink: cpdUsd };
    AsyncStorage.setItem(KEYS.QD, JSON.stringify(d));
    AsyncStorage.setItem(KEYS.QD_COST_PROMPT, new Date().toISOString());
    scheduleQdNotifications(new Date(quitDate)).catch(() => {});
    setData(d);
    setShowSetup(false);
  }

  function resetProgress() {
    const slipTs = new Date().toISOString();
    const currentStreakHours = data ? (Date.now() - new Date(data.quitDate).getTime()) / 3600000 : 0;
    Alert.alert(
      'I had a slip',
      "A slip doesn't erase your progress. Log it and keep the timer, or reset — your personal best is saved either way.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Log slip (keep timer)',
          onPress: () => {
            const updated = [...slips, slipTs];
            AsyncStorage.setItem(KEYS.QD_SLIPS, JSON.stringify(updated));
            setSlips(updated);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          },
        },
        {
          text: 'Reset timer to now',
          style: 'destructive',
          onPress: () => {
            const updated = [...slips, slipTs];
            const newBest = Math.max(bestHours, currentStreakHours);
            const d: QdData = { ...data!, quitDate: slipTs };
            AsyncStorage.setItem(KEYS.QD, JSON.stringify(d));
            AsyncStorage.setItem(KEYS.QD_SLIPS, JSON.stringify(updated));
            AsyncStorage.setItem(KEYS.QD_BEST, String(newBest));
            scheduleQdNotifications(new Date(slipTs)).catch(() => {});
            setSlips(updated);
            setBestHours(newBest);
            setData(d);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
          },
        },
      ],
    );
  }

  // Persist a craving log entry. Same pattern as QS — wins ride a Success haptic
  // and losses ride a softer Warning haptic, never moralize about a slip, and
  // never reset the timer (slips and cravings are separate buckets).
  function saveCraving() {
    const entry: Craving = {
      ts: new Date().toISOString(),
      intensity: cravingIntensity,
      trigger: cravingTrigger ?? undefined,
      coping:  cravingCoping ?? undefined,
      gaveIn:  cravingGaveIn,
    };
    const updated = [...cravings, entry];
    AsyncStorage.setItem(KEYS.QD_CRAVE, JSON.stringify(updated));
    setCravings(updated);
    setCravingFormOpen(false);
    // Reset form for next time so the user doesn't see stale values
    setCravingIntensity(6);
    setCravingTrigger(null);
    setCravingCoping(null);
    setCravingGaveIn(false);
    Haptics.notificationAsync(
      entry.gaveIn ? Haptics.NotificationFeedbackType.Warning : Haptics.NotificationFeedbackType.Success,
    ).catch(() => {});
  }

  // Cravings in the rolling last 7 days, plus the win-rate (didn't give in) so
  // the main view + cravings detail can surface a single resilience number.
  const qdCravingsLast7d = useMemo(() => {
    const cutoff = Date.now() - 7 * 86_400_000;
    return cravings.filter(c => new Date(c.ts).getTime() >= cutoff);
  }, [cravings]);
  const qdCravingsWon7d = qdCravingsLast7d.filter(c => !c.gaveIn).length;
  const qdCravingsWinRatePct = qdCravingsLast7d.length > 0
    ? Math.round((qdCravingsWon7d / qdCravingsLast7d.length) * 100)
    : null;

  // Today's tip — recomputes only when the user's preferences change so the same
  // tip stays put within a session. pickDailyQdTip is deterministic on the date
  // hash so the user sees one consistent tip per calendar day.
  const dailyQdTip = useMemo(() => pickDailyQdTip(tipPrefs), [tipPrefs]);

  // Toggle "love this" on a tip. Liking a tip auto-clears any prior skip so the
  // user's signal is unambiguous: a love overrides the hide.
  function toggleQdTipLike(id: string) {
    setTipPrefs(prev => {
      const isLiked = prev.liked.includes(id);
      const next: TipPrefs = {
        liked:   isLiked ? prev.liked.filter(x => x !== id) : [...prev.liked, id],
        skipped: isLiked ? prev.skipped : prev.skipped.filter(x => x !== id),
      };
      AsyncStorage.setItem(KEYS.QD_TIP, JSON.stringify(next));
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      return next;
    });
  }
  // Toggle "not for me" on a tip. Hiding auto-clears any prior love for the same
  // reason — opposite signals can't coexist on a single tip.
  function toggleQdTipSkip(id: string) {
    setTipPrefs(prev => {
      const isSkipped = prev.skipped.includes(id);
      const next: TipPrefs = {
        liked:   isSkipped ? prev.liked : prev.liked.filter(x => x !== id),
        skipped: isSkipped ? prev.skipped.filter(x => x !== id) : [...prev.skipped, id],
      };
      AsyncStorage.setItem(KEYS.QD_TIP, JSON.stringify(next));
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      return next;
    });
  }

  // ── Calm Breathing — 4-7-8 cycle state machine + animated scale ────────────
  // Identical loop to QuitSmokingModal — three rounds (inhale 4s · hold 7s ·
  // exhale 8s) → 'complete'. Refs back the running flag and round count so the
  // timing callbacks read fresh values even if React renders haven't caught up.
  const QD_BREATH_ROUNDS = 3;
  const qdBreathScale = useRef(new Animated.Value(0.55)).current;
  const qdBreathRunningRef = useRef(false);
  const qdBreathRoundRef = useRef(0);
  const qdBreathTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const [qdBreathRunning, setQdBreathRunning] = useState(false);
  const [qdBreathRound, setQdBreathRound] = useState(0);
  const [qdBreathPhase, setQdBreathPhase] = useState<'idle' | 'inhale' | 'hold' | 'exhale' | 'complete'>('idle');

  function runQdBreathCycle() {
    if (!qdBreathRunningRef.current) return;
    qdBreathRoundRef.current += 1;
    setQdBreathRound(qdBreathRoundRef.current);
    setQdBreathPhase('inhale');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    Animated.timing(qdBreathScale, {
      toValue: 1.0,
      duration: 4000,
      easing: Easing.inOut(Easing.quad),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!finished || !qdBreathRunningRef.current) return;
      setQdBreathPhase('hold');
      const tHold = setTimeout(() => {
        if (!qdBreathRunningRef.current) return;
        setQdBreathPhase('exhale');
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        Animated.timing(qdBreathScale, {
          toValue: 0.55,
          duration: 8000,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }).start(({ finished: f }) => {
          if (!f || !qdBreathRunningRef.current) return;
          if (qdBreathRoundRef.current >= QD_BREATH_ROUNDS) {
            qdBreathRunningRef.current = false;
            setQdBreathRunning(false);
            setQdBreathPhase('complete');
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          } else {
            runQdBreathCycle();
          }
        });
      }, 7000);
      qdBreathTimersRef.current.push(tHold);
    });
  }

  function startQdBreathing() {
    if (qdBreathRunningRef.current) return;
    qdBreathRunningRef.current = true;
    qdBreathRoundRef.current = 0;
    setQdBreathRound(0);
    setQdBreathRunning(true);
    runQdBreathCycle();
  }

  function stopQdBreathing() {
    qdBreathRunningRef.current = false;
    qdBreathRoundRef.current = 0;
    setQdBreathRunning(false);
    setQdBreathRound(0);
    setQdBreathPhase('idle');
    qdBreathScale.stopAnimation();
    Animated.timing(qdBreathScale, { toValue: 0.55, duration: 250, useNativeDriver: true }).start();
    qdBreathTimersRef.current.forEach(t => clearTimeout(t));
    qdBreathTimersRef.current = [];
  }

  // Auto-stop the breathing loop the moment we leave the breathing view or
  // close the modal. Prevents background timers / haptics from firing into a
  // hidden screen — the kind of bug that drains battery and confuses users.
  useEffect(() => {
    if (!visible || qdView !== 'breathing') {
      qdBreathRunningRef.current = false;
      qdBreathRoundRef.current = 0;
      setQdBreathRunning(false);
      setQdBreathRound(0);
      setQdBreathPhase('idle');
      qdBreathScale.stopAnimation();
      qdBreathTimersRef.current.forEach(t => clearTimeout(t));
      qdBreathTimersRef.current = [];
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, qdView]);

  // ── Reasons editor — opens the reasons screen in edit mode with a fresh draft ─
  // Mirrors QuitSmokingModal exactly so both programs share the same UX.
  function openReasonsEditor() {
    setReasonsDraft(reasons.length > 0 ? [...reasons] : []);
    setReasonsInput('');
    setReasonsEditing(true);
    setQdView('reasons');
  }
  function addReasonToDraft() {
    const trimmed = reasonsInput.trim();
    if (!trimmed) return;
    if (reasonsDraft.length >= 10) {
      Alert.alert('That\'s plenty', 'Pick your strongest 10 reasons — the list should sting when you read it back.');
      return;
    }
    setReasonsDraft([...reasonsDraft, trimmed]);
    setReasonsInput('');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }
  function removeReasonFromDraft(idx: number) {
    setReasonsDraft(reasonsDraft.filter((_, i) => i !== idx));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }
  function saveReasons() {
    const cleaned = reasonsDraft.map(r => r.trim()).filter(r => r.length > 0);
    AsyncStorage.setItem(KEYS.QD_REASONS, JSON.stringify(cleaned));
    setReasons(cleaned);
    setReasonsEditing(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }

  const hours = elapsed / 3600000;
  const drinksAvoided = data ? Math.floor(hours * (data.drinksPerDay / 24)) : 0;
  const moneySaved = data ? drinksAvoided * data.costPerDrink : 0;
  const calsAvoided = drinksAvoided * 150; // ~150 kcal per drink
  const unlockedCount = data ? QD_ACHIEVEMENTS.filter(a => hours >= a.hours).length : 0;

  // Returns "Xd Yh", "Xh Ym", or "Xm" — compact streak display for personal-best.
  function qdFormatStreakHours(h: number): string {
    if (h <= 0) return '0m';
    const totalMin = Math.floor(h * 60);
    const days = Math.floor(totalMin / 1440);
    const hrs  = Math.floor((totalMin % 1440) / 60);
    const mins = totalMin % 60;
    if (days > 0) return hrs > 0 ? `${days}d ${hrs}h` : `${days}d`;
    if (hrs  > 0) return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
    return `${mins}m`;
  }

  // Tier-based color for achievement badges — escalates with milestone weight.
  // <24h: first-day momentum (sky)   < 1wk: early days (teal)
  // <1mo: real traction (green)      < 1yr: long haul (honey)
  // ≥1yr: legendary (purple3)
  function qdAchColor(h: number): string {
    if (h < 24)    return colors.sky;
    if (h < 168)   return colors.teal;
    if (h < 720)   return colors.green;
    if (h < 8760)  return colors.honey;
    return colors.purple3;
  }

  // Date when an achievement was earned = quitDate + hours-threshold (in ms).
  function qdAchEarnedAt(a: typeof QD_ACHIEVEMENTS[number], quitDate: string): Date {
    const t = new Date(quitDate).getTime();
    return new Date(t + a.hours * 3_600_000);
  }

  // ── Confetti + haptic on newly-unlocked QD achievement ─────────────────────
  // Diff unlocked-IDs across renders. On first run we seed the ref without firing
  // (so opening the modal at hour 500 doesn't carpet-bomb the user with confetti
  // for every historical unlock). After seeding, any new id triggers the overlay.
  // Uses `hours` as the stable id since QD_ACHIEVEMENTS items are keyed by it.
  useEffect(() => {
    if (!data) return;
    const unlockedNow = new Set<string>(
      QD_ACHIEVEMENTS.filter(a => hours >= a.hours).map(a => String(a.hours)),
    );
    const prev = prevQdUnlockedRefGlobal.current;
    if (prev == null || !isSettled) {
      // First settled pass: seed the historical unlock set without firing, then
      // flip isSettled so subsequent ticks go live and fire on new crossings.
      prevQdUnlockedRefGlobal.current = unlockedNow;
      if (!isSettled) setIsSettled(true);
      return;
    }
    const newly: typeof QD_ACHIEVEMENTS[number][] = [];
    for (const a of QD_ACHIEVEMENTS) {
      if (unlockedNow.has(String(a.hours)) && !prev.has(String(a.hours))) newly.push(a);
    }
    if (newly.length > 0) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      // Cross-feature XP grant — earned milestones feed the app-wide leveling
      // system so quitting drinking pays into the same dopamine bank as QS.
      // 20xp per unlock keeps it meaningful but not exploitative.
      void useAppStore.getState().addXp(20 * newly.length);
    }
    prevQdUnlockedRefGlobal.current = unlockedNow;
  }, [hours, data]);

  async function shareQdAchievement(a: typeof QD_ACHIEVEMENTS[number]) {
    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const days = Math.floor(elapsed / 86_400_000);
      const moneyTxt = formatMoneyFromUsd(moneySaved, country, 0);
      const lines = [
        `🏆 I just unlocked "${a.title}" on Dagnara.`,
        a.desc + '.',
        '',
        '— My sobriety so far —',
        `🗓  ${fmt(days)} day${days === 1 ? '' : 's'} alcohol-free`,
        `🍺  ${fmt(drinksAvoided)} drink${drinksAvoided === 1 ? '' : 's'} avoided`,
        `💰  ${moneyTxt} saved`,
        '',
        'Dagnara · dagnara.com #QuitDrinking',
      ];
      await Share.share({ message: lines.join('\n') });
    } catch { /* user cancelled */ }
  }

  // ── Per-period projections (drives Overall Progress detail screen) ─────────
  // Unlike smoking (cigs-per-pack adds a layer), alcohol's cost-per-drink IS the
  // per-unit cost — no pack arithmetic needed. Calories use the ~150 kcal/drink
  // heuristic (~140 ml wine / 350 ml beer / 45 ml spirit average).
  const dpd = data?.drinksPerDay ?? 0;
  const cpdUsd = data?.costPerDrink ?? 0;
  const kcalPerDrink = 150;
  const drinksPer = {
    day:   Math.round(dpd),
    week:  Math.round(dpd * 7),
    month: Math.round(dpd * 30.42),
    year:  Math.round(dpd * 365),
  };
  const qdMoneyPer = {
    day:   cpdUsd * dpd,
    week:  cpdUsd * dpd * 7,
    month: cpdUsd * dpd * 30.42,
    year:  cpdUsd * dpd * 365,
  };
  const caloriesPer = {
    day:   Math.round(dpd * kcalPerDrink),
    week:  Math.round(dpd * kcalPerDrink * 7),
    month: Math.round(dpd * kcalPerDrink * 30.42),
    year:  Math.round(dpd * kcalPerDrink * 365),
  };
  // Country-aware currency formatter — QdData stores cost in USD.
  const fmtQdMoney = (vUsd: number): string => formatMoneyFromUsd(vUsd, country);

  if (showSetup) {
    return (
      <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
          <SafeAreaView style={m.sheet} edges={['top', 'bottom']}>
            <ProgramSheetHeader title="Quit Drinking Setup" onBack={() => (data ? setShowSetup(false) : onClose())} />
            <ScrollView
              contentContainerStyle={{ padding: spacing.md, gap: spacing.md }}
              automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={m.label}>Quit date (leave blank for right now)</Text>
              <TextInput
                style={m.input}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={colors.ink3}
                value={formDate}
                onChangeText={setFormDate}
                maxLength={10}
              />
              <Text style={m.label}>Drinks per day (average)</Text>
              <TextInput style={m.input} keyboardType="decimal-pad" value={formDpd} onChangeText={setFormDpd} placeholderTextColor={colors.ink3} />
              <Text style={m.label}>Cost per drink ({currencySymbol(country)})</Text>
              <TextInput style={m.input} keyboardType="decimal-pad" value={formCpd} onChangeText={setFormCpd} placeholderTextColor={colors.ink3} />
              <TouchableOpacity style={m.primaryBtn} activeOpacity={0.85} onPress={saveSetup}>
                <LinearGradient colors={[colors.purple, colors.purpleGlow]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={m.primaryBtnGrad}>
                  <Text style={m.primaryBtnTxt}>Start My Journey</Text>
                </LinearGradient>
              </TouchableOpacity>
            </ScrollView>
          </SafeAreaView>
      </Modal>
    );
  }

  return (
    <>
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={m.sheet} edges={['top', 'bottom']}>
        {/* ── Header: back-chevron pill + centered title on every view ─────── */}
        {qdView === 'main' ? (
            <ProgramSheetHeader
              title="Quit Drinking"
              onBack={onClose}
              right={
                <TouchableOpacity
                  onPress={() => {
                    if (data) {
                      setFormDate(data.quitDate.slice(0, 10));
                      setFormDpd(String(data.drinksPerDay));
                      // costPerDrink is stored in USD — convert to display currency for editing.
                      setFormCpd(usdToLocal(data.costPerDrink, country).toFixed(minorUnits(country)));
                    }
                    setShowSetup(true);
                  }}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  style={{ width: spacing.xl + spacing.sm, height: spacing.xl + spacing.sm, borderRadius: radius.pill, backgroundColor: colors.layer2, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: colors.line2 }}
                >
                  <Ionicons name="pencil-sharp" size={20} color={colors.ink} />
                </TouchableOpacity>
              }
            />
          ) : (
            <ProgramSheetHeader
              // Detail-view back navigation mirrors QuitSmokingModal.
              onBack={() => {
                if (qdView === 'achievement') { setSelectedAch(null); setQdView('achievements'); }
                else if (qdView === 'tip' || qdView === 'quitline' || qdView === 'breathing') setQdView('cravings');
                else { setReasonsEditing(false); setQdView('main'); }
              }}
              title={
                qdView === 'progress'     ? 'Overall progress' :
                qdView === 'achievements' ? 'Achievements' :
                qdView === 'health'       ? 'Health improvements' :
                qdView === 'cravings'     ? 'Beat your cravings' :
                qdView === 'tip'          ? 'Tip of the day' :
                qdView === 'quitline'     ? 'Helplines' :
                qdView === 'breathing'    ? 'Calm breathing' :
                qdView === 'reasons'      ? 'My reasons' :
                qdView === 'support'      ? 'Recovery support' : ''
              }
            />
          )}
        <ScrollView ref={qdScrollRef} contentContainerStyle={{ padding: spacing.md, gap: spacing.md }} showsVerticalScrollIndicator={false}>
          {/* ════════════════════════════════════════════════════════════════
              MAIN VIEW — timer + stats + achievements + health (existing content)
          ════════════════════════════════════════════════════════════════ */}
          {qdView === 'main' && (<>
          {/* Timer */}
          <View style={m.timerCard}>
            <Text style={m.timerLabel}>Alcohol-free for</Text>
            <Text style={m.timerValue}>{formatDuration(elapsed)}</Text>
            <Text style={m.timerSub}>{unlockedCount}/{QD_ACHIEVEMENTS.length} achievements unlocked</Text>
          </View>

          {/* Stats — tap any card to open the Overall Progress detail view */}
          <TouchableOpacity activeOpacity={0.85} onPress={() => setQdView('progress')}>
            <View style={m.statsRow}>
              <View style={m.statCard}>
                <Text style={m.statVal}>{fmt(drinksAvoided)}</Text>
                <Text style={m.statLbl}>drinks avoided</Text>
              </View>
              <View style={m.statCard}>
                <Text style={m.statVal}>{formatMoneyFromUsd(moneySaved, country)}</Text>
                <Text style={m.statLbl}>money saved</Text>
              </View>
              <View style={m.statCard}>
                <Text style={m.statVal}>{fmt(calsAvoided)}</Text>
                <Text style={m.statLbl}>kcal avoided</Text>
              </View>
            </View>
          </TouchableOpacity>

          {/* Resilience — personal best & slips (relapse-positive framing) */}
          <View style={m.statsRow}>
            <View style={m.statCard}>
              <Text style={m.statVal}>
                {(() => {
                  const best = Math.max(bestHours, hours);
                  if (best <= 0) return '0m';
                  const totalMin = Math.floor(best * 60);
                  const days = Math.floor(totalMin / 1440);
                  const hrs  = Math.floor((totalMin % 1440) / 60);
                  if (days > 0) return hrs > 0 ? `${days}d ${hrs}h` : `${days}d`;
                  if (hrs > 0) return `${hrs}h`;
                  return `${totalMin % 60}m`;
                })()}
              </Text>
              <Text style={m.statLbl}>personal best</Text>
            </View>
            <View style={m.statCard}>
              <Text style={m.statVal}>{slips.length}</Text>
              <Text style={m.statLbl}>slips logged</Text>
            </View>
            <View style={m.statCard}>
              <Text style={m.statVal}>
                {slips.length === 0
                  ? '—'
                  : (() => {
                      const h = (Date.now() - new Date(slips[slips.length - 1]).getTime()) / 3_600_000;
                      if (h <= 0) return '0m';
                      const totalMin = Math.floor(h * 60);
                      const days = Math.floor(totalMin / 1440);
                      const hrs  = Math.floor((totalMin % 1440) / 60);
                      if (days > 0) return hrs > 0 ? `${days}d ${hrs}h` : `${days}d`;
                      if (hrs > 0) return `${hrs}h`;
                      return `${totalMin % 60}m`;
                    })()}
              </Text>
              <Text style={m.statLbl}>last slip</Text>
            </View>
          </View>

          {/* ── Achievements (horizontal scroll + See all → grid) ─────────── */}
          <View style={m.qsSectionHead}>
            <Text style={m.qsHeading}>Achievements</Text>
            <TouchableOpacity onPress={() => setQdView('achievements')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={m.qsSeeAll}>See all</Text>
            </TouchableOpacity>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={m.qsAchScroll}
          >
            {QD_ACHIEVEMENTS.map((a, i) => {
              const done = hours >= a.hours;
              return (
                <TouchableOpacity
                  key={`ach-${i}`}
                  activeOpacity={0.85}
                  style={[m.qsAchTile, !done && m.qsAchTileLocked]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                    setSelectedAch(a);
                    setQdView('achievement');
                  }}
                >
                  <QsAchBadge icon={a.icon} color={qdAchColor(a.hours)} locked={!done} />
                  <Text style={[m.qsAchTileTitle, !done && { color: colors.ink3 }]} numberOfLines={1}>{a.title}</Text>
                  <Text style={m.qsAchTileDesc} numberOfLines={2}>{a.desc}</Text>
                  {done && (
                    <View style={m.qsAchCheck}>
                      <Ionicons name="checkmark" size={12} color={colors.white} />
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* ── Health improvements card → opens detail ─────────────── */}
          <View style={m.qsSectionHead}>
            <Text style={m.qsHeading}>Health improvements</Text>
            <TouchableOpacity onPress={() => setQdView('health')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={m.qsSeeAll}>See all</Text>
            </TouchableOpacity>
          </View>
          {(() => {
            // Pick the next-in-progress milestone (first one not yet done), or the
            // last one if everything is unlocked — keeps main view scannable.
            const next = QD_MILESTONES.find((ms) => hours < ms.hours) ?? QD_MILESTONES[QD_MILESTONES.length - 1];
            const pct  = Math.min(100, Math.round((hours / next.hours) * 100));
            const done = pct >= 100;
            return (
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); setQdView('health'); }}
                style={m.qsHealthCard}
              >
                <Text style={{ fontSize: fontSize.xl }}>{next.icon}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={m.qsHealthDesc}>{next.text}</Text>
                  <View style={[m.qsHealthBarRow, { marginTop: spacing.xs }]}>
                    <Text style={[m.qsHealthPct, { color: done ? colors.green : colors.sky }]}>{pct}</Text>
                    <View style={m.qsHealthBarTrack}>
                      <View
                        style={[
                          m.qsHealthBarFill,
                          { width: `${Math.max(pct, 4)}%`, backgroundColor: done ? colors.green : colors.sky },
                        ]}
                      />
                    </View>
                    <Text style={m.qsHealthBarEnd}>100</Text>
                  </View>
                </View>
              </TouchableOpacity>
            );
          })()}

          {/* ── Beat your cravings — entry card (same pattern as Health) ──── */}
          <View style={m.qsSectionHead}>
            <Text style={m.qsHeading}>Beat your cravings</Text>
            <TouchableOpacity onPress={() => setQdView('cravings')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={m.qsSeeAll}>See all</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); setQdView('cravings'); }}
            style={m.qsHealthCard}
          >
            <View style={{ width: 68, height: 78, alignItems: 'center', justifyContent: 'center' }}>
              <MeditationArt size={76} />
            </View>
            <View style={{ flex: 1 }}>
              {/* Show live stats if user has 7d history — otherwise generic intro */}
              {qdCravingsLast7d.length > 0 ? (
                <Text style={m.qsHealthDesc} numberOfLines={2}>
                  <Text style={{ color: colors.green, fontWeight: '800' }}>{qdCravingsWon7d}</Text>
                  {' '}
                  craving{qdCravingsWon7d === 1 ? '' : 's'} ridden out this week
                  {qdCravingsWinRatePct !== null ? ` · ${qdCravingsWinRatePct}% win rate` : ''}.
                </Text>
              ) : (
                <Text style={m.qsHealthDesc} numberOfLines={2}>
                  Small tools to ride out the urge when alcohol calls.
                </Text>
              )}
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.ink3} />
          </TouchableOpacity>

          {/* ── My reasons — strongest evidence-based craving anchor ─────── */}
          <View style={m.qsSectionHead}>
            <Text style={m.qsHeading}>My reasons</Text>
            <TouchableOpacity onPress={() => setQdView('reasons')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={m.qsSeeAll}>{reasons.length > 0 ? 'See all' : 'Add'}</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
              if (reasons.length === 0) openReasonsEditor();
              else setQdView('reasons');
            }}
            style={m.qsHealthCard}
          >
            <View style={[m.qsProgCircle, { backgroundColor: colors.rose, width: 56, height: 56 }]}>
              <Ionicons name="heart" size={26} color={colors.white} />
            </View>
            <View style={{ flex: 1 }}>
              {reasons.length > 0 ? (
                <>
                  <Text style={m.qsHealthDesc} numberOfLines={2}>
                    {`"${reasons[0]}"`}
                  </Text>
                  <Text style={[m.qsHealthDesc, { fontSize: fontSize.xs, color: colors.ink3, marginTop: 4 }]}>
                    {reasons.length} reason{reasons.length === 1 ? '' : 's'} · read on the next craving
                  </Text>
                </>
              ) : (
                <Text style={m.qsHealthDesc} numberOfLines={2}>
                  Write down why you're quitting. The strongest urge-fighting tool there is.
                </Text>
              )}
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.ink3} />
          </TouchableOpacity>

          {/* ── Recovery support — AA / SMART / online programs ────────────── */}
          <View style={m.qsSectionHead}>
            <Text style={m.qsHeading}>Recovery support</Text>
            <TouchableOpacity onPress={() => setQdView('support')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={m.qsSeeAll}>Open</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); setQdView('support'); }}
            style={m.qsHealthCard}
          >
            <View style={[m.qsProgCircle, { backgroundColor: colors.teal, width: 56, height: 56 }]}>
              <Ionicons name="people" size={26} color={colors.white} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={m.qsHealthDesc} numberOfLines={2}>
                AA, SMART Recovery, Refuge Recovery and more — find a meeting or community near you.
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.ink3} />
          </TouchableOpacity>

          <TouchableOpacity style={m.dangerBtn} onPress={resetProgress}>
            <Text style={m.dangerBtnTxt}>I had a drink</Text>
          </TouchableOpacity>
          <View style={{ height: 24 }} />
          </>)}

          {/* ════════════════════════════════════════════════════════════════
              PROGRESS DETAIL — drinks avoided / money saved / calories
              avoided per period + resilience (personal-best + slips)
          ════════════════════════════════════════════════════════════════ */}
          {qdView === 'progress' && (
            <>
              {/* Drinks avoided */}
              <Text style={m.qsDetailSectionTitle}>Drinks avoided</Text>
              <View style={m.qsDetailRow}>
                <Text style={m.qsDetailRowLbl}>Per day</Text>
                <Text style={m.qsDetailRowVal}>{fmt(drinksPer.day)}</Text>
              </View>
              <View style={m.qsDetailRow}>
                <Text style={m.qsDetailRowLbl}>Per week</Text>
                <Text style={m.qsDetailRowVal}>{fmt(drinksPer.week)}</Text>
              </View>
              <View style={m.qsDetailRow}>
                <Text style={m.qsDetailRowLbl}>Per month</Text>
                <Text style={m.qsDetailRowVal}>{fmt(drinksPer.month)}</Text>
              </View>
              <View style={[m.qsDetailRow, m.qsDetailRowLast]}>
                <Text style={m.qsDetailRowLbl}>Per year</Text>
                <Text style={m.qsDetailRowVal}>{fmt(drinksPer.year)}</Text>
              </View>

              {/* Money saved */}
              <Text style={m.qsDetailSectionTitle}>Money saved</Text>
              <View style={m.qsDetailRow}>
                <Text style={m.qsDetailRowLbl}>Per day</Text>
                <Text style={m.qsDetailRowVal}>{fmtQdMoney(qdMoneyPer.day)}</Text>
              </View>
              <View style={m.qsDetailRow}>
                <Text style={m.qsDetailRowLbl}>Per week</Text>
                <Text style={m.qsDetailRowVal}>{fmtQdMoney(qdMoneyPer.week)}</Text>
              </View>
              <View style={m.qsDetailRow}>
                <Text style={m.qsDetailRowLbl}>Per month</Text>
                <Text style={m.qsDetailRowVal}>{fmtQdMoney(qdMoneyPer.month)}</Text>
              </View>
              <View style={[m.qsDetailRow, m.qsDetailRowLast]}>
                <Text style={m.qsDetailRowLbl}>Per year</Text>
                <Text style={m.qsDetailRowVal}>{fmtQdMoney(qdMoneyPer.year)}</Text>
              </View>

              {/* Calories avoided — alcohol's equivalent of QS's "time won back" */}
              <Text style={m.qsDetailSectionTitle}>Calories avoided</Text>
              <View style={m.qsDetailRow}>
                <Text style={m.qsDetailRowLbl}>Per day</Text>
                <Text style={m.qsDetailRowVal}>{fmt(caloriesPer.day)} kcal</Text>
              </View>
              <View style={m.qsDetailRow}>
                <Text style={m.qsDetailRowLbl}>Per week</Text>
                <Text style={m.qsDetailRowVal}>{fmt(caloriesPer.week)} kcal</Text>
              </View>
              <View style={m.qsDetailRow}>
                <Text style={m.qsDetailRowLbl}>Per month</Text>
                <Text style={m.qsDetailRowVal}>{fmt(caloriesPer.month)} kcal</Text>
              </View>
              <View style={[m.qsDetailRow, m.qsDetailRowLast]}>
                <Text style={m.qsDetailRowLbl}>Per year</Text>
                <Text style={m.qsDetailRowVal}>{fmt(caloriesPer.year)} kcal</Text>
              </View>

              {/* Resilience — personal best + slip recovery (relapse-positive framing) */}
              <Text style={m.qsDetailSectionTitle}>Resilience</Text>
              <View style={m.qsDetailRow}>
                <Text style={m.qsDetailRowLbl}>Current streak</Text>
                <Text style={m.qsDetailRowVal}>{qdFormatStreakHours(hours)}</Text>
              </View>
              <View style={m.qsDetailRow}>
                <Text style={m.qsDetailRowLbl}>Personal best</Text>
                <Text style={[m.qsDetailRowVal, hours >= bestHours && { color: colors.green }]}>
                  {qdFormatStreakHours(Math.max(bestHours, hours))}
                  {hours >= bestHours && bestHours > 0 ? '  ★' : ''}
                </Text>
              </View>
              <View style={m.qsDetailRow}>
                <Text style={m.qsDetailRowLbl}>Slips logged</Text>
                <Text style={m.qsDetailRowVal}>{fmt(slips.length)}</Text>
              </View>
              <View style={[m.qsDetailRow, m.qsDetailRowLast]}>
                <Text style={m.qsDetailRowLbl}>Last slip</Text>
                <Text style={[m.qsDetailRowVal, slips.length === 0 && { color: colors.green }]}>
                  {slips.length === 0
                    ? 'Never'
                    : `${qdFormatStreakHours((Date.now() - new Date(slips[slips.length - 1]).getTime()) / 3_600_000)} ago`}
                </Text>
              </View>

              {/* Productivity scene — reuse the QS family-consistent bottom illo */}
              <View style={m.qsDetailArt}>
                <ProgressSceneArt width={240} />
              </View>
              <View style={{ height: 24 }} />
            </>
          )}

          {/* ════════════════════════════════════════════════════════════════
              ACHIEVEMENTS DETAIL — QuitNow-style 2-col grid w/ tier badges
          ════════════════════════════════════════════════════════════════ */}
          {qdView === 'achievements' && (
            <>
              <View style={m.qsAchGrid2}>
                {QD_ACHIEVEMENTS.map((a, i) => {
                  const done = hours >= a.hours;
                  return (
                    <TouchableOpacity
                      key={`ach-grid-${i}`}
                      activeOpacity={0.85}
                      style={m.qsAchCard}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                        setSelectedAch(a);
                        setQdView('achievement');
                      }}
                    >
                      {/* Badge block — top portion of card */}
                      <View style={m.qsAchCardArt}>
                        <QsAchBadge icon={a.icon} color={qdAchColor(a.hours)} locked={!done} />
                      </View>
                      {/* Title */}
                      <Text style={[m.qsAchCardTitle, !done && { color: colors.ink3 }]} numberOfLines={1}>
                        {a.title}
                      </Text>
                      {/* Stat — the descriptive text from the achievement */}
                      <Text style={[m.qsAchCardStat, !done && { color: colors.ink3 }]} numberOfLines={2}>
                        {a.desc}
                      </Text>
                      {/* Green scalloped verification seal — only when unlocked */}
                      {done && (
                        <View style={m.qsAchCardSeal}>
                          <Svg width={26} height={26} viewBox="0 0 64 64">
                            <Polygon
                              points={Array.from({ length: 24 }, (_, idx) => {
                                const ang = (idx / 24) * Math.PI * 2 - Math.PI / 2;
                                const r = idx % 2 === 0 ? 30 : 24;
                                return `${(32 + Math.cos(ang) * r).toFixed(2)},${(32 + Math.sin(ang) * r).toFixed(2)}`;
                              }).join(' ')}
                              fill={colors.green}
                            />
                            <Path
                              d="M 22 33 L 29 40 L 44 25"
                              stroke={colors.white}
                              strokeWidth={5}
                              fill="none"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </Svg>
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
              <View style={{ height: 24 }} />
            </>
          )}

          {/* ════════════════════════════════════════════════════════════════
              ACHIEVEMENT DETAIL — QuitNow-style hero badge + stat + date
          ════════════════════════════════════════════════════════════════ */}
          {qdView === 'achievement' && selectedAch && data && (() => {
            const a = selectedAch;
            const done = hours >= a.hours;
            const earnedAt = done ? qdAchEarnedAt(a, data.quitDate) : null;
            const dateTxt = earnedAt
              ? `${earnedAt.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })} at ${earnedAt.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false })}`
              : '';

            return (
              <>
                {/* ── Hero illo — QsIllo SVG sits directly on page bg, no card
                    frame. Chunk 15: swapped emoji-in-disc for the shared QsIllo
                    family so QD reads as the same trophy class as QS. ──────── */}
                <View style={m.qsAchDetailArt}>
                  <QsIllo kind={a.illo} id={a.id} locked={!done} />
                </View>

                {/* ── Title + stat + date chip ──────────────────────────────── */}
                <View style={m.qsAchDetailTitleWrap}>
                  <Text style={m.qsAchDetailTitle}>{a.title}</Text>
                  <Text style={m.qsAchDetailStat}>{a.desc}</Text>

                  {done ? (
                    <View style={m.qsAchDetailDate}>
                      <Ionicons name="checkmark-circle" size={16} color={colors.green} style={{ marginRight: 6 }} />
                      <Text style={m.qsAchDetailDateTxt}>{dateTxt || 'Unlocked'}</Text>
                    </View>
                  ) : (
                    <View style={m.qsAchDetailDate}>
                      <Ionicons name="lock-closed" size={14} color={colors.ink3} style={{ marginRight: 6 }} />
                      <Text style={[m.qsAchDetailDateTxt, { color: colors.ink3 }]}>Locked — keep going</Text>
                    </View>
                  )}
                </View>

                {/* ── Locked state: in-flow encouragement card ──────────────── */}
                {!done && (
                  <View style={m.qsAchDetailLockedNote}>
                    <Text style={m.qsAchDetailLockedTitle}>Almost there</Text>
                    <Text style={m.qsAchDetailLockedSub}>
                      {qdFormatStreakHours(Math.max(0, a.hours - hours))} to go — stay the course.
                    </Text>
                  </View>
                )}

                {/* Spacer so the bottom dock (added in chunk 13) won't cover content */}
                {done && <View style={{ height: 200 }} />}
              </>
            );
          })()}

          {/* ════════════════════════════════════════════════════════════════
              HEALTH IMPROVEMENTS DETAIL — progress bars per milestone.
              Same layout as QS but cited to NHS/NIH (alcohol-recovery sources).
          ════════════════════════════════════════════════════════════════ */}
          {qdView === 'health' && (
            <>
              <View style={m.qsHealthList}>
                {QD_MILESTONES.map((ms, i) => {
                  const pct  = Math.min(100, Math.round((hours / ms.hours) * 100));
                  const done = pct >= 100;
                  return (
                    <View key={`qd-h-${i}`} style={m.qsHealthRow}>
                      {/* Bar with end labels */}
                      <View style={m.qsHealthBarRow}>
                        <Text style={[m.qsHealthPct, { color: done ? colors.green : colors.sky }]}>{pct}</Text>
                        <View style={m.qsHealthBarTrack}>
                          <View
                            style={[
                              m.qsHealthBarFill,
                              { width: `${Math.max(pct, 4)}%`, backgroundColor: done ? colors.green : colors.sky },
                            ]}
                          />
                        </View>
                        <Text style={m.qsHealthBarEnd}>100</Text>
                      </View>
                      {/* Icon + description + tick */}
                      <View style={m.qsHealthBody}>
                        <Text style={{ fontSize: fontSize.lg }}>{ms.icon}</Text>
                        <Text style={m.qsHealthText}>{ms.text}</Text>
                        {done && <Ionicons name="checkmark-circle" size={20} color={colors.green} />}
                      </View>
                    </View>
                  );
                })}
                {/* Source footnote — NHS rod-of-asclepius mark in WHO blue family */}
                <View style={m.qsHealthWhoBlock}>
                  <Text style={m.qsHealthFootnote}>Based on</Text>
                  <Svg width={38} height={38} viewBox="0 0 64 64">
                    <Circle cx={32} cy={32} r={28} fill={colors.sky} />
                    <Line x1={32} y1={14} x2={32} y2={52} stroke={colors.white} strokeWidth={2} strokeLinecap="round" />
                    <Path
                      d="M 32 20 Q 26 24 32 28 Q 38 32 32 36 Q 26 40 32 44"
                      stroke={colors.white}
                      strokeWidth={1.8}
                      fill="none"
                      strokeLinecap="round"
                    />
                    <Circle cx={32} cy={32} r={14} fill="none" stroke={colors.white} strokeWidth={1.2} />
                  </Svg>
                  <Text style={m.qsHealthFootnote}>NHS &amp; NIAAA recovery data</Text>
                </View>
              </View>
              <View style={{ height: 24 }} />
            </>
          )}

          {/* ════════════════════════════════════════════════════════════════
              BEAT YOUR CRAVINGS — list of 3 tools (Tip / Quit lines / Breathing)
              + an "add reasons" hint (active once chunk 11 lands).
          ════════════════════════════════════════════════════════════════ */}
          {qdView === 'cravings' && (
            <>
              <Text style={m.qsCravingsIntro}>
                Pick a tool to ride the wave when an urge hits. Each takes less than a minute.
              </Text>

              {/* Reasons reminder banner — the strongest in-moment craving tool.
                  Populated state previews reason #1 and routes to the reasons
                  read-mode view; empty state pulls the user into the editor. */}
              {reasons.length > 0 ? (
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); setQdView('reasons'); }}
                  style={m.qsReasonsBanner}
                >
                  <View style={m.qsReasonsBannerIcon}>
                    <Ionicons name="heart" size={18} color={colors.rose} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={m.qsReasonsBannerLbl}>READ FIRST · YOUR REASONS</Text>
                    <Text style={m.qsReasonsBannerTxt} numberOfLines={2}>
                      {`"${reasons[0]}"`}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.ink3} />
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); openReasonsEditor(); }}
                  style={m.qsReasonsBannerEmpty}
                >
                  <Ionicons name="heart-outline" size={18} color={colors.rose} />
                  <Text style={m.qsReasonsBannerEmptyTxt}>
                    Write down your reasons — the #1 craving tool.
                  </Text>
                </TouchableOpacity>
              )}

              {/* 7-day craving summary — only shown once user has any history */}
              {qdCravingsLast7d.length > 0 && (
                <View style={m.qsCravingSummary}>
                  <View style={m.qsCravingSummaryCell}>
                    <Text style={m.qsCravingSummaryVal}>{qdCravingsLast7d.length}</Text>
                    <Text style={m.qsCravingSummaryLbl}>logged · 7d</Text>
                  </View>
                  <View style={m.qsCravingSummaryDiv} />
                  <View style={m.qsCravingSummaryCell}>
                    <Text style={[m.qsCravingSummaryVal, { color: colors.green }]}>{qdCravingsWon7d}</Text>
                    <Text style={m.qsCravingSummaryLbl}>rode out</Text>
                  </View>
                  {qdCravingsWinRatePct !== null && (
                    <>
                      <View style={m.qsCravingSummaryDiv} />
                      <View style={m.qsCravingSummaryCell}>
                        <Text style={[m.qsCravingSummaryVal, { color: colors.honey }]}>{qdCravingsWinRatePct}%</Text>
                        <Text style={m.qsCravingSummaryLbl}>win rate</Text>
                      </View>
                    </>
                  )}
                </View>
              )}

              {/* Log a craving — primary action up top so it's the first tap target */}
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                  setCravingFormOpen(true);
                }}
                style={m.qsCravingLogBtnWrap}
              >
                <LinearGradient
                  colors={[colors.purple, colors.purpleGlow]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={m.qsCravingLogBtn}
                >
                  <Ionicons name="add-circle" size={18} color={colors.white} />
                  <Text style={m.qsCravingLogBtnTxt}>Log a craving</Text>
                </LinearGradient>
              </TouchableOpacity>

              {/* Tip of the day */}
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); setQdView('tip'); }}
                style={m.qsCravingCard}
              >
                <View style={m.qsCravingCardArt}>
                  <TipBulbArt size={84} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={m.qsCravingCardTitle}>Tip of the day</Text>
                  <Text style={m.qsCravingCardDesc}>A fresh strategy every day to keep urges short and sweet.</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.ink3} />
              </TouchableOpacity>

              {/* Helplines */}
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); setQdView('quitline'); }}
                style={m.qsCravingCard}
              >
                <View style={m.qsCravingCardArt}>
                  <QuitlinePhoneArt size={84} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={m.qsCravingCardTitle}>Helplines</Text>
                  <Text style={m.qsCravingCardDesc}>Free, confidential support lines staffed by trained counselors.</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.ink3} />
              </TouchableOpacity>

              {/* Calm breathing */}
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); setQdView('breathing'); }}
                style={m.qsCravingCard}
              >
                <View style={m.qsCravingCardArt}>
                  <MeditationArt size={84} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={m.qsCravingCardTitle}>Calm breathing</Text>
                  <Text style={m.qsCravingCardDesc}>Guided 4-7-8 breath cycle to drop your stress and the urge with it.</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.ink3} />
              </TouchableOpacity>

              <View style={{ height: 24 }} />
            </>
          )}

          {/* ════════════════════════════════════════════════════════════════
              TIP OF THE DAY — date stamp, one fresh tip, love/hide reactions.
              Reactions persist to KEYS.QD_TIP and bias tomorrow's pick away
              from skipped tips so the rotation feels personal over time.
          ════════════════════════════════════════════════════════════════ */}
          {qdView === 'tip' && (
            <>
              <View style={m.qsTipHero}>
                <TipBulbArt size={140} />
              </View>
              <Text style={m.qsTipDate}>
                {new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
              </Text>
              <Text style={m.qsTipTitle}>{dailyQdTip.title}</Text>
              <Text style={m.qsTipBody}>{dailyQdTip.body}</Text>

              <View style={m.qsTipReactRow}>
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => toggleQdTipLike(dailyQdTip.id)}
                  style={[m.qsTipReactBtn, tipPrefs.liked.includes(dailyQdTip.id) && m.qsTipReactBtnLiked]}
                >
                  <Ionicons
                    name={tipPrefs.liked.includes(dailyQdTip.id) ? 'heart' : 'heart-outline'}
                    size={18}
                    color={tipPrefs.liked.includes(dailyQdTip.id) ? colors.rose : colors.ink2}
                  />
                  <Text style={[m.qsTipReactTxt, tipPrefs.liked.includes(dailyQdTip.id) && { color: colors.rose }]}>
                    {tipPrefs.liked.includes(dailyQdTip.id) ? 'Loved' : 'Love this'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => toggleQdTipSkip(dailyQdTip.id)}
                  style={[m.qsTipReactBtn, tipPrefs.skipped.includes(dailyQdTip.id) && m.qsTipReactBtnSkipped]}
                >
                  <Ionicons
                    name={tipPrefs.skipped.includes(dailyQdTip.id) ? 'eye-off' : 'eye-off-outline'}
                    size={18}
                    color={tipPrefs.skipped.includes(dailyQdTip.id) ? colors.honey : colors.ink2}
                  />
                  <Text style={[m.qsTipReactTxt, tipPrefs.skipped.includes(dailyQdTip.id) && { color: colors.honey }]}>
                    {tipPrefs.skipped.includes(dailyQdTip.id) ? 'Hidden' : 'Not for me'}
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={m.qsTipDivider} />
              <View style={m.qsTipFootRow}>
                <Ionicons name="refresh" size={16} color={colors.ink3} />
                <Text style={m.qsTipFootTxt}>A new tip unlocks every day. Come back tomorrow.</Text>
              </View>
              <View style={{ height: 24 }} />
            </>
          )}

          {/* ════════════════════════════════════════════════════════════════
              HELPLINES — user's home-country alcohol helpline (falls back to
              the full international list when no entry exists for their
              country). Tap a row to dial directly.
          ════════════════════════════════════════════════════════════════ */}
          {qdView === 'quitline' && (
            <>
              <View style={m.qsQuitlineHero}>
                <QuitlinePhoneArt size={120} />
              </View>
              <Text style={m.qsQuitlineIntro}>
                Free, confidential, and staffed by counselors trained in alcohol recovery. Tap a number to call now.
              </Text>

              <View style={m.qsQuitlineGroup}>
                {/* Country-specific: show only the user's home-country helpline(s).
                    If the user's country isn't in the dataset, fall back to the full
                    list (alphabetised) so the screen is never empty. */}
                {(() => {
                  const local = QD_QUITLINES.filter(q => q.code === country);
                  const list = local.length > 0
                    ? local
                    : [...QD_QUITLINES].sort((a, b) => a.region.localeCompare(b.region));
                  return list.map((q, idx, arr) => (
                    <TouchableOpacity
                      key={q.code}
                      activeOpacity={0.85}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                        Linking.openURL(q.href).catch(() => {
                          Alert.alert('Unable to dial', `Please dial ${q.number} from your phone app.`);
                        });
                      }}
                      style={[m.qsQuitlineRow, idx === arr.length - 1 && m.qsQuitlineRowLast]}
                    >
                      <Text style={m.qsQuitlineFlag}>{q.flag}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={m.qsQuitlineRegion}>{q.region}</Text>
                        <Text style={m.qsQuitlineHours}>{q.hours}</Text>
                      </View>
                      <View style={m.qsQuitlineCallBtn}>
                        <Ionicons name="call" size={14} color={colors.white} />
                        <Text style={m.qsQuitlineNumber}>{q.number}</Text>
                      </View>
                    </TouchableOpacity>
                  ));
                })()}
              </View>

              <Text style={m.qsQuitlineFootnote}>
                {QD_QUITLINES.some(q => q.code === country)
                  ? 'In an immediate medical emergency, dial your local emergency number instead.'
                  : 'No dedicated helpline is listed for your country yet — these international lines may still help. In an immediate emergency, dial your local emergency number instead.'}
              </Text>
              <View style={{ height: 24 }} />
            </>
          )}

          {/* ════════════════════════════════════════════════════════════════
              CALM BREATHING — 4-7-8 guided breath with animated circle.
              Mirrors QuitSmokingModal exactly — the technique is identical and
              the alcohol-specific framing is in the "Why it works" footer.
          ════════════════════════════════════════════════════════════════ */}
          {qdView === 'breathing' && (
            <>
              <Text style={m.qsBreathingIntro}>
                Inhale for 4 seconds, hold for 7, exhale for 8. Three rounds is enough to reset your nervous system.
              </Text>

              <View style={m.qsBreathingStage}>
                {/* Outer dashed guide ring */}
                <View style={m.qsBreathingGuideOuter} pointerEvents="none" />
                {/* Mid solid guide ring */}
                <View style={m.qsBreathingGuideMid} pointerEvents="none" />
                {/* Halo dots scattered around the outer ring */}
                {Array.from({ length: 12 }).map((_, i) => {
                  const ang = (i * 30 - 90) * Math.PI / 180;
                  const r = 150;
                  const dx = Math.cos(ang) * r;
                  const dy = Math.sin(ang) * r;
                  const big = i % 3 === 0;
                  const color = big ? colors.honey : (i % 3 === 1 ? colors.purple3 : colors.purple);
                  return (
                    <View
                      key={`qd-br-halo-${i}`}
                      pointerEvents="none"
                      style={{
                        position: 'absolute',
                        width: big ? 6 : 4,
                        height: big ? 6 : 4,
                        borderRadius: radius.pill,
                        backgroundColor: color,
                        transform: [{ translateX: dx }, { translateY: dy }],
                      }}
                    />
                  );
                })}
                {/* Animated breath circle */}
                <Animated.View
                  style={[
                    m.qsBreathingCircle,
                    { transform: [{ scale: qdBreathScale }] },
                  ]}
                >
                  <LinearGradient
                    colors={[colors.purple2, colors.purpleGlow]}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                    style={StyleSheet.absoluteFillObject}
                  />
                  {/* Inner highlight (polished plastic) */}
                  <View style={m.qsBreathingCircleHighlight} pointerEvents="none" />
                </Animated.View>
                {/* Phase label sits on top, perfectly centered */}
                <View style={m.qsBreathingPhaseWrap} pointerEvents="none">
                  <Text style={m.qsBreathingPhase}>
                    {qdBreathPhase === 'idle'     && 'Ready'}
                    {qdBreathPhase === 'inhale'   && 'Breathe in'}
                    {qdBreathPhase === 'hold'     && 'Hold'}
                    {qdBreathPhase === 'exhale'   && 'Breathe out'}
                    {qdBreathPhase === 'complete' && 'Complete'}
                  </Text>
                  <Text style={m.qsBreathingPhaseSub}>
                    {qdBreathPhase === 'idle'     && 'Tap start when you’re ready'}
                    {qdBreathPhase === 'inhale'   && '4 seconds'}
                    {qdBreathPhase === 'hold'     && '7 seconds'}
                    {qdBreathPhase === 'exhale'   && '8 seconds'}
                    {qdBreathPhase === 'complete' && 'Three rounds done'}
                  </Text>
                </View>
              </View>

              {/* Round progress — three dots, one per breathing round */}
              <View style={m.qsBreathingDots}>
                {Array.from({ length: QD_BREATH_ROUNDS }).map((_, i) => (
                  <View
                    key={`qd-br-dot-${i}`}
                    style={[
                      m.qsBreathingDot,
                      { backgroundColor: qdBreathRound > i ? colors.honey : colors.line2 },
                    ]}
                  />
                ))}
              </View>

              {/* Start / stop CTA */}
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
                  if (qdBreathRunning) stopQdBreathing();
                  else startQdBreathing();
                }}
                style={m.qsBreathingBtnWrap}
              >
                {qdBreathRunning ? (
                  <View style={[m.qsBreathingBtn, { backgroundColor: colors.rose + '22', borderColor: colors.rose + '55' }]}>
                    <Ionicons name="stop" size={16} color={colors.rose} />
                    <Text style={[m.qsBreathingBtnTxt, { color: colors.rose }]}>Stop</Text>
                  </View>
                ) : (
                  <LinearGradient
                    colors={[colors.purple, colors.purpleGlow]}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                    style={m.qsBreathingBtn}
                  >
                    <Ionicons name="play" size={16} color={colors.white} />
                    <Text style={m.qsBreathingBtnTxt}>{qdBreathPhase === 'complete' ? 'Breathe again' : 'Start'}</Text>
                  </LinearGradient>
                )}
              </TouchableOpacity>

              <View style={m.qsBreathingTips}>
                <Text style={m.qsBreathingTipsHead}>Why it works</Text>
                <Text style={m.qsBreathingTipsBody}>
                  Slow exhales activate your parasympathetic nervous system — the same one that tells your body the danger has passed. Three rounds is usually enough to outlast an alcohol urge’s peak, which typically subsides within five minutes.
                </Text>
              </View>
              <View style={{ height: 32 }} />
            </>
          )}

          {/* ════════════════════════════════════════════════════════════════
              MY REASONS — strongest evidence-based craving anchor.
              Editor mode (reasonsEditing) adds/removes; read mode shows list.
          ════════════════════════════════════════════════════════════════ */}
          {qdView === 'reasons' && (
            reasonsEditing ? (
              <>
                <View style={m.qsReasonsIntro}>
                  <Ionicons name="heart" size={18} color={colors.rose} />
                  <Text style={m.qsReasonsIntroTxt}>
                    Write down why you're quitting, in your own words. On a hard craving, reading this back is the most effective thing you can do.
                  </Text>
                </View>

                <View style={m.qsReasonAddRow}>
                  <TextInput
                    style={[m.qsTextInput, { flex: 1 }]}
                    value={reasonsInput}
                    onChangeText={setReasonsInput}
                    placeholder="e.g. To be present for my family"
                    placeholderTextColor={colors.ink3}
                    returnKeyType="done"
                    onSubmitEditing={addReasonToDraft}
                    maxLength={120}
                  />
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={addReasonToDraft}
                    style={m.qsReasonAddBtn}
                  >
                    <Ionicons name="add" size={26} color={colors.white} />
                  </TouchableOpacity>
                </View>

                {reasonsDraft.length === 0 ? (
                  <Text style={m.qsReasonsEmptyHint}>
                    No reasons yet — add your first one above.
                  </Text>
                ) : (
                  <View style={{ gap: spacing.sm }}>
                    {reasonsDraft.map((r, i) => (
                      <View key={`qd-rdraft-${i}`} style={m.qsReasonRow}>
                        <View style={m.qsReasonNum}>
                          <Text style={m.qsReasonNumTxt}>{i + 1}</Text>
                        </View>
                        <Text style={m.qsReasonRowTxt}>{r}</Text>
                        <TouchableOpacity
                          onPress={() => removeReasonFromDraft(i)}
                          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        >
                          <Ionicons name="close-circle" size={22} color={colors.ink3} />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                )}

                <TouchableOpacity activeOpacity={0.85} onPress={saveReasons} style={m.qsCravingSaveBtnWrap}>
                  <LinearGradient
                    colors={[colors.purple, colors.purpleGlow]}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                    style={m.qsCravingSaveBtn}
                  >
                    <Text style={m.qsCravingSaveBtnTxt}>Save reasons</Text>
                  </LinearGradient>
                </TouchableOpacity>
                <View style={{ height: 24 }} />
              </>
            ) : reasons.length === 0 ? (
              <>
                <View style={m.qsReasonsEmptyWrap}>
                  <View style={m.qsReasonsEmptyIcon}>
                    <Ionicons name="heart" size={40} color={colors.rose} />
                  </View>
                  <Text style={m.qsReasonsEmptyTitle}>Why are you quitting?</Text>
                  <Text style={m.qsReasonsEmptyBody}>
                    Your reasons are the strongest craving tool there is. Reading them back beats any tip or breathing exercise.
                  </Text>
                  <TouchableOpacity activeOpacity={0.85} onPress={openReasonsEditor} style={m.qsCravingSaveBtnWrap}>
                    <LinearGradient
                      colors={[colors.purple, colors.purpleGlow]}
                      start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                      style={m.qsCravingSaveBtn}
                    >
                      <Text style={m.qsCravingSaveBtnTxt}>Add your reasons</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                </View>
                <View style={{ height: 24 }} />
              </>
            ) : (
              <>
                <View style={m.qsReasonsIntro}>
                  <Ionicons name="heart" size={18} color={colors.rose} />
                  <Text style={m.qsReasonsIntroTxt}>
                    When a craving hits, read this list slowly, top to bottom. Cravings peak and pass within a few minutes.
                  </Text>
                </View>
                <View style={{ gap: spacing.sm }}>
                  {reasons.map((r, i) => (
                    <View key={`qd-reason-${i}`} style={m.qsReasonRow}>
                      <View style={m.qsReasonNum}>
                        <Text style={m.qsReasonNumTxt}>{i + 1}</Text>
                      </View>
                      <Text style={m.qsReasonRowTxt}>{r}</Text>
                    </View>
                  ))}
                </View>
                <TouchableOpacity activeOpacity={0.85} onPress={openReasonsEditor} style={m.qsReasonsEditBtn}>
                  <Ionicons name="pencil" size={16} color={colors.purple} />
                  <Text style={m.qsReasonsEditBtnTxt}>Edit reasons</Text>
                </TouchableOpacity>
                <View style={{ height: 24 }} />
              </>
            )
          )}

          {/* ════════════════════════════════════════════════════════════════
              RECOVERY SUPPORT — AA / SMART / online programs. List of free,
              evidence-based communities and frameworks. Each row opens either
              the program's website (url) or dials a 24/7 helpline (phone).
              Footnote warns about medical alcohol withdrawal — sudden
              cessation in severe dependence can be dangerous and should be
              done under medical supervision.
          ════════════════════════════════════════════════════════════════ */}
          {qdView === 'support' && (
            <>
              <View style={m.qsQuitlineHero}>
                <View
                  style={{
                    width: 96, height: 96, borderRadius: radius.pill,
                    backgroundColor: colors.purpleTint,
                    borderWidth: 1, borderColor: colors.line3,
                    alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <Ionicons name="people" size={48} color={colors.lavender} />
                </View>
              </View>
              <Text style={m.qsQuitlineIntro}>
                Evidence-based recovery support — pick the community or framework that fits how you think. All free.
              </Text>

              <View style={m.qsQuitlineGroup}>
                {QD_SUPPORT.map((s, idx, arr) => (
                  <TouchableOpacity
                    key={s.key}
                    activeOpacity={0.85}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                      const target = s.phone ? `tel:${s.phone}` : s.url!;
                      Linking.openURL(target).catch(() => {
                        Alert.alert(
                          s.phone ? 'Unable to dial' : 'Unable to open',
                          s.phone
                            ? `Please dial ${s.phone} from your phone app.`
                            : `Visit ${s.url} in your browser.`
                        );
                      });
                    }}
                    style={[m.qsQuitlineRow, idx === arr.length - 1 && m.qsQuitlineRowLast]}
                  >
                    <View
                      style={{
                        width: 36, height: 36, borderRadius: radius.pill,
                        backgroundColor: s.color + '22',
                        alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      <Ionicons name={s.icon} size={18} color={s.color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={m.qsQuitlineRegion}>{s.name}</Text>
                      <Text
                        style={[m.qsQuitlineHours, { lineHeight: fontSize.xs + 4 }]}
                        numberOfLines={2}
                      >
                        {s.desc}
                      </Text>
                    </View>
                    <Ionicons
                      name={s.phone ? 'call' : 'open-outline'}
                      size={18}
                      color={colors.ink3}
                    />
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={m.qsQuitlineFootnote}>
                Not medical advice. If you have severe alcohol dependence, talk to a doctor before quitting — sudden alcohol withdrawal can be dangerous.
              </Text>
              <View style={{ height: 24 }} />
            </>
          )}

          {/* ════════════════════════════════════════════════════════════════
              STUB VIEWS — all QD views now implemented. Guard left in place
              as a defensive no-op in case qdView is set to an unknown value.
          ════════════════════════════════════════════════════════════════ */}
          {qdView !== 'main' && qdView !== 'progress' && qdView !== 'achievements' && qdView !== 'achievement' && qdView !== 'health' && qdView !== 'cravings' && qdView !== 'tip' && qdView !== 'quitline' && qdView !== 'breathing' && qdView !== 'reasons' && qdView !== 'support' && (
            <View style={{ paddingVertical: spacing.xl, alignItems: 'center', gap: spacing.sm }}>
              <Text style={{ fontSize: fontSize.sm, color: colors.ink3, textAlign: 'center', paddingHorizontal: spacing.lg }}>
                This view is being built. Tap the back arrow to return.
              </Text>
            </View>
          )}
        </ScrollView>

        {/* ════════════════════════════════════════════════════════════════
            DOCKED SHARE BAR — anchored below the achievement detail view
            when the selected achievement is unlocked. Same UX as QS: title +
            sub on top, 5 brand-colored social buttons below. The brand hex
            literals here are intentional (Instagram/X/Facebook/TikTok logo
            identification) and mirror the QS implementation 1:1.
        ════════════════════════════════════════════════════════════════ */}
        {qdView === 'achievement' && selectedAch && data && hours >= selectedAch.hours && (() => {
          const a = selectedAch;
          const onShare = () => { void shareQdAchievement(a); };
          return (
            <View style={m.qsAchDetailDock} pointerEvents="box-none">
              <Text style={m.qsAchDockTitle}>You did it!</Text>
              <Text style={m.qsAchDockSub}>Your recovery has progressed</Text>

              <View style={m.qsAchSocialRow}>
                {/* Instagram — multi-stop brand gradient */}
                <TouchableOpacity activeOpacity={0.8} onPress={onShare} style={m.qsAchSocialBtn}>
                  <LinearGradient
                    colors={['#feda75', '#fa7e1e', '#d62976', '#962fbf', '#4f5bd5']}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                    style={m.qsAchSocialGrad}
                  >
                    <Ionicons name="logo-instagram" size={20} color={colors.white} />
                  </LinearGradient>
                </TouchableOpacity>

                {/* X — brand black */}
                <TouchableOpacity activeOpacity={0.8} onPress={onShare} style={m.qsAchSocialBtn}>
                  <LinearGradient
                    colors={['#0a0a0a', '#000000']}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                    style={m.qsAchSocialGrad}
                  >
                    <Text style={m.qsAchSocialX}>𝕏</Text>
                  </LinearGradient>
                </TouchableOpacity>

                {/* Facebook — brand blue */}
                <TouchableOpacity activeOpacity={0.8} onPress={onShare} style={m.qsAchSocialBtn}>
                  <LinearGradient
                    colors={['#1877f2', '#0c5fd9']}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                    style={m.qsAchSocialGrad}
                  >
                    <Ionicons name="logo-facebook" size={20} color={colors.white} />
                  </LinearGradient>
                </TouchableOpacity>

                {/* TikTok — brand black */}
                <TouchableOpacity activeOpacity={0.8} onPress={onShare} style={m.qsAchSocialBtn}>
                  <LinearGradient
                    colors={['#000000', '#0a0a0a']}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                    style={m.qsAchSocialGrad}
                  >
                    <Ionicons name="logo-tiktok" size={20} color={colors.white} />
                  </LinearGradient>
                </TouchableOpacity>

                {/* Generic share — green to match the header share icon */}
                <TouchableOpacity activeOpacity={0.8} onPress={onShare} style={m.qsAchSocialBtn}>
                  <View style={[m.qsAchSocialGrad, { backgroundColor: colors.green }]}>
                    <Ionicons name="share-outline" size={20} color={colors.white} />
                  </View>
                </TouchableOpacity>
              </View>
            </View>
          );
        })()}

      </SafeAreaView>
    </Modal>

    {/* ────────────────────────────────────────────────────────────────────
        QD CRAVING LOG FORM — intensity / trigger / coping / "did you give in"
        Sibling Modal so it overlays the parent QuitDrinkingModal cleanly.
        Uses QD_CRAVING_TRIGGERS / QD_CRAVING_COPING (alcohol-tuned chips).
    ──────────────────────────────────────────────────────────────────── */}
    <Modal
      visible={cravingFormOpen}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={() => setCravingFormOpen(false)}
    >
      <SafeAreaView style={m.sheet} edges={['top', 'bottom']}>
        <ProgramSheetHeader title="Log a craving" onBack={() => setCravingFormOpen(false)} />
        <ScrollView
          contentContainerStyle={{ padding: spacing.md, gap: spacing.lg }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Intensity 1-10 */}
          <View style={{ gap: spacing.sm }}>
            <Text style={m.qsCravingFormLbl}>Intensity</Text>
            <View style={m.qsCravingIntensityRow}>
              {Array.from({ length: 10 }, (_, i) => i + 1).map(n => {
                const active = cravingIntensity === n;
                const tint = n <= 3 ? colors.green : n <= 6 ? colors.honey : colors.rose;
                return (
                  <TouchableOpacity
                    key={`qd-int-${n}`}
                    activeOpacity={0.8}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                      setCravingIntensity(n);
                    }}
                    style={[
                      m.qsCravingIntensityCell,
                      active && { backgroundColor: tint + '33', borderColor: tint },
                    ]}
                  >
                    <Text style={[m.qsCravingIntensityNum, active && { color: tint }]}>{n}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={m.qsCravingFormHint}>
              {cravingIntensity <= 3 ? 'Mild — a passing thought.' :
                cravingIntensity <= 6 ? 'Moderate — definitely noticeable.' :
                cravingIntensity <= 8 ? 'Strong — hard to ignore.' :
                'Severe — fighting hard.'}
            </Text>
          </View>

          {/* Trigger */}
          <View style={{ gap: spacing.sm }}>
            <Text style={m.qsCravingFormLbl}>What triggered it?</Text>
            <View style={m.qsCravingChipRow}>
              {QD_CRAVING_TRIGGERS.map(t => {
                const active = cravingTrigger === t.key;
                return (
                  <TouchableOpacity
                    key={`qd-trig-${t.key}`}
                    activeOpacity={0.85}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                      setCravingTrigger(active ? null : t.key);
                    }}
                    style={[m.qsCravingChip, active && m.qsCravingChipActive]}
                  >
                    <Text style={m.qsCravingChipIcon}>{t.icon}</Text>
                    <Text style={[m.qsCravingChipLbl, active && { color: colors.ink }]}>{t.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Coping */}
          <View style={{ gap: spacing.sm }}>
            <Text style={m.qsCravingFormLbl}>How did you handle it?</Text>
            <View style={m.qsCravingChipRow}>
              {QD_CRAVING_COPING.map(t => {
                const active = cravingCoping === t.key;
                return (
                  <TouchableOpacity
                    key={`qd-cop-${t.key}`}
                    activeOpacity={0.85}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                      setCravingCoping(active ? null : t.key);
                    }}
                    style={[m.qsCravingChip, active && m.qsCravingChipActive]}
                  >
                    <Text style={m.qsCravingChipIcon}>{t.icon}</Text>
                    <Text style={[m.qsCravingChipLbl, active && { color: colors.ink }]}>{t.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Gave in toggle — two-button outcome picker, never moralizing */}
          <View style={{ gap: spacing.sm }}>
            <Text style={m.qsCravingFormLbl}>Outcome</Text>
            <View style={m.qsCravingOutcomeRow}>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                  setCravingGaveIn(false);
                }}
                style={[
                  m.qsCravingOutcomeBtn,
                  !cravingGaveIn && { backgroundColor: colors.green + '22', borderColor: colors.green },
                ]}
              >
                <Ionicons name="checkmark-circle" size={20} color={!cravingGaveIn ? colors.green : colors.ink3} />
                <Text style={[m.qsCravingOutcomeTxt, !cravingGaveIn && { color: colors.green }]}>Rode it out</Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                  setCravingGaveIn(true);
                }}
                style={[
                  m.qsCravingOutcomeBtn,
                  cravingGaveIn && { backgroundColor: colors.honey + '22', borderColor: colors.honey },
                ]}
              >
                <Ionicons name="alert-circle" size={20} color={cravingGaveIn ? colors.honey : colors.ink3} />
                <Text style={[m.qsCravingOutcomeTxt, cravingGaveIn && { color: colors.honey }]}>Gave in</Text>
              </TouchableOpacity>
            </View>
            <Text style={m.qsCravingFormHint}>
              No judgment either way — logging gives you data on what works.
            </Text>
          </View>

          {/* Save CTA */}
          <TouchableOpacity activeOpacity={0.85} onPress={saveCraving} style={m.qsCravingSaveBtnWrap}>
            <LinearGradient
              colors={[colors.purple, colors.purpleGlow]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={m.qsCravingSaveBtn}
            >
              <Text style={m.qsCravingSaveBtnTxt}>Save craving</Text>
            </LinearGradient>
          </TouchableOpacity>

          <View style={{ height: spacing.lg }} />
        </ScrollView>
      </SafeAreaView>
    </Modal>
    </>
  );
}
