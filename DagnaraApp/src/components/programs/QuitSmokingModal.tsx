import { useState, useEffect, useRef, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Modal, Alert, TextInput, Platform, Keyboard, Share, Animated, Linking, Easing,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle, Line, Rect, Path, Polygon } from 'react-native-svg';
import { colors, spacing, fontSize, radius } from '../../theme';
import { useAppStore } from '../../store/appStore';
import { useAuthStore } from '../../store/authStore';
import { scheduleQsNotifications } from '../../lib/notifications';
import { formatMoneyFromUsd, currencySymbol, usdToLocal, localToUsd, minorUnits } from '../../lib/currency';
import { fmt } from '../../lib/format';
import {
  CRAVING_COPING, CRAVING_TRIGGERS, Craving, DEFAULT_TIP_PREFS, HeroBadgeArt, MeditationArt, NRT_TYPES, NrtEntry, PatternsArt, ProgramSheetHeader, ProgressSceneArt, QS_MILESTONES, QS_PRODUCT_LABELS, QS_QUITLINES, QsAchBadge, QsAchievement, QsData, QsIllo, QsProduct, QuitlinePhoneArt, TipBulbArt, TipPrefs, achColor, buildAchList, estimateAchHours, formatAchStat, isAchUnlocked, makeKeys, nrtRelTime, pickDailyTip, prevUnlockedRefGlobal, productLabels, unlockedAchAt, m,
} from './shared';

// ── Quit Smoking Modal ────────────────────────────────────────────────────────
export function QuitSmokingModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { email } = useAuthStore();
  const country = useAppStore((s) => s.country);
  const KEYS = makeKeys(email ?? 'anon');
  const [data, setData] = useState<QsData | null>(null);
  const [slips, setSlips] = useState<string[]>([]); // ISO timestamps of logged slips
  const [bestHours, setBestHours] = useState<number>(0); // personal-best streak in hours
  const [cravings, setCravings] = useState<Craving[]>([]); // every logged craving (won or lost)
  const [elapsed, setElapsed] = useState(0); // ms
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Reasons-I'm-quitting anchor list. The strongest evidence-based craving tool
  // — reading back why you started is more effective than any tip or breathing
  // exercise. Surfaced as a reminder banner on the cravings view and a card on main.
  const [reasons, setReasons] = useState<string[]>([]);
  // Editor state for the reasons screen (draft list + edit mode toggle)
  const [reasonsDraft, setReasonsDraft] = useState<string[]>([]);
  const [reasonsEditing, setReasonsEditing] = useState(false);
  const [reasonsInput, setReasonsInput] = useState('');
  // NRT tracker — every NRT (patch/gum/lozenge/etc.) the user logs while quitting.
  const [nrtLog, setNrtLog] = useState<NrtEntry[]>([]);
  const [nrtFormOpen, setNrtFormOpen] = useState(false);
  const [nrtFormKind, setNrtFormKind] = useState<NrtEntry['kind']>('patch');
  const [nrtFormStrength, setNrtFormStrength] = useState('');
  const [nrtFormNote, setNrtFormNote] = useState('');
  // Tip personalization — liked/skipped IDs influence daily-tip rotation.
  const [tipPrefs, setTipPrefs] = useState<TipPrefs>(DEFAULT_TIP_PREFS);
  const [isSettled, setIsSettled] = useState(false);
  // Setup form state
  const [showSetup, setShowSetup] = useState(false);
  const [formDate, setFormDate] = useState('');
  const [formCpd, setFormCpd] = useState('15');
  const [formCpp, setFormCpp] = useState('12');
  const [formCigsPerPack, setFormCigsPerPack] = useState('20');
  const [formProduct, setFormProduct] = useState<QsProduct>('cigarettes');
  // Craving logger modal — visible when user taps "Log a craving"
  const [cravingFormOpen, setCravingFormOpen] = useState(false);
  const [cravingIntensity, setCravingIntensity] = useState<number>(6);
  const [cravingTrigger, setCravingTrigger] = useState<string | null>(null);
  const [cravingCoping, setCravingCoping] = useState<string | null>(null);
  const [cravingGaveIn, setCravingGaveIn] = useState(false);
  // UI: which detail view is showing inside the modal
  const [qsView, setQsView] = useState<'main' | 'progress' | 'achievements' | 'achievement' | 'health' | 'cravings' | 'tip' | 'quitline' | 'breathing' | 'reasons' | 'nrt' | 'rescue' | 'patterns' | 'goal'>('main');
  // Money-saved goal — user names what they're saving for + dollar target.
  // Persisted to QS_GOAL. Stored amount is in user's display currency (NOT USD)
  // so the editor's number is what the user typed and the bar reads naturally.
  const [moneyGoal, setMoneyGoal] = useState<{ amount: number; label: string } | null>(null);
  const [goalDraftAmount, setGoalDraftAmount] = useState('');
  const [goalDraftLabel,  setGoalDraftLabel ] = useState('');
  // Craving rescue — 3-minute countdown the user runs in the moment a craving
  // hits. Reuses the breathing animation circle for visual rhythm. On completion
  // we auto-log a Craving with gaveIn:false (rode it out).
  const RESCUE_TOTAL_SEC = 180;
  const [rescueSecondsLeft, setRescueSecondsLeft] = useState(RESCUE_TOTAL_SEC);
  const [rescueRunning, setRescueRunning] = useState(false);
  const [rescueDone, setRescueDone] = useState(false);
  const rescueIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // UI: which achievement is selected for the QuitNow-style detail screen
  const [selectedAch, setSelectedAch] = useState<QsAchievement | null>(null);
  const qsScrollRef = useRef<ScrollView>(null);

  // ── Beat Your Cravings — daily tip is stable for the whole mount + skipped-aware ─
  // Re-derives when tipPrefs change so a fresh skip pushes the user to the next tip.
  const dailyTip = useMemo(() => pickDailyTip(tipPrefs), [tipPrefs]);

  // ── Calm Breathing — 4-7-8 cycle state machine + animated scale ────────────
  // Runs a fixed 3 rounds (inhale 4s · hold 7s · exhale 8s) then lands on a
  // celebratory 'complete' state — matches the "three rounds" promise in copy.
  const BREATH_ROUNDS = 3;
  const breathScale = useRef(new Animated.Value(0.55)).current;
  const breathRunningRef = useRef(false);
  const breathRoundRef = useRef(0);
  const breathTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const [breathRunning, setBreathRunning] = useState(false);
  const [breathRound, setBreathRound] = useState(0);
  const [breathPhase, setBreathPhase] = useState<'idle' | 'inhale' | 'hold' | 'exhale' | 'complete'>('idle');

  function runBreathCycle() {
    if (!breathRunningRef.current) return;
    breathRoundRef.current += 1;
    setBreathRound(breathRoundRef.current);
    setBreathPhase('inhale');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    Animated.timing(breathScale, {
      toValue: 1.0,
      duration: 4000,
      easing: Easing.inOut(Easing.quad),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!finished || !breathRunningRef.current) return;
      setBreathPhase('hold');
      const tHold = setTimeout(() => {
        if (!breathRunningRef.current) return;
        setBreathPhase('exhale');
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        Animated.timing(breathScale, {
          toValue: 0.55,
          duration: 8000,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }).start(({ finished: f }) => {
          if (!f || !breathRunningRef.current) return;
          if (breathRoundRef.current >= BREATH_ROUNDS) {
            // All rounds done — land on the celebratory 'complete' state.
            breathRunningRef.current = false;
            setBreathRunning(false);
            setBreathPhase('complete');
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          } else {
            runBreathCycle();
          }
        });
      }, 7000);
      breathTimersRef.current.push(tHold);
    });
  }

  function startBreathing() {
    if (breathRunningRef.current) return;
    breathRunningRef.current = true;
    breathRoundRef.current = 0;
    setBreathRound(0);
    setBreathRunning(true);
    runBreathCycle();
  }

  function stopBreathing() {
    breathRunningRef.current = false;
    breathRoundRef.current = 0;
    setBreathRunning(false);
    setBreathRound(0);
    setBreathPhase('idle');
    breathScale.stopAnimation();
    Animated.timing(breathScale, { toValue: 0.55, duration: 250, useNativeDriver: true }).start();
    breathTimersRef.current.forEach(t => clearTimeout(t));
    breathTimersRef.current = [];
  }

  // Auto-stop breathing/rescue whenever we leave those views or close the modal.
  // Both share the breathing animation infrastructure — kill it on any exit.
  useEffect(() => {
    const isAnimView = qsView === 'breathing' || qsView === 'rescue';
    if (!visible || !isAnimView) {
      breathRunningRef.current = false;
      breathRoundRef.current = 0;
      setBreathRunning(false);
      setBreathRound(0);
      setBreathPhase('idle');
      breathScale.stopAnimation();
      breathTimersRef.current.forEach(t => clearTimeout(t));
      breathTimersRef.current = [];
      if (rescueIntervalRef.current) { clearInterval(rescueIntervalRef.current); rescueIntervalRef.current = null; }
      // Only reset the rescue countdown when leaving rescue, not when leaving breathing
      if (qsView !== 'rescue') {
        setRescueRunning(false);
        setRescueSecondsLeft(RESCUE_TOTAL_SEC);
        setRescueDone(false);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, qsView]);

  // Shared share helper — used by both the header icon and the social row in the
  // achievement detail view, so both routes show identical share copy.
  // Rich share template that embeds the user's lifetime stats so the post
  // doubles as proof — every platform (SMS / Twitter / Instagram caption / etc.)
  // gets the same headline + stats block + Dagnara attribution.
  async function shareAchievement(a: QsAchievement) {
    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const labels = productLabels(data);
      const statLine = formatAchStat(a, country, data?.productType ?? 'cigarettes');
      const days = Math.floor(elapsed / 86_400_000);
      const moneyTxt = formatMoneyFromUsd(moneySaved, country, 0);
      const lines = [
        `🏆 I just unlocked "${a.title}" on Dagnara.`,
        statLine + '.',
        '',
        '— My quit so far —',
        `🗓  ${fmt(days)} day${days === 1 ? '' : 's'} ${data?.productType === 'pouches' ? 'pouch-free' : data?.productType === 'vape' ? 'vape-free' : 'smoke-free'}`,
        `🚫  ${fmt(cigsAvoided)} ${labels.unitPlural} avoided`,
        `💰  ${moneyTxt} saved`,
        `⏱  ${lifeRegainedTxt} of life won back`,
        '',
        'Dagnara · dagnara.com #QuitTogether',
      ];
      await Share.share({ message: lines.join('\n') });
    } catch { /* user cancelled */ }
  }

  // Reset detail-view state any time the modal closes so the next open lands on main
  useEffect(() => {
    if (!visible) { setQsView('main'); setSelectedAch(null); setReasonsEditing(false); setCravingFormOpen(false); setNrtFormOpen(false); }
  }, [visible]);

  // Scroll to top whenever the inner view changes so first item is always visible
  useEffect(() => {
    qsScrollRef.current?.scrollTo({ x: 0, y: 0, animated: false });
  }, [qsView]);

  useEffect(() => {
    if (!visible) return;
    Promise.all([
      AsyncStorage.getItem(KEYS.QS),
      AsyncStorage.getItem(KEYS.QS_SLIPS),
      AsyncStorage.getItem(KEYS.QS_BEST),
      AsyncStorage.getItem(KEYS.QS_CRAVE),
      AsyncStorage.getItem(KEYS.QS_REASONS),
      AsyncStorage.getItem(KEYS.QS_NRT),
      AsyncStorage.getItem(KEYS.QS_TIP),
      AsyncStorage.getItem(KEYS.QS_COST_PROMPT),
      AsyncStorage.getItem(KEYS.QS_GOAL),
    ]).then(([raw, rawSlips, rawBest, rawCrave, rawReasons, rawNrt, rawTip, rawCostPrompt, rawGoal]) => {
      if (raw) {
        try {
          const d: QsData = JSON.parse(raw);
          setData(d);
          setShowSetup(false);
          // Re-arm milestone notifications every modal open. Cheap insurance against
          // OS-level notification drops (app updates, force-stops, permission toggles)
          // — schedule fn de-dupes existing tags so this is a no-op when nothing changed.
          scheduleQsNotifications(new Date(d.quitDate)).catch(() => {});
          // Yearly cost-update prompt — keeps money-saved numbers accurate as packs
          // get more expensive over time. Skips if user has set up in the last 365d.
          try {
            const lastPrompt = rawCostPrompt ? new Date(rawCostPrompt).getTime() : 0;
            const setupAge   = Date.now() - new Date(d.quitDate).getTime();
            const promptAge  = Date.now() - lastPrompt;
            const YEAR_MS = 365 * 86_400_000;
            if (setupAge > YEAR_MS && (lastPrompt === 0 || promptAge > YEAR_MS)) {
              const labels = productLabels(d);
              const formattedPack = formatMoneyFromUsd(d.costPerPack, country, 2);
              setTimeout(() => {
                Alert.alert(
                  'Update your numbers?',
                  `It's been a while since you set up your tracker. Has your ${labels.pack} price changed from ${formattedPack}? Updating keeps "money saved" accurate.`,
                  [
                    { text: 'Looks right', style: 'cancel', onPress: () => {
                      AsyncStorage.setItem(KEYS.QS_COST_PROMPT, new Date().toISOString());
                    } },
                    { text: 'Update now', onPress: () => {
                      setFormDate(d.quitDate.slice(0, 10));
                      setFormCpd(String(d.cigsPerDay));
                      setFormCpp(usdToLocal(d.costPerPack, country).toFixed(minorUnits(country)));
                      setFormCigsPerPack(String(d.cigsPerPack));
                      setFormProduct(d.productType ?? 'cigarettes');
                      setShowSetup(true);
                      AsyncStorage.setItem(KEYS.QS_COST_PROMPT, new Date().toISOString());
                    } },
                  ],
                );
              }, 600);
            }
          } catch { /* prompt is best-effort */ }
        } catch {
          void AsyncStorage.removeItem(KEYS.QS);
          setData(null);
          setShowSetup(true);
        }
      } else {
        setData(null);
        setShowSetup(true);
      }
      try {
        setSlips(rawSlips ? (JSON.parse(rawSlips) as string[]) : []);
      } catch {
        setSlips([]);
      }
      try {
        const parsed = rawBest ? parseFloat(rawBest) : 0;
        setBestHours(Number.isFinite(parsed) ? parsed : 0);
      } catch {
        setBestHours(0);
      }
      try {
        setCravings(rawCrave ? (JSON.parse(rawCrave) as Craving[]) : []);
      } catch {
        setCravings([]);
      }
      try {
        const list = rawReasons ? (JSON.parse(rawReasons) as string[]) : [];
        setReasons(Array.isArray(list) ? list.filter(s => typeof s === 'string' && s.trim().length > 0) : []);
      } catch {
        setReasons([]);
      }
      try {
        const list = rawNrt ? (JSON.parse(rawNrt) as NrtEntry[]) : [];
        setNrtLog(Array.isArray(list) ? list : []);
      } catch {
        setNrtLog([]);
      }
      try {
        const prefs = rawTip ? (JSON.parse(rawTip) as TipPrefs) : DEFAULT_TIP_PREFS;
        const safe: TipPrefs = {
          liked:   Array.isArray(prefs?.liked)   ? prefs.liked   : [],
          skipped: Array.isArray(prefs?.skipped) ? prefs.skipped : [],
        };
        setTipPrefs(safe);
      } catch {
        setTipPrefs(DEFAULT_TIP_PREFS);
      }
      try {
        if (rawGoal) {
          const g = JSON.parse(rawGoal) as { amount: number; label: string };
          if (g && typeof g.amount === 'number' && Number.isFinite(g.amount) && g.amount > 0 && typeof g.label === 'string') {
            setMoneyGoal({ amount: g.amount, label: g.label });
          } else {
            setMoneyGoal(null);
          }
        } else {
          setMoneyGoal(null);
        }
      } catch {
        setMoneyGoal(null);
      }
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
    const labels = QS_PRODUCT_LABELS[formProduct];
    const cpd = parseInt(formCpd, 10) || 15;
    // User types in local currency; persist in USD via exchange rate.
    const cppLocal = parseFloat(formCpp) || 12;
    const cppUsd = localToUsd(cppLocal, country);
    const cip = parseInt(formCigsPerPack, 10) || 20;
    if (cpd < 1 || cpd > 200) { Alert.alert('Invalid value', `${labels.perDayLbl} must be between 1 and 200.`); return; }
    if (cppUsd <= 0 || cppUsd > 500) { Alert.alert('Invalid value', `${labels.perPackLbl} must be between ${formatMoneyFromUsd(0.01, country)} and ${formatMoneyFromUsd(500, country, 0)}.`); return; }
    if (cip < 1 || cip > 100) { Alert.alert('Invalid value', `${labels.pkgFieldLbl} must be between 1 and 100.`); return; }
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
    const d: QsData = { quitDate, cigsPerDay: cpd, costPerPack: cppUsd, cigsPerPack: cip, productType: formProduct };
    AsyncStorage.setItem(KEYS.QS, JSON.stringify(d));
    // Stamp the cost-update prompt so we don't re-prompt right after a fresh setup.
    AsyncStorage.setItem(KEYS.QS_COST_PROMPT, new Date().toISOString());
    scheduleQsNotifications(new Date(quitDate)).catch(() => {});
    setData(d);
    setShowSetup(false);
  }

  function resetProgress() {
    const slipTs = new Date().toISOString();
    // Snapshot the current streak before any reset so we can update personal best.
    const currentStreakHours = data ? (Date.now() - new Date(data.quitDate).getTime()) / 3600000 : 0;
    Alert.alert(
      'I had a slip',
      'A slip doesn\'t erase your progress. You can log it and keep your timer running, or reset the clock — your personal best is saved either way.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Log slip (keep timer)',
          onPress: () => {
            const updated = [...slips, slipTs];
            AsyncStorage.setItem(KEYS.QS_SLIPS, JSON.stringify(updated));
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
            const d: QsData = { ...data!, quitDate: slipTs };
            AsyncStorage.setItem(KEYS.QS, JSON.stringify(d));
            AsyncStorage.setItem(KEYS.QS_SLIPS, JSON.stringify(updated));
            AsyncStorage.setItem(KEYS.QS_BEST, String(newBest));
            scheduleQsNotifications(new Date(slipTs)).catch(() => {});
            setSlips(updated);
            setBestHours(newBest);
            setData(d);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
          },
        },
      ],
    );
  }

  // Returns "Xd Yh", "Xh Ym", or "Xm" so personal-best/streak displays stay compact.
  function formatStreakHours(h: number): string {
    if (h <= 0) return '0m';
    const totalMin = Math.floor(h * 60);
    const days = Math.floor(totalMin / 1440);
    const hrs  = Math.floor((totalMin % 1440) / 60);
    const mins = totalMin % 60;
    if (days > 0) return hrs > 0 ? `${days}d ${hrs}h` : `${days}d`;
    if (hrs  > 0) return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
    return `${mins}m`;
  }

  // Persist a craving log entry. Wins ride one haptic, losses ride a softer one
  // — we never moralize about a slip and we never reset the timer here (slips
  // and cravings are separate buckets).
  function saveCraving() {
    const entry: Craving = {
      ts: new Date().toISOString(),
      intensity: cravingIntensity,
      trigger: cravingTrigger ?? undefined,
      coping:  cravingCoping ?? undefined,
      gaveIn:  cravingGaveIn,
    };
    const updated = [...cravings, entry];
    AsyncStorage.setItem(KEYS.QS_CRAVE, JSON.stringify(updated));
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

  // ── Craving rescue — start/stop/finish the 3-min wave-rider timer ──────────
  // On natural finish we auto-log a Craving entry as a win (gaveIn:false) so the
  // user's stats reflect every rescue they completed. On abort we leave the log
  // alone — aborting != slipping. The breathing animation is reused for rhythm.
  function startRescue() {
    if (rescueRunning) return;
    setRescueDone(false);
    setRescueSecondsLeft(RESCUE_TOTAL_SEC);
    setRescueRunning(true);
    breathRoundRef.current = 0;
    breathRunningRef.current = true;
    setBreathRunning(true);
    runBreathCycle();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    if (rescueIntervalRef.current) clearInterval(rescueIntervalRef.current);
    rescueIntervalRef.current = setInterval(() => {
      setRescueSecondsLeft((s) => {
        const next = s - 1;
        if (next <= 0) {
          // Natural completion — stop everything, fire success, auto-log win
          if (rescueIntervalRef.current) { clearInterval(rescueIntervalRef.current); rescueIntervalRef.current = null; }
          breathRunningRef.current = false;
          breathRoundRef.current = 0;
          setBreathRunning(false);
          setBreathRound(0);
          setBreathPhase('idle');
          breathScale.stopAnimation();
          Animated.timing(breathScale, { toValue: 0.55, duration: 250, useNativeDriver: true }).start();
          breathTimersRef.current.forEach(t => clearTimeout(t));
          breathTimersRef.current = [];
          setRescueRunning(false);
          setRescueDone(true);
          // Auto-log a "rode it out" craving — use the user's last intensity guess
          // (or default 7) and trigger='other' since no chip is picked in-rescue.
          const entry: Craving = {
            ts: new Date().toISOString(),
            intensity: 7,
            coping: 'breath',
            gaveIn: false,
          };
          const updated = [...cravings, entry];
          AsyncStorage.setItem(KEYS.QS_CRAVE, JSON.stringify(updated));
          setCravings(updated);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          return 0;
        }
        return next;
      });
    }, 1000);
  }
  function stopRescue() {
    if (rescueIntervalRef.current) { clearInterval(rescueIntervalRef.current); rescueIntervalRef.current = null; }
    breathRunningRef.current = false;
    breathRoundRef.current = 0;
    setBreathRunning(false);
    setBreathRound(0);
    setBreathPhase('idle');
    breathScale.stopAnimation();
    Animated.timing(breathScale, { toValue: 0.55, duration: 250, useNativeDriver: true }).start();
    breathTimersRef.current.forEach(t => clearTimeout(t));
    breathTimersRef.current = [];
    setRescueRunning(false);
    setRescueSecondsLeft(RESCUE_TOTAL_SEC);
    setRescueDone(false);
  }

  // Persist the money-saved goal. Stored amount is in display currency (NOT USD)
  // so what the user typed is what they read back. Label is freeform (under 60 ch).
  function saveGoal() {
    const amt = parseFloat(goalDraftAmount);
    const lbl = goalDraftLabel.trim();
    if (!Number.isFinite(amt) || amt <= 0) {
      Alert.alert('Invalid amount', 'Enter a goal amount greater than 0.');
      return;
    }
    if (!lbl) {
      Alert.alert('What are you saving for?', 'Give your goal a name — e.g. "Weekend in Lisbon" or "New bike".');
      return;
    }
    const g = { amount: amt, label: lbl.slice(0, 60) };
    AsyncStorage.setItem(KEYS.QS_GOAL, JSON.stringify(g));
    setMoneyGoal(g);
    setQsView('progress');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }
  function clearGoal() {
    Alert.alert(
      'Remove your goal?',
      'You can set a new one any time.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: () => {
          AsyncStorage.removeItem(KEYS.QS_GOAL);
          setMoneyGoal(null);
          setGoalDraftAmount('');
          setGoalDraftLabel('');
          setQsView('progress');
        } },
      ],
    );
  }

  // Cravings in the rolling last 7 days, plus the win-rate (didn't give in) so the
  // main view can surface a single resilience number when the user has any history.
  const cravingsLast7d = useMemo(() => {
    const cutoff = Date.now() - 7 * 86_400_000;
    return cravings.filter(c => new Date(c.ts).getTime() >= cutoff);
  }, [cravings]);
  const cravingsWon7d = cravingsLast7d.filter(c => !c.gaveIn).length;
  const cravingsWinRatePct = cravingsLast7d.length > 0
    ? Math.round((cravingsWon7d / cravingsLast7d.length) * 100)
    : null;

  const hours = elapsed / 3600000;
  const cigsAvoided = data ? Math.floor(hours * (data.cigsPerDay / 24)) : 0;
  const moneySaved = data && data.cigsPerPack > 0 ? ((cigsAvoided / data.cigsPerPack) * data.costPerPack) : 0;
  const lifeRegained = cigsAvoided * 11; // minutes

  // Days quit (used by Overall Progress card)
  const triDays = Math.floor(elapsed / 86_400_000);

  // Time-regained as "Xd"/"Xh"/"Xm"
  const lifeRegainedTxt = lifeRegained >= 1440
    ? `${Math.floor(lifeRegained / 1440)}d`
    : lifeRegained >= 60
      ? `${Math.floor(lifeRegained / 60)}h`
      : `${lifeRegained}m`;


  // Latest unlocked WHO health milestone (separate from gamified achievements)
  const latestHealthMs = data
    ? [...QS_MILESTONES].reverse().find(ms => hours >= ms.hours) ?? null
    : null;

  // ── Per-period projections (drives Overall Progress detail screen) ───────────
  const cpd = data?.cigsPerDay ?? 0;
  const cpp = data?.costPerPack ?? 0;
  const cip = data?.cigsPerPack ?? 1;
  const moneyPerCig = cip > 0 ? cpp / cip : 0;
  const minPerCig   = 11; // matches existing lifeRegained calc
  const cigPer = {
    day:   cpd,
    week:  Math.round(cpd * 7),
    month: Math.round(cpd * 30.42),
    year:  Math.round(cpd * 365),
  };
  const moneyPer = {
    day:   moneyPerCig * cpd,
    week:  moneyPerCig * cpd * 7,
    month: moneyPerCig * cpd * 30.42,
    year:  moneyPerCig * cpd * 365,
  };
  function fmtMins(min: number): string {
    const total = Math.round(min);
    if (total < 60) return `${total} ${total === 1 ? 'minute' : 'minutes'}`;
    const totalHours = Math.floor(total / 60);
    if (totalHours < 24) return `${totalHours} ${totalHours === 1 ? 'hour' : 'hours'}`;
    const days  = Math.floor(totalHours / 24);
    const hours = totalHours % 24;
    const dStr  = `${days} ${days === 1 ? 'day' : 'days'}`;
    if (hours === 0) return dStr;
    const hStr  = `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
    return `${dStr} and ${hStr}`;
  }
  // Country-aware currency formatter (locale + symbol + position from preferences).
  // All stored money in QsData is USD — render in the user's selected currency.
  const fmtKr = (vUsd: number): string => formatMoneyFromUsd(vUsd, country);
  const timePer = {
    day:   fmtMins(cpd * minPerCig),
    week:  fmtMins(cpd * minPerCig * 7),
    month: fmtMins(cpd * minPerCig * 30.42),
    year:  fmtMins(cpd * minPerCig * 365),
  };

  // ── Unified achievement list, sorted by estimated hours-to-unlock ──────────
  // Single chronological stream — no category tabs. Time milestones interleave
  // with cigarettes-avoided + money-saved milestones based on the user's setup.
  const achList = useMemo<QsAchievement[]>(() => {
    const list = buildAchList();
    return list.sort((a, b) => {
      const ha = estimateAchHours(a, cpd, cip, cpp);
      const hb = estimateAchHours(b, cpd, cip, cpp);
      if (ha === hb) return a.title.localeCompare(b.title);
      return ha - hb;
    });
  }, [cpd, cip, cpp]);

  const totalUnlockedAch = achList.filter(a => isAchUnlocked(a, hours, cigsAvoided, moneySaved)).length;
  const totalAchAll      = achList.length;

  // ── Reasons editor — opens the reasons screen in edit mode with a fresh draft ─
  function openReasonsEditor() {
    setReasonsDraft(reasons.length > 0 ? [...reasons] : []);
    setReasonsInput('');
    setReasonsEditing(true);
    setQsView('reasons');
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
    AsyncStorage.setItem(KEYS.QS_REASONS, JSON.stringify(cleaned));
    setReasons(cleaned);
    setReasonsEditing(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }

  // ── NRT — log a usage of patch / gum / lozenge / etc. ──────────────────────
  function openNrtForm() {
    setNrtFormKind('patch');
    setNrtFormStrength('');
    setNrtFormNote('');
    setNrtFormOpen(true);
  }
  function saveNrtEntry() {
    const entry: NrtEntry = {
      ts: new Date().toISOString(),
      kind: nrtFormKind,
      strength: nrtFormStrength.trim() || undefined,
      note:     nrtFormNote.trim()     || undefined,
    };
    const updated = [entry, ...nrtLog]; // newest-first
    AsyncStorage.setItem(KEYS.QS_NRT, JSON.stringify(updated));
    setNrtLog(updated);
    setNrtFormOpen(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }
  function removeNrtEntry(ts: string) {
    const updated = nrtLog.filter(n => n.ts !== ts);
    AsyncStorage.setItem(KEYS.QS_NRT, JSON.stringify(updated));
    setNrtLog(updated);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }
  // Rolling NRT usage stats for the NRT view header. Today / 7d / 30d counts.
  const nrtToday = useMemo(() => {
    const start = new Date(); start.setHours(0,0,0,0);
    return nrtLog.filter(n => new Date(n.ts).getTime() >= start.getTime()).length;
  }, [nrtLog]);
  const nrt7d = useMemo(() => {
    const cutoff = Date.now() - 7 * 86_400_000;
    return nrtLog.filter(n => new Date(n.ts).getTime() >= cutoff).length;
  }, [nrtLog]);

  // ── Tip personalization — like/skip toggle persists immediately ─────────────
  function toggleTipLike(id: string) {
    setTipPrefs(prev => {
      const isLiked = prev.liked.includes(id);
      const next: TipPrefs = {
        liked: isLiked ? prev.liked.filter(x => x !== id) : [...prev.liked, id],
        // Liking removes from skipped (mutually exclusive intent).
        skipped: isLiked ? prev.skipped : prev.skipped.filter(x => x !== id),
      };
      AsyncStorage.setItem(KEYS.QS_TIP, JSON.stringify(next));
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      return next;
    });
  }
  function toggleTipSkip(id: string) {
    setTipPrefs(prev => {
      const isSkipped = prev.skipped.includes(id);
      const next: TipPrefs = {
        liked: isSkipped ? prev.liked : prev.liked.filter(x => x !== id),
        skipped: isSkipped ? prev.skipped.filter(x => x !== id) : [...prev.skipped, id],
      };
      AsyncStorage.setItem(KEYS.QS_TIP, JSON.stringify(next));
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      return next;
    });
  }

  // ── Confetti + haptic on newly-unlocked achievement (#6) ────────────────────
  // Diff unlocked-IDs across renders. On first run we seed the ref without firing
  // (so opening the modal at hour 500 doesn't carpet-bomb the user with confetti
  // for every historical unlock). After seeding, any new id triggers the overlay.
  useEffect(() => {
    if (!data) return;
    const unlockedNow = new Set<string>(
      achList.filter(a => isAchUnlocked(a, hours, cigsAvoided, moneySaved)).map(a => a.id),
    );
    const prev = prevUnlockedRefGlobal.current;
    if (prev == null || !isSettled) {
      // First settled pass: seed the historical unlock set without firing, then
      // flip isSettled so subsequent ticks go live and fire on new crossings.
      prevUnlockedRefGlobal.current = unlockedNow;
      if (!isSettled) setIsSettled(true);
      return;
    }
    const newly: QsAchievement[] = [];
    for (const a of achList) {
      if (unlockedNow.has(a.id) && !prev.has(a.id)) newly.push(a);
    }
    if (newly.length > 0) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      // Cross-feature XP grant — earned milestones feed the app-wide leveling
      // system so quitting smoking pays into the same dopamine bank as the rest
      // of the app. 20xp per unlock keeps it meaningful but not exploitative.
      void useAppStore.getState().addXp(20 * newly.length);
    }
    prevUnlockedRefGlobal.current = unlockedNow;
  }, [achList, hours, cigsAvoided, moneySaved, data]);

  if (showSetup) {
    const setupLabels = QS_PRODUCT_LABELS[formProduct];
    return (
      <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
          <SafeAreaView style={m.sheet} edges={['top', 'bottom']}>
            <ProgramSheetHeader title="Quit Setup" onBack={() => (data ? setShowSetup(false) : onClose())} />
            <ScrollView
              contentContainerStyle={{ padding: spacing.md, gap: spacing.md }}
              automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={m.label}>What are you quitting?</Text>
              <View style={m.qsProductPickerRow}>
                {(['cigarettes', 'vape', 'pouches'] as QsProduct[]).map(p => {
                  const lbl = QS_PRODUCT_LABELS[p];
                  const active = formProduct === p;
                  return (
                    <TouchableOpacity
                      key={p}
                      activeOpacity={0.85}
                      onPress={() => {
                        setFormProduct(p);
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                      }}
                      style={[m.qsProductChip, active && m.qsProductChipActive]}
                    >
                      <Text style={m.qsProductChipEmoji}>{lbl.emoji}</Text>
                      <Text style={[m.qsProductChipTxt, active && m.qsProductChipTxtActive]}>{lbl.productName}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <Text style={m.label}>Quit date (leave blank for right now)</Text>
              <TextInput
                style={m.input}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={colors.ink3}
                value={formDate}
                onChangeText={setFormDate}
                maxLength={10}
                returnKeyType="next"
                onSubmitEditing={() => Keyboard.dismiss()}
              />
              <Text style={m.label}>{setupLabels.perDayLbl}</Text>
              <TextInput style={m.input} keyboardType="numeric" value={formCpd} onChangeText={setFormCpd} placeholderTextColor={colors.ink3} returnKeyType="done" onSubmitEditing={() => Keyboard.dismiss()} />
              <Text style={m.label}>{setupLabels.perPackLbl} ({currencySymbol(country)})</Text>
              <TextInput style={m.input} keyboardType="decimal-pad" value={formCpp} onChangeText={setFormCpp} placeholderTextColor={colors.ink3} returnKeyType="done" onSubmitEditing={() => Keyboard.dismiss()} />
              <Text style={m.label}>{setupLabels.pkgFieldLbl}</Text>
              <TextInput style={m.input} keyboardType="numeric" value={formCigsPerPack} onChangeText={setFormCigsPerPack} placeholderTextColor={colors.ink3} returnKeyType="done" onSubmitEditing={() => Keyboard.dismiss()} />
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
        {qsView === 'main' ? (
            <ProgramSheetHeader
              title="Quit Smoking"
              onBack={onClose}
              right={
                <TouchableOpacity
                  onPress={() => {
                    if (data) {
                      setFormDate(data.quitDate.slice(0, 10));
                      setFormCpd(String(data.cigsPerDay));
                      // costPerPack is stored in USD — convert to display currency for editing.
                      setFormCpp(usdToLocal(data.costPerPack, country).toFixed(minorUnits(country)));
                      setFormCigsPerPack(String(data.cigsPerPack));
                    }
                    setShowSetup(true);
                  }}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  style={{ width: spacing.xl + spacing.sm, height: spacing.xl + spacing.sm, borderRadius: radius.pill, backgroundColor: colors.layer2, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: colors.line2 }}
                >
                  <Ionicons name="pencil" size={20} color={colors.ink2} />
                </TouchableOpacity>
              }
            />
          ) : (
            <ProgramSheetHeader
              // Detail-view back navigation:
              //  • 'achievement'              → achievements list
              //  • tip / quitline / breathing → cravings list
              //  • goal                       → progress
              //  • anything else              → main
              onBack={() => {
                if (qsView === 'achievement') { setSelectedAch(null); setQsView('achievements'); }
                else if (qsView === 'tip' || qsView === 'quitline' || qsView === 'breathing' || qsView === 'rescue' || qsView === 'patterns') setQsView('cravings');
                else if (qsView === 'goal') setQsView('progress');
                else { setReasonsEditing(false); setQsView('main'); }
              }}
              title={
                qsView === 'progress'     ? 'Overall progress' :
                qsView === 'achievements' ? 'Achievements' :
                qsView === 'health'       ? 'Health improvements' :
                qsView === 'cravings'     ? 'Beat your cravings' :
                qsView === 'tip'          ? 'Tip of the day' :
                qsView === 'quitline'     ? 'Quit lines' :
                qsView === 'breathing'    ? 'Calm breathing' :
                qsView === 'reasons'      ? 'My reasons' :
                qsView === 'nrt'          ? 'NRT log' :
                qsView === 'rescue'       ? 'Ride the wave' :
                qsView === 'patterns'     ? 'Your patterns' :
                qsView === 'goal'         ? 'Money-saved goal' : ''
              }
              right={
                qsView === 'health' ? (
                  <View style={m.qsHealthHeartCount}>
                    <Ionicons name="heart" size={20} color={colors.rose} />
                    <Text style={m.qsHealthHeartCountTxt}>
                      {QS_MILESTONES.filter(ms => hours >= ms.hours).length}/{QS_MILESTONES.length}
                    </Text>
                  </View>
                ) : qsView === 'achievements' ? (
                  <View style={m.qsHealthHeartCount}>
                    <Ionicons name="trophy" size={20} color={colors.honey} />
                    <Text style={m.qsHealthHeartCountTxt}>
                      {totalUnlockedAch}/{totalAchAll}
                    </Text>
                  </View>
                ) : qsView === 'achievement' && selectedAch ? (
                  <TouchableOpacity
                    onPress={() => { if (selectedAch) void shareAchievement(selectedAch); }}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  >
                    <Ionicons name="share-outline" size={22} color={colors.green} />
                  </TouchableOpacity>
                ) : undefined
              }
            />
          )}

        <ScrollView ref={qsScrollRef} contentContainerStyle={{ padding: spacing.md, gap: spacing.md }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {/* ════════════════════════════════════════════════════════════════
              MAIN VIEW
          ════════════════════════════════════════════════════════════════ */}
          {qsView === 'main' && (
            <>
              {/* ── Hero band: compact medal only (QuitNow style) ─────────── */}
              <View style={m.qsHero}>
                <LinearGradient
                  colors={['rgba(124,77,255,0.22)', 'transparent']}
                  style={StyleSheet.absoluteFillObject}
                  start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }}
                  pointerEvents="none"
                />
                <View style={m.qsHeroArt}>
                  <HeroBadgeArt size={120} />
                </View>
              </View>

              {/* ── Overall Progress (separated header, same pattern as Health) ─ */}
              <View style={m.qsSectionHead}>
                <Text style={m.qsHeading}>Overall progress</Text>
                <TouchableOpacity onPress={() => setQsView('progress')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text style={m.qsSeeAll}>See all</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity activeOpacity={0.85} onPress={() => setQsView('progress')} style={m.qsProgCard}>
                <View style={m.qsProgRow}>
                  <View style={m.qsProgStat}>
                    <View style={[m.qsProgCircle, { backgroundColor: colors.sky }]}>
                      <Ionicons name="calendar" size={22} color={colors.white} />
                    </View>
                    <Text style={m.qsProgNum}>{fmt(triDays)}</Text>
                    <Text style={m.qsProgLbl}>days{'\n'}quit</Text>
                  </View>
                  <View style={m.qsProgStat}>
                    <View style={[m.qsProgCircle, { backgroundColor: colors.rose }]}>
                      <Ionicons name="flame" size={22} color={colors.white} />
                    </View>
                    <Text style={m.qsProgNum}>{fmt(cigsAvoided)}</Text>
                    <Text style={m.qsProgLbl}>{productLabels(data).unitPlural}{'\n'}avoided</Text>
                  </View>
                  <View style={m.qsProgStat}>
                    <View style={[m.qsProgCircle, { backgroundColor: colors.honey }]}>
                      <Ionicons name="cash" size={22} color={colors.white} />
                    </View>
                    <Text style={m.qsProgNum}>{formatMoneyFromUsd(moneySaved, country, 0)}</Text>
                    <Text style={m.qsProgLbl}>money{'\n'}saved</Text>
                  </View>
                  <View style={m.qsProgStat}>
                    <View style={[m.qsProgCircle, { backgroundColor: colors.teal }]}>
                      <Ionicons name="time" size={22} color={colors.white} />
                    </View>
                    <Text style={m.qsProgNum}>{lifeRegainedTxt}</Text>
                    <Text style={m.qsProgLbl}>won{'\n'}back</Text>
                  </View>
                </View>
              </TouchableOpacity>

              {/* Resilience strip — personal best + slip count surfaced inline so
                  the user sees their record without tapping into the detail.
                  A ★ next to personal best when current streak ties or beats it.
                  Tapping the strip opens the Progress view (Resilience block). */}
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                  setQsView('progress');
                }}
                style={m.qsResilienceStrip}
              >
                <View style={m.qsResilienceCell}>
                  <Ionicons name="trophy" size={14} color={colors.honey} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={m.qsResilienceLbl}>Personal best</Text>
                    <Text style={m.qsResilienceVal} numberOfLines={1}>
                      {formatStreakHours(Math.max(bestHours, hours))}
                      {hours >= bestHours && bestHours > 0 ? '  ★' : ''}
                    </Text>
                  </View>
                </View>
                <View style={m.qsResilienceDiv} />
                <View style={m.qsResilienceCell}>
                  <Ionicons name="refresh" size={14} color={slips.length === 0 ? colors.green : colors.ink2} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={m.qsResilienceLbl}>Slips logged</Text>
                    <Text style={[m.qsResilienceVal, slips.length === 0 && { color: colors.green }]} numberOfLines={1}>
                      {slips.length === 0 ? 'None yet' : fmt(slips.length)}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>

              {/* ── Achievements (horizontal scroll + See all → detail) ─── */}
              <View style={m.qsSectionHead}>
                <Text style={m.qsHeading}>Achievements</Text>
                <TouchableOpacity onPress={() => setQsView('achievements')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text style={m.qsSeeAll}>See all</Text>
                </TouchableOpacity>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={m.qsAchScroll}
              >
                {achList.map((a) => {
                  const done = isAchUnlocked(a, hours, cigsAvoided, moneySaved);
                  return (
                    <TouchableOpacity
                      key={a.id}
                      activeOpacity={0.85}
                      style={[m.qsAchTile, !done && m.qsAchTileLocked]}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                        setSelectedAch(a);
                        setQsView('achievement');
                      }}
                    >
                      <QsAchBadge icon={a.icon} color={achColor(a.type)} locked={!done} />
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
                <TouchableOpacity onPress={() => setQsView('health')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text style={m.qsSeeAll}>See all</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity activeOpacity={0.85} onPress={() => setQsView('health')} style={m.qsHealthCard}>
                {/* Health clipboard — clean flat clipboard w/ heart + pulse */}
                <Svg width={68} height={78} viewBox="0 0 64 76">
                  {/* Halo accent dots */}
                  <Circle cx={6}  cy={26} r={1.6} fill={colors.honey} />
                  <Circle cx={58} cy={26} r={1.6} fill={colors.purple3} />
                  <Circle cx={4}  cy={48} r={1.3} fill={colors.purple} />
                  <Circle cx={60} cy={48} r={1.3} fill={colors.purple} />
                  <Circle cx={8}  cy={64} r={1.4} fill={colors.purple3} />
                  <Circle cx={56} cy={64} r={1.4} fill={colors.honey} />
                  {/* Clip arm at top of clipboard */}
                  <Rect x={26} y={6}  width={12} height={10} rx={2}   fill={colors.purple2} />
                  <Rect x={28} y={4}  width={8}  height={4}  rx={1.5} fill={colors.purple} />
                  {/* Clipboard back (purple casing) */}
                  <Rect x={12} y={12} width={40} height={60} rx={6} fill={colors.purple3} />
                  {/* Paper inside */}
                  <Rect x={16} y={18} width={32} height={50} rx={3} fill={colors.white} />
                  {/* Heart */}
                  <Path
                    d="M 32 32 C 28 27 21 29 21 35 C 21 39 26 43 32 49 C 38 43 43 39 43 35 C 43 29 36 27 32 32 Z"
                    fill={colors.rose}
                  />
                  {/* Pulse / EKG line beneath the heart */}
                  <Path
                    d="M 17 58 L 22 58 L 25 53 L 28 62 L 31 55 L 34 58 L 47 58"
                    stroke={colors.purple}
                    strokeWidth={1.6}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                  />
                </Svg>
                {/* Description text */}
                <View style={{ flex: 1 }}>
                  <Text style={m.qsHealthDesc} numberOfLines={2}>
                    {latestHealthMs
                      ? latestHealthMs.text
                      : `Your first health milestone unlocks 20 minutes after your last ${productLabels(data).unit}.`}
                  </Text>
                </View>
                {/* Scalloped verified seal — only when a milestone is unlocked */}
                {latestHealthMs && (
                  <Svg width={26} height={26} viewBox="0 0 64 64">
                    <Polygon
                      points={Array.from({ length: 24 }, (_, i) => {
                        const a = (i / 24) * Math.PI * 2 - Math.PI / 2;
                        const r = i % 2 === 0 ? 30 : 24;
                        return `${(32 + Math.cos(a) * r).toFixed(2)},${(32 + Math.sin(a) * r).toFixed(2)}`;
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
                )}
              </TouchableOpacity>

              {/* ── Beat your cravings — entry card (same pattern as Health) ── */}
              <View style={m.qsSectionHead}>
                <Text style={m.qsHeading}>Beat your cravings</Text>
                <TouchableOpacity onPress={() => setQsView('cravings')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text style={m.qsSeeAll}>See all</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); setQsView('cravings'); }}
                style={m.qsHealthCard}
              >
                <View style={{ width: 68, height: 78, alignItems: 'center', justifyContent: 'center' }}>
                  <MeditationArt size={76} />
                </View>
                <View style={{ flex: 1 }}>
                  {/* Show live craving stats if user has 7d history — otherwise the generic intro */}
                  {cravingsLast7d.length > 0 ? (
                    <Text style={m.qsHealthDesc} numberOfLines={2}>
                      <Text style={{ color: colors.green, fontWeight: '800' }}>{cravingsWon7d}</Text>
                      {' '}
                      craving{cravingsWon7d === 1 ? '' : 's'} ridden out this week
                      {cravingsWinRatePct !== null ? ` · ${cravingsWinRatePct}% win rate` : ''}.
                    </Text>
                  ) : (
                    <Text style={m.qsHealthDesc} numberOfLines={2}>
                      Small changes to your lifestyle to help you beat cravings when they hit.
                    </Text>
                  )}
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.ink3} />
              </TouchableOpacity>

              {/* ── My reasons — anchor of the strongest evidence-based tool ── */}
              <View style={m.qsSectionHead}>
                <Text style={m.qsHeading}>My reasons</Text>
                <TouchableOpacity onPress={() => setQsView('reasons')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text style={m.qsSeeAll}>{reasons.length > 0 ? 'See all' : 'Add'}</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                  if (reasons.length === 0) openReasonsEditor();
                  else setQsView('reasons');
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
                      Write down why you're quitting. The strongest craving tool there is.
                    </Text>
                  )}
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.ink3} />
              </TouchableOpacity>

              {/* ── NRT log — quick-track patches / gum / lozenges ──────────── */}
              <View style={m.qsSectionHead}>
                <Text style={m.qsHeading}>NRT log</Text>
                <TouchableOpacity onPress={() => setQsView('nrt')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text style={m.qsSeeAll}>{nrtLog.length > 0 ? 'See all' : 'Open'}</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); setQsView('nrt'); }}
                style={m.qsHealthCard}
              >
                <View style={[m.qsProgCircle, { backgroundColor: colors.teal, width: 56, height: 56 }]}>
                  <Ionicons name="medkit" size={26} color={colors.white} />
                </View>
                <View style={{ flex: 1 }}>
                  {nrtLog.length > 0 ? (
                    <Text style={m.qsHealthDesc} numberOfLines={2}>
                      <Text style={{ color: colors.teal, fontWeight: '800' }}>{nrtToday}</Text> today · {nrt7d} this week
                    </Text>
                  ) : (
                    <Text style={m.qsHealthDesc} numberOfLines={2}>
                      Log patches, gum, lozenges. Doubles your odds of quitting for good.
                    </Text>
                  )}
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.ink3} />
              </TouchableOpacity>

              {/* ── Actions ─────────────────────────────────────────────── */}
              <TouchableOpacity style={m.dangerBtn} onPress={resetProgress}>
                <Text style={m.dangerBtnTxt}>I had a slip</Text>
              </TouchableOpacity>
              <View style={{ height: 24 }} />
            </>
          )}

          {/* ════════════════════════════════════════════════════════════════
              OVERALL PROGRESS DETAIL — Per day / week / month / year
          ════════════════════════════════════════════════════════════════ */}
          {qsView === 'progress' && (
            <>
              {/* Units avoided — label adapts to product (cigarettes / pods / pouches) */}
              <Text style={m.qsDetailSectionTitle}>{productLabels(data).unitPlural.replace(/^./, c => c.toUpperCase())} avoided</Text>
              <View style={m.qsDetailRow}>
                <Text style={m.qsDetailRowLbl}>Per day</Text>
                <Text style={m.qsDetailRowVal}>{fmt(cigPer.day)}</Text>
              </View>
              <View style={m.qsDetailRow}>
                <Text style={m.qsDetailRowLbl}>Per week</Text>
                <Text style={m.qsDetailRowVal}>{fmt(cigPer.week)}</Text>
              </View>
              <View style={m.qsDetailRow}>
                <Text style={m.qsDetailRowLbl}>Per month</Text>
                <Text style={m.qsDetailRowVal}>{fmt(cigPer.month)}</Text>
              </View>
              <View style={[m.qsDetailRow, m.qsDetailRowLast]}>
                <Text style={m.qsDetailRowLbl}>Per year</Text>
                <Text style={m.qsDetailRowVal}>{fmt(cigPer.year)}</Text>
              </View>

              {/* Money saved */}
              <Text style={m.qsDetailSectionTitle}>Money saved</Text>
              <View style={m.qsDetailRow}>
                <Text style={m.qsDetailRowLbl}>Per day</Text>
                <Text style={m.qsDetailRowVal}>{fmtKr(moneyPer.day)}</Text>
              </View>
              <View style={m.qsDetailRow}>
                <Text style={m.qsDetailRowLbl}>Per week</Text>
                <Text style={m.qsDetailRowVal}>{fmtKr(moneyPer.week)}</Text>
              </View>
              <View style={m.qsDetailRow}>
                <Text style={m.qsDetailRowLbl}>Per month</Text>
                <Text style={m.qsDetailRowVal}>{fmtKr(moneyPer.month)}</Text>
              </View>
              <View style={[m.qsDetailRow, m.qsDetailRowLast]}>
                <Text style={m.qsDetailRowLbl}>Per year</Text>
                <Text style={m.qsDetailRowVal}>{fmtKr(moneyPer.year)}</Text>
              </View>

              {/* Money-saved GOAL — named target with a live progress bar. Empty
                  state shows a "Set a goal" CTA. moneyGoal.amount is stored in the
                  user's display currency; moneySaved is USD, so we convert the
                  USD figure into the same display currency for an apples-to-apples
                  bar. Reuses the same fmtKr formatter for the readouts. */}
              <Text style={m.qsDetailSectionTitle}>Money-saved goal</Text>
              {moneyGoal ? (() => {
                // moneyPer.day is display-currency per day, so cumulative saved
                // in display currency = moneyPer.day × full days quit. We already
                // compute hours; use hours/24 for the day fraction. This compares
                // like-for-like with the stored goal amount (also display currency).
                const savedCurr = moneyPer.day * (hours / 24);
                const pct = Math.max(0, Math.min(1, savedCurr / moneyGoal.amount));
                const remaining = Math.max(0, moneyGoal.amount - savedCurr);
                const done = pct >= 1;
                return (
                  <View style={m.qsGoalCard}>
                    <View style={m.qsGoalHead}>
                      <View style={{ flex: 1 }}>
                        <Text style={m.qsGoalLabel} numberOfLines={2}>{moneyGoal.label}</Text>
                        <Text style={m.qsGoalSub}>
                          {fmtKr(savedCurr)} of {fmtKr(moneyGoal.amount)} · {Math.round(pct * 100)}%
                        </Text>
                      </View>
                      <View style={[m.qsGoalBadge, done && { backgroundColor: colors.green + '22', borderColor: colors.green + '55' }]}>
                        <Ionicons
                          name={done ? 'trophy' : 'flag'}
                          size={14}
                          color={done ? colors.green : colors.honey}
                        />
                      </View>
                    </View>
                    <View style={m.qsGoalBarTrack}>
                      <View
                        style={[
                          m.qsGoalBarFill,
                          {
                            width: `${Math.max(2, pct * 100)}%`,
                            backgroundColor: done ? colors.green : colors.honey,
                          },
                        ]}
                      />
                    </View>
                    <Text style={[m.qsGoalFootnote, done && { color: colors.green }]}>
                      {done
                        ? "You hit it. Time to spend it on what you're saving for."
                        : `${fmtKr(remaining)} to go — keep going.`}
                    </Text>
                    <View style={m.qsGoalActionsRow}>
                      <TouchableOpacity
                        activeOpacity={0.85}
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                          setGoalDraftAmount(String(moneyGoal.amount));
                          setGoalDraftLabel(moneyGoal.label);
                          setQsView('goal');
                        }}
                        style={m.qsGoalActionBtn}
                      >
                        <Ionicons name="pencil" size={14} color={colors.ink2} />
                        <Text style={m.qsGoalActionTxt}>Edit goal</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })() : (
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                    setGoalDraftAmount('');
                    setGoalDraftLabel('');
                    setQsView('goal');
                  }}
                  style={m.qsGoalEmpty}
                >
                  <View style={m.qsGoalEmptyIcon}>
                    <Ionicons name="trophy" size={20} color={colors.honey} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={m.qsGoalEmptyTitle}>Set a savings goal</Text>
                    <Text style={m.qsGoalEmptySub}>Name what you're saving for and watch your bar fill as you stay quit.</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.ink3} />
                </TouchableOpacity>
              )}

              {/* Time won back */}
              <Text style={m.qsDetailSectionTitle}>Time won back</Text>
              <View style={m.qsDetailRow}>
                <Text style={m.qsDetailRowLbl}>Per day</Text>
                <Text style={m.qsDetailRowVal}>{timePer.day}</Text>
              </View>
              <View style={m.qsDetailRow}>
                <Text style={m.qsDetailRowLbl}>Per week</Text>
                <Text style={m.qsDetailRowVal}>{timePer.week}</Text>
              </View>
              <View style={m.qsDetailRow}>
                <Text style={m.qsDetailRowLbl}>Per month</Text>
                <Text style={m.qsDetailRowVal}>{timePer.month}</Text>
              </View>
              <View style={[m.qsDetailRow, m.qsDetailRowLast]}>
                <Text style={m.qsDetailRowLbl}>Per year</Text>
                <Text style={m.qsDetailRowVal}>{timePer.year}</Text>
              </View>

              {/* Resilience — personal best + slip recovery (relapse-positive framing) */}
              <Text style={m.qsDetailSectionTitle}>Resilience</Text>
              <View style={m.qsDetailRow}>
                <Text style={m.qsDetailRowLbl}>Current streak</Text>
                <Text style={m.qsDetailRowVal}>{formatStreakHours(hours)}</Text>
              </View>
              <View style={m.qsDetailRow}>
                <Text style={m.qsDetailRowLbl}>Personal best</Text>
                <Text style={[m.qsDetailRowVal, hours >= bestHours && { color: colors.green }]}>
                  {formatStreakHours(Math.max(bestHours, hours))}
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
                    : `${formatStreakHours((Date.now() - new Date(slips[slips.length - 1]).getTime()) / 3_600_000)} ago`}
                </Text>
              </View>

              {/* Productivity scene — bottom illustration */}
              <View style={m.qsDetailArt}>
                <ProgressSceneArt width={240} />
              </View>
              <View style={{ height: 16 }} />
            </>
          )}

          {/* ════════════════════════════════════════════════════════════════
              ACHIEVEMENTS DETAIL — QuitNow-style 2-col grid w/ illustrations
          ════════════════════════════════════════════════════════════════ */}
          {qsView === 'achievements' && (
            <>
              <View style={m.qsAchGrid2}>
                {achList.map((a) => {
                  const done = isAchUnlocked(a, hours, cigsAvoided, moneySaved);
                  return (
                    <TouchableOpacity
                      key={a.id}
                      activeOpacity={0.85}
                      style={m.qsAchCard}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                        setSelectedAch(a);
                        setQsView('achievement');
                      }}
                    >
                      {/* Illustration block — top portion of card */}
                      <View style={m.qsAchCardArt}>
                        <QsIllo kind={a.illo} id={a.id} locked={!done} />
                      </View>
                      {/* Title */}
                      <Text style={[m.qsAchCardTitle, !done && { color: colors.ink3 }]} numberOfLines={1}>
                        {a.title}
                      </Text>
                      {/* Stat — "5 cigarettes avoided" / "1 hour of life regained" */}
                      <Text style={[m.qsAchCardStat, !done && { color: colors.ink3 }]} numberOfLines={2}>
                        {formatAchStat(a, country, data?.productType ?? 'cigarettes')}
                      </Text>
                      {/* Green scalloped verification seal — only when unlocked */}
                      {done && (
                        <View style={m.qsAchCardSeal}>
                          <Svg width={26} height={26} viewBox="0 0 64 64">
                            <Polygon
                              points={Array.from({ length: 24 }, (_, i) => {
                                const ang = (i / 24) * Math.PI * 2 - Math.PI / 2;
                                const r = i % 2 === 0 ? 30 : 24;
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
              ACHIEVEMENT DETAIL — QuitNow-style hero + stat + share
          ════════════════════════════════════════════════════════════════ */}
          {qsView === 'achievement' && selectedAch && data && (() => {
            const a = selectedAch;
            const done = isAchUnlocked(a, hours, cigsAvoided, moneySaved);
            const earnedAt = done ? unlockedAchAt(a, data.quitDate, data.cigsPerDay, data.cigsPerPack, data.costPerPack) : null;
            const dateTxt = earnedAt
              ? `${earnedAt.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })} at ${earnedAt.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false })}`
              : '';

            return (
              <>
                {/* ── Hero illo — sits directly on the page bg, no card frame ── */}
                <View style={m.qsAchDetailArt}>
                  <QsIllo kind={a.illo} id={a.id} locked={!done} />
                </View>

                {/* ── Title + stat + date chip ──────────────────────────────── */}
                <View style={m.qsAchDetailTitleWrap}>
                  <Text style={m.qsAchDetailTitle}>{a.title}</Text>
                  <Text style={m.qsAchDetailStat}>{formatAchStat(a, country, data?.productType ?? 'cigarettes')}</Text>

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

                {/* ── Locked state: in-flow note (no docked share bar) ──────── */}
                {!done && (
                  <View style={m.qsAchDetailLockedNote}>
                    <Text style={m.qsAchDetailLockedTitle}>Almost there</Text>
                    <Text style={m.qsAchDetailLockedSub}>{a.desc}</Text>
                  </View>
                )}

                {/* Spacer so the bottom dock doesn't cover content while scrolling */}
                {done && <View style={{ height: 200 }} />}
              </>
            );
          })()}

          {/* ════════════════════════════════════════════════════════════════
              HEALTH IMPROVEMENTS DETAIL — Progress bars per milestone
          ════════════════════════════════════════════════════════════════ */}
          {qsView === 'health' && (
            <>
              <View style={m.qsHealthList}>
                {QS_MILESTONES.map((ms, i) => {
                  const pct  = Math.min(100, Math.round((hours / ms.hours) * 100));
                  const done = pct >= 100;
                  return (
                    <View key={i} style={m.qsHealthRow}>
                      {/* Bar with end labels */}
                      <View style={m.qsHealthBarRow}>
                        <Text style={[m.qsHealthPct, { color: done ? colors.sky : colors.rose }]}>{pct}</Text>
                        <View style={m.qsHealthBarTrack}>
                          <View
                            style={[
                              m.qsHealthBarFill,
                              { width: `${Math.max(pct, 4)}%`, backgroundColor: done ? colors.sky : colors.rose },
                            ]}
                          />
                        </View>
                        <Text style={m.qsHealthBarEnd}>100</Text>
                      </View>
                      {/* Description + green chevron */}
                      <View style={m.qsHealthBody}>
                        <Text style={m.qsHealthText}>{ms.text}</Text>
                        <Ionicons name="chevron-forward" size={20} color={colors.green} />
                      </View>
                    </View>
                  );
                })}
                <View style={m.qsHealthWhoBlock}>
                  <Text style={m.qsHealthFootnote}>Based on</Text>
                  <Svg width={38} height={38} viewBox="0 0 64 64">
                    {/* Blue disc (WHO/UN blue) */}
                    <Circle cx={32} cy={32} r={28} fill={colors.sky} />
                    {/* Olive branches (left + right) */}
                    <Path d="M 8 32 Q 18 18 32 14" stroke={colors.white} strokeWidth={1.4} fill="none" strokeLinecap="round" />
                    <Path d="M 8 32 Q 18 46 32 50" stroke={colors.white} strokeWidth={1.4} fill="none" strokeLinecap="round" />
                    <Path d="M 56 32 Q 46 18 32 14" stroke={colors.white} strokeWidth={1.4} fill="none" strokeLinecap="round" />
                    <Path d="M 56 32 Q 46 46 32 50" stroke={colors.white} strokeWidth={1.4} fill="none" strokeLinecap="round" />
                    {/* Globe meridians */}
                    <Circle cx={32} cy={32} r={14} fill="none" stroke={colors.white} strokeWidth={1.2} />
                    <Line x1={18} y1={32} x2={46} y2={32} stroke={colors.white} strokeWidth={1} />
                    <Path d="M 32 18 Q 24 32 32 46" stroke={colors.white} strokeWidth={1} fill="none" />
                    <Path d="M 32 18 Q 40 32 32 46" stroke={colors.white} strokeWidth={1} fill="none" />
                    {/* Rod of Asclepius — vertical staff */}
                    <Line x1={32} y1={14} x2={32} y2={52} stroke={colors.white} strokeWidth={2} strokeLinecap="round" />
                    {/* Serpent — S-curve around the staff */}
                    <Path
                      d="M 32 20 Q 26 24 32 28 Q 38 32 32 36 Q 26 40 32 44"
                      stroke={colors.white}
                      strokeWidth={1.8}
                      fill="none"
                      strokeLinecap="round"
                    />
                  </Svg>
                  <Text style={m.qsHealthFootnote}>World Health Organization data</Text>
                </View>
              </View>
              <View style={{ height: 24 }} />
            </>
          )}

          {/* ════════════════════════════════════════════════════════════════
              BEAT YOUR CRAVINGS — list of 3 tools (Tip / Quit lines / Breathing)
          ════════════════════════════════════════════════════════════════ */}
          {qsView === 'cravings' && (
            <>
              <Text style={m.qsCravingsIntro}>
                Pick a tool to ride the wave when a craving hits. Each takes less than a minute.
              </Text>

              {/* ── Reasons reminder banner — the strongest in-moment craving tool ─ */}
              {reasons.length > 0 ? (
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); setQsView('reasons'); }}
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
              {cravingsLast7d.length > 0 && (
                <View style={m.qsCravingSummary}>
                  <View style={m.qsCravingSummaryCell}>
                    <Text style={m.qsCravingSummaryVal}>{cravingsLast7d.length}</Text>
                    <Text style={m.qsCravingSummaryLbl}>logged · 7d</Text>
                  </View>
                  <View style={m.qsCravingSummaryDiv} />
                  <View style={m.qsCravingSummaryCell}>
                    <Text style={[m.qsCravingSummaryVal, { color: colors.green }]}>{cravingsWon7d}</Text>
                    <Text style={m.qsCravingSummaryLbl}>rode out</Text>
                  </View>
                  {cravingsWinRatePct !== null && (
                    <>
                      <View style={m.qsCravingSummaryDiv} />
                      <View style={m.qsCravingSummaryCell}>
                        <Text style={[m.qsCravingSummaryVal, { color: colors.honey }]}>{cravingsWinRatePct}%</Text>
                        <Text style={m.qsCravingSummaryLbl}>win rate</Text>
                      </View>
                    </>
                  )}
                </View>
              )}

              {/* "Craving right now?" rescue CTA — the headline in-the-moment tool.
                  Bigger and louder than the log button because it's the action you
                  want a panicking user to find in under a second. */}
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
                  setRescueSecondsLeft(RESCUE_TOTAL_SEC);
                  setRescueDone(false);
                  setQsView('rescue');
                }}
                style={m.qsRescueBtnWrap}
              >
                <LinearGradient
                  colors={[colors.rose, colors.purpleGlow]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={m.qsRescueBtn}
                >
                  <View style={m.qsRescueBtnIcon}>
                    <Ionicons name="flash" size={22} color={colors.white} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={m.qsRescueBtnTitle}>I'm craving right now</Text>
                    <Text style={m.qsRescueBtnSub}>Ride the wave · 3 min</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={colors.white} />
                </LinearGradient>
              </TouchableOpacity>

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

              {/* Your patterns — unlocks after 3 logged cravings (else stats look thin) */}
              {cravings.length >= 3 && (
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); setQsView('patterns'); }}
                  style={m.qsCravingCard}
                >
                  <View style={m.qsCravingCardArt}>
                    <PatternsArt size={84} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={m.qsCravingCardTitle}>Your patterns</Text>
                    <Text style={m.qsCravingCardDesc}>See your top triggers, peak craving times, and what's working best for you.</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={colors.ink3} />
                </TouchableOpacity>
              )}

              {/* Tip of the day */}
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); setQsView('tip'); }}
                style={m.qsCravingCard}
              >
                <View style={m.qsCravingCardArt}>
                  <TipBulbArt size={84} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={m.qsCravingCardTitle}>Tip of the day</Text>
                  <Text style={m.qsCravingCardDesc}>A fresh strategy every day to keep cravings short and sweet.</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.ink3} />
              </TouchableOpacity>

              {/* Quit lines */}
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); setQsView('quitline'); }}
                style={m.qsCravingCard}
              >
                <View style={m.qsCravingCardArt}>
                  <QuitlinePhoneArt size={84} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={m.qsCravingCardTitle}>Quit lines</Text>
                  <Text style={m.qsCravingCardDesc}>Free, confidential hotlines staffed by trained counselors worldwide.</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.ink3} />
              </TouchableOpacity>

              {/* Calm breathing */}
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); setQsView('breathing'); }}
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
              TIP OF THE DAY — single rotating card with hero illo + body
          ════════════════════════════════════════════════════════════════ */}
          {qsView === 'tip' && (
            <>
              <View style={m.qsTipHero}>
                <TipBulbArt size={140} />
              </View>
              <Text style={m.qsTipDate}>
                {new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
              </Text>
              <Text style={m.qsTipTitle}>{dailyTip.title}</Text>
              <Text style={m.qsTipBody}>{dailyTip.body}</Text>

              {/* Like / skip — personalizes which tips you see in future rotations. */}
              <View style={m.qsTipReactRow}>
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => toggleTipLike(dailyTip.id)}
                  style={[m.qsTipReactBtn, tipPrefs.liked.includes(dailyTip.id) && m.qsTipReactBtnLiked]}
                >
                  <Ionicons
                    name={tipPrefs.liked.includes(dailyTip.id) ? 'heart' : 'heart-outline'}
                    size={18}
                    color={tipPrefs.liked.includes(dailyTip.id) ? colors.rose : colors.ink2}
                  />
                  <Text style={[m.qsTipReactTxt, tipPrefs.liked.includes(dailyTip.id) && { color: colors.rose }]}>
                    {tipPrefs.liked.includes(dailyTip.id) ? 'Loved' : 'Love this'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => toggleTipSkip(dailyTip.id)}
                  style={[m.qsTipReactBtn, tipPrefs.skipped.includes(dailyTip.id) && m.qsTipReactBtnSkipped]}
                >
                  <Ionicons
                    name={tipPrefs.skipped.includes(dailyTip.id) ? 'eye-off' : 'eye-off-outline'}
                    size={18}
                    color={tipPrefs.skipped.includes(dailyTip.id) ? colors.honey : colors.ink2}
                  />
                  <Text style={[m.qsTipReactTxt, tipPrefs.skipped.includes(dailyTip.id) && { color: colors.honey }]}>
                    {tipPrefs.skipped.includes(dailyTip.id) ? 'Hidden' : 'Not for me'}
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
              QUIT LINES — user's home-country quitline (falls back to the full
              international list when no entry exists for their country).
          ════════════════════════════════════════════════════════════════ */}
          {qsView === 'quitline' && (
            <>
              <View style={m.qsQuitlineHero}>
                <QuitlinePhoneArt size={120} />
              </View>
              <Text style={m.qsQuitlineIntro}>
                Free, confidential, and staffed by people trained specifically to help you quit. Tap a number to call now.
              </Text>

              <View style={m.qsQuitlineGroup}>
                {/* Country-specific: show only the user's home-country quitline(s).
                    If the user's country isn't in the dataset, fall back to the full
                    list (alphabetised) so the screen is never empty. */}
                {(() => {
                  const local = QS_QUITLINES.filter(q => q.code === country);
                  const list = local.length > 0
                    ? local
                    : [...QS_QUITLINES].sort((a, b) => a.region.localeCompare(b.region));
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
                {QS_QUITLINES.some(q => q.code === country)
                  ? 'In an immediate medical emergency, dial your local emergency number instead.'
                  : 'No dedicated quitline is listed for your country yet — these international lines may still help. In an immediate emergency, dial your local emergency number instead.'}
              </Text>
              <View style={{ height: 24 }} />
            </>
          )}

          {/* ════════════════════════════════════════════════════════════════
              CALM BREATHING — 4-7-8 guided breath with animated circle
          ════════════════════════════════════════════════════════════════ */}
          {qsView === 'breathing' && (
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
                      key={`br-halo-${i}`}
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
                    { transform: [{ scale: breathScale }] },
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
                    {breathPhase === 'idle'     && 'Ready'}
                    {breathPhase === 'inhale'   && 'Breathe in'}
                    {breathPhase === 'hold'     && 'Hold'}
                    {breathPhase === 'exhale'   && 'Breathe out'}
                    {breathPhase === 'complete' && 'Complete'}
                  </Text>
                  <Text style={m.qsBreathingPhaseSub}>
                    {breathPhase === 'idle'     && 'Tap start when you’re ready'}
                    {breathPhase === 'inhale'   && '4 seconds'}
                    {breathPhase === 'hold'     && '7 seconds'}
                    {breathPhase === 'exhale'   && '8 seconds'}
                    {breathPhase === 'complete' && 'Three rounds done'}
                  </Text>
                </View>
              </View>

              {/* Round progress — three dots, one per breathing round */}
              <View style={m.qsBreathingDots}>
                {Array.from({ length: BREATH_ROUNDS }).map((_, i) => (
                  <View
                    key={`br-dot-${i}`}
                    style={[
                      m.qsBreathingDot,
                      { backgroundColor: breathRound > i ? colors.honey : colors.line2 },
                    ]}
                  />
                ))}
              </View>

              {/* Start / stop CTA */}
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => {
                  if (breathRunning) {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
                    stopBreathing();
                  } else {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
                    startBreathing();
                  }
                }}
                style={m.qsBreathingBtnWrap}
              >
                {breathRunning ? (
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
                    <Text style={m.qsBreathingBtnTxt}>{breathPhase === 'complete' ? 'Breathe again' : 'Start'}</Text>
                  </LinearGradient>
                )}
              </TouchableOpacity>

              <View style={m.qsBreathingTips}>
                <Text style={m.qsBreathingTipsHead}>Why it works</Text>
                <Text style={m.qsBreathingTipsBody}>
                  Slow exhales activate your parasympathetic nervous system — the same one that tells your body the danger has passed. Three rounds is usually enough to outlast a craving’s peak.
                </Text>
              </View>
              <View style={{ height: 32 }} />
            </>
          )}

          {/* ════════════════════════════════════════════════════════════════
              RIDE THE WAVE — 3-minute real-time craving rescue. Reuses the
              breathing animation as the visual rhythm. A craving's peak is
              usually 3-5 minutes — if you make it through, you win.
          ════════════════════════════════════════════════════════════════ */}
          {qsView === 'rescue' && (
            <>
              {!rescueDone ? (
                <>
                  <Text style={m.qsBreathingIntro}>
                    {rescueRunning
                      ? 'Cravings peak in about 3 minutes, then fade. Breathe with the circle and watch the timer.'
                      : 'Hit start. Breathe with the circle. Outlast the wave — it always passes.'}
                  </Text>

                  {/* Reasons reminder — the single most effective in-moment tool */}
                  {reasons.length > 0 && (
                    <View style={m.qsRescueReasonCard}>
                      <View style={m.qsRescueReasonHead}>
                        <Ionicons name="heart" size={14} color={colors.rose} />
                        <Text style={m.qsRescueReasonHeadTxt}>REMEMBER WHY</Text>
                      </View>
                      <Text style={m.qsRescueReasonTxt}>{`"${reasons[Math.floor(Math.random() * Math.min(reasons.length, 1000)) % reasons.length]}"`}</Text>
                    </View>
                  )}

                  {/* Reused breathing stage — circle scales with breath rhythm */}
                  <View style={m.qsBreathingStage}>
                    <View style={m.qsBreathingGuideOuter} pointerEvents="none" />
                    <View style={m.qsBreathingGuideMid} pointerEvents="none" />
                    {Array.from({ length: 12 }).map((_, i) => {
                      const ang = (i * 30 - 90) * Math.PI / 180;
                      const r = 150;
                      const dx = Math.cos(ang) * r;
                      const dy = Math.sin(ang) * r;
                      const big = i % 3 === 0;
                      const color = big ? colors.honey : (i % 3 === 1 ? colors.purple3 : colors.purple);
                      return (
                        <View
                          key={`rsq-halo-${i}`}
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
                    <Animated.View
                      style={[
                        m.qsBreathingCircle,
                        { transform: [{ scale: breathScale }] },
                      ]}
                    >
                      <LinearGradient
                        colors={[colors.rose, colors.purpleGlow]}
                        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                        style={StyleSheet.absoluteFillObject}
                      />
                      <View style={m.qsBreathingCircleHighlight} pointerEvents="none" />
                    </Animated.View>
                    <View style={m.qsBreathingPhaseWrap} pointerEvents="none">
                      <Text style={m.qsRescueTimer}>
                        {`${String(Math.floor(rescueSecondsLeft / 60)).padStart(1, '0')}:${String(rescueSecondsLeft % 60).padStart(2, '0')}`}
                      </Text>
                      <Text style={m.qsBreathingPhaseSub}>
                        {breathPhase === 'inhale'   && 'Breathe in'}
                        {breathPhase === 'hold'     && 'Hold'}
                        {breathPhase === 'exhale'   && 'Breathe out'}
                        {(breathPhase === 'idle' || breathPhase === 'complete') && (rescueRunning ? 'Stay with it' : 'Ready')}
                      </Text>
                    </View>
                  </View>

                  {/* Progress dots — fill as seconds elapse (10 dots = 18s each) */}
                  <View style={m.qsBreathingDots}>
                    {Array.from({ length: 10 }).map((_, i) => {
                      const elapsedSec = RESCUE_TOTAL_SEC - rescueSecondsLeft;
                      const passed = elapsedSec >= (i + 1) * (RESCUE_TOTAL_SEC / 10);
                      return (
                        <View
                          key={`rsq-dot-${i}`}
                          style={[
                            m.qsBreathingDot,
                            { backgroundColor: passed ? colors.honey : colors.line2 },
                          ]}
                        />
                      );
                    })}
                  </View>

                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => {
                      if (rescueRunning) {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
                        Alert.alert(
                          'Stop now?',
                          'You\'re not weak for stopping — but you\'re stronger than you think. Want to keep going?',
                          [
                            { text: 'Keep going', style: 'cancel' },
                            { text: 'Stop', style: 'destructive', onPress: () => stopRescue() },
                          ],
                        );
                      } else {
                        startRescue();
                      }
                    }}
                    style={m.qsBreathingBtnWrap}
                  >
                    {rescueRunning ? (
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
                        <Text style={m.qsBreathingBtnTxt}>Start</Text>
                      </LinearGradient>
                    )}
                  </TouchableOpacity>

                  <View style={m.qsBreathingTips}>
                    <Text style={m.qsBreathingTipsHead}>Why three minutes?</Text>
                    <Text style={m.qsBreathingTipsBody}>
                      Nicotine cravings rise, peak, and fall in waves of 3–5 minutes. If you can outlast one wave, the urge fades on its own. Every wave you ride is one less the next time gets to push you around.
                    </Text>
                  </View>
                  <View style={{ height: 32 }} />
                </>
              ) : (
                /* Completion celebration — the user just rode out a craving */
                <>
                  <View style={m.qsRescueDoneHero}>
                    <Svg width={140} height={140} viewBox="0 0 64 64">
                      {/* Scalloped sun-burst seal */}
                      <Polygon
                        points={Array.from({ length: 24 }, (_, i) => {
                          const ang = (i / 24) * Math.PI * 2 - Math.PI / 2;
                          const r = i % 2 === 0 ? 30 : 24;
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
                  <Text style={m.qsRescueDoneTitle}>You rode it out.</Text>
                  <Text style={m.qsRescueDoneBody}>
                    The urge rose, peaked, and passed — and you stayed steady through all three minutes. We logged it as a win in your craving history. Every wave you outlast makes the next one quieter.
                  </Text>

                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => { stopRescue(); setQsView('cravings'); }}
                    style={m.qsCravingSaveBtnWrap}
                  >
                    <LinearGradient
                      colors={[colors.purple, colors.purpleGlow]}
                      start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                      style={m.qsCravingSaveBtn}
                    >
                      <Text style={m.qsCravingSaveBtnTxt}>Back to cravings</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => { setRescueDone(false); setRescueSecondsLeft(RESCUE_TOTAL_SEC); }}
                    style={m.qsRescueAgainBtn}
                  >
                    <Text style={m.qsRescueAgainBtnTxt}>Go again</Text>
                  </TouchableOpacity>
                  <View style={{ height: 32 }} />
                </>
              )}
            </>
          )}

          {/* ════════════════════════════════════════════════════════════════
              YOUR PATTERNS — visualize what's driving the cravings (triggers,
              hour-of-day, coping wins) so the user can see their own data.
          ════════════════════════════════════════════════════════════════ */}
          {qsView === 'patterns' && (() => {
            // Aggregate trigger counts — top 5 displayed as horizontal bars
            const triggerCounts = new Map<string, number>();
            const copingCountsWon = new Map<string, number>();
            const hourCounts = new Array(24).fill(0) as number[];
            let totalIntensity = 0;
            let intensityN = 0;
            let totalWon = 0;
            for (const c of cravings) {
              if (c.trigger) triggerCounts.set(c.trigger, (triggerCounts.get(c.trigger) ?? 0) + 1);
              if (c.coping && !c.gaveIn) copingCountsWon.set(c.coping, (copingCountsWon.get(c.coping) ?? 0) + 1);
              try {
                const h = new Date(c.ts).getHours();
                if (h >= 0 && h < 24) hourCounts[h] += 1;
              } catch { /* ignore bad date */ }
              if (Number.isFinite(c.intensity)) { totalIntensity += c.intensity; intensityN += 1; }
              if (!c.gaveIn) totalWon += 1;
            }
            const winRate = cravings.length > 0 ? Math.round((totalWon / cravings.length) * 100) : 0;
            const avgIntensity = intensityN > 0 ? (totalIntensity / intensityN) : 0;
            const triggerLabel = (k: string) => CRAVING_TRIGGERS.find(t => t.key === k)?.label ?? k;
            const triggerIcon  = (k: string) => CRAVING_TRIGGERS.find(t => t.key === k)?.icon  ?? '•';
            const copingLabel  = (k: string) => CRAVING_COPING.find(t => t.key === k)?.label   ?? k;
            const copingIcon   = (k: string) => CRAVING_COPING.find(t => t.key === k)?.icon    ?? '•';
            const topTriggers = [...triggerCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
            const topCoping   = [...copingCountsWon.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
            const maxTrigger  = topTriggers[0]?.[1] ?? 0;
            const maxCoping   = topCoping[0]?.[1] ?? 0;
            // Bucket the 24 hours into 6 four-hour slots for a readable histogram
            const slots: { label: string; count: number }[] = [
              { label: '12-4a',  count: hourCounts.slice(0, 4).reduce((a, b) => a + b, 0) },
              { label: '4-8a',   count: hourCounts.slice(4, 8).reduce((a, b) => a + b, 0) },
              { label: '8-12p',  count: hourCounts.slice(8, 12).reduce((a, b) => a + b, 0) },
              { label: '12-4p',  count: hourCounts.slice(12, 16).reduce((a, b) => a + b, 0) },
              { label: '4-8p',   count: hourCounts.slice(16, 20).reduce((a, b) => a + b, 0) },
              { label: '8-12a',  count: hourCounts.slice(20, 24).reduce((a, b) => a + b, 0) },
            ];
            const maxSlot = Math.max(0, ...slots.map(s => s.count));
            return (
              <>
                <Text style={m.qsBreathingIntro}>
                  Based on {cravings.length} logged craving{cravings.length === 1 ? '' : 's'}. The more you log, the clearer your picture gets.
                </Text>

                {/* Top-line summary stats */}
                <View style={m.qsCravingSummary}>
                  <View style={m.qsCravingSummaryCell}>
                    <Text style={[m.qsCravingSummaryVal, { color: colors.green }]}>{winRate}%</Text>
                    <Text style={m.qsCravingSummaryLbl}>win rate</Text>
                  </View>
                  <View style={m.qsCravingSummaryDiv} />
                  <View style={m.qsCravingSummaryCell}>
                    <Text style={m.qsCravingSummaryVal}>{avgIntensity > 0 ? avgIntensity.toFixed(1) : '—'}</Text>
                    <Text style={m.qsCravingSummaryLbl}>avg intensity</Text>
                  </View>
                  <View style={m.qsCravingSummaryDiv} />
                  <View style={m.qsCravingSummaryCell}>
                    <Text style={[m.qsCravingSummaryVal, { color: colors.honey }]}>{totalWon}</Text>
                    <Text style={m.qsCravingSummaryLbl}>rode out</Text>
                  </View>
                </View>

                {/* Top triggers — horizontal bar chart */}
                <Text style={m.qsDetailSectionTitle}>Top triggers</Text>
                {topTriggers.length === 0 ? (
                  <Text style={m.qsPatternsEmpty}>No triggers tagged yet — pick one when you log your next craving.</Text>
                ) : (
                  <View style={m.qsPatternsCard}>
                    {topTriggers.map(([k, count]) => {
                      const pct = maxTrigger > 0 ? (count / maxTrigger) : 0;
                      return (
                        <View key={`tr-${k}`} style={m.qsPatternsBarRow}>
                          <Text style={m.qsPatternsBarIcon}>{triggerIcon(k)}</Text>
                          <Text style={m.qsPatternsBarLbl}>{triggerLabel(k)}</Text>
                          <View style={m.qsPatternsBarTrack}>
                            <View style={[m.qsPatternsBarFill, { width: `${Math.max(6, pct * 100)}%`, backgroundColor: colors.rose }]} />
                          </View>
                          <Text style={m.qsPatternsBarCount}>{count}</Text>
                        </View>
                      );
                    })}
                  </View>
                )}

                {/* When cravings hit — 6-slot histogram */}
                <Text style={m.qsDetailSectionTitle}>When they hit</Text>
                <View style={m.qsPatternsCard}>
                  <View style={m.qsPatternsHistRow}>
                    {slots.map((s, i) => {
                      const pct = maxSlot > 0 ? s.count / maxSlot : 0;
                      const isPeak = maxSlot > 0 && s.count === maxSlot;
                      return (
                        <View key={`slot-${i}`} style={m.qsPatternsHistCol}>
                          <View style={m.qsPatternsHistBarWrap}>
                            <View
                              style={[
                                m.qsPatternsHistBar,
                                {
                                  height: `${Math.max(4, pct * 100)}%`,
                                  backgroundColor: isPeak ? colors.honey : colors.purple2,
                                },
                              ]}
                            />
                          </View>
                          <Text style={m.qsPatternsHistLbl}>{s.label}</Text>
                          <Text style={m.qsPatternsHistCount}>{s.count}</Text>
                        </View>
                      );
                    })}
                  </View>
                  {maxSlot > 0 && (
                    <Text style={m.qsPatternsHistCaption}>
                      Most cravings hit during {slots.find(s => s.count === maxSlot)?.label}. Plan ahead for that window.
                    </Text>
                  )}
                </View>

                {/* What's working — top coping wins */}
                <Text style={m.qsDetailSectionTitle}>What's working</Text>
                {topCoping.length === 0 ? (
                  <Text style={m.qsPatternsEmpty}>Pick a coping action on your craving log to see what's beating cravings for you.</Text>
                ) : (
                  <View style={m.qsPatternsCard}>
                    {topCoping.map(([k, count]) => {
                      const pct = maxCoping > 0 ? (count / maxCoping) : 0;
                      return (
                        <View key={`cp-${k}`} style={m.qsPatternsBarRow}>
                          <Text style={m.qsPatternsBarIcon}>{copingIcon(k)}</Text>
                          <Text style={m.qsPatternsBarLbl}>{copingLabel(k)}</Text>
                          <View style={m.qsPatternsBarTrack}>
                            <View style={[m.qsPatternsBarFill, { width: `${Math.max(6, pct * 100)}%`, backgroundColor: colors.green }]} />
                          </View>
                          <Text style={m.qsPatternsBarCount}>{count}</Text>
                        </View>
                      );
                    })}
                  </View>
                )}

                <View style={{ height: 32 }} />
              </>
            );
          })()}

          {/* ════════════════════════════════════════════════════════════════
              MONEY-SAVED GOAL — name a thing you're saving for, watch the bar.
          ════════════════════════════════════════════════════════════════ */}
          {qsView === 'goal' && (
            <>
              <View style={m.qsReasonsIntro}>
                <Ionicons name="trophy" size={18} color={colors.honey} />
                <Text style={m.qsReasonsIntroTxt}>
                  Name what you're saving for — a trip, gear, a treat — and we'll track your money-saved progress against it. The bigger the prize, the better the motivation.
                </Text>
              </View>

              <Text style={m.qsDetailSectionTitle}>What are you saving for?</Text>
              <TextInput
                style={m.qsTextInput}
                value={goalDraftLabel}
                onChangeText={setGoalDraftLabel}
                placeholder="e.g. Weekend in Lisbon"
                placeholderTextColor={colors.ink3}
                maxLength={60}
                returnKeyType="next"
              />

              <Text style={m.qsDetailSectionTitle}>How much do you need?</Text>
              <TextInput
                style={m.qsTextInput}
                value={goalDraftAmount}
                onChangeText={setGoalDraftAmount}
                placeholder="500"
                placeholderTextColor={colors.ink3}
                keyboardType="decimal-pad"
                returnKeyType="done"
                onSubmitEditing={saveGoal}
              />

              <TouchableOpacity activeOpacity={0.85} onPress={saveGoal} style={m.qsCravingSaveBtnWrap}>
                <LinearGradient
                  colors={[colors.purple, colors.purpleGlow]}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={m.qsCravingSaveBtn}
                >
                  <Text style={m.qsCravingSaveBtnTxt}>{moneyGoal ? 'Update goal' : 'Save goal'}</Text>
                </LinearGradient>
              </TouchableOpacity>

              {moneyGoal && (
                <TouchableOpacity activeOpacity={0.85} onPress={clearGoal} style={m.qsRescueAgainBtn}>
                  <Text style={[m.qsRescueAgainBtnTxt, { color: colors.rose }]}>Remove this goal</Text>
                </TouchableOpacity>
              )}
              <View style={{ height: 24 }} />
            </>
          )}

          {/* ════════════════════════════════════════════════════════════════
              MY REASONS — strongest evidence-based craving anchor.
              Editor mode (reasonsEditing) adds/removes; read mode shows list.
          ════════════════════════════════════════════════════════════════ */}
          {qsView === 'reasons' && (
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
                    placeholder="e.g. To be there for my kids"
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
                      <View key={`rdraft-${i}`} style={m.qsReasonRow}>
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
                    <View key={`reason-${i}`} style={m.qsReasonRow}>
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
              NRT LOG — patches / gum / lozenges. Tracking doubles quit odds.
          ════════════════════════════════════════════════════════════════ */}
          {qsView === 'nrt' && (
            <>
              <View style={m.qsNrtStatRow}>
                <View style={m.qsNrtStatCell}>
                  <Text style={m.qsNrtStatVal}>{nrtToday}</Text>
                  <Text style={m.qsNrtStatLbl}>TODAY</Text>
                </View>
                <View style={m.qsNrtStatDiv} />
                <View style={m.qsNrtStatCell}>
                  <Text style={m.qsNrtStatVal}>{nrt7d}</Text>
                  <Text style={m.qsNrtStatLbl}>7 DAYS</Text>
                </View>
                <View style={m.qsNrtStatDiv} />
                <View style={m.qsNrtStatCell}>
                  <Text style={m.qsNrtStatVal}>{nrtLog.length}</Text>
                  <Text style={m.qsNrtStatLbl}>ALL TIME</Text>
                </View>
              </View>

              <TouchableOpacity activeOpacity={0.85} onPress={openNrtForm} style={m.qsCravingLogBtnWrap}>
                <LinearGradient
                  colors={[colors.purple, colors.purpleGlow]}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={m.qsCravingLogBtn}
                >
                  <Ionicons name="add" size={18} color={colors.white} />
                  <Text style={m.qsCravingLogBtnTxt}>Log NRT</Text>
                </LinearGradient>
              </TouchableOpacity>

              {nrtLog.length === 0 ? (
                <View style={m.qsReasonsEmptyWrap}>
                  <View style={[m.qsReasonsEmptyIcon, { backgroundColor: colors.teal + '22' }]}>
                    <Ionicons name="medkit" size={38} color={colors.teal} />
                  </View>
                  <Text style={m.qsReasonsEmptyTitle}>No NRT logged yet</Text>
                  <Text style={m.qsReasonsEmptyBody}>
                    Track every patch, gum, or lozenge. Used properly, NRT roughly doubles your odds of quitting for good.
                  </Text>
                </View>
              ) : (
                <View style={{ gap: spacing.sm }}>
                  <Text style={m.qsCravingFormLbl}>History</Text>
                  {nrtLog.map(entry => {
                    const meta = NRT_TYPES.find(t => t.key === entry.kind);
                    return (
                      <View key={entry.ts} style={m.qsNrtRow}>
                        <View style={m.qsNrtRowIcon}>
                          <Text style={m.qsNrtRowIconTxt}>{meta?.icon ?? '•'}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={m.qsNrtRowTitle}>
                            {meta?.label ?? 'Other'}{entry.strength ? `  ·  ${entry.strength}` : ''}
                          </Text>
                          <Text style={m.qsNrtRowTime}>{nrtRelTime(entry.ts)}</Text>
                          {entry.note ? <Text style={m.qsNrtRowNote}>{entry.note}</Text> : null}
                        </View>
                        <TouchableOpacity
                          onPress={() => removeNrtEntry(entry.ts)}
                          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        >
                          <Ionicons name="close-circle" size={22} color={colors.ink3} />
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </View>
              )}
              <View style={{ height: 24 }} />
            </>
          )}
        </ScrollView>

        {/* ════════════════════════════════════════════════════════════════
            DOCKED SHARE BAR — only when viewing an UNLOCKED achievement.
            Lives outside the ScrollView so it pins to the bottom edge
            (QuitNow-style sticky footer card).
        ════════════════════════════════════════════════════════════════ */}
        {qsView === 'achievement' && selectedAch && data && isAchUnlocked(selectedAch, hours, cigsAvoided, moneySaved) && (() => {
          const a = selectedAch;
          const onShare = () => { void shareAchievement(a); };
          return (
            <View style={m.qsAchDetailDock} pointerEvents="box-none">
              <Text style={m.qsAchDockTitle}>You did it!</Text>
              <Text style={m.qsAchDockSub}>Your health has improved</Text>

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
        CRAVING LOG FORM — intensity / trigger / coping / "did you give in"
        Sibling Modal so it overlays the parent QuitSmokingModal cleanly.
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
                    key={`int-${n}`}
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
              {CRAVING_TRIGGERS.map(t => {
                const active = cravingTrigger === t.key;
                return (
                  <TouchableOpacity
                    key={`trig-${t.key}`}
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
              {CRAVING_COPING.map(t => {
                const active = cravingCoping === t.key;
                return (
                  <TouchableOpacity
                    key={`cop-${t.key}`}
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

    {/* ────────────────────────────────────────────────────────────────────
        NRT LOG FORM — type / strength / note.
        Sibling Modal so it overlays the parent QuitSmokingModal cleanly.
    ──────────────────────────────────────────────────────────────────── */}
    <Modal
      visible={nrtFormOpen}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={() => setNrtFormOpen(false)}
    >
      <SafeAreaView style={m.sheet} edges={['top', 'bottom']}>
        <ProgramSheetHeader title="Log NRT" onBack={() => setNrtFormOpen(false)} />
        <ScrollView
          contentContainerStyle={{ padding: spacing.md, gap: spacing.lg }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Type */}
          <View style={{ gap: spacing.sm }}>
            <Text style={m.qsCravingFormLbl}>Type</Text>
            <View style={m.qsCravingChipRow}>
              {NRT_TYPES.map(t => {
                const active = nrtFormKind === t.key;
                return (
                  <TouchableOpacity
                    key={`nrtk-${t.key}`}
                    activeOpacity={0.85}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                      setNrtFormKind(t.key);
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

          {/* Strength */}
          <View style={{ gap: spacing.sm }}>
            <Text style={m.qsCravingFormLbl}>Strength <Text style={m.qsNrtOptional}>· optional</Text></Text>
            <TextInput
              style={m.qsTextInput}
              value={nrtFormStrength}
              onChangeText={setNrtFormStrength}
              placeholder="e.g. 21 mg, 4 mg, 2 mg"
              placeholderTextColor={colors.ink3}
              maxLength={40}
              returnKeyType="done"
            />
          </View>

          {/* Note */}
          <View style={{ gap: spacing.sm }}>
            <Text style={m.qsCravingFormLbl}>Note <Text style={m.qsNrtOptional}>· optional</Text></Text>
            <TextInput
              style={[m.qsTextInput, m.qsNrtNoteInput]}
              value={nrtFormNote}
              onChangeText={setNrtFormNote}
              placeholder="How you felt, what triggered it…"
              placeholderTextColor={colors.ink3}
              multiline
              maxLength={200}
            />
          </View>

          {/* Save CTA */}
          <TouchableOpacity activeOpacity={0.85} onPress={saveNrtEntry} style={m.qsCravingSaveBtnWrap}>
            <LinearGradient
              colors={[colors.purple, colors.purpleGlow]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={m.qsCravingSaveBtn}
            >
              <Text style={m.qsCravingSaveBtnTxt}>Save entry</Text>
            </LinearGradient>
          </TouchableOpacity>

          <View style={{ height: spacing.lg }} />
        </ScrollView>
      </SafeAreaView>
    </Modal>
    </>
  );
}
