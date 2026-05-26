import { useState, useEffect, useRef, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Modal, Alert, TextInput, Platform, Keyboard, Share,
  Animated, Linking, Easing,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle, Ellipse, G, Line, Rect, Path, Polygon, Text as SvgText } from 'react-native-svg';
import { colors, spacing, fontSize, radius } from '../../src/theme';
import { ClockPickerModal } from '../../src/components/ClockPickerModal';
import { CalendarPickerModal } from '../../src/components/CalendarPickerModal';
import { BackChevron } from '../../src/components/BackChevron';
import { FastingModal } from '../../src/components/programs/FastingModal';
import { useAppStore } from '../../src/store/appStore';
import { useAuthStore } from '../../src/store/authStore';
import { schedulePillReminders, scheduleQsNotifications, cancelQsNotifications, scheduleQdNotifications, cancelQdNotifications } from '../../src/lib/notifications';
import { formatMoneyFromUsd, currencySymbol, usdToLocal, localToUsd, minorUnits } from '../../src/lib/currency';
import { fmt, fmtFlex } from '../../src/lib/format';
import {
  groceryKey,
  loadGroceryHistory,
  recordGroceryPurchase,
  pickFrequentItems,
  type GroceryHistory,
  type GroceryHistoryItem,
} from '../../src/lib/grocery';

// ── Storage keys (scoped per user to prevent data leakage between accounts) ───
function makeKeys(email: string) {
  return {
    QS:       `dagnara_quit_smoking_${email}`,
    QS_SLIPS: `dagnara_quit_smoking_slips_${email}`,
    QS_BEST:  `dagnara_quit_smoking_best_${email}`,    // personal-best streak (hours)
    QS_REASONS: `dagnara_quit_smoking_reasons_${email}`, // user's reasons-I'm-quitting anchor
    QS_CRAVE: `dagnara_quit_smoking_cravings_${email}`,  // craving log entries
    QS_TIP:   `dagnara_quit_smoking_tip_${email}`,        // tip prefs (liked/skipped IDs)
    QS_NRT:   `dagnara_quit_smoking_nrt_${email}`,        // NRT log
    QS_COST_PROMPT: `dagnara_quit_smoking_cost_prompt_${email}`, // last cost-update prompt date
    QS_GOAL:  `dagnara_quit_smoking_goal_${email}`,       // money-saved goal ({amount,label})
    QD:       `dagnara_quit_drinking_${email}`,
    QD_SLIPS: `dagnara_quit_drinking_slips_${email}`,
    QD_BEST:  `dagnara_quit_drinking_best_${email}`,
    QD_REASONS: `dagnara_quit_drinking_reasons_${email}`, // user's reasons-I'm-quitting anchor
    QD_CRAVE: `dagnara_quit_drinking_cravings_${email}`,  // craving log entries
    QD_TIP:   `dagnara_quit_drinking_tip_${email}`,        // tip prefs (liked/skipped IDs)
    QD_COST_PROMPT: `dagnara_quit_drinking_cost_prompt_${email}`, // last cost-update prompt date
    PILLS:    `dagnara_pill_meds_${email}`,
    PILL_LOG: (day: string) => `dagnara_pill_log_${day}_${email}`,
  };
}

// ── Types ─────────────────────────────────────────────────────────────────────
// `productType` defaults to 'cigarettes' when missing (legacy users). For vape
// and pouches we keep the same numeric fields (units/day, units/pack, $/pack)
// and only change the labels — keeps math identical across products.
type QsProduct = 'cigarettes' | 'vape' | 'pouches';
interface QsData {
  quitDate: string;     // ISO date string
  cigsPerDay: number;   // units per day (cigs / pods / pouches)
  costPerPack: number;  // $/pack (USD-normalized)
  cigsPerPack: number;  // units per pack
  productType?: QsProduct;
}

// Per-product display labels. Math is identical across products — these only
// drive copy and short unit words used in counters / setup form.
const QS_PRODUCT_LABELS: Record<QsProduct, {
  unit: string;          // singular noun, lowercased ("cigarette" / "pod" / "pouch")
  unitPlural: string;    // plural noun ("cigarettes" / "pods" / "pouches")
  short: string;         // short countable word for tight UIs ("cig" / "pod" / "pouch")
  pack: string;          // pack noun ("pack" / "box" / "tin")
  pkgFieldLbl: string;   // setup form label for "X per pack"
  perDayLbl: string;     // setup form label for "X per day"
  perPackLbl: string;    // setup form label for "X per pack/box/tin" cost
  emoji: string;         // icon used on the product picker
  productName: string;   // full title-cased product name for setup picker
}> = {
  cigarettes: {
    unit: 'cigarette', unitPlural: 'cigarettes', short: 'cig',
    pack: 'pack', pkgFieldLbl: 'Cigarettes per pack',
    perDayLbl: 'Cigarettes per day', perPackLbl: 'Cost per pack',
    emoji: '🚬', productName: 'Cigarettes',
  },
  vape: {
    unit: 'pod', unitPlural: 'pods', short: 'pod',
    pack: 'box', pkgFieldLbl: 'Pods per box',
    perDayLbl: 'Pods per day', perPackLbl: 'Cost per box',
    emoji: '💨', productName: 'Vape pods',
  },
  pouches: {
    unit: 'pouch', unitPlural: 'pouches', short: 'pouch',
    pack: 'tin', pkgFieldLbl: 'Pouches per tin',
    perDayLbl: 'Pouches per day', perPackLbl: 'Cost per tin',
    emoji: '🟢', productName: 'Nicotine pouches',
  },
};
function productLabels(d: QsData | null | undefined): typeof QS_PRODUCT_LABELS[QsProduct] {
  return QS_PRODUCT_LABELS[d?.productType ?? 'cigarettes'];
}

// ── NRT tracker ───────────────────────────────────────────────────────────────
// Nicotine Replacement Therapy log. Kept intentionally small — type + optional
// strength + ISO timestamp. We don't track adherence ratios or doses-per-day
// here; this surfaces "how much NRT are you actually using" so the user can
// see their own tapering.
interface NrtEntry {
  ts: string;
  kind: 'patch' | 'gum' | 'lozenge' | 'spray' | 'inhaler' | 'pouch' | 'other';
  strength?: string;   // e.g. "21mg", "4mg" — free text, optional
  note?: string;       // optional free-text
}
const NRT_TYPES: { key: NrtEntry['kind']; label: string; icon: string }[] = [
  { key: 'patch',    label: 'Patch',    icon: '🩹' },
  { key: 'gum',      label: 'Gum',      icon: '🍬' },
  { key: 'lozenge',  label: 'Lozenge',  icon: '🟠' },
  { key: 'spray',    label: 'Spray',    icon: '💧' },
  { key: 'inhaler',  label: 'Inhaler',  icon: '🌬️' },
  { key: 'pouch',    label: 'Pouch',    icon: '🟢' },
  { key: 'other',    label: 'Other',    icon: '•' },
];
// Compact relative time for NRT log rows ("Just now", "12m ago", "3h ago", "2d ago").
function nrtRelTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return 'Just now';
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

// ── Tip preferences ───────────────────────────────────────────────────────────
// Liked / skipped tip IDs. Used by pickDailyTip() to filter skipped tips out
// of the rotation so the user never sees the same dismissed tip again.
interface TipPrefs {
  liked: string[];
  skipped: string[];
}
const DEFAULT_TIP_PREFS: TipPrefs = { liked: [], skipped: [] };

interface QdData {
  quitDate: string;
  drinksPerDay: number;
  costPerDrink: number;
}

// Single craving log entry. Captures the moment + how the user rode the wave.
// `gaveIn=false` is a win — surface those count prominently on the main view.
interface Craving {
  ts: string;            // ISO timestamp
  intensity: number;     // 1..10
  trigger?: string;      // e.g. 'stress' | 'social' | 'meal' | 'boredom' | 'alcohol' | 'other'
  coping?: string;       // e.g. 'breath' | 'walk' | 'water' | 'snack' | 'distract' | 'other'
  gaveIn: boolean;       // did the craving win
}

// Trigger and coping options for the craving logger — keep them short so the
// chip row stays one line on small phones.
const CRAVING_TRIGGERS: Array<{ key: string; label: string; icon: string }> = [
  { key: 'stress',  label: 'Stress',  icon: '😣' },
  { key: 'social',  label: 'Social',  icon: '👥' },
  { key: 'meal',    label: 'Meal',    icon: '🍽' },
  { key: 'boredom', label: 'Bored',   icon: '🥱' },
  { key: 'alcohol', label: 'Drinks',  icon: '🥂' },
  { key: 'other',   label: 'Other',   icon: '•' },
];
const CRAVING_COPING: Array<{ key: string; label: string; icon: string }> = [
  { key: 'breath',   label: 'Breathe',  icon: '🫁' },
  { key: 'walk',     label: 'Walk',     icon: '🚶' },
  { key: 'water',    label: 'Water',    icon: '💧' },
  { key: 'snack',    label: 'Snack',    icon: '🥜' },
  { key: 'distract', label: 'Distract', icon: '🎧' },
  { key: 'other',    label: 'Other',    icon: '•' },
];

interface Medication {
  id: string;
  name: string;
  dosage: string;              // display string, auto-built from qty+unit
  dosageQty: number;           // e.g. 2
  dosageUnit: string;          // e.g. 'tab'
  times: string[];
  color: string;
  notes: string;
  durationDays: number | null; // null = ongoing
  startDate: string;           // YYYY-MM-DD
  daysOfWeek: number[] | null; // null = every day; 0=Mon…6=Sun
}

interface DoseEntry {
  takenCount: number;
  takenTimes: string[];
  skippedSlots?: number[];   // slot indices the user explicitly skipped
}

interface PillLog {
  [medId: string]: DoseEntry;
}

// ── Pill colors ───────────────────────────────────────────────────────────────
const PILL_COLORS = [
  colors.sky, colors.green, colors.honey, colors.rose,
  colors.violet, colors.teal, colors.purple2, colors.lavender,
];

// ── 82 quit-smoking achievements split across 4 stat types ────────────────────
// Each entry: emoji (legacy badge), illo (custom Dagnara SVG kind), title, desc.
// Time-based (28).
const QS_ACHIEVEMENTS = [
  { id: '20m',  hours: 0.33,    icon: '🫧', illo: 'clock',    title: 'First Step',          desc: 'Blood pressure normalizes' },
  { id: '1h',   hours: 1,       icon: '⏱️',  illo: 'clock',    title: 'Strong Start',        desc: 'You can do this' },
  { id: '4h',   hours: 4,       icon: '⏰', illo: 'clock',    title: 'Quarter Day',         desc: 'Four hours in' },
  { id: '8h',   hours: 8,       icon: '🩸', illo: 'sunrise',  title: 'Half-Day Hero',       desc: 'CO and nicotine cut in half' },
  { id: '12h',  hours: 12,      icon: '💨', illo: 'sunrise',  title: 'Halfway There',       desc: 'Carbon monoxide eliminated' },
  { id: '1d',   hours: 24,      icon: '📅', illo: 'calendar', title: 'First cross on the calendar', desc: 'Heart attack risk drops' },
  { id: '2d',   hours: 48,      icon: '👃', illo: 'calendar', title: 'Two-Day Streak',      desc: 'Taste and smell return' },
  { id: '3d',   hours: 72,      icon: '🫁', illo: 'calendar', title: 'Three-Day Wonder',    desc: 'Nicotine fully gone' },
  { id: '4d',   hours: 96,      icon: '☀️', illo: 'calendar', title: 'Four-Day Force',      desc: 'Building momentum' },
  { id: '5d',   hours: 120,     icon: '🔥', illo: 'calendar', title: 'Five-Day Fighter',    desc: 'Strength growing' },
  { id: '6d',   hours: 144,     icon: '🎯', illo: 'calendar', title: 'Almost a Week',       desc: 'So close to seven' },
  { id: '1w',   hours: 168,     icon: '🏃', illo: 'calendar', title: 'Week One Champion',   desc: 'Lungs rebuilding' },
  { id: '10d',  hours: 240,     icon: '🌿', illo: 'sprout',   title: 'Ten Days Free',       desc: 'A solid run' },
  { id: '2w',   hours: 336,     icon: '🌳', illo: 'sprout',   title: 'Two Week Titan',      desc: 'Circulation improves' },
  { id: '3w',   hours: 504,     icon: '💪', illo: 'sprout',   title: 'Three Week Triumph',  desc: 'Habit reshaping' },
  { id: '1mo',  hours: 720,     icon: '🌙', illo: 'sprout',   title: 'Month-Long Master',   desc: 'Cough and fatigue down' },
  { id: '6w',   hours: 1008,    icon: '⚡', illo: 'sprout',   title: 'Six Week Surge',      desc: 'Energy stabilizing' },
  { id: '2mo',  hours: 1440,    icon: '🌄', illo: 'sprout',   title: 'Two Months Free',     desc: 'Energy returning' },
  { id: '3mo',  hours: 2160,    icon: '🫀', illo: 'trophy',   title: 'Quarter Year',        desc: 'Lung function up 30%' },
  { id: '4mo',  hours: 2880,    icon: '🌅', illo: 'trophy',   title: 'Four Months Strong',  desc: 'Solid recovery' },
  { id: '6mo',  hours: 4380,    icon: '🥇', illo: 'trophy',   title: 'Half-Year Hero',      desc: 'Major risk drop' },
  { id: '9mo',  hours: 6480,    icon: '🌱', illo: 'trophy',   title: 'Nine Months New',     desc: 'Cilia regenerated' },
  { id: '1y',   hours: 8760,    icon: '🏆', illo: 'trophy',   title: 'One Year Wonder',     desc: 'Heart disease risk halved' },
  { id: '18mo', hours: 13140,   icon: '🌟', illo: 'star',     title: 'Year and a Half',     desc: 'Going strong' },
  { id: '2y',   hours: 17520,   icon: '⭐', illo: 'star',     title: 'Two-Year Titan',      desc: 'Major milestone' },
  { id: '3y',   hours: 26280,   icon: '💎', illo: 'star',     title: 'Three-Year Legend',   desc: 'Truly free' },
  { id: '5y',   hours: 43800,   icon: '🧠', illo: 'crown',    title: 'Five-Year Star',      desc: 'Stroke risk = non-smoker' },
  { id: '10y',  hours: 87600,   icon: '👑', illo: 'crown',    title: 'Decade Dominator',    desc: 'Lung cancer risk halved' },
];

// Cigarettes avoided (28).
const QS_CIG_ACHIEVEMENTS = [
  { id: 'c5',     cigs: 5,      icon: '🚀', illo: 'rocket', title: 'To Infinity',         desc: 'And beyond' },
  { id: 'c10',    cigs: 10,     icon: '🎉', illo: 'dance',  title: 'Saturday Night',      desc: 'Off to a great start' },
  { id: 'c15',    cigs: 15,     icon: '🦸', illo: 'dive',   title: 'Clothes Off',         desc: 'Feeling free' },
  { id: 'c20',    cigs: 20,     icon: '🤸', illo: 'jump',   title: 'Jump Around',         desc: 'Energy returning' },
  { id: 'c25',    cigs: 25,     icon: '🎪', illo: 'dance',  title: 'Quarter Hundred',     desc: 'Building habits' },
  { id: 'c50',    cigs: 50,     icon: '🌬️', illo: 'jump',   title: 'Half a Century',      desc: 'Lungs thank you' },
  { id: 'c75',    cigs: 75,     icon: '🎊', illo: 'dive',   title: 'Three Quarters',      desc: 'Almost a hundred' },
  { id: 'c100',   cigs: 100,    icon: '💯', illo: 'trophy', title: 'Centurion',           desc: 'A century clean' },
  { id: 'c150',   cigs: 150,    icon: '🎖️', illo: 'trophy', title: 'One Fifty Strong',    desc: 'Momentum locked in' },
  { id: 'c200',   cigs: 200,    icon: '🎗️', illo: 'star',   title: 'Double Century',      desc: 'Two hundred down' },
  { id: 'c250',   cigs: 250,    icon: '🏅', illo: 'trophy', title: 'Quarter Thousand',    desc: 'Quarter of a K' },
  { id: 'c365',   cigs: 365,    icon: '🗓️', illo: 'calendar', title: 'Year of Smoke',    desc: 'A year of cigs avoided' },
  { id: 'c500',   cigs: 500,    icon: '🔆', illo: 'trophy', title: 'Five Hundred',        desc: 'Half a thousand' },
  { id: 'c750',   cigs: 750,    icon: '🛰️', illo: 'rocket', title: 'Three Quarters K',    desc: 'Nearly four digits' },
  { id: 'c1k',    cigs: 1000,   icon: '🥈', illo: 'crown',  title: 'Quadruple Digits',    desc: 'One thousand clean' },
  { id: 'c1_5k',  cigs: 1500,   icon: '🌠', illo: 'star',   title: 'Fifteen Hundred',     desc: 'Steady climb' },
  { id: 'c2k',    cigs: 2000,   icon: '🎇', illo: 'crown',  title: 'Two Thousand',        desc: 'A massive milestone' },
  { id: 'c3k',    cigs: 3000,   icon: '🎆', illo: 'trophy', title: 'Three Thousand',      desc: 'Triple digit-K' },
  { id: 'c5k',    cigs: 5000,   icon: '✨', illo: 'crown',  title: 'Halfway to Ten K',    desc: 'Diamond level' },
  { id: 'c7_5k',  cigs: 7500,   icon: '🪐', illo: 'star',   title: 'Seventy Five Hundred', desc: 'Almost five figures' },
  { id: 'c10k',   cigs: 10000,  icon: '🌌', illo: 'crown',  title: 'Five Figures',        desc: 'Ten thousand clean' },
  { id: 'c15k',   cigs: 15000,  icon: '☄️', illo: 'rocket', title: 'Fifteen K',           desc: 'Sky-high tally' },
  { id: 'c25k',   cigs: 25000,  icon: '🌞', illo: 'crown',  title: 'Royal Status',        desc: 'Twenty-five thousand strong' },
  { id: 'c50k',   cigs: 50000,  icon: '🦅', illo: 'crown',  title: 'Legendary',           desc: 'Fifty thousand' },
  { id: 'c75k',   cigs: 75000,  icon: '🦚', illo: 'star',   title: 'Seventy Five K',      desc: 'Almost six figures' },
  { id: 'c100k',  cigs: 100000, icon: '🐉', illo: 'trophy', title: 'Six Figures',         desc: 'One hundred thousand' },
  { id: 'c150k',  cigs: 150000, icon: '🦁', illo: 'crown',  title: 'Hundred Fifty K',     desc: 'Untouchable' },
  { id: 'c250k',  cigs: 250000, icon: '🐲', illo: 'crown',  title: 'Quarter Million',     desc: 'Outright legend' },
];

// Money saved (14).
const QS_MONEY_ACHIEVEMENTS = [
  { id: 'm5',     money: 5,      icon: '💵', illo: 'jar',    title: 'First Five',          desc: 'First savings' },
  { id: 'm10',    money: 10,     icon: '💴', illo: 'jar',    title: 'First Ten',           desc: 'Building a fund' },
  { id: 'm25',    money: 25,     icon: '💶', illo: 'jar',    title: 'Quarter C',           desc: 'Coffee for a week' },
  { id: 'm50',    money: 50,     icon: '💷', illo: 'jar',    title: 'Fifty Saved',         desc: 'Halfway to a hundred' },
  { id: 'm100',   money: 100,    icon: '💰', illo: 'jar',    title: 'Three Figures',       desc: 'A hundred banked' },
  { id: 'm200',   money: 200,    icon: '🪙', illo: 'jar',    title: 'Two Hundred',         desc: 'Real money saved' },
  { id: 'm500',   money: 500,    icon: '🏦', illo: 'trophy', title: 'Half a Thousand',     desc: 'Mini-vacation fund' },
  { id: 'm1k',    money: 1000,   icon: '💳', illo: 'crown',  title: 'Grand',               desc: 'Quadruple digits' },
  { id: 'm2_5k',  money: 2500,   icon: '📈', illo: 'crown',  title: 'Twenty-Five Hundred', desc: 'Serious savings' },
  { id: 'm5k',    money: 5000,   icon: '💸', illo: 'crown',  title: 'Five Grand',          desc: 'Royal savings' },
  { id: 'm10k',   money: 10000,  icon: '🤑', illo: 'crown',  title: 'Ten Grand',           desc: 'Five figures saved' },
  { id: 'm25k',   money: 25000,  icon: '🏠', illo: 'crown',  title: 'Twenty-Five K',       desc: 'Down-payment territory' },
  { id: 'm50k',   money: 50000,  icon: '🏡', illo: 'crown',  title: 'Fifty Grand',         desc: 'Life-changing' },
  { id: 'm100k',  money: 100000, icon: '🏛️', illo: 'crown',  title: 'Hundred K Saved',     desc: 'Wealthy and well' },
];

// Life regained (12) — each cigarette costs ~11 min of life.
const QS_LIFE_ACHIEVEMENTS = [
  { id: 'l1h',    lifeHours: 1,     icon: '🧬', illo: 'hero',   title: 'Superpowers',        desc: 'One hour of life back' },
  { id: 'l3h',    lifeHours: 3,     icon: '🩺', illo: 'lungs',  title: 'Three Hours Back',   desc: 'Lungs say thanks' },
  { id: 'l6h',    lifeHours: 6,     icon: '🩹', illo: 'lungs',  title: 'Half Day Back',      desc: 'Six precious hours' },
  { id: 'l12h',   lifeHours: 12,    icon: '💖', illo: 'hero',   title: 'Half-Day Hero',      desc: 'A full half-day reclaimed' },
  { id: 'l1d',    lifeHours: 24,    icon: '🌻', illo: 'sprout', title: 'Day Reclaimed',      desc: 'A full day of life' },
  { id: 'l3d',    lifeHours: 72,    icon: '🍀', illo: 'sprout', title: 'Three Days Back',    desc: 'A long weekend earned' },
  { id: 'l1w',    lifeHours: 168,   icon: '🌷', illo: 'lungs',  title: 'Week Reclaimed',     desc: 'A whole week regained' },
  { id: 'l2w',    lifeHours: 336,   icon: '💚', illo: 'heart',  title: 'Two Weeks Back',     desc: 'Vacation-length recovery' },
  { id: 'l1mo',   lifeHours: 720,   icon: '🌾', illo: 'sprout', title: 'Month Restored',     desc: 'Thirty days of life' },
  { id: 'l3mo',   lifeHours: 2160,  icon: '🌲', illo: 'sprout', title: 'Quarter Year Back',  desc: 'Three months reclaimed' },
  { id: 'l6mo',   lifeHours: 4380,  icon: '🪷', illo: 'star',   title: 'Half Year Restored', desc: 'Six months of life' },
  { id: 'l1y',    lifeHours: 8760,  icon: '🎁', illo: 'trophy', title: 'Year of Life',       desc: 'A whole year given back' },
];

// ── QuitNow-aligned: Health milestones (8, exact QuitNow wording) ────────────
const QS_MILESTONES = [
  { hours: 0.33,    text: 'Your heart rate and blood pressure go back to normal' },
  { hours: 12,      text: 'The carbon monoxide level in your blood drops to normal' },
  { hours: 336,     text: 'Your circulation improves and your lung function increases' },
  { hours: 720,     text: 'Coughing and shortness of breath decrease' },
  { hours: 8760,    text: "Your risk of coronary heart disease is about half that of a smoker's" },
  { hours: 43800,   text: "The stroke risk is that of a nonsmoker's" },
  { hours: 87600,   text: 'Your risk of lung cancer falls to about half that of a smoker and your risk of cancer of the mouth, throat, esophagus, bladder, cervix, and pancreas decreases' },
  { hours: 131400,  text: "The risk of coronary heart disease is that of a nonsmoker's" },
];

// QD achievements — id and illo added in chunk 15 so the QD achievement detail
// view and the unlock overlay can reuse the existing QsIllo SVG family (clock,
// sunrise, calendar, sprout, trophy, star, crown) instead of the temporary
// emoji-in-disc. Calendar entries reuse the QS ids (t_1d…t_1w) so CAL_DAY shows
// the correct day number on the badge; the remaining ids are QD-local and only
// need to be unique within this array.
const QD_ACHIEVEMENTS = [
  { id: '5m',   hours: 0.083, icon: '⚡', illo: 'clock',    title: '5 Minutes',  desc: 'You made the first step' },
  { id: '1h',   hours: 1,     icon: '1️⃣', illo: 'clock',    title: '1 Hour',     desc: 'First hour alcohol-free' },
  { id: '6h',   hours: 6,     icon: '🌅', illo: 'sunrise',  title: '6 Hours',    desc: 'Blood alcohol cleared' },
  { id: '12h',  hours: 12,    icon: '💧', illo: 'sunrise',  title: '12 Hours',   desc: 'Hydration starts recovering' },
  { id: 't_1d', hours: 24,    icon: '☀️', illo: 'calendar', title: '1 Day',      desc: 'First full day complete' },
  { id: 't_2d', hours: 48,    icon: '🛌', illo: 'calendar', title: '2 Days',     desc: 'Sleep quality improving' },
  { id: 't_3d', hours: 72,    icon: '🧠', illo: 'calendar', title: '3 Days',     desc: 'Anxiety and fogginess lift' },
  { id: 't_4d', hours: 96,    icon: '🍎', illo: 'calendar', title: '4 Days',     desc: 'Hunger and thirst normalize' },
  { id: 't_5d', hours: 120,   icon: '💪', illo: 'calendar', title: '5 Days',     desc: 'Energy levels rising' },
  { id: 't_6d', hours: 144,   icon: '🎯', illo: 'calendar', title: '6 Days',     desc: 'Focus and clarity improve' },
  { id: 't_1w', hours: 168,   icon: '🏅', illo: 'calendar', title: '1 Week',     desc: 'Liver starts to recover' },
  { id: '10d',  hours: 240,   icon: '😊', illo: 'sprout',   title: '10 Days',    desc: 'Mood significantly better' },
  { id: '2w',   hours: 336,   icon: '🌿', illo: 'sprout',   title: '2 Weeks',    desc: 'Skin begins to clear up' },
  { id: '3w',   hours: 504,   icon: '🔋', illo: 'sprout',   title: '3 Weeks',    desc: 'Physical energy restored' },
  { id: '1mo',  hours: 720,   icon: '🥇', illo: 'sprout',   title: '1 Month',    desc: 'Liver fat reduces by 15%' },
  { id: '45d',  hours: 1080,  icon: '💎', illo: 'sprout',   title: '45 Days',    desc: 'Blood pressure normalizes' },
  { id: '2mo',  hours: 1440,  icon: '🦁', illo: 'sprout',   title: '2 Months',   desc: 'Immune system strengthening' },
  { id: '3mo',  hours: 2160,  icon: '🌟', illo: 'trophy',   title: '3 Months',   desc: 'Cancer risk begins to drop' },
  { id: '4mo',  hours: 2880,  icon: '🎉', illo: 'trophy',   title: '4 Months',   desc: 'Red blood cells fully renewed' },
  { id: '5mo',  hours: 3600,  icon: '🏆', illo: 'trophy',   title: '5 Months',   desc: 'Bone density improving' },
  { id: '6mo',  hours: 4380,  icon: '🎊', illo: 'trophy',   title: '6 Months',   desc: 'Liver fully regenerating' },
  { id: '7mo',  hours: 5040,  icon: '⭐', illo: 'star',     title: '7 Months',   desc: 'Brain chemistry rebalancing' },
  { id: '8mo',  hours: 5760,  icon: '🌙', illo: 'star',     title: '8 Months',   desc: 'Sleep patterns normalized' },
  { id: '9mo',  hours: 6480,  icon: '🎵', illo: 'star',     title: '9 Months',   desc: 'Social confidence returns' },
  { id: '10mo', hours: 7200,  icon: '🌈', illo: 'star',     title: '10 Months',  desc: 'Depression risk greatly reduced' },
  { id: '11mo', hours: 7920,  icon: '🦅', illo: 'star',     title: '11 Months',  desc: 'Craving frequency very low' },
  { id: '1y',   hours: 8760,  icon: '🏅', illo: 'trophy',   title: '1 Year',     desc: 'Liver disease risk halved' },
  { id: '5y',   hours: 43800, icon: '👑', illo: 'crown',    title: '5 Years',    desc: 'Mouth cancer risk halved' },
];

const QD_MILESTONES = [
  { hours: 6,     icon: '🍷', text: 'Blood alcohol fully cleared' },
  { hours: 24,    icon: '🧠', text: 'Brain chemistry stabilizing' },
  { hours: 72,    icon: '😴', text: 'Sleep patterns improving' },
  { hours: 168,   icon: '❤️', text: 'Heart rate and BP normalizing' },
  { hours: 336,   icon: '🌿', text: 'Skin hydration improving' },
  { hours: 720,   icon: '🫁', text: 'Liver fat decreasing' },
  { hours: 2160,  icon: '💪', text: 'Physical strength recovering' },
  { hours: 4380,  icon: '🎯', text: 'Cancer risk dropping' },
  { hours: 8760,  icon: '🏆', text: 'Liver disease risk halved' },
  { hours: 17520, icon: '💎', text: 'Heart disease risk reduces' },
  { hours: 26280, icon: '🌟', text: 'Stroke risk approaches normal' },
  { hours: 43800, icon: '👑', text: 'Life expectancy normalizing' },
];

// Quit-drinking daily tips — alcohol-craving-aware (urge surfing, HALT,
// mocktails, social scripts). Mirrors QS_TIPS shape so the pickDailyQdTip
// rotation works the same way.
const QD_TIPS: { id: string; title: string; body: string }[] = [
  { id: 'urge-surf',     title: 'Surf the urge',              body: 'A craving peaks in 15–20 minutes then fades. Set a timer, do anything else, and watch it pass.' },
  { id: 'water',         title: 'Drink a tall glass of water', body: 'Slow sips. Alcohol dehydrates — replacing fluid blunts the urge and gives your hand a job.' },
  { id: 'halt',          title: 'Run the HALT check',         body: 'Hungry, Angry, Lonely, Tired? Cravings rarely show up alone. Fix the underlying one and the urge often goes with it.' },
  { id: 'mocktail',      title: 'Pour a real mocktail',       body: 'Sparkling water + lime + a slice of ginger in your favorite glass. The ritual matters as much as the drink.' },
  { id: 'walk',          title: 'Walk it off',                body: 'Even a 5-minute walk drops the urge and floods your brain with natural dopamine alcohol used to fake.' },
  { id: 'trigger',       title: 'Name your trigger',          body: 'Stress, Friday, a fight, boredom? Naming the trigger is half the battle the next time it shows up.' },
  { id: 'brush',         title: 'Brush your teeth',           body: 'A clean mouth feels too good to ruin with wine. Use it as a hard reset whenever a craving hits.' },
  { id: 'reach',         title: 'Text one person',            body: 'A single "I’m struggling" to someone who knows you’re quitting is enough — you don’t have to be alone in this.' },
  { id: 'reward',        title: 'Move the money',             body: 'Transfer what you didn’t spend on alcohol into a savings goal. Watching the jar fill beats any glass of wine.' },
  { id: 'cold-chew',     title: 'Chew something cold',        body: 'Ice, frozen grapes, sugar-free gum. The cold sensation interrupts the hand-to-mouth loop.' },
  { id: 'breathe',       title: 'Breathe like you mean it',   body: '4 in, 7 hold, 8 out. Three rounds. Your nervous system thinks the craving already happened.' },
  { id: 'avoid-bar',     title: 'Skip the bar tonight',       body: 'Early days deserve every shortcut. It’s OK to say no, leave early, or never go in the first place.' },
  { id: 'eat',           title: 'Eat a real meal',            body: 'Low blood sugar feels exactly like a craving. Protein + carbs settles it within 20 minutes.' },
  { id: 'visualize',     title: 'Visualize the win',          body: 'Picture yourself one year sober. Sharper, lighter, prouder. That person is the one you’re fighting for.' },
  { id: 'fidget',        title: 'Move your hands',            body: 'Doodle, stretch a rubber band, fold laundry. The hand-to-glass ritual is half of why you reach for one.' },
  { id: 'sleep',         title: 'Sleep is everything',        body: 'A bad night doubles cravings. Protect your 7–8 hours and you protect your sobriety.' },
  { id: 'replace',       title: 'Replace the routine',        body: 'Wine with dinner was a cue. Have it with sparkling water in a new glass, with a new playlist. Break the trigger pairing.' },
  { id: 'journal',       title: 'Write it down',              body: 'Two lines: "what triggered me, what I did instead." Three weeks of these and you’ll see your own playbook.' },
  { id: 'cold-blast',    title: 'Cold shower or face splash', body: 'A 30-second cold blast resets your stress response and the craving with it.' },
  { id: 'why',           title: 'Re-read your why',           body: 'Pin one sentence about why you quit. Open it whenever a craving hits. Your past self knows the way.' },
  { id: 'fruit',         title: 'Eat a piece of fruit',       body: 'Apple, orange, anything sweet and crunchy. Cravings often spike when blood sugar dips.' },
  { id: 'stretch',       title: 'Stretch for 60 seconds',     body: 'Roll your shoulders, open your chest, look up. Drinkers carry tension here — let it out.' },
  { id: 'caffeine',      title: 'Skip the late coffee',       body: 'Caffeine after 2pm wrecks sleep, and bad sleep brings cravings. Protect the next morning.' },
  { id: 'forgive',       title: 'Forgive yourself fast',      body: 'Slipped? It’s data, not a failure. The streak is the long game, not the perfection.' },
  { id: 'route',         title: 'Change your route',          body: 'If you used to stop at the off-licence on the way home, take a different street. Out of sight beats out of mind.' },
  { id: 'phone',         title: 'Phone a friend',             body: 'Two minutes of a voice you love can shut down a craving faster than any willpower hack.' },
  { id: 'chore',         title: 'Do one small chore',         body: 'Wash a dish, fold a shirt, water a plant. Movement + completion beats sitting with the urge.' },
  { id: 'tea',           title: 'Hot tea or broth',           body: 'Warm cups give your hands and mouth something to do for ten minutes — long enough for the wave to pass.' },
  { id: 'wins',          title: 'Open your wins',             body: 'Check the achievements tab. You’ve done more than you think. Receipts beat doubt.' },
  { id: 'plan',          title: 'Plan tomorrow morning',      body: 'Write 3 things you’ll do tomorrow before noon. Future-focus drains the craving of its emotional power.' },
];

// Major alcohol-help hotlines — country / region, number, blurb. Free + confidential
// in their respective countries. Numbers should be verified yearly against the
// national helpline website at time of build; `code` is ISO 3166-1 alpha-2 and is
// matched against appStore `country` so we surface the user’s home country first.
const QD_QUITLINES: { code: string; region: string; flag: string; number: string; hours: string; href: string }[] = [
  { code: 'US', region: 'United States',  flag: '🇺🇸', number: '1-800-662-4357',  hours: '24/7 · SAMHSA',                                  href: 'tel:18006624357' },
  { code: 'GB', region: 'United Kingdom', flag: '🇬🇧', number: '0300 123 1110',    hours: 'Mon–Fri 9am–8pm · weekends 11am–4pm',            href: 'tel:03001231110' },
  { code: 'CA', region: 'Canada',         flag: '🇨🇦', number: '1-866-585-0445',   hours: '24/7',                                            href: 'tel:18665850445' },
  { code: 'AU', region: 'Australia',      flag: '🇦🇺', number: '1800 250 015',     hours: '24/7 · National Alcohol & Drug',                  href: 'tel:1800250015' },
  { code: 'IE', region: 'Ireland',        flag: '🇮🇪', number: '1800 459 459',     hours: 'Mon–Fri 9:30am–5:30pm',                           href: 'tel:1800459459' },
  { code: 'NZ', region: 'New Zealand',    flag: '🇳🇿', number: '0800 787 797',     hours: '24/7 · Alcohol Drug Helpline',                    href: 'tel:0800787797' },
  { code: 'FR', region: 'France',         flag: '🇫🇷', number: '0 980 980 930',    hours: 'Daily 8am–2am · Alcool Info Service',             href: 'tel:0980980930' },
  { code: 'ES', region: 'Spain',          flag: '🇪🇸', number: '900 161 515',      hours: 'Mon–Fri 9am–9pm',                                 href: 'tel:900161515' },
  { code: 'SE', region: 'Sweden',         flag: '🇸🇪', number: '020-84 44 48',     hours: 'Mon–Thu 9am–9pm · Fri 9am–5pm · Sun 12pm–7pm',    href: 'tel:+4620844448' },
  { code: 'DE', region: 'Germany',        flag: '🇩🇪', number: '01806 313031',     hours: 'Mon–Thu 10am–10pm · Fri–Sun 10am–6pm',            href: 'tel:01806313031' },
  { code: 'NL', region: 'Netherlands',    flag: '🇳🇱', number: '0900 1995',        hours: 'Mon–Fri 10am–10pm · Sat–Sun 1pm–6pm',             href: 'tel:09001995' },
  { code: 'NO', region: 'Norway',         flag: '🇳🇴', number: '08588',            hours: 'Mon–Fri 11am–6pm · RUStelefonen',                 href: 'tel:08588' },
  { code: 'DK', region: 'Denmark',        flag: '🇩🇰', number: '80 200 500',       hours: 'Mon–Fri 11am–5pm · Alkolinjen',                   href: 'tel:80200500' },
  { code: 'IT', region: 'Italy',          flag: '🇮🇹', number: '800 632 000',      hours: 'Mon–Fri 10am–4pm · Telefono Verde Alcol',         href: 'tel:800632000' },
  { code: 'BE', region: 'Belgium',        flag: '🇧🇪', number: '078 15 10 20',     hours: 'Mon–Fri 10am–8pm · De DrugLijn',                  href: 'tel:078151020' },
  { code: 'FI', region: 'Finland',        flag: '🇫🇮', number: '0800 900 45',      hours: 'Mon–Fri 9am–3pm · Päihdeneuvonta',                href: 'tel:0800900450' },
  { code: 'AT', region: 'Austria',        flag: '🇦🇹', number: '01 4000 53535',    hours: 'Mon–Sun 10am–6pm · Sucht & Drogen Hotline',       href: 'tel:0140005353' },
  { code: 'CH', region: 'Switzerland',    flag: '🇨🇭', number: '0800 104 104',     hours: 'Mon–Fri 8am–12pm · 1pm–5pm',                       href: 'tel:0800104104' },
  { code: 'PT', region: 'Portugal',       flag: '🇵🇹', number: '1414',             hours: 'Mon–Fri 9am–7pm · SICAD Linha Vida',              href: 'tel:1414' },
  { code: 'PL', region: 'Poland',         flag: '🇵🇱', number: '801 199 990',      hours: 'Mon–Sat 6pm–10pm · Telefon Zaufania',             href: 'tel:801199990' },
];

// Trigger and coping options tuned for alcohol cravings — distinct from the
// smoking lists (no 'meal' pairing since wine-with-dinner is a *trigger*, and
// 'celebration' replaces 'social' as the biggest alcohol-specific cue).
const QD_CRAVING_TRIGGERS: Array<{ key: string; label: string; icon: string }> = [
  { key: 'stress',      label: 'Stress',      icon: '😣' },
  { key: 'social',      label: 'Social',      icon: '👥' },
  { key: 'celebration', label: 'Celebration', icon: '🎉' },
  { key: 'boredom',     label: 'Bored',       icon: '🥱' },
  { key: 'emotion',     label: 'Low mood',    icon: '😔' },
  { key: 'habit',       label: 'Habit',       icon: '🕰' },
  { key: 'other',       label: 'Other',       icon: '•' },
];
const QD_CRAVING_COPING: Array<{ key: string; label: string; icon: string }> = [
  { key: 'breath',   label: 'Breathe',  icon: '🫁' },
  { key: 'walk',     label: 'Walk',     icon: '🚶' },
  { key: 'water',    label: 'Water',    icon: '💧' },
  { key: 'mocktail', label: 'Mocktail', icon: '🍹' },
  { key: 'snack',    label: 'Snack',    icon: '🥜' },
  { key: 'distract', label: 'Distract', icon: '🎧' },
  { key: 'reach',    label: 'Reach out', icon: '📞' },
  { key: 'other',    label: 'Other',    icon: '•' },
];

// Recovery support communities & frameworks — surfaced from the QD main view
// and again on its own detail screen. Each entry is either a `url` (opens the
// program's website) or a `phone` (dials directly via tel: link). Order matters
// only for first impression: AA / SMART lead because they're the two most-cited
// programs, then secular / Buddhist / women-only alternatives, then a 24/7
// helpline as a last-resort always-available fallback.
const QD_SUPPORT: {
  key: string;
  name: string;
  desc: string;
  icon: 'people' | 'school' | 'leaf' | 'compass' | 'flower' | 'videocam' | 'call';
  color: string;
  url?: string;
  phone?: string;
}[] = [
  { key: 'aa',         name: 'Alcoholics Anonymous', desc: 'Worldwide 12-step fellowship. Free meetings in-person & online.',  icon: 'people',   color: colors.purple3,  url: 'https://www.aa.org' },
  { key: 'smart',      name: 'SMART Recovery',       desc: 'Secular, evidence-based. CBT tools and free meetings.',            icon: 'school',   color: colors.teal,     url: 'https://smartrecovery.org' },
  { key: 'dharma',     name: 'Recovery Dharma',      desc: 'Buddhist-inspired, peer-led recovery — meditation & community.',   icon: 'leaf',     color: colors.green,    url: 'https://recoverydharma.org' },
  { key: 'lifering',   name: 'LifeRing Secular',     desc: 'Secular alternative to 12-step — your sober self, your way.',      icon: 'compass',  color: colors.honey,    url: 'https://lifering.org' },
  { key: 'wfs',        name: 'Women for Sobriety',   desc: 'Women-only program built on positive affirmations & support.',     icon: 'flower',   color: colors.rose,     url: 'https://womenforsobriety.org' },
  { key: 'intherooms', name: 'In The Rooms',         desc: 'Online meetings around the clock — AA, SMART, NA, and more.',      icon: 'videocam', color: colors.sky,      url: 'https://www.intherooms.com' },
  { key: 'samhsa',     name: 'SAMHSA Helpline',      desc: '24/7 free, confidential treatment referral. Call any time.',       icon: 'call',     color: colors.lavender, phone: '18006624357' },
];

// Daily tip seed (QD) — same calendar day returns the same tip, rotation moves
// forward across the array each new day. Uses local date (yyyy-mm-dd) seeding,
// and skips any tip the user has previously dismissed. Mirrors pickDailyTip()
// behavior exactly so the UI patterns can be shared.
function pickDailyQdTip(prefs?: TipPrefs): { id: string; title: string; body: string } {
  const d = new Date();
  const dayIndex = Math.floor(
    (Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(2024, 0, 1)) / 86400000
  );
  const len = QD_TIPS.length;
  const start = ((dayIndex % len) + len) % len;
  const skipped = prefs?.skipped ?? [];
  if (skipped.length === 0 || skipped.length >= len) return QD_TIPS[start];
  for (let i = 0; i < len; i++) {
    const tip = QD_TIPS[(start + i) % len];
    if (!skipped.includes(tip.id)) return tip;
  }
  return QD_TIPS[start];
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  return `${m}:${String(s).padStart(2,'0')}`;
}

function todayKey(): string {
  return new Date().toLocaleDateString('en-CA');
}

function fmtFriendlyDate(key: string): string {
  // "YYYY-MM-DD" → "Apr 24, 2026"
  const parts = key.split('-');
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10) - 1;
  const d = parseInt(parts[2], 10);
  if (isNaN(y) || isNaN(m) || isNaN(d)) return key;
  const date = new Date(y, m, d);
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// SVG ring constants
const RING_SIZE = 220;
const RING_R = 88;
const RING_STROKE = 14;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_R;

// ── Quit-Smoking achievement palette (matches QuitNow's category coloring) ────
const QS_CAT_COLORS = {
  time:  colors.sky,
  cigs:  colors.rose,
  money: colors.honey,
};

// ── Hero crest — "Liberation Sunrise" victory medallion ─────────────────────
// A heroic single sprout surges from a cleanly snapped honey-gold cigarette
// inside a deep-enamel medallion lit from within by a honey sunrise, cradled
// by a partial laurel arc with berries — the reading order break → growth →
// light narrates the moment breath returns.
// ── HeroBadgeArt — "Phoenix Horizon Crest" ─────────────────────────────────
// A premium quit-smoking medallion: a visible dawn sun rises behind a clear
// horizon line on a deep-enamel coin face. The spent cigarette filter rests
// at the horizon as a foundation, its paper stub torn open. A confident
// sprout climbs UP from the break — silhouetted against the sun — into a
// quiet sky. A classical laurel wreath cradles the lower hemisphere; a milled
// honey-gold rim frames it all. Every element earns its place; nothing is
// decorative for its own sake.
function HeroBadgeArt({ size = 132 }: { size?: number }) {
  const cx = 90, cy = 92;

  // Coin geometry — referenced by horizon, sun, laurel, centerpiece.
  const faceR = 47.5;   // inner enamel face radius
  const horizonY = cy + 8; // the threshold — past below, future above

  // 4-point sharp celestial star.
  const star4 = (sx: number, sy: number, R: number, r: number): string => {
    const k = r * 0.707;
    return [
      `${sx.toFixed(2)},${(sy - R).toFixed(2)}`,
      `${(sx + k).toFixed(2)},${(sy - k).toFixed(2)}`,
      `${(sx + R).toFixed(2)},${sy.toFixed(2)}`,
      `${(sx + k).toFixed(2)},${(sy + k).toFixed(2)}`,
      `${sx.toFixed(2)},${(sy + R).toFixed(2)}`,
      `${(sx - k).toFixed(2)},${(sy + k).toFixed(2)}`,
      `${(sx - R).toFixed(2)},${sy.toFixed(2)}`,
      `${(sx - k).toFixed(2)},${(sy - k).toFixed(2)}`,
    ].join(' ');
  };

  // Classical laurel leaf — pointed-oval with central vein.
  const laurel = (
    baseAng: number,
    side: 'L' | 'R',
    tiltDeg: number,
    baseR: number,
    len: number,
    halfW: number,
  ): { path: string; vein: string } => {
    const baseA = baseAng * Math.PI / 180;
    const baseX = cx + Math.cos(baseA) * baseR;
    const baseY = cy + Math.sin(baseA) * baseR;
    const tipAng = side === 'L' ? baseAng + 90 - tiltDeg : baseAng - 90 + tiltDeg;
    const tipA = tipAng * Math.PI / 180;
    const tipX = baseX + Math.cos(tipA) * len;
    const tipY = baseY + Math.sin(tipA) * len;
    const perpA = tipA + Math.PI / 2;
    const midX = baseX + Math.cos(tipA) * (len * 0.46);
    const midY = baseY + Math.sin(tipA) * (len * 0.46);
    const sideLX = midX + Math.cos(perpA) * halfW;
    const sideLY = midY + Math.sin(perpA) * halfW;
    const sideRX = midX - Math.cos(perpA) * halfW;
    const sideRY = midY - Math.sin(perpA) * halfW;
    return {
      path: `M ${baseX.toFixed(2)} ${baseY.toFixed(2)} Q ${sideLX.toFixed(2)} ${sideLY.toFixed(2)} ${tipX.toFixed(2)} ${tipY.toFixed(2)} Q ${sideRX.toFixed(2)} ${sideRY.toFixed(2)} ${baseX.toFixed(2)} ${baseY.toFixed(2)} Z`,
      vein: `M ${baseX.toFixed(2)} ${baseY.toFixed(2)} L ${tipX.toFixed(2)} ${tipY.toFixed(2)}`,
    };
  };

  // Partial laurel cradle — 5 leaves per side along the bottom arc. Tilt eases
  // from sharp at the outer base to soft at the apex so leaves climb naturally.
  const cradleLeft = [
    { ang: 140, tilt: 38, len: 13.2, halfW: 4.9, fill: colors.green2 },
    { ang: 160, tilt: 30, len: 14.8, halfW: 5.4, fill: colors.green  },
    { ang: 180, tilt: 24, len: 15.4, halfW: 5.6, fill: colors.green2 },
    { ang: 200, tilt: 20, len: 14.6, halfW: 5.3, fill: colors.green  },
    { ang: 220, tilt: 16, len: 12.8, halfW: 4.8, fill: colors.green2 },
  ];
  const cradleRight = [
    { ang: 40,  tilt: 38, len: 13.2, halfW: 4.9, fill: colors.green  },
    { ang: 20,  tilt: 30, len: 14.8, halfW: 5.4, fill: colors.green2 },
    { ang: 0,   tilt: 24, len: 15.4, halfW: 5.6, fill: colors.green  },
    { ang: -20, tilt: 20, len: 14.6, halfW: 5.3, fill: colors.green2 },
    { ang: -40, tilt: 16, len: 12.8, halfW: 4.8, fill: colors.green  },
  ];

  // Sun rays radiating from the rising sun — 9 thin beams across the sky.
  // Stops just shy of the rim so the rim frames the scene cleanly.
  const sunRays = Array.from({ length: 9 }, (_, i) => {
    // Spread from -82° to +82° (in screen space, where -90° = straight up).
    const deg = -82 + i * 20.5;
    const ang = deg * Math.PI / 180;
    return {
      ang,
      // Beam length varies subtly — center beam tallest.
      len: 28 + (1 - Math.abs(deg) / 90) * 7,
      // Center beam slightly brighter.
      bright: Math.abs(deg) < 12,
    };
  });

  return (
    <Svg width={size} height={size} viewBox="0 0 180 180">
      {/* ═══ 1 · ATMOSPHERE — 7 sparse cosmic specks on the outer field ═══ */}
      {[
        { ang: -70, r: 82, c: colors.honey,    sz: 1.9, op: 0.92 },
        { ang: -32, r: 80, c: colors.purple3,  sz: 1.1, op: 0.62 },
        { ang:   4, r: 84, c: colors.lavender, sz: 1.5, op: 0.75 },
        { ang:  46, r: 81, c: colors.purple2,  sz: 0.95, op: 0.55 },
        { ang:  92, r: 83, c: colors.honey,    sz: 1.05, op: 0.6 },
        { ang: 158, r: 80, c: colors.purple3,  sz: 0.9, op: 0.5 },
        { ang: 208, r: 82, c: colors.lavender, sz: 1.2, op: 0.7 },
      ].map((s, i) => {
        const a = s.ang * Math.PI / 180;
        return (
          <Circle
            key={`hb-cosmos-${i}`}
            cx={cx + Math.cos(a) * s.r}
            cy={cy + Math.sin(a) * s.r}
            r={s.sz}
            fill={s.c}
            opacity={s.op}
          />
        );
      })}

      {/* ═══ 2 · OUTER HALO — quiet honey aura widening the medallion ═════ */}
      <Circle cx={cx} cy={cy} r={76} fill={colors.honey} opacity={0.045} />
      <Circle cx={cx} cy={cy} r={66} fill={colors.honey} opacity={0.07} />

      {/* ═══ 3 · DEEP RAYS — 12 long restrained beams behind the coin ════ */}
      {/* These read as the sun's far-reach beyond the medallion frame.   */}
      {Array.from({ length: 12 }).map((_, i) => {
        const ang = (i * 30 - 90) * Math.PI / 180;
        const innerR = 58;
        const outerR = 74;
        const wHalf = 1.7;
        const cosA = Math.cos(ang), sinA = Math.sin(ang);
        const perpX = -sinA, perpY = cosA;
        const tipX = cx + cosA * outerR;
        const tipY = cy + sinA * outerR;
        const baseLX = cx + cosA * innerR + perpX * wHalf;
        const baseLY = cy + sinA * innerR + perpY * wHalf;
        const baseRX = cx + cosA * innerR - perpX * wHalf;
        const baseRY = cy + sinA * innerR - perpY * wHalf;
        return (
          <Polygon
            key={`hb-deepray-${i}`}
            points={`${tipX.toFixed(2)},${tipY.toFixed(2)} ${baseLX.toFixed(2)},${baseLY.toFixed(2)} ${baseRX.toFixed(2)},${baseRY.toFixed(2)}`}
            fill={colors.purple}
            opacity={0.65}
          />
        );
      })}

      {/* ═══ 4 · MEDALLION — concentric sculptural rim cradling the face ══ */}
      {/* Drop shadow seated under the coin */}
      <Circle cx={cx} cy={cy + 2.5} r={56.5} fill={colors.bg} opacity={0.55} />
      {/* Outer dark band — anchors the rim against the sunburst */}
      <Circle cx={cx} cy={cy} r={55.5} fill={colors.purple3} opacity={0.48} />
      {/* Honey-gold rim — the medallion's signature */}
      <Circle cx={cx} cy={cy} r={54}   fill={colors.honey} />
      {/* Inner shadow groove carved into the gold */}
      <Circle cx={cx} cy={cy} r={51}   fill={colors.purple} />
      {/* Bezel transition — soft purple between gold and enamel */}
      <Circle cx={cx} cy={cy} r={49.3} fill={colors.purple3} opacity={0.32} />
      {/* Deep enamel coin face — the sky */}
      <Circle cx={cx} cy={cy} r={faceR} fill={colors.layer3} />

      {/* ═══ 5 · SKY — purple dawn wash above the horizon ═════════════════ */}
      {/* Soft purple wash anchors the sky in the brand */}
      <Circle cx={cx - 2} cy={cy - 6} r={42} fill={colors.purple} opacity={0.16} />

      {/* ═══ 6 · SUN — radial halos + a visible dawn disc ═════════════════ */}
      {/* Concentric honey halos — the dawn rising inside the coin face */}
      <Circle cx={cx} cy={cy - 6} r={34} fill={colors.honey} opacity={0.06} />
      <Circle cx={cx} cy={cy - 8} r={24} fill={colors.honey} opacity={0.10} />
      <Circle cx={cx} cy={cy - 9} r={16} fill={colors.honey} opacity={0.18} />

      {/* Sun rays — thin beams climbing from the sun across the sky */}
      {sunRays.map((s, i) => {
        // Beams emanate from the sun's center (cy - 4) — they fan upward.
        const sunCx = cx;
        const sunCy = cy - 4;
        const innerR = 11;
        const outerR = innerR + s.len;
        const cosA = Math.cos(s.ang - Math.PI / 2);
        const sinA = Math.sin(s.ang - Math.PI / 2);
        const perpX = -sinA, perpY = cosA;
        const wHalf = s.bright ? 1.1 : 0.78;
        const tipX = sunCx + cosA * outerR;
        const tipY = sunCy + sinA * outerR;
        const baseLX = sunCx + cosA * innerR + perpX * wHalf;
        const baseLY = sunCy + sinA * innerR + perpY * wHalf;
        const baseRX = sunCx + cosA * innerR - perpX * wHalf;
        const baseRY = sunCy + sinA * innerR - perpY * wHalf;
        return (
          <Polygon
            key={`hb-sunray-${i}`}
            points={`${tipX.toFixed(2)},${tipY.toFixed(2)} ${baseLX.toFixed(2)},${baseLY.toFixed(2)} ${baseRX.toFixed(2)},${baseRY.toFixed(2)}`}
            fill={colors.honey}
            opacity={s.bright ? 0.62 : 0.42}
          />
        );
      })}

      {/* Sun disc — half-emerged above the horizon (the dawn moment) */}
      <Circle cx={cx} cy={cy - 4} r={9.5} fill={colors.honey} />
      <Circle cx={cx} cy={cy - 4} r={9.5} fill={colors.white} opacity={0.18} />
      {/* Sun specular pip — the brightest point of the sun */}
      <Circle cx={cx - 2.2} cy={cy - 6.4} r={2.4} fill={colors.white} opacity={0.7} />

      {/* ═══ 7 · HORIZON — the threshold separating past from future ══════ */}
      {/* Sea / foreground bowl — subtle darkening below the horizon line.   */}
      {/* Endpoints aligned to the actual rim chord at horizonY so the arc   */}
      {/* follows the coin's true curvature (half-width = √(47.5²-8²) ≈ 46.82) */}
      <Path
        d={`M ${cx - 46.82} ${horizonY} A 47.5 47.5 0 0 1 ${cx + 46.82} ${horizonY} Z`}
        fill={colors.bg2}
        opacity={0.55}
      />
      {/* Crisp horizon line — honey reflected on a still surface */}
      <Line
        x1={cx - 44} y1={horizonY}
        x2={cx + 44} y2={horizonY}
        stroke={colors.honey}
        strokeOpacity={0.6}
        strokeWidth={0.9}
        strokeLinecap="round"
      />
      {/* Horizon shimmer — a single subtle gleam on the surface */}
      <Line
        x1={cx - 18} y1={horizonY + 1.2}
        x2={cx + 18} y2={horizonY + 1.2}
        stroke={colors.honey}
        strokeOpacity={0.3}
        strokeWidth={0.55}
        strokeLinecap="round"
      />

      {/* ═══ 8 · RIM ENGRAVING — 24 milled ticks + reflection rings ══════ */}
      {Array.from({ length: 24 }).map((_, i) => {
        const ang = (i * 15) * Math.PI / 180;
        const inner = 51;
        const outer = 53.4;
        return (
          <Line
            key={`hb-tick-${i}`}
            x1={cx + Math.cos(ang) * inner}
            y1={cy + Math.sin(ang) * inner}
            x2={cx + Math.cos(ang) * outer}
            y2={cy + Math.sin(ang) * outer}
            stroke={colors.purple}
            strokeOpacity={0.5}
            strokeWidth={0.85}
            strokeLinecap="round"
          />
        );
      })}
      {/* Honey reflection ring — gold light caught at the enamel's edge */}
      <Circle
        cx={cx} cy={cy} r={44.5}
        fill="none"
        stroke={colors.honey}
        strokeOpacity={0.34}
        strokeWidth={1.0}
      />
      {/* Inner purple bezel line */}
      <Circle
        cx={cx} cy={cy} r={42}
        fill="none"
        stroke={colors.purple}
        strokeOpacity={0.4}
        strokeWidth={0.55}
      />

      {/* ═══ 9 · RIM SHEEN — polished gold catches the upper light ═══════ */}
      {/* Long arc tracing the upper gold rim — confident specular sweep */}
      <Path
        d={`M ${cx - 42} ${cy - 30} A 51.7 51.7 0 0 1 ${cx + 42} ${cy - 30}`}
        stroke={colors.white}
        strokeOpacity={0.46}
        strokeWidth={2.2}
        strokeLinecap="round"
        fill="none"
      />
      {/* Bright top gleam at 12 o'clock — a single confident highlight */}
      <Path
        d={`M ${cx - 13} ${cy - 50.5} A 53 53 0 0 1 ${cx + 13} ${cy - 50.5}`}
        stroke={colors.white}
        strokeOpacity={0.78}
        strokeWidth={1.4}
        strokeLinecap="round"
        fill="none"
      />

      {/* ═══ 10 · LAUREL CRADLE — classical wreath wrapping lower arc ════ */}
      {cradleLeft.map((l, i) => {
        const { path, vein } = laurel(l.ang, 'L', l.tilt, 49, l.len, l.halfW);
        return (
          <G key={`hb-laurelL-${i}`}>
            <Path d={path} fill={l.fill} />
            <Path
              d={vein}
              stroke={colors.white}
              strokeOpacity={0.58}
              strokeWidth={0.85}
              strokeLinecap="round"
              fill="none"
            />
          </G>
        );
      })}
      {cradleRight.map((l, i) => {
        const { path, vein } = laurel(l.ang, 'R', l.tilt, 49, l.len, l.halfW);
        return (
          <G key={`hb-laurelR-${i}`}>
            <Path d={path} fill={l.fill} />
            <Path
              d={vein}
              stroke={colors.white}
              strokeOpacity={0.58}
              strokeWidth={0.85}
              strokeLinecap="round"
              fill="none"
            />
          </G>
        );
      })}

      {/* Honey berries — three pairs nestled between leaf clusters */}
      <Circle cx={cx - 30} cy={cy + 39} r={1.85} fill={colors.honey} />
      <Circle cx={cx - 30} cy={cy + 39} r={0.7} fill={colors.white} opacity={0.75} />
      <Circle cx={cx + 30} cy={cy + 39} r={1.85} fill={colors.honey} />
      <Circle cx={cx + 30} cy={cy + 39} r={0.7} fill={colors.white} opacity={0.75} />
      <Circle cx={cx - 14} cy={cy + 47} r={1.5} fill={colors.honey} opacity={0.92} />
      <Circle cx={cx - 14} cy={cy + 47} r={0.55} fill={colors.white} opacity={0.65} />
      <Circle cx={cx + 14} cy={cy + 47} r={1.5} fill={colors.honey} opacity={0.92} />
      <Circle cx={cx + 14} cy={cy + 47} r={0.55} fill={colors.white} opacity={0.65} />

      {/* ═══ 11 · CENTERPIECE — broken cigarette at the horizon ══════════ */}
      {/* The filter + stub rest ON the horizon line. The break faces up.  */}
      {/* All Y coordinates reference horizonY so the scene reads correctly */}

      {/* Cigarette contact shadow — anchors it to the horizon */}
      <Rect
        x={cx - 30}
        y={horizonY + 5}
        width={32}
        height={1.4}
        rx={0.7}
        fill={colors.bg}
        opacity={0.55}
      />

      {/* Filter — honey-gold cork (the spent gold of the released habit) */}
      {/* Sits horizontally on the horizon: filter on the left, stub on the right */}
      <Rect x={cx - 30} y={horizonY - 5} width={12} height={10} rx={1.6} fill={colors.honey} />
      {/* Filter cork seams — darker bands at paper junction + base */}
      <Rect x={cx - 30} y={horizonY - 5}   width={12} height={1.9} fill={colors.purple} opacity={0.68} />
      <Rect x={cx - 30} y={horizonY + 3}   width={12} height={1.8} fill={colors.purple} opacity={0.4} />
      {/* Filter highlight — a confident vertical gleam on the cork */}
      <Rect x={cx - 29} y={horizonY - 2}   width={1.4} height={4.6} rx={0.7} fill={colors.white} opacity={0.5} />

      {/* Paper stub — torn open, the break facing right toward the sprout */}
      <Rect x={cx - 18} y={horizonY - 5} width={16} height={10} fill={colors.white} />
      {/* Paper edge shadow at the filter junction */}
      <Rect x={cx - 18.5} y={horizonY - 5} width={0.9} height={10} fill={colors.purple} opacity={0.22} />
      {/* Paper subtle horizontal ribbing — paper texture */}
      <Rect x={cx - 18} y={horizonY - 2.4} width={16} height={0.55} fill={colors.line3} opacity={0.55} />
      <Rect x={cx - 18} y={horizonY + 2.6} width={16} height={0.45} fill={colors.line3} opacity={0.4} />

      {/* Jagged broken edge — sharp teeth where the cigarette was snapped */}
      <Polygon
        points={`${cx - 2},${horizonY - 5} ${cx + 1.4},${horizonY - 3.2} ${cx - 2},${horizonY - 1.4} ${cx + 1.8},${horizonY + 0.6} ${cx - 2},${horizonY + 2.4} ${cx + 1.4},${horizonY + 4} ${cx - 2},${horizonY + 5}`}
        fill={colors.white}
      />
      {/* Paper-edge accent — soft purple inner shadow on the teeth */}
      <Polygon
        points={`${cx - 2.5},${horizonY - 5} ${cx - 0.4},${horizonY - 3.4} ${cx - 2.5},${horizonY - 1.8} ${cx - 0.2},${horizonY + 0.2} ${cx - 2.5},${horizonY + 2.2} ${cx - 0.4},${horizonY + 3.8} ${cx - 2.5},${horizonY + 5}`}
        fill={colors.purple}
        opacity={0.18}
      />

      {/* Drifting ash — the old habit dispersing rightward into the past */}
      <Circle cx={cx + 5}    cy={horizonY + 6.5} r={0.85} fill={colors.purple3} opacity={0.78} />
      <Circle cx={cx + 9}    cy={horizonY + 8.5} r={0.55} fill={colors.purple3} opacity={0.62} />
      <Circle cx={cx + 3.2}  cy={horizonY + 9}   r={0.45} fill={colors.purple3} opacity={0.5} />
      <Circle cx={cx + 11.5} cy={horizonY + 7}   r={0.4}  fill={colors.purple3} opacity={0.5} />
      <Circle cx={cx + 13.5} cy={horizonY + 9.5} r={0.3}  fill={colors.purple3} opacity={0.42} />
      <Circle cx={cx + 15.5} cy={horizonY + 7.5} r={0.28} fill={colors.purple3} opacity={0.38} />

      {/* ═══ 12 · HEROIC SPROUT — climbing UP from the break, into the sun ═ */}
      {/* Confident upright stem — gentle arc, not anxious zigzag */}
      <Path
        d={`M ${cx - 0.5} ${horizonY - 5}
            C ${cx + 1}   ${horizonY - 18},
              ${cx - 1.5} ${horizonY - 30},
              ${cx + 1}   ${horizonY - 44}`}
        stroke={colors.green}
        strokeWidth={2.8}
        strokeLinecap="round"
        fill="none"
      />
      {/* Stem highlight — light catches the right edge */}
      <Path
        d={`M ${cx + 0.6} ${horizonY - 7}
            C ${cx + 1.9} ${horizonY - 18},
              ${cx - 0.4} ${horizonY - 30},
              ${cx + 1.9} ${horizonY - 43}`}
        stroke={colors.white}
        strokeOpacity={0.5}
        strokeWidth={0.95}
        strokeLinecap="round"
        fill="none"
      />

      {/* SECONDARY LEAF — left side, lower; compact and confident */}
      <Path
        d={`M ${cx - 0.2} ${horizonY - 16}
            C ${cx - 9}    ${horizonY - 18},
              ${cx - 13.5} ${horizonY - 25},
              ${cx - 11}   ${horizonY - 33}
            C ${cx - 4.5}  ${horizonY - 29},
              ${cx - 1}    ${horizonY - 22},
              ${cx - 0.2}  ${horizonY - 16} Z`}
        fill={colors.green2}
      />
      <Path
        d={`M ${cx - 0.2} ${horizonY - 16} Q ${cx - 6} ${horizonY - 24}, ${cx - 11} ${horizonY - 33}`}
        stroke={colors.white}
        strokeOpacity={0.65}
        strokeWidth={1.05}
        strokeLinecap="round"
        fill="none"
      />
      <Path
        d={`M ${cx - 5} ${horizonY - 22} L ${cx - 8.5} ${horizonY - 24}`}
        stroke={colors.white}
        strokeOpacity={0.42}
        strokeWidth={0.7}
        strokeLinecap="round"
      />

      {/* HERO LEAF — right side, higher; bold and aspirational */}
      <Path
        d={`M ${cx + 1} ${horizonY - 22}
            C ${cx + 13}   ${horizonY - 21},
              ${cx + 21}   ${horizonY - 33},
              ${cx + 17.5} ${horizonY - 45}
            C ${cx + 8}    ${horizonY - 39},
              ${cx + 2.5}  ${horizonY - 30},
              ${cx + 1}    ${horizonY - 22} Z`}
        fill={colors.green}
      />
      <Path
        d={`M ${cx + 1} ${horizonY - 22} Q ${cx + 9.5} ${horizonY - 32}, ${cx + 17.5} ${horizonY - 45}`}
        stroke={colors.white}
        strokeOpacity={0.72}
        strokeWidth={1.3}
        strokeLinecap="round"
        fill="none"
      />
      <Path
        d={`M ${cx + 6} ${horizonY - 26} L ${cx + 10.5} ${horizonY - 28.5}`}
        stroke={colors.white}
        strokeOpacity={0.48}
        strokeWidth={0.8}
        strokeLinecap="round"
      />
      <Path
        d={`M ${cx + 10} ${horizonY - 32} L ${cx + 14.5} ${horizonY - 35}`}
        stroke={colors.white}
        strokeOpacity={0.42}
        strokeWidth={0.75}
        strokeLinecap="round"
      />
      {/* Hero leaf gloss — the wet shine of fresh growth */}
      <Path
        d={`M ${cx + 11} ${horizonY - 36} Q ${cx + 13.5} ${horizonY - 39.5}, ${cx + 16} ${horizonY - 42.5}`}
        stroke={colors.white}
        strokeOpacity={0.58}
        strokeWidth={1.4}
        strokeLinecap="round"
        fill="none"
      />

      {/* APEX BUD — the new tip, just emerged */}
      <Circle cx={cx + 1} cy={horizonY - 47} r={2.4} fill={colors.green} />
      <Circle cx={cx + 0.4} cy={horizonY - 47.6} r={1.0} fill={colors.white} opacity={0.55} />

      {/* ═══ 13 · CELESTIAL ACCENTS — 3 strategic stars at compositional rests ═ */}
      <Polygon points={star4(cx + 56, cy - 42, 3.2, 1.05)} fill={colors.white} opacity={0.95} />
      <Polygon points={star4(cx - 54, cy - 38, 2.7, 0.9)}  fill={colors.honey} opacity={0.92} />
      <Polygon points={star4(cx + 62, cy + 4,  2.0, 0.78)} fill={colors.white} opacity={0.78} />

      {/* Tiny floating sparks at field edges */}
      <Circle cx={cx - 62} cy={cy + 6}   r={0.85} fill={colors.honey} opacity={0.65} />
      <Circle cx={cx + 48} cy={cy - 56}  r={0.7}  fill={colors.white} opacity={0.55} />
      <Circle cx={cx - 46} cy={cy - 54}  r={0.6}  fill={colors.white} opacity={0.5} />
    </Svg>
  );
}

// ── Progress scene — bottom illustration for Overall-Progress detail ─────────
// QuitNow-style flat scene: person holding a yellow clipboard, floating clock,
// checklist card, calendar tag, and a sprout. Family-consistent with HeroBadge.
function ProgressSceneArt({ width = 260 }: { width?: number }) {
  const h = Math.round(width * (180 / 280));
  return (
    <Svg width={width} height={h} viewBox="0 0 280 180">
      {/* ── Scattered halo dots ───────────────────────────────────────────── */}
      <Circle cx={14}  cy={26}  r={2.4} fill={colors.honey} />
      <Circle cx={10}  cy={94}  r={1.8} fill={colors.purple3} />
      <Circle cx={26}  cy={156} r={2.2} fill={colors.purple} />
      <Circle cx={140} cy={8}   r={2.0} fill={colors.honey} />
      <Circle cx={266} cy={22}  r={2.6} fill={colors.purple3} />
      <Circle cx={272} cy={90}  r={2.0} fill={colors.honey} />
      <Circle cx={256} cy={158} r={1.8} fill={colors.purple} />

      {/* ── Checklist card — top-left ─────────────────────────────────────── */}
      <Rect x={20} y={20} width={62} height={52} rx={6} fill={colors.purple3} />
      <Rect x={24} y={24} width={54} height={44} rx={4} fill={colors.white} />
      {/* Row 1 — checked */}
      <Rect x={28} y={30} width={7}  height={7} rx={1.4} fill={colors.green} />
      <Path d="M 29 33.5 L 31 35.5 L 34 31.5" stroke={colors.white} strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Rect x={38} y={31} width={32} height={4} rx={1.2} fill={colors.purple} />
      {/* Row 2 — checked */}
      <Rect x={28} y={42} width={7}  height={7} rx={1.4} fill={colors.green} />
      <Path d="M 29 45.5 L 31 47.5 L 34 43.5" stroke={colors.white} strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Rect x={38} y={43} width={28} height={4} rx={1.2} fill={colors.purple} />
      {/* Row 3 — pending */}
      <Rect x={28} y={54} width={7}  height={7} rx={1.4} fill={colors.line2} />
      <Rect x={38} y={55} width={24} height={4} rx={1.2} fill={colors.line2} />

      {/* ── Floating clock — top-right ───────────────────────────────────── */}
      <Rect x={207} y={20} width={6}  height={5}  rx={1.5} fill={colors.purple2} />
      <Circle cx={210} cy={50} r={26} fill={colors.purple2} />
      <Circle cx={210} cy={50} r={20} fill={colors.white} />
      {/* tick marks */}
      <Circle cx={210} cy={34} r={1.4} fill={colors.purple} />
      <Circle cx={226} cy={50} r={1.4} fill={colors.purple} />
      <Circle cx={210} cy={66} r={1.4} fill={colors.purple} />
      <Circle cx={194} cy={50} r={1.4} fill={colors.purple} />
      {/* hands — pointing 12-ish and 4-ish */}
      <Line x1={210} y1={50} x2={210} y2={38} stroke={colors.purple} strokeWidth={2.2} strokeLinecap="round" />
      <Line x1={210} y1={50} x2={222} y2={54} stroke={colors.rose}  strokeWidth={2.0} strokeLinecap="round" />
      <Circle cx={210} cy={50} r={2} fill={colors.purple} />

      {/* ── Small honey clock — mid-right ─────────────────────────────────── */}
      <Circle cx={248} cy={118} r={14} fill={colors.honey} />
      <Circle cx={248} cy={118} r={10} fill={colors.white} />
      <Line x1={248} y1={118} x2={248} y2={111} stroke={colors.purple} strokeWidth={1.6} strokeLinecap="round" />
      <Line x1={248} y1={118} x2={254} y2={120} stroke={colors.rose}  strokeWidth={1.4} strokeLinecap="round" />
      <Circle cx={248} cy={118} r={1.2} fill={colors.purple} />

      {/* ── Person figure — center ────────────────────────────────────────── */}
      {/* Body / torso (purple shirt) */}
      <Path d="M 102 178 Q 102 116 130 116 Q 158 116 158 178 Z" fill={colors.purple} />
      {/* Neck */}
      <Rect x={124} y={104} width={12} height={10} fill={colors.honey} />
      {/* Head */}
      <Circle cx={130} cy={92} r={18} fill={colors.honey} />
      {/* Hair cap */}
      <Path d="M 113 88 Q 116 72 130 72 Q 144 72 147 88 L 147 82 Q 142 78 130 78 Q 118 78 113 82 Z" fill={colors.purple} />
      {/* Smile */}
      <Path d="M 124 96 Q 130 100 136 96" stroke={colors.purple} strokeWidth={1.4} strokeLinecap="round" fill="none" />
      {/* Eyes */}
      <Circle cx={124} cy={90} r={1.4} fill={colors.purple} />
      <Circle cx={136} cy={90} r={1.4} fill={colors.purple} />

      {/* ── Clipboard (yellow, in front of body) ──────────────────────────── */}
      {/* Clipboard backing — yellow */}
      <Rect x={100} y={128} width={60} height={48} rx={4} fill={colors.honey} />
      {/* Clip top */}
      <Rect x={122} y={124} width={16} height={8}  rx={2} fill={colors.purple2} />
      {/* Paper */}
      <Rect x={104} y={134} width={52} height={38} rx={2} fill={colors.white} />
      {/* Lines on paper */}
      <Rect x={110} y={140} width={36} height={3}  rx={1.2} fill={colors.purple3} />
      <Rect x={110} y={148} width={30} height={3}  rx={1.2} fill={colors.purple3} />
      <Rect x={110} y={156} width={24} height={3}  rx={1.2} fill={colors.purple3} />
      {/* Tiny green check on bottom of paper */}
      <Path d="M 138 162 L 141 165 L 146 159" stroke={colors.green} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" fill="none" />

      {/* Arms wrapping around the clipboard */}
      <Path d="M 102 140 Q 96 160 102 174" stroke={colors.purple} strokeWidth={11} strokeLinecap="round" fill="none" />
      <Path d="M 158 140 Q 164 160 158 174" stroke={colors.purple} strokeWidth={11} strokeLinecap="round" fill="none" />
      {/* Hand highlights */}
      <Circle cx={102} cy={172} r={5} fill={colors.honey} />
      <Circle cx={158} cy={172} r={5} fill={colors.honey} />

      {/* ── Calendar tag — bottom-right ───────────────────────────────────── */}
      <Rect x={186} y={140} width={36} height={32} rx={4} fill={colors.rose} />
      <Rect x={186} y={140} width={36} height={9}  rx={4} fill={colors.purple} />
      <Rect x={193} y={136} width={3}  height={7}  rx={1} fill={colors.purple2} />
      <Rect x={212} y={136} width={3}  height={7}  rx={1} fill={colors.purple2} />
      {/* Calendar squares */}
      <Rect x={190} y={154} width={5} height={5} rx={1} fill={colors.white} />
      <Rect x={198} y={154} width={5} height={5} rx={1} fill={colors.white} />
      <Rect x={206} y={154} width={5} height={5} rx={1} fill={colors.white} />
      <Rect x={214} y={154} width={5} height={5} rx={1} fill={colors.white} />
      <Rect x={190} y={162} width={5} height={4} rx={1} fill={colors.white} />
      <Rect x={198} y={162} width={5} height={4} rx={1} fill={colors.honey} />
      <Rect x={206} y={162} width={5} height={4} rx={1} fill={colors.white} />

      {/* ── Sprout — bottom-left next to figure ───────────────────────────── */}
      <Path d="M 72 178 L 72 162" stroke={colors.green2} strokeWidth={2.2} strokeLinecap="round" />
      <Ellipse cx={66} cy={158} rx={6} ry={3.4} fill={colors.green} />
      <Ellipse cx={78} cy={154} rx={6} ry={3.4} fill={colors.green} />
    </Svg>
  );
}

// ── Custom heart + EKG art for the Health-Improvements card ───────────────────
// ── Per-achievement visual variant ───────────────────────────────────────────
// Each id (e.g. 't_20m', 'c_c100', 'l_l1y') deterministically maps to a small
// palette so that two achievements sharing the same `illo` still look distinct.
// 18 palettes — large enough that the biggest group (crown = 17) gets near-zero
// intra-group collisions.
function illoVariant(id: string): { tint: string; accent: string; pop: string; spin: number } {
  let h = 5381;
  for (let i = 0; i < id.length; i++) h = ((h * 33) ^ id.charCodeAt(i)) >>> 0;
  const palettes: Array<[string, string, string]> = [
    [colors.honey,    colors.rose,     colors.sky],
    [colors.rose,     colors.honey,    colors.purple3],
    [colors.sky,      colors.purple3,  colors.honey],
    [colors.purple2,  colors.rose,     colors.honey],
    [colors.green,    colors.honey,    colors.rose],
    [colors.teal,     colors.sky,      colors.purple3],
    [colors.lavender, colors.purple3,  colors.sky],
    [colors.purple3,  colors.honey,    colors.rose],
    [colors.rose,     colors.sky,      colors.honey],
    [colors.honey,    colors.purple3,  colors.rose],
    [colors.sky,      colors.honey,    colors.rose],
    [colors.purple3,  colors.sky,      colors.honey],
    [colors.green,    colors.sky,      colors.purple3],
    [colors.teal,     colors.honey,    colors.rose],
    [colors.lavender, colors.honey,    colors.sky],
    [colors.purple,   colors.lavender, colors.rose],
    [colors.honey,    colors.green,    colors.purple3],
    [colors.rose,     colors.green,    colors.honey],
  ];
  const p = palettes[h % palettes.length];
  // spin = -22..22 degrees, deterministic small rotation for extra asymmetry
  const spin = ((h >> 8) % 45) - 22;
  return { tint: p[0], accent: p[1], pop: p[2], spin };
}

// ── Dagnara-style achievement illustrations ──────────────────────────────────
// Each illo is a self-contained 140×100 SVG scene matching the app's purple/pink
// aesthetic (dark blob backdrop, rose-pink focal element, soft accents).
// `id` parameterizes per-achievement variants so identical illos still differ.
function QsIllo({ kind, locked = false, id = '' }: { kind: string; locked?: boolean; id?: string }) {
  const opacity = locked ? 0.35 : 1;
  const v = illoVariant(id);
  // QuitNow-style backdrop: a dotted halo arc that sweeps over the subject.
  // No dark blob — the illustration sits clean on the modal background, with
  // honey + purple dots accenting the curve. Matches MeditationArt / TipBulbArt.
  const Backdrop = (
    <>
      {Array.from({ length: 11 }).map((_, i) => {
        const ang = (Math.PI * (210 - i * 24)) / 180;
        const r = 54;
        const dx = 70 + Math.cos(ang) * r;
        const dy = 56 + Math.sin(ang) * r;
        const big = i % 3 === 1;
        const fill = big ? colors.honey : (i % 3 === 0 ? colors.purple3 : colors.purple);
        return <Circle key={`halo-${i}`} cx={dx} cy={dy} r={big ? 3.2 : 2.2} fill={fill} />;
      })}
    </>
  );
  switch (kind) {
    // ── Rocket — body, nose, flame, launch cloud; palette varies per id ──
    case 'rocket': return (
      <Svg width="100%" height="100%" viewBox="0 0 140 100" opacity={opacity}>
        {Backdrop}
        {/* Star field */}
        <Path d="M 24 24 L 26 28 L 30 30 L 26 32 L 24 36 L 22 32 L 18 30 L 22 28 Z" fill={v.pop} />
        <Path d="M 116 22 L 118 26 L 122 28 L 118 30 L 116 34 L 114 30 L 110 28 L 114 26 Z" fill={v.tint} />
        <Circle cx={32} cy={50} r={1.5} fill={colors.white} opacity={0.7} />
        <Circle cx={108} cy={50} r={1.5} fill={colors.white} opacity={0.7} />
        <Circle cx={18} cy={66} r={1} fill={v.pop} />
        <Circle cx={122} cy={56} r={1} fill={v.accent} />
        {/* Nose cone — accent */}
        <Path d="M 70 14 Q 78 22 80 32 L 60 32 Q 62 22 70 14 Z" fill={v.accent} />
        {/* Body — tint */}
        <Path d="M 60 32 L 80 32 L 80 60 L 60 60 Z" fill={v.tint} />
        {/* Window */}
        <Circle cx={70} cy={42} r={5.5} fill={colors.sky} />
        <Circle cx={70} cy={42} r={5.5} fill="none" stroke={colors.white} strokeWidth={1.2} opacity={0.55} />
        <Circle cx={68} cy={40} r={1.5} fill={colors.white} opacity={0.9} />
        {/* Stripe */}
        <Rect x={60} y={52} width={20} height={3} fill={colors.purple} opacity={0.55} />
        {/* Fins */}
        <Path d="M 60 50 L 48 70 L 60 64 Z" fill={colors.purple} />
        <Path d="M 80 50 L 92 70 L 80 64 Z" fill={colors.purple} />
        {/* Booster */}
        <Rect x={64} y={60} width={12} height={6} fill={colors.purple2} />
        {/* Layered flame — pop outer, tint inner */}
        <Path d="M 62 66 L 60 82 L 68 74 L 70 86 L 72 74 L 80 82 L 78 66 Z" fill={v.pop} />
        <Path d="M 66 68 L 65 78 L 70 72 L 75 78 L 74 68 Z" fill={v.tint} />
        {/* Launch cloud */}
        <Circle cx={42} cy={86} r={7} fill={colors.lavender} opacity={0.6} />
        <Circle cx={54} cy={90} r={6} fill={colors.lavender} opacity={0.6} />
        <Circle cx={70} cy={94} r={8} fill={colors.lavender} opacity={0.5} />
        <Circle cx={86} cy={90} r={6} fill={colors.lavender} opacity={0.6} />
        <Circle cx={98} cy={86} r={7} fill={colors.lavender} opacity={0.6} />
      </Svg>
    );

    // ── Calendar — page with X marks, scattered confetti, day-number badge ──
    // Per-id: number of crossed-off days + the corner badge number both reflect
    // the milestone (1d → 1, 2d → 2, …, 1w → 7, c365 → 365).
    case 'calendar': {
      const CAL_DAY: Record<string, number> = {
        t_1d: 1, t_2d: 2, t_3d: 3, t_4d: 4, t_5d: 5, t_6d: 6, t_1w: 7, c_c365: 365,
      };
      const day = CAL_DAY[id] ?? 1;
      const crossed = Math.min(day, 8); // visible grid only has 8 cells
      const cells = [
        { x: 52, y: 48 }, { x: 65, y: 48 }, { x: 78, y: 48 },
        { x: 52, y: 58 }, { x: 65, y: 58 }, { x: 78, y: 58 },
        { x: 52, y: 68 }, { x: 65, y: 68 },
      ];
      const label = String(day);
      return (
        <Svg width="100%" height="100%" viewBox="0 0 140 100" opacity={opacity}>
          {Backdrop}
          {/* Calendar body */}
          <Rect x={46} y={28} width={56} height={54} rx={5} fill={colors.ink} />
          {/* Header strip — tint per id */}
          <Rect x={46} y={28} width={56} height={14} rx={5} fill={v.tint} />
          <Rect x={46} y={40} width={56} height={2} fill={colors.purple2} opacity={0.5} />
          {/* Binding rings */}
          <Rect x={56} y={22} width={4} height={12} rx={2} fill={colors.purple3} />
          <Rect x={88} y={22} width={4} height={12} rx={2} fill={colors.purple3} />
          {/* Date grid */}
          {cells.map((c, i) => (
            <Rect key={i} x={c.x} y={c.y} width={9} height={7} rx={1} fill={colors.line2} />
          ))}
          {/* X marks — number of crossed cells reflects milestone */}
          {cells.slice(0, crossed).map((c, i) => (
            <Path
              key={`x${i}`}
              d={`M ${c.x + 1} ${c.y + 1} L ${c.x + 8} ${c.y + 6} M ${c.x + 8} ${c.y + 1} L ${c.x + 1} ${c.y + 6}`}
              stroke={v.accent}
              strokeWidth={2}
              strokeLinecap="round"
            />
          ))}
          {/* Badge — disc with milestone day number */}
          <Circle cx={96} cy={76} r={9} fill={v.tint} />
          <Circle cx={96} cy={76} r={9} fill="none" stroke={v.accent} strokeWidth={1.2} />
          <SvgText
            x={96}
            y={79}
            fontSize={day >= 100 ? 6 : 8}
            fontWeight="bold"
            fill={colors.white}
            textAnchor="middle"
          >
            {label}
          </SvgText>
          {/* Confetti — rotated rects + sparkle stars */}
          <Rect x={28} y={36} width={5} height={3} fill={v.tint}   transform="rotate(20 30 38)" />
          <Rect x={114} y={48} width={5} height={3} fill={v.pop}   transform="rotate(-30 116 50)" />
          <Rect x={34} y={66} width={4} height={3} fill={v.accent} transform="rotate(45 36 68)" />
          <Rect x={114} y={28} width={4} height={3} fill={v.accent} transform="rotate(-15 116 30)" />
          <Path d="M 22 56 L 24 60 L 28 62 L 24 64 L 22 68 L 20 64 L 16 62 L 20 60 Z" fill={v.tint} />
          <Path d="M 116 70 L 118 74 L 122 76 L 118 78 L 116 82 L 114 78 L 110 76 L 114 74 Z" fill={v.pop} />
          <Circle cx={26} cy={84} r={2} fill={v.accent} />
          <Circle cx={120} cy={90} r={1.5} fill={v.tint} />
        </Svg>
      );
    }

    // ── Trophy — cup + tiered base + ribbon, palette varies per id ──
    // Per-id: cup tint, ribbon hue, sparkle accents all derive from `v` so each
    // trophy looks visually distinct even when many achievements share this illo.
    case 'trophy': return (
      <Svg width="100%" height="100%" viewBox="0 0 140 100" opacity={opacity}>
        {Backdrop}
        {/* Cup body — primary tint */}
        <Path d="M 54 20 L 86 20 L 84 48 Q 82 60 70 60 Q 58 60 56 48 Z" fill={v.tint} />
        {/* Cup rim — accent */}
        <Rect x={52} y={18} width={36} height={4} rx={1} fill={v.accent} />
        {/* Handles */}
        <Path d="M 54 26 Q 40 28 42 42 Q 44 50 54 50 L 54 46 Q 48 46 48 40 Q 48 32 56 32 Z" fill={v.tint} />
        <Path d="M 86 26 Q 100 28 98 42 Q 96 50 86 50 L 86 46 Q 92 46 92 40 Q 92 32 84 32 Z" fill={v.tint} />
        {/* Star on cup */}
        <Path d="M 70 30 L 73 38 L 81 38 L 75 43 L 77 51 L 70 46 L 63 51 L 65 43 L 59 38 L 67 38 Z" fill={colors.white} opacity={0.9} />
        {/* Stem */}
        <Rect x={66} y={58} width={8} height={8} fill={colors.purple} />
        {/* Tiered base — kept purple-on-purple for app cohesion */}
        <Rect x={56} y={66} width={28} height={6} rx={2} fill={colors.purple} />
        <Rect x={50} y={72} width={40} height={6} rx={2} fill={colors.purple2} />
        <Rect x={46} y={78} width={48} height={5} rx={2} fill={colors.purple3} />
        {/* Ribbon — accent */}
        <Path d="M 62 84 L 56 96 L 64 92 L 70 98 L 76 92 L 84 96 L 78 84 Z" fill={v.accent} />
        {/* Sparkles — per-id pop & tint */}
        <Path d="M 28 26 L 30 30 L 34 32 L 30 34 L 28 38 L 26 34 L 22 32 L 26 30 Z" fill={v.tint} />
        <Path d="M 110 20 L 112 24 L 116 26 L 112 28 L 110 32 L 108 28 L 104 26 L 108 24 Z" fill={v.pop} />
        <Circle cx={116} cy={54} r={2} fill={v.pop} />
        <Circle cx={24} cy={58} r={2} fill={v.accent} />
        <Circle cx={32} cy={84} r={1.5} fill={v.tint} opacity={0.7} />
        <Circle cx={108} cy={84} r={1.5} fill={v.pop} opacity={0.7} />
      </Svg>
    );

    // ── Jar — glass jar with coin stack and hands cradling ──
    // Per-id: number of coin layers (2..5) reflects savings tier; coin + hand
    // tints derive from `v` so jars feel distinct as the milestones grow.
    case 'jar': {
      const JAR_LAYERS: Record<string, number> = {
        m_m5: 2, m_m10: 2, m_m25: 3, m_m50: 3, m_m100: 4, m_m200: 5,
      };
      const layers = JAR_LAYERS[id] ?? 4;
      // y-position of each coin layer (top-down)
      const layerYs = [54, 60, 66, 72]; // base 4 layers
      return (
        <Svg width="100%" height="100%" viewBox="0 0 140 100" opacity={opacity}>
          {Backdrop}
          {/* Jar lid */}
          <Rect x={54} y={22} width={32} height={8} rx={2} fill={colors.purple} />
          <Rect x={54} y={28} width={32} height={2} fill={colors.purple2} opacity={0.5} />
          {/* Jar body */}
          <Path d="M 52 30 L 88 30 L 86 76 Q 86 82 80 82 L 60 82 Q 54 82 54 76 Z" fill={colors.sky} opacity={0.45} />
          <Path d="M 52 30 L 88 30 L 86 76 Q 86 82 80 82 L 60 82 Q 54 82 54 76 Z" fill="none" stroke={colors.lavender} strokeWidth={1.5} />
          {/* Glass shine */}
          <Path d="M 58 36 L 58 72" stroke={colors.white} strokeWidth={2} opacity={0.3} strokeLinecap="round" />
          {/* Coin stack — count varies per id */}
          {/* bottom ellipse cap always shown */}
          <Ellipse cx={70} cy={72} rx={15} ry={3} fill={v.tint} />
          {layerYs.slice(0, layers).reverse().map((y, idx) => {
            const w = 30 - idx * 2;
            const x = 70 - w / 2;
            return (
              <Rect key={`coinrect-${idx}`} x={x} y={y - 6} width={w} height={6} fill={v.tint} />
            );
          })}
          {layerYs.slice(0, layers).map((y, idx) => (
            <Ellipse key={`coined-${idx}`} cx={70} cy={y - 6} rx={15 - idx * 1} ry={2.8} fill={colors.purple2} />
          ))}
          {/* Highlights on coin edges */}
          {layerYs.slice(0, layers).map((y, idx) => (
            <Circle key={`hl-${idx}`} cx={64 + idx * 2} cy={y - 6} r={1.2} fill={colors.white} opacity={0.7} />
          ))}
          {/* Hands cradling — accent tint */}
          <Path d="M 48 68 Q 38 70 36 84 Q 36 92 44 92 L 56 84 Q 56 78 54 74 Z" fill={v.accent} />
          <Path d="M 92 68 Q 102 70 104 84 Q 104 92 96 92 L 84 84 Q 84 78 86 74 Z" fill={v.accent} />
          {/* Sparkles */}
          <Circle cx={28} cy={32} r={2} fill={v.pop} />
          <Circle cx={114} cy={28} r={2} fill={v.tint} />
          <Path d="M 22 50 L 24 54 L 28 56 L 24 58 L 22 62 L 20 58 L 16 56 L 20 54 Z" fill={v.pop} />
        </Svg>
      );
    }

    // ── Heart — glowing pink heart with double halo ──
    case 'heart': return (
      <Svg width="100%" height="100%" viewBox="0 0 140 100" opacity={opacity}>
        {Backdrop}
        {/* Outer + inner halo */}
        <Circle cx={70} cy={50} r={32} fill={colors.purple} opacity={0.18} />
        <Circle cx={70} cy={50} r={26} fill={colors.purple} opacity={0.22} />
        {/* Heart */}
        <Path
          d="M 70 76 L 48 54 Q 40 46 46 36 Q 52 26 62 30 Q 67 32 70 40 Q 73 32 78 30 Q 88 26 94 36 Q 100 46 92 54 Z"
          fill={colors.rose}
        />
        {/* Highlight curve + dot */}
        <Path d="M 56 38 Q 53 44 58 50" stroke={colors.white} strokeWidth={2.5} opacity={0.65} fill="none" strokeLinecap="round" />
        <Circle cx={58} cy={40} r={2} fill={colors.white} opacity={0.7} />
        {/* Sparkles */}
        <Path d="M 26 30 L 28 34 L 32 36 L 28 38 L 26 42 L 24 38 L 20 36 L 24 34 Z" fill={colors.honey} />
        <Path d="M 114 28 L 116 32 L 120 34 L 116 36 L 114 40 L 112 36 L 108 34 L 112 32 Z" fill={colors.sky} />
        <Path d="M 22 66 L 24 70 L 28 72 L 24 74 L 22 78 L 20 74 L 16 72 L 20 70 Z" fill={colors.honey} />
        <Path d="M 118 68 L 120 72 L 124 74 L 120 76 L 118 80 L 116 76 L 112 74 L 116 72 Z" fill={colors.sky} />
        <Circle cx={36} cy={50} r={1.5} fill={colors.white} opacity={0.8} />
        <Circle cx={104} cy={52} r={1.5} fill={colors.white} opacity={0.8} />
      </Svg>
    );

    // ── Crown — crown with gems, velvet base, sparkles ──
    // Per-id: peak heights, gem layout, and palette all vary so the 17 crown
    // achievements (5y→250k milestones) each have a unique silhouette+tint.
    case 'crown': {
      // peakRaise 0..5 shifts the three crown spikes upward
      const peakRaise = Math.abs(v.spin) % 6;
      const sideY = 30 - peakRaise;
      const centerY = 24 - peakRaise;
      // gem-shape variant 0..2
      const gemShape = Math.abs(v.spin >> 2) % 3;
      return (
        <Svg width="100%" height="100%" viewBox="0 0 140 100" opacity={opacity}>
          {Backdrop}
          {/* Crown silhouette — spike heights derive from id */}
          <Path d={`M 40 64 L 48 ${sideY} L 60 52 L 70 ${centerY} L 80 52 L 92 ${sideY} L 100 64 Z`} fill={v.tint} />
          {/* Crown highlight */}
          <Path d={`M 40 64 L 48 ${sideY} L 60 52 L 70 ${centerY}`} stroke={colors.white} strokeWidth={1.5} opacity={0.4} fill="none" />
          {/* Crown band */}
          <Rect x={40} y={62} width={60} height={12} rx={1} fill={v.tint} />
          <Rect x={40} y={62} width={60} height={3} fill={colors.purple} opacity={0.3} />
          {/* Gems on points — accent + pop swap by id */}
          <Circle cx={48} cy={sideY} r={3.5} fill={v.accent} />
          <Circle cx={70} cy={centerY} r={4} fill={v.pop} />
          <Circle cx={92} cy={sideY} r={3.5} fill={v.accent} />
          <Circle cx={48} cy={sideY - 2} r={1} fill={colors.white} opacity={0.85} />
          <Circle cx={70} cy={centerY - 2} r={1.2} fill={colors.white} opacity={0.85} />
          <Circle cx={92} cy={sideY - 2} r={1} fill={colors.white} opacity={0.85} />
          {/* Band gems — three variants of diamond shapes */}
          {gemShape === 0 && (
            <>
              <Path d="M 60 64 L 62 68 L 60 72 L 58 68 Z" fill={v.pop} />
              <Path d="M 70 64 L 72 68 L 70 72 L 68 68 Z" fill={v.accent} />
              <Path d="M 80 64 L 82 68 L 80 72 L 78 68 Z" fill={v.pop} />
            </>
          )}
          {gemShape === 1 && (
            <>
              <Circle cx={60} cy={68} r={2.5} fill={v.accent} />
              <Circle cx={70} cy={68} r={3} fill={v.pop} />
              <Circle cx={80} cy={68} r={2.5} fill={v.accent} />
            </>
          )}
          {gemShape === 2 && (
            <>
              <Rect x={58} y={66} width={4} height={4} rx={1} fill={v.pop} transform="rotate(45 60 68)" />
              <Rect x={68} y={66} width={4} height={4} rx={1} fill={v.accent} transform="rotate(45 70 68)" />
              <Rect x={78} y={66} width={4} height={4} rx={1} fill={v.pop} transform="rotate(45 80 68)" />
            </>
          )}
          {/* Velvet base — accent */}
          <Path d="M 36 74 L 104 74 L 100 84 Q 70 90 40 84 Z" fill={v.accent} opacity={0.65} />
          {/* Sparkles */}
          <Path d="M 22 36 L 24 40 L 28 42 L 24 44 L 22 48 L 20 44 L 16 42 L 20 40 Z" fill={colors.white} />
          <Path d="M 116 36 L 118 40 L 122 42 L 118 44 L 116 48 L 114 44 L 110 42 L 114 40 Z" fill={colors.white} />
          <Circle cx={26} cy={64} r={1.5} fill={v.pop} />
          <Circle cx={114} cy={64} r={1.5} fill={v.pop} />
        </Svg>
      );
    }

    // ── Star — large radiant star with double glow and sparkle field ──
    // Per-id: star tint + center pip + rotation derived from `v` so each
    // star-illo achievement (18mo, 2y, 3y, c200, c1.5k, c7.5k, c75k, l6mo) differs.
    case 'star': {
      const rot = v.spin / 4; // -5..5 deg subtle twist
      return (
        <Svg width="100%" height="100%" viewBox="0 0 140 100" opacity={opacity}>
          {Backdrop}
          {/* Glow rings — tint per id */}
          <Circle cx={70} cy={50} r={34} fill={v.tint} opacity={0.1} />
          <Circle cx={70} cy={50} r={26} fill={v.tint} opacity={0.16} />
          {/* Outer star */}
          <Path
            d="M 70 18 L 79 42 L 104 42 L 84 58 L 92 82 L 70 68 L 48 82 L 56 58 L 36 42 L 61 42 Z"
            fill={v.tint}
            transform={`rotate(${rot} 70 50)`}
          />
          {/* Inner highlight */}
          <Path d="M 70 28 L 75 42 L 70 56 L 65 42 Z" fill={colors.white} opacity={0.65} />
          {/* Center pip — pop */}
          <Circle cx={70} cy={50} r={2} fill={v.pop} />
          {/* Sparkle accents */}
          <Path d="M 22 26 L 24 30 L 28 32 L 24 34 L 22 38 L 20 34 L 16 32 L 20 30 Z" fill={v.accent} />
          <Path d="M 114 24 L 116 28 L 120 30 L 116 32 L 114 36 L 112 32 L 108 30 L 112 28 Z" fill={v.pop} />
          <Path d="M 20 70 L 22 74 L 26 76 L 22 78 L 20 82 L 18 78 L 14 76 L 18 74 Z" fill={v.pop} />
          <Path d="M 116 72 L 118 76 L 122 78 L 118 80 L 116 84 L 114 80 L 110 78 L 114 76 Z" fill={v.accent} />
          <Circle cx={36} cy={88} r={1.5} fill={colors.white} opacity={0.7} />
          <Circle cx={104} cy={88} r={1.5} fill={colors.white} opacity={0.7} />
        </Svg>
      );
    }

    // ── Sprout — multi-leaf plant on rose earth, falling petals ──
    // Per-id: growth stage (leaf count, flower size, bud presence) reflects the
    // milestone — e.g. 10d shows fewer leaves, l3mo shows a full bloom.
    case 'sprout': {
      // Map each id to a growth stage 0..9
      const GROW: Record<string, number> = {
        t_10d: 0, t_2w: 1, t_3w: 2, t_1mo: 3, t_6w: 4, t_2mo: 5,
        l_l1d: 0, l_l3d: 2, l_l1mo: 6, l_l3mo: 9,
      };
      const stage = GROW[id] ?? 4;
      const flowerR = 4 + stage * 0.5; // 4..8.5
      const hasUpperLeaf = stage >= 2;
      const hasExtraLeaf = stage >= 5;
      const hasBloom = stage >= 7;
      return (
        <Svg width="100%" height="100%" viewBox="0 0 140 100" opacity={opacity}>
          {Backdrop}
          {/* Earth mound */}
          <Path d="M 34 80 Q 70 64 106 80 L 106 92 L 34 92 Z" fill={v.accent} />
          <Path d="M 34 80 Q 70 66 106 80" stroke={colors.purple3} strokeWidth={1.5} opacity={0.5} fill="none" />
          <Circle cx={44} cy={84} r={1.2} fill={colors.purple3} opacity={0.6} />
          <Circle cx={96} cy={84} r={1.2} fill={colors.purple3} opacity={0.6} />
          {/* Curvy stem */}
          <Path d="M 70 78 Q 68 60 70 42" stroke={colors.green} strokeWidth={3} strokeLinecap="round" fill="none" />
          {/* Bottom-left leaf */}
          <Path d="M 70 64 Q 54 62 46 50 Q 58 54 70 58 Z" fill={colors.green} />
          {/* Bottom-right leaf */}
          <Path d="M 70 56 Q 86 54 94 42 Q 82 46 70 50 Z" fill={colors.green2} />
          {/* Upper small leaf — appears at stage 2+ */}
          {hasUpperLeaf && (
            <Path d="M 70 46 Q 60 44 56 36 Q 64 38 70 42 Z" fill={colors.green} />
          )}
          {/* Extra side leaf at stage 5+ */}
          {hasExtraLeaf && (
            <Path d="M 70 48 Q 80 46 86 38 Q 78 42 70 44 Z" fill={colors.green2} />
          )}
          {/* Bud / flower — size grows with stage; full bloom adds petals */}
          {hasBloom ? (
            <>
              <Circle cx={70} cy={36 - (flowerR - 6)} r={flowerR + 1} fill={v.tint} opacity={0.45} />
              <Path
                d={`M 70 ${36 - (flowerR - 6) - flowerR}
                    L ${70 + flowerR * 0.7} ${36 - (flowerR - 6) - flowerR * 0.3}
                    L ${70 + flowerR * 0.95} ${36 - (flowerR - 6) + flowerR * 0.6}
                    L 70 ${36 - (flowerR - 6) + flowerR}
                    L ${70 - flowerR * 0.95} ${36 - (flowerR - 6) + flowerR * 0.6}
                    L ${70 - flowerR * 0.7} ${36 - (flowerR - 6) - flowerR * 0.3} Z`}
                fill={v.tint}
              />
              <Circle cx={70} cy={36 - (flowerR - 6)} r={2.4} fill={v.pop} />
            </>
          ) : (
            <>
              <Circle cx={70} cy={36} r={flowerR} fill={v.tint} />
              <Circle cx={70} cy={36} r={flowerR * 0.5} fill={v.pop} />
            </>
          )}
          <Circle cx={68} cy={34} r={1.2} fill={colors.white} opacity={0.85} />
          {/* Falling petals / sparkles */}
          <Circle cx={28} cy={42} r={2} fill={v.pop} />
          <Path d="M 104 28 L 106 32 L 110 34 L 106 36 L 104 40 L 102 36 L 98 34 L 102 32 Z" fill={v.tint} />
          <Circle cx={22} cy={62} r={1.5} fill={v.tint} />
          <Circle cx={116} cy={58} r={1.5} fill={v.pop} />
          <Circle cx={114} cy={74} r={1.2} fill={v.accent} />
        </Svg>
      );
    }

    // ── Sunrise — sun rising over pink horizon with birds and clouds ──
    // Per-id: sun height + ray count + sun tint vary so each sunrise differs.
    case 'sunrise': {
      const cyMap: Record<string, number> = { t_8h: 64, t_12h: 46 };
      const sunY = cyMap[id] ?? 56;
      const extraRays = id === 't_12h'; // higher = more rays
      return (
        <Svg width="100%" height="100%" viewBox="0 0 140 100" opacity={opacity}>
          {Backdrop}
          {/* Sun glow */}
          <Circle cx={70} cy={sunY} r={26} fill={v.tint} opacity={0.18} />
          {/* Sun body */}
          <Circle cx={70} cy={sunY} r={16} fill={v.tint} />
          <Path d={`M 60 ${sunY - 6} Q 64 ${sunY - 10} 70 ${sunY - 10}`} stroke={colors.white} strokeWidth={2} opacity={0.6} fill="none" strokeLinecap="round" />
          {/* Rays */}
          <Path d={`M 70 ${sunY - 24} L 70 ${sunY - 32}`} stroke={v.tint} strokeWidth={3} strokeLinecap="round" />
          <Path d={`M 52 ${sunY - 16} L 46 ${sunY - 22}`} stroke={v.tint} strokeWidth={3} strokeLinecap="round" />
          <Path d={`M 88 ${sunY - 16} L 94 ${sunY - 22}`} stroke={v.tint} strokeWidth={3} strokeLinecap="round" />
          <Path d={`M 44 ${sunY} L 36 ${sunY}`} stroke={v.tint} strokeWidth={3} strokeLinecap="round" />
          <Path d={`M 96 ${sunY} L 104 ${sunY}`} stroke={v.tint} strokeWidth={3} strokeLinecap="round" />
          {extraRays && (
            <>
              <Path d={`M 58 ${sunY - 20} L 54 ${sunY - 28}`} stroke={v.tint} strokeWidth={2.5} strokeLinecap="round" />
              <Path d={`M 82 ${sunY - 20} L 86 ${sunY - 28}`} stroke={v.tint} strokeWidth={2.5} strokeLinecap="round" />
              <Path d={`M 50 ${sunY - 8} L 42 ${sunY - 12}`} stroke={v.tint} strokeWidth={2.5} strokeLinecap="round" />
              <Path d={`M 90 ${sunY - 8} L 98 ${sunY - 12}`} stroke={v.tint} strokeWidth={2.5} strokeLinecap="round" />
            </>
          )}
          {/* Horizon */}
          <Rect x={24} y={76} width={92} height={4} rx={2} fill={v.accent} />
          <Rect x={24} y={80} width={92} height={3} rx={2} fill={v.accent} opacity={0.5} />
          {/* Birds */}
          <Path d="M 34 42 Q 38 38 42 42 Q 46 38 50 42" stroke={colors.ink} strokeWidth={1.5} fill="none" strokeLinecap="round" />
          <Path d="M 96 36 Q 100 32 104 36 Q 108 32 112 36" stroke={colors.ink} strokeWidth={1.5} fill="none" strokeLinecap="round" />
          {/* Clouds */}
          <Circle cx={34} cy={50} r={5} fill={colors.lavender} opacity={0.75} />
          <Circle cx={40} cy={50} r={4} fill={colors.lavender} opacity={0.75} />
          <Circle cx={104} cy={54} r={5} fill={colors.lavender} opacity={0.7} />
          <Circle cx={110} cy={54} r={4} fill={colors.lavender} opacity={0.7} />
          {/* Corner sparkles */}
          <Circle cx={20} cy={66} r={1.5} fill={v.pop} />
          <Circle cx={120} cy={68} r={1.5} fill={v.pop} />
        </Svg>
      );
    }

    // ── Clock — analog clock with markers, hands, and corner sparkles ──
    // Per-id: hands point to the matching milestone time so each clock-illo
    // achievement renders visually distinct (20m, 1h, 4h all differ).
    case 'clock': {
      // Hand angles in degrees from 12 o'clock, clockwise.
      const CLOCK_HANDS: Record<string, { hour: number; minute: number }> = {
        t_20m: { hour: 10,  minute: 120 }, // 12:20
        t_1h:  { hour: 30,  minute: 0   }, // 1:00
        t_4h:  { hour: 120, minute: 0   }, // 4:00
      };
      const h = CLOCK_HANDS[id] ?? { hour: 30, minute: 0 };
      const HR_LEN = 12;
      const MN_LEN = 18;
      const hourX = 70 + HR_LEN * Math.sin((h.hour * Math.PI) / 180);
      const hourY = 50 - HR_LEN * Math.cos((h.hour * Math.PI) / 180);
      const minX  = 70 + MN_LEN * Math.sin((h.minute * Math.PI) / 180);
      const minY  = 50 - MN_LEN * Math.cos((h.minute * Math.PI) / 180);
      return (
        <Svg width="100%" height="100%" viewBox="0 0 140 100" opacity={opacity}>
          {Backdrop}
          {/* Drop shadow */}
          <Circle cx={70} cy={52} r={28} fill={colors.purple} opacity={0.25} />
          {/* Face — tint varies per id */}
          <Circle cx={70} cy={50} r={26} fill={colors.ink} />
          <Circle cx={70} cy={50} r={26} fill="none" stroke={v.tint} strokeWidth={3} />
          {/* Hour markers (12/3/6/9 bars, others dots) */}
          <Rect x={68} y={26} width={4} height={5} rx={1} fill={colors.purple3} />
          <Rect x={89} y={48} width={5} height={4} rx={1} fill={colors.purple3} />
          <Rect x={68} y={69} width={4} height={5} rx={1} fill={colors.purple3} />
          <Rect x={46} y={48} width={5} height={4} rx={1} fill={colors.purple3} />
          <Circle cx={82} cy={32} r={1.5} fill={colors.purple3} opacity={0.7} />
          <Circle cx={58} cy={32} r={1.5} fill={colors.purple3} opacity={0.7} />
          <Circle cx={82} cy={68} r={1.5} fill={colors.purple3} opacity={0.7} />
          <Circle cx={58} cy={68} r={1.5} fill={colors.purple3} opacity={0.7} />
          {/* Hands — angle derived from id */}
          <Line x1={70} y1={50} x2={hourX} y2={hourY} stroke={v.accent} strokeWidth={3.2} strokeLinecap="round" />
          <Line x1={70} y1={50} x2={minX}  y2={minY}  stroke={v.pop}    strokeWidth={2.5} strokeLinecap="round" />
          {/* Center cap */}
          <Circle cx={70} cy={50} r={3} fill={colors.honey} />
          <Circle cx={70} cy={50} r={1.2} fill={colors.white} />
          {/* Corner sparkles */}
          <Path d="M 22 28 L 24 32 L 28 34 L 24 36 L 22 40 L 20 36 L 16 34 L 20 32 Z" fill={v.tint} />
          <Path d="M 116 26 L 118 30 L 122 32 L 118 34 L 116 38 L 114 34 L 110 32 L 114 30 Z" fill={v.pop} />
          <Circle cx={26} cy={74} r={2} fill={v.accent} />
          <Circle cx={114} cy={76} r={2} fill={v.pop} />
        </Svg>
      );
    }

    // ── Lungs — lung pair with trachea, veins, breath wisps; tint per id ──
    case 'lungs': return (
      <Svg width="100%" height="100%" viewBox="0 0 140 100" opacity={opacity}>
        {Backdrop}
        {/* Trachea + carina */}
        <Rect x={68} y={22} width={4} height={18} rx={1} fill={colors.lavender} />
        <Rect x={64} y={36} width={12} height={6} rx={1} fill={colors.lavender} />
        {/* Lungs — tint per id */}
        <Path d="M 68 40 Q 46 40 40 56 Q 36 74 48 82 Q 60 86 68 76 L 68 60 Z" fill={v.tint} />
        <Path d="M 72 40 Q 94 40 100 56 Q 104 74 92 82 Q 80 86 72 76 L 72 60 Z" fill={v.tint} />
        {/* Vein detail */}
        <Path d="M 56 50 Q 54 58 56 70" stroke={colors.white} strokeWidth={1.5} opacity={0.55} fill="none" strokeLinecap="round" />
        <Path d="M 50 56 Q 50 64 54 72" stroke={colors.white} strokeWidth={1.2} opacity={0.45} fill="none" strokeLinecap="round" />
        <Path d="M 84 50 Q 86 58 84 70" stroke={colors.white} strokeWidth={1.5} opacity={0.55} fill="none" strokeLinecap="round" />
        <Path d="M 90 56 Q 90 64 86 72" stroke={colors.white} strokeWidth={1.2} opacity={0.45} fill="none" strokeLinecap="round" />
        {/* Breath wisps — accent */}
        <Path d="M 28 50 Q 22 46 28 40 Q 24 36 30 32" stroke={v.accent} strokeWidth={2} fill="none" strokeLinecap="round" />
        <Path d="M 112 50 Q 118 46 112 40 Q 116 36 110 32" stroke={v.accent} strokeWidth={2} fill="none" strokeLinecap="round" />
        {/* Sparkles */}
        <Circle cx={26} cy={70} r={2} fill={v.pop} />
        <Circle cx={114} cy={70} r={2} fill={v.pop} />
        <Path d="M 22 24 L 24 28 L 28 30 L 24 32 L 22 36 L 20 32 L 16 30 L 20 28 Z" fill={v.accent} />
      </Svg>
    );

    // ── Hero — superhero with flowing cape; cape + emblem tint vary per id ──
    case 'hero': return (
      <Svg width="100%" height="100%" viewBox="0 0 140 100" opacity={opacity}>
        {Backdrop}
        {/* Flowing cape — tint */}
        <Path d="M 64 36 Q 38 42 30 70 Q 36 72 46 66 Q 56 60 66 56 Z" fill={v.tint} />
        <Path d="M 64 38 Q 44 44 38 64" stroke={colors.purple3} strokeWidth={1} opacity={0.5} fill="none" />
        {/* Torso */}
        <Path d="M 60 50 L 80 50 L 78 74 L 62 74 Z" fill={colors.purple} />
        {/* Chest emblem — pop */}
        <Path d="M 70 56 L 72 60 L 76 60 L 73 62 L 74 66 L 70 64 L 66 66 L 67 62 L 64 60 L 68 60 Z" fill={v.pop} />
        {/* Head */}
        <Circle cx={70} cy={42} r={8} fill={colors.purple3} />
        {/* Mask */}
        <Path d="M 62 40 Q 70 36 78 40 L 78 44 Q 70 46 62 44 Z" fill={colors.ink} />
        <Circle cx={66} cy={42} r={1.2} fill={colors.white} />
        <Circle cx={74} cy={42} r={1.2} fill={colors.white} />
        {/* Arms */}
        <Path d="M 80 52 Q 90 46 96 38" stroke={colors.purple3} strokeWidth={5} strokeLinecap="round" fill="none" />
        <Path d="M 60 52 Q 52 50 46 44" stroke={colors.purple3} strokeWidth={5} strokeLinecap="round" fill="none" />
        <Circle cx={96} cy={38} r={3.5} fill={colors.purple3} />
        <Circle cx={46} cy={44} r={3.5} fill={colors.purple3} />
        {/* Legs */}
        <Rect x={64} y={74} width={4} height={10} rx={1} fill={colors.purple2} />
        <Rect x={72} y={74} width={4} height={10} rx={1} fill={colors.purple2} />
        {/* Speed lines — accent */}
        <Path d="M 14 36 L 26 36" stroke={v.accent} strokeWidth={1.5} opacity={0.7} strokeLinecap="round" />
        <Path d="M 12 46 L 24 46" stroke={v.accent} strokeWidth={1.5} opacity={0.7} strokeLinecap="round" />
        <Path d="M 16 56 L 28 56" stroke={v.accent} strokeWidth={1.5} opacity={0.5} strokeLinecap="round" />
        {/* Sparkles */}
        <Path d="M 110 24 L 112 28 L 116 30 L 112 32 L 110 36 L 108 32 L 104 30 L 108 28 Z" fill={v.pop} />
        <Circle cx={116} cy={64} r={2} fill={v.pop} />
        <Circle cx={108} cy={82} r={1.5} fill={v.accent} />
      </Svg>
    );

    // ── Dance — two dancers under disco ball; outfit tints vary per id ──
    case 'dance': return (
      <Svg width="100%" height="100%" viewBox="0 0 140 100" opacity={opacity}>
        {Backdrop}
        {/* Disco ball */}
        <Circle cx={70} cy={26} r={8} fill={colors.purple3} />
        <Path d="M 62 22 L 78 22 M 62 26 L 78 26 M 62 30 L 78 30 M 66 18 L 66 34 M 70 18 L 70 34 M 74 18 L 74 34" stroke={colors.white} strokeWidth={0.5} opacity={0.6} />
        <Circle cx={68} cy={24} r={1.5} fill={colors.white} opacity={0.9} />
        {/* Ball chain */}
        <Line x1={70} y1={18} x2={70} y2={12} stroke={colors.lavender} strokeWidth={1} />
        {/* Light beams — tint + pop + accent */}
        <Path d="M 70 34 L 38 60" stroke={v.tint} strokeWidth={1} opacity={0.45} />
        <Path d="M 70 34 L 102 60" stroke={v.pop} strokeWidth={1} opacity={0.45} />
        <Path d="M 70 34 L 26 78" stroke={v.accent} strokeWidth={1} opacity={0.35} />
        <Path d="M 70 34 L 114 78" stroke={colors.purple3} strokeWidth={1} opacity={0.35} />
        {/* Left dancer — tint outfit */}
        <Circle cx={48} cy={50} r={5} fill={colors.purple3} />
        <Path d="M 44 56 L 52 56 L 50 74 L 46 74 Z" fill={v.tint} />
        <Path d="M 44 60 Q 36 56 32 62" stroke={colors.purple3} strokeWidth={3} strokeLinecap="round" fill="none" />
        <Path d="M 52 60 Q 60 58 60 66" stroke={colors.purple3} strokeWidth={3} strokeLinecap="round" fill="none" />
        <Path d="M 46 74 L 42 86" stroke={colors.purple2} strokeWidth={3} strokeLinecap="round" />
        <Path d="M 50 74 L 54 86" stroke={colors.purple2} strokeWidth={3} strokeLinecap="round" />
        {/* Right dancer — accent outfit */}
        <Circle cx={92} cy={50} r={5} fill={colors.purple3} />
        <Path d="M 88 56 L 96 56 L 94 74 L 90 74 Z" fill={v.accent} />
        <Path d="M 88 60 Q 80 62 80 68" stroke={colors.purple3} strokeWidth={3} strokeLinecap="round" fill="none" />
        <Path d="M 96 60 Q 104 56 108 62" stroke={colors.purple3} strokeWidth={3} strokeLinecap="round" fill="none" />
        <Path d="M 90 74 L 88 86" stroke={colors.purple2} strokeWidth={3} strokeLinecap="round" />
        <Path d="M 94 74 L 98 86" stroke={colors.purple2} strokeWidth={3} strokeLinecap="round" />
        {/* Music notes */}
        <Circle cx={24} cy={50} r={2.5} fill={v.pop} />
        <Line x1={26} y1={50} x2={26} y2={40} stroke={v.pop} strokeWidth={1.5} />
        <Circle cx={114} cy={48} r={2.5} fill={v.tint} />
        <Line x1={116} y1={48} x2={116} y2={38} stroke={v.tint} strokeWidth={1.5} />
        {/* Floor sparkle */}
        <Circle cx={70} cy={88} r={1.5} fill={v.pop} opacity={0.7} />
      </Svg>
    );

    // ── Jump — figure mid-jump with rope; rope + shoe tints vary per id ──
    case 'jump': return (
      <Svg width="100%" height="100%" viewBox="0 0 140 100" opacity={opacity}>
        {Backdrop}
        {/* Rope — tint per id */}
        <Path d="M 22 56 Q 70 18 118 56" stroke={v.tint} strokeWidth={2.5} fill="none" strokeLinecap="round" />
        <Path d="M 22 56 Q 70 96 118 56" stroke={v.tint} strokeWidth={2.5} fill="none" strokeLinecap="round" opacity={0.5} />
        {/* Head */}
        <Circle cx={70} cy={36} r={7} fill={colors.purple3} />
        <Path d="M 67 38 Q 70 40 73 38" stroke={colors.ink} strokeWidth={1.2} fill="none" strokeLinecap="round" />
        <Circle cx={67} cy={35} r={0.8} fill={colors.ink} />
        <Circle cx={73} cy={35} r={0.8} fill={colors.ink} />
        {/* Body */}
        <Path d="M 64 42 L 76 42 L 74 62 L 66 62 Z" fill={colors.purple} />
        {/* Star on shirt — pop */}
        <Path d="M 70 48 L 71 51 L 74 51 L 72 53 L 73 56 L 70 54 L 67 56 L 68 53 L 66 51 L 69 51 Z" fill={v.pop} />
        {/* Arms gripping rope */}
        <Path d="M 64 46 Q 56 50 52 56" stroke={colors.purple3} strokeWidth={4} strokeLinecap="round" fill="none" />
        <Path d="M 76 46 Q 84 50 88 56" stroke={colors.purple3} strokeWidth={4} strokeLinecap="round" fill="none" />
        <Circle cx={52} cy={56} r={3} fill={colors.purple3} />
        <Circle cx={88} cy={56} r={3} fill={colors.purple3} />
        {/* Legs */}
        <Path d="M 66 62 Q 60 70 58 76" stroke={colors.purple2} strokeWidth={4} strokeLinecap="round" fill="none" />
        <Path d="M 74 62 Q 80 70 82 76" stroke={colors.purple2} strokeWidth={4} strokeLinecap="round" fill="none" />
        {/* Shoes — accent */}
        <Ellipse cx={58} cy={78} rx={4} ry={2} fill={v.accent} />
        <Ellipse cx={82} cy={78} rx={4} ry={2} fill={v.accent} />
        {/* Motion lines */}
        <Path d="M 38 82 L 46 84" stroke={colors.sky} strokeWidth={1.5} opacity={0.6} strokeLinecap="round" />
        <Path d="M 94 84 L 102 82" stroke={colors.sky} strokeWidth={1.5} opacity={0.6} strokeLinecap="round" />
        {/* Sparkles */}
        <Circle cx={28} cy={28} r={1.5} fill={v.pop} />
        <Circle cx={112} cy={26} r={1.5} fill={v.pop} />
        <Path d="M 18 70 L 20 74 L 24 76 L 20 78 L 18 82 L 16 78 L 12 76 L 16 74 Z" fill={v.tint} />
      </Svg>
    );

    // ── Dive — figure floating in water with bubbles; suit tint per id ──
    case 'dive': return (
      <Svg width="100%" height="100%" viewBox="0 0 140 100" opacity={opacity}>
        {Backdrop}
        {/* Water wave lines — water stays sky-blue (semantic) */}
        <Path d="M 16 64 Q 30 60 40 64 Q 50 68 60 64 Q 70 60 80 64 Q 90 68 100 64 Q 110 60 124 64" stroke={colors.sky} strokeWidth={2} fill="none" strokeLinecap="round" opacity={0.85} />
        <Path d="M 16 72 Q 30 68 40 72 Q 50 76 60 72 Q 70 68 80 72 Q 90 76 100 72 Q 110 68 124 72" stroke={colors.sky} strokeWidth={1.5} fill="none" strokeLinecap="round" opacity={0.55} />
        {/* Floating body — tint per id */}
        <Path d="M 44 56 Q 70 50 96 56 Q 96 62 70 64 Q 44 62 44 56 Z" fill={v.tint} />
        {/* Head */}
        <Circle cx={42} cy={56} r={6} fill={colors.purple3} />
        <Path d="M 36 54 Q 42 48 48 54" stroke={colors.ink} strokeWidth={2} fill="none" strokeLinecap="round" />
        <Path d="M 40 58 Q 42 60 44 58" stroke={colors.ink} strokeWidth={1} fill="none" strokeLinecap="round" />
        <Path d="M 41 55 L 44 55" stroke={colors.ink} strokeWidth={1} strokeLinecap="round" />
        {/* Arm raised */}
        <Path d="M 64 56 Q 60 50 64 44" stroke={colors.purple3} strokeWidth={3} fill="none" strokeLinecap="round" />
        {/* Feet */}
        <Circle cx={98} cy={56} r={3} fill={colors.purple3} />
        <Circle cx={102} cy={54} r={3} fill={colors.purple3} />
        {/* Bubbles */}
        <Circle cx={28} cy={78} r={2.5} fill={colors.sky} opacity={0.6} />
        <Circle cx={36} cy={84} r={1.5} fill={colors.sky} opacity={0.5} />
        <Circle cx={104} cy={80} r={2} fill={colors.sky} opacity={0.6} />
        <Circle cx={112} cy={86} r={1.5} fill={colors.sky} opacity={0.5} />
        <Circle cx={68} cy={84} r={1.2} fill={colors.sky} opacity={0.5} />
        {/* Sparkles — accent + pop per id */}
        <Path d="M 22 30 L 24 34 L 28 36 L 24 38 L 22 42 L 20 38 L 16 36 L 20 34 Z" fill={v.accent} />
        <Path d="M 116 28 L 118 32 L 122 34 L 118 36 L 116 40 L 114 36 L 110 34 L 114 32 Z" fill={v.pop} />
        <Circle cx={114} cy={48} r={1.5} fill={v.pop} />
      </Svg>
    );

    default: return (
      <Svg width="100%" height="100%" viewBox="0 0 140 100" opacity={opacity}>
        {Backdrop}
        <Circle cx={70} cy={50} r={20} fill={colors.purple} />
      </Svg>
    );
  }
}

// ── Achievement-tile colored emoji badge (QuitNow-style) ──────────────────────
function QsAchBadge({ icon, color, locked }: { icon: string; color: string; locked: boolean }) {
  return (
    <View
      style={[
        m.qsAchTileBadge,
        locked
          ? { backgroundColor: colors.layer2, borderColor: colors.line2 }
          : { backgroundColor: color + '22', borderColor: color + '55' },
      ]}
    >
      <Text style={[m.qsAchTileIcon, locked && { opacity: 0.35 }]}>{icon}</Text>
    </View>
  );
}

// ── Unified achievement model ────────────────────────────────────────────────
// Merges time + cigarettes + money + life-regained into a single typed list so
// the UI can show one chronologically-ordered stream (no tabs, no category breakdown).
type QsAchType = 'time' | 'cigs' | 'money' | 'life';
interface QsAchievement {
  id:        string;        // type-prefixed (t_…, c_…, m_…, l_…) to avoid collisions
  type:      QsAchType;
  threshold: number;        // hours | cigs avoided | dollars saved | life-hours (varies by type)
  icon:      string;        // emoji for the legacy small badge (horizontal scroll)
  illo:      string;        // Dagnara SVG illustration kind (rocket | calendar | trophy | …)
  title:     string;
  desc:      string;
}

// Average life lost per cigarette, in minutes (CDC estimate).
const MIN_PER_CIG = 11;

/** Combine all four source arrays into one unified list. */
function buildAchList(): QsAchievement[] {
  return [
    ...QS_ACHIEVEMENTS.map<QsAchievement>(a => ({
      id: `t_${a.id}`, type: 'time', threshold: a.hours,
      icon: a.icon, illo: a.illo, title: a.title, desc: a.desc,
    })),
    ...QS_CIG_ACHIEVEMENTS.map<QsAchievement>(a => ({
      id: `c_${a.id}`, type: 'cigs', threshold: a.cigs,
      icon: a.icon, illo: a.illo, title: a.title, desc: a.desc,
    })),
    ...QS_MONEY_ACHIEVEMENTS.map<QsAchievement>(a => ({
      id: `m_${a.id}`, type: 'money', threshold: a.money,
      icon: a.icon, illo: a.illo, title: a.title, desc: a.desc,
    })),
    ...QS_LIFE_ACHIEVEMENTS.map<QsAchievement>(a => ({
      id: `l_${a.id}`, type: 'life', threshold: a.lifeHours,
      icon: a.icon, illo: a.illo, title: a.title, desc: a.desc,
    })),
  ];
}

/** Estimated hours-to-unlock — used to chronologically sort across all types. */
function estimateAchHours(
  a: QsAchievement, cigsPerDay: number, cigsPerPack: number, costPerPack: number,
): number {
  if (a.type === 'time')  return a.threshold;
  if (a.type === 'cigs')  return cigsPerDay > 0 ? (a.threshold * 24) / cigsPerDay : Infinity;
  if (a.type === 'life') {
    // life-hours → cigs needed → real hours of abstinence
    const cigsNeeded = (a.threshold * 60) / MIN_PER_CIG;
    return cigsPerDay > 0 ? (cigsNeeded * 24) / cigsPerDay : Infinity;
  }
  // money → cigs equivalent → hours
  const moneyPerCig = cigsPerPack > 0 ? (costPerPack / cigsPerPack) : 0;
  if (moneyPerCig <= 0 || cigsPerDay <= 0) return Infinity;
  const cigs = a.threshold / moneyPerCig;
  return (cigs * 24) / cigsPerDay;
}

/** Unlock check against current totals. */
function isAchUnlocked(
  a: QsAchievement, hours: number, cigsAvoided: number, moneySaved: number,
): boolean {
  if (a.type === 'time')  return hours       >= a.threshold;
  if (a.type === 'cigs')  return cigsAvoided >= a.threshold;
  if (a.type === 'life')  return (cigsAvoided * MIN_PER_CIG) / 60 >= a.threshold;
  return moneySaved >= a.threshold;
}

/** Date the achievement was earned (estimated from the user's setup). null if locked. */
function unlockedAchAt(
  a: QsAchievement, quitISO: string, cpd: number, cip: number, cpp: number,
): Date | null {
  const est = estimateAchHours(a, cpd, cip, cpp);
  if (!isFinite(est)) return null;
  const t = new Date(quitISO).getTime() + est * 3600_000;
  if (t > Date.now()) return null;
  return new Date(t);
}

/** Sentence-form stat for the detail hero ("1 day without smoking"). */
function formatAchStat(a: QsAchievement, country: string = 'US', product: QsProduct = 'cigarettes'): string {
  const verb = product === 'cigarettes' ? 'smoking'
             : product === 'vape'       ? 'vaping'
             : 'pouches';
  const unitPl = QS_PRODUCT_LABELS[product].unitPlural;
  if (a.type === 'time') {
    const h = a.threshold;
    const suffix = product === 'pouches' ? 'pouch-free' : `without ${verb}`;
    if (h < 1)    return `${Math.round(h * 60)} minutes ${suffix}`;
    if (h < 24)   return `${Math.round(h)} ${h === 1 ? 'hour' : 'hours'} ${suffix}`;
    if (h < 168)  { const d = Math.round(h / 24);   return `${d} ${d === 1 ? 'day'   : 'days'} ${suffix}`; }
    if (h < 720)  { const w = Math.round(h / 168);  return `${w} ${w === 1 ? 'week'  : 'weeks'} ${suffix}`; }
    if (h < 8760) { const mo = Math.round(h / 720); return `${mo} ${mo === 1 ? 'month' : 'months'} ${suffix}`; }
    const y = Math.round(h / 8760);
    return `${y} ${y === 1 ? 'year' : 'years'} ${suffix}`;
  }
  if (a.type === 'cigs')  return `${fmt(a.threshold)} ${unitPl} avoided`;
  if (a.type === 'life') {
    const h = a.threshold;
    if (h < 24)   return `${Math.round(h)} ${h === 1 ? 'hour' : 'hours'} of life regained`;
    if (h < 168)  { const d = Math.round(h / 24);   return `${d} ${d === 1 ? 'day'   : 'days'} of life regained`; }
    if (h < 720)  { const w = Math.round(h / 168);  return `${w} ${w === 1 ? 'week'  : 'weeks'} of life regained`; }
    if (h < 8760) { const mo = Math.round(h / 720); return `${mo} ${mo === 1 ? 'month' : 'months'} of life regained`; }
    const y = Math.round(h / 8760);
    return `${y} ${y === 1 ? 'year' : 'years'} of life regained`;
  }
  return `${formatMoneyFromUsd(a.threshold, country, 0)} saved`;
}

/** Per-type accent — drives the colored badge on tile + detail. */
function achColor(type: QsAchType): string {
  if (type === 'time')  return QS_CAT_COLORS.time;
  if (type === 'cigs')  return QS_CAT_COLORS.cigs;
  if (type === 'life')  return colors.green;
  return QS_CAT_COLORS.money;
}

// ── Beat Your Cravings — content data ────────────────────────────────────────
// Rotated daily; picked deterministically from local date so the "tip of the day"
// is stable for the whole day (no surprise change on re-open).
// IDs are stable across builds so liked/skipped prefs in storage survive reorders.
const QS_TIPS: { id: string; title: string; body: string }[] = [
  { id: 'wave',      title: 'Ride the wave', body: 'A craving peaks at 3–5 minutes and then fades. Set a timer, do anything else, and watch it pass.' },
  { id: 'water',     title: 'Drink a glass of water', body: 'Slow sips. It interrupts the hand-to-mouth habit and gives you something to do for two minutes.' },
  { id: 'walk',      title: 'Walk it off', body: 'Even a 5-minute walk drops the urge and floods your brain with the kind of dopamine smoking used to fake.' },
  { id: 'trigger',   title: 'Identify your trigger', body: 'Was it stress, coffee, a friend, boredom? Naming the trigger is half the battle the next time it shows up.' },
  { id: 'brush',     title: 'Brush your teeth', body: 'A clean mouth feels too good to ruin. Use it as a hard reset whenever a craving hits.' },
  { id: 'reach',     title: 'Reach out', body: 'Text one person who knows you’re quitting. A single "I’m struggling" is enough — you don’t have to be alone in this.' },
  { id: 'reward',    title: 'Reward yourself', body: 'Move the money you didn’t spend on cigarettes into a separate jar or savings goal. Watch it grow.' },
  { id: 'cold-chew', title: 'Chew something cold', body: 'Ice, frozen grapes, sugar-free gum. The sensation gives your mouth and hands a job.' },
  { id: 'breathe',   title: 'Breathe like you mean it', body: '4 in, 7 hold, 8 out. Three rounds. Your nervous system will think the craving already happened.' },
  { id: 'avoid',     title: 'Avoid the trigger today', body: 'It’s OK to skip the bar tonight. It’s OK to take a different route home. Early days deserve every shortcut.' },
  { id: 'protein',   title: 'Snack on protein', body: 'Nicotine spikes blood sugar. A small handful of nuts or a boiled egg keeps the crash from feeling like a craving.' },
  { id: 'visualize', title: 'Visualize the win', body: 'Picture yourself one year clean. Lungs lighter, wallet heavier, breath fresher. That person is the one you’re fighting for.' },
  { id: 'hands',     title: 'Move your hands', body: 'Doodle, stretch a rubber band, fold laundry. The hand-to-mouth ritual is half of why you reach for one.' },
  { id: 'sleep',     title: 'Sleep is everything', body: 'A bad night doubles cravings. Protect your 7–8 hours and you protect your quit.' },
  { id: 'replace',   title: 'Replace the routine', body: 'Coffee was a cue. Have it in a new mug, on a new chair, with a new podcast. Break the trigger pairing.' },
  { id: 'journal',   title: 'Write it down', body: 'A two-line note: "what triggered me, what I did instead." Three weeks of these and you’ll see your own playbook.' },
  { id: 'cold-blast',title: 'Cold shower or face splash', body: 'A 30-second cold blast resets your stress response and the craving with it.' },
  { id: 'why',       title: 'Re-read your why', body: 'Pin one sentence about why you quit. Open it whenever a craving hits. Your past self knows the way.' },
  { id: 'fruit',     title: 'Eat a piece of fruit', body: 'Apple, orange, anything crunchy or juicy. Sweet sensation without the sugar crash.' },
  { id: 'stretch',   title: 'Stretch for 60 seconds', body: 'Roll your shoulders, look up at the ceiling, open your chest. Smokers carry tension here — let it out.' },
  { id: 'alcohol',   title: 'Avoid alcohol early on', body: 'It lowers the guardrails. Pick mocktails for the first month and you’ll thank yourself.' },
  { id: 'forgive',   title: 'Forgive yourself fast', body: 'Slipped? It’s data, not a failure. The streak is the long game, not the perfection.' },
  { id: 'route',     title: 'Change your route', body: 'If you used to smoke on the walk to work, take a different street. Out of sight beats out of mind.' },
  { id: 'phone',     title: 'Phone a friend', body: 'Two minutes of a voice you love can shut down a craving faster than any willpower hack.' },
  { id: 'chore',     title: 'Do one chore', body: 'Wash a dish, fold a shirt, water a plant. Movement + completion beats sitting with the urge.' },
  { id: 'tea',       title: 'Hot tea or broth', body: 'Warm cups give your hands and mouth something to do for ten minutes — long enough for the wave to pass.' },
  { id: 'wins',      title: 'Note your wins', body: 'Open the achievements tab. You’ve done more than you think. Receipts beat doubt.' },
  { id: 'smell',     title: 'Smell something nice', body: 'Coffee, lemon peel, mint. A strong pleasant scent overrides the phantom tobacco craving.' },
  { id: 'read',      title: 'Read one page', body: 'A book, a chapter, a poem. Two minutes of attention elsewhere is enough to lose the urge.' },
  { id: 'plan',      title: 'Plan tomorrow', body: 'Write 3 things you’ll do tomorrow. Future-focus drains the craving of its emotional power.' },
];

// Major quit-smoking hotlines — country / region, number, short blurb. Free + confidential
// in their respective countries. Numbers double-checked Q1 2026.
// `code` is ISO 3166-1 alpha-2 — matches appStore `country` so we can surface the
// user's home country at the top of the list. Numbers verified against the
// national quitline website at time of writing; review yearly.
const QS_QUITLINES: { code: string; region: string; flag: string; number: string; hours: string; href: string }[] = [
  { code: 'US', region: 'United States',  flag: '🇺🇸', number: '1-800-QUIT-NOW',  hours: '8am – 11pm local',                              href: 'tel:18007848669' },
  { code: 'GB', region: 'United Kingdom', flag: '🇬🇧', number: '0300 123 1044',    hours: 'Mon–Fri 9am – 8pm · weekends 11am – 4pm',       href: 'tel:03001231044' },
  { code: 'CA', region: 'Canada',         flag: '🇨🇦', number: '1-866-366-3667',   hours: '24/7',                                          href: 'tel:18663663667' },
  { code: 'AU', region: 'Australia',      flag: '🇦🇺', number: '13 78 48',         hours: 'Mon–Fri 7am – 10:30pm · weekends 9am – 5pm',    href: 'tel:137848' },
  { code: 'IE', region: 'Ireland',        flag: '🇮🇪', number: '1800 201 203',     hours: 'Mon–Fri 10am – 5pm',                            href: 'tel:1800201203' },
  { code: 'NZ', region: 'New Zealand',    flag: '🇳🇿', number: '0800 778 778',     hours: '24/7',                                          href: 'tel:0800778778' },
  { code: 'FR', region: 'France',         flag: '🇫🇷', number: '39 89',            hours: 'Mon–Sat 8am – 8pm',                             href: 'tel:3989' },
  { code: 'ES', region: 'Spain',          flag: '🇪🇸', number: '900 100 444',      hours: 'Mon–Fri 9am – 5pm',                             href: 'tel:900100444' },
  { code: 'SE', region: 'Sweden',         flag: '🇸🇪', number: '020-84 00 00',     hours: 'Mon–Fri 9am – 8pm · weekends 10am – 4pm',       href: 'tel:+4620840000' },
  { code: 'DE', region: 'Germany',        flag: '🇩🇪', number: '0800 8 31 31 31',  hours: 'Mon–Thu 10am – 10pm · Fri–Sun 10am – 6pm',      href: 'tel:080083131310' },
  { code: 'NL', region: 'Netherlands',    flag: '🇳🇱', number: '0800-1995',        hours: 'Mon–Fri 9am – 5pm',                             href: 'tel:08001995' },
  { code: 'NO', region: 'Norway',         flag: '🇳🇴', number: '800 400 85',       hours: 'Mon–Fri 9am – 3pm',                             href: 'tel:80040085' },
  { code: 'DK', region: 'Denmark',        flag: '🇩🇰', number: '80 31 31 31',      hours: 'Mon–Thu 11am – 6pm · Fri 11am – 4pm',           href: 'tel:80313131' },
  { code: 'IT', region: 'Italy',          flag: '🇮🇹', number: '800 554088',       hours: 'Mon–Fri 10am – 4pm',                            href: 'tel:800554088' },
  { code: 'BE', region: 'Belgium',        flag: '🇧🇪', number: '0800 11 100',      hours: 'Mon–Fri 3pm – 7pm',                             href: 'tel:080011100' },
  { code: 'FI', region: 'Finland',        flag: '🇫🇮', number: '0800 148 484',     hours: 'Mon–Thu 9am – 6pm · Fri 9am – 4pm',             href: 'tel:0800148484' },
  { code: 'AT', region: 'Austria',        flag: '🇦🇹', number: '0800 810 013',     hours: 'Mon–Fri 10am – 6pm',                            href: 'tel:0800810013' },
  { code: 'CH', region: 'Switzerland',    flag: '🇨🇭', number: '0848 000 181',     hours: 'Mon–Fri 11am – 7pm',                            href: 'tel:0848000181' },
  { code: 'PT', region: 'Portugal',       flag: '🇵🇹', number: '808 208 888',      hours: 'Mon–Fri 9am – 7pm',                             href: 'tel:808208888' },
  { code: 'PL', region: 'Poland',         flag: '🇵🇱', number: '801 108 108',      hours: 'Mon–Fri 9am – 9pm · weekends 9am – 3pm',        href: 'tel:801108108' },
];

// Daily tip seed — same calendar day returns the same tip, rotation moves forward
// across the array each new day. Uses local date (yyyy-mm-dd) for seeding.
// If `prefs.skipped` includes the day's tip id, walk forward until we find one
// the user hasn't skipped — fall back to the original pick if every tip is skipped.
function pickDailyTip(prefs?: TipPrefs): { id: string; title: string; body: string } {
  const d = new Date();
  const dayIndex = Math.floor(
    (Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(2024, 0, 1)) / 86400000
  );
  const len = QS_TIPS.length;
  const start = ((dayIndex % len) + len) % len;
  const skipped = prefs?.skipped ?? [];
  if (skipped.length === 0 || skipped.length >= len) return QS_TIPS[start];
  for (let i = 0; i < len; i++) {
    const tip = QS_TIPS[(start + i) % len];
    if (!skipped.includes(tip.id)) return tip;
  }
  return QS_TIPS[start];
}

// ── Clean QuitNow-style illustrations ────────────────────────────────────────
// Flat shapes, no dark backdrop blob, single subject, dashed/dotted accent arc.
// Each art uses theme tokens only.

/** Meditating figure — hero illo for Beat Your Cravings + Calm Breathing. */
function MeditationArt({ size = 96 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 140 140">
      {/* Dotted halo arc — alternating yellow + purple dots around the figure */}
      {Array.from({ length: 11 }).map((_, i) => {
        // Arc from ~200° (left of figure) up over the top to ~-20° (right)
        const ang = (Math.PI * (200 - i * 22)) / 180;
        const r = 56;
        const cx = 70 + Math.cos(ang) * r;
        const cy = 80 + Math.sin(ang) * r;
        const big = i % 3 === 1;
        const fill = big ? colors.honey : (i % 3 === 0 ? colors.purple3 : colors.purple);
        return <Circle key={i} cx={cx} cy={cy} r={big ? 4 : 2.4} fill={fill} />;
      })}
      {/* Head */}
      <Circle cx={70} cy={56} r={11} fill={colors.honey} />
      {/* Hair cap — dark purple top */}
      <Path d="M 60 54 Q 62 42 70 42 Q 78 42 80 54 L 80 50 Q 75 47 70 47 Q 65 47 60 50 Z" fill={colors.purple} />
      {/* Bun on top */}
      <Circle cx={70} cy={42} r={4} fill={colors.purple} />
      {/* Body / torso (lotus pose triangle silhouette) */}
      <Path
        d="M 50 110 Q 70 70 90 110 Q 86 116 70 116 Q 54 116 50 110 Z"
        fill={colors.sky}
      />
      {/* Neck */}
      <Rect x={66} y={64} width={8} height={6} fill={colors.honey} />
      {/* Arms folded in lap — two soft bands */}
      <Path d="M 50 102 Q 70 92 90 102" stroke={colors.sky} strokeWidth={9} strokeLinecap="round" fill="none" />
      {/* Wrists / hands accent (warm highlight) */}
      <Circle cx={56} cy={104} r={4} fill={colors.honey} />
      <Circle cx={84} cy={104} r={4} fill={colors.honey} />
      {/* Crossed legs base */}
      <Path d="M 44 114 Q 70 122 96 114 L 92 122 Q 70 128 48 122 Z" fill={colors.purple3} />
    </Svg>
  );
}

/** Lightbulb — hero illo for Tip of the Day. */
function TipBulbArt({ size = 96 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 140 140">
      {/* Radiating sparkles (clean accent) */}
      <Circle cx={28} cy={40} r={3} fill={colors.honey} />
      <Circle cx={112} cy={36} r={2.4} fill={colors.purple3} />
      <Circle cx={22} cy={86} r={2.4} fill={colors.purple3} />
      <Circle cx={118} cy={84} r={3} fill={colors.honey} />
      <Path d="M 36 24 L 38 30 L 32 28 Z" fill={colors.honey} />
      <Path d="M 104 24 L 106 30 L 100 28 Z" fill={colors.purple3} />
      {/* Bulb glass — warm yellow */}
      <Path
        d="M 70 30 Q 50 30 46 52 Q 46 68 58 78 L 58 92 L 82 92 L 82 78 Q 94 68 94 52 Q 90 30 70 30 Z"
        fill={colors.honey}
      />
      {/* Highlight on bulb */}
      <Path d="M 58 44 Q 56 56 62 64" stroke={colors.white} strokeWidth={2.5} strokeOpacity={0.55} strokeLinecap="round" fill="none" />
      {/* Filament — small loops */}
      <Path d="M 60 60 Q 65 50 70 60 Q 75 70 80 60" stroke={colors.purple} strokeWidth={2} fill="none" strokeLinecap="round" />
      {/* Bulb base — metal screw */}
      <Rect x={58} y={92} width={24} height={5} rx={1.5} fill={colors.purple3} />
      <Rect x={59} y={98} width={22} height={4} rx={1.5} fill={colors.purple} />
      <Rect x={60} y={103} width={20} height={4} rx={1.5} fill={colors.purple3} />
      {/* Tip / contact point */}
      <Path d="M 64 110 L 76 110 L 73 116 L 67 116 Z" fill={colors.purple} />
    </Svg>
  );
}

/** Phone handset with sound waves — hero illo for Quit Lines. */
function QuitlinePhoneArt({ size = 96 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 140 140">
      {/* Outgoing sound waves — concentric arcs on the right */}
      <Path d="M 96 50 Q 110 70 96 90" stroke={colors.purple3} strokeWidth={3} fill="none" strokeLinecap="round" />
      <Path d="M 106 42 Q 124 70 106 98" stroke={colors.purple3} strokeWidth={3} fill="none" strokeLinecap="round" strokeOpacity={0.5} />
      {/* Decorative dots top-left */}
      <Circle cx={28} cy={38} r={3} fill={colors.honey} />
      <Circle cx={20} cy={50} r={2} fill={colors.purple3} />
      {/* Handset body — rounded rect tilted as a phone shape */}
      <Path
        d="M 36 96 Q 36 84 46 78 L 58 66 Q 64 60 70 66 L 78 74 Q 84 80 78 86 L 66 98 Q 60 104 54 98 L 50 94 Q 44 100 36 96 Z"
        fill={colors.sky}
      />
      {/* Earpiece dot */}
      <Circle cx={56} cy={70} r={3} fill={colors.honey} />
      {/* Mouthpiece dot */}
      <Circle cx={74} cy={88} r={3} fill={colors.honey} />
      {/* Highlight strip */}
      <Path d="M 46 84 Q 52 78 60 78" stroke={colors.white} strokeWidth={2} strokeOpacity={0.5} strokeLinecap="round" fill="none" />
    </Svg>
  );
}

/** Bar-chart insights — hero illo for the Patterns view. Five ascending purple
 *  bars on a clean baseline with a trending arrow that arcs up over them. The
 *  honey accent reads as the "peak / best" bar. Family-consistent with the
 *  other QuitNow-style art (dotted halo accents + flat fills, single subject). */
function PatternsArt({ size = 96 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 140 140">
      {/* Decorative halo dots — match TipBulbArt / MeditationArt rhythm */}
      <Circle cx={22} cy={36} r={2.8} fill={colors.honey} />
      <Circle cx={118} cy={32} r={2.2} fill={colors.purple3} />
      <Circle cx={20} cy={92} r={2.0} fill={colors.purple3} />
      <Circle cx={120} cy={96} r={2.6} fill={colors.honey} />
      <Path d="M 32 24 L 34 30 L 28 28 Z" fill={colors.honey} />
      <Path d="M 108 26 L 110 32 L 104 30 Z" fill={colors.purple3} />

      {/* Baseline — the chart floor */}
      <Rect x={26} y={108} width={88} height={2} rx={1} fill={colors.purple3} />
      <Circle cx={26} cy={109} r={2.2} fill={colors.purple3} />

      {/* Five ascending bars — left-to-right growth narrative; honey peak */}
      <Rect x={32}  y={92}  width={11} height={16} rx={2} fill={colors.purple2} />
      <Rect x={48}  y={78}  width={11} height={30} rx={2} fill={colors.purple2} />
      <Rect x={64}  y={64}  width={11} height={44} rx={2} fill={colors.purple} />
      <Rect x={80}  y={48}  width={11} height={60} rx={2} fill={colors.purple} />
      <Rect x={96}  y={38}  width={11} height={70} rx={2} fill={colors.honey} />

      {/* Bar highlights — a vertical specular line catches the light */}
      <Rect x={33}  y={94}  width={1.2} height={12} rx={0.6} fill={colors.white} opacity={0.45} />
      <Rect x={49}  y={80}  width={1.2} height={26} rx={0.6} fill={colors.white} opacity={0.45} />
      <Rect x={65}  y={66}  width={1.2} height={40} rx={0.6} fill={colors.white} opacity={0.42} />
      <Rect x={81}  y={50}  width={1.2} height={56} rx={0.6} fill={colors.white} opacity={0.4} />
      <Rect x={97}  y={40}  width={1.2} height={66} rx={0.6} fill={colors.white} opacity={0.6} />

      {/* Trend arc — confident upward sweep tying the bars together */}
      <Path
        d="M 37 98 Q 60 86 70 70 Q 82 50 101 36"
        stroke={colors.honey}
        strokeWidth={2.4}
        fill="none"
        strokeLinecap="round"
        strokeOpacity={0.9}
      />
      {/* Arrowhead at the apex of the trend */}
      <Polygon
        points="101,36 96,40 100,42"
        fill={colors.honey}
      />
      <Polygon
        points="101,36 105,41 100,42"
        fill={colors.honey}
      />

      {/* Data points — small dots crowning each bar */}
      <Circle cx={37.5}  cy={92} r={1.8} fill={colors.white} opacity={0.75} />
      <Circle cx={53.5}  cy={78} r={1.8} fill={colors.white} opacity={0.75} />
      <Circle cx={69.5}  cy={64} r={1.8} fill={colors.white} opacity={0.78} />
      <Circle cx={85.5}  cy={48} r={1.8} fill={colors.white} opacity={0.8} />
      <Circle cx={101.5} cy={38} r={2.2} fill={colors.white} />
    </Svg>
  );
}

// ── Achievement persistent trackers ──────────────────────────────────────────
// Moved outside components so they persist across modal opens/mounts.
// Seeding happens on first open; subsequent opens won't trigger historical popups.
const prevUnlockedRefGlobal = { current: null as Set<string> | null };
const prevQdUnlockedRefGlobal = { current: null as Set<string> | null };

// ── Quit Smoking Modal ────────────────────────────────────────────────────────
function QuitSmokingModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { email } = useAuthStore();
  const country = useAppStore((s) => s.country);
  const KEYS = makeKeys(email ?? 'anon');
  const [data, setData] = useState<QsData | null>(null);
  const [slips, setSlips] = useState<string[]>([]); // ISO timestamps of logged slips
  const [bestHours, setBestHours] = useState<number>(0); // personal-best streak in hours
  const [cravings, setCravings] = useState<Craving[]>([]); // every logged craving (won or lost)
  const [elapsed, setElapsed] = useState(0); // ms
  const intervalRef = useRef<any>(null);
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
  // Confetti overlay — fired when a new achievement unlocks (#6). We diff the
  // unlocked set against the previous render to detect "new this tick".
  const [unlockOverlayAch, setUnlockOverlayAch] = useState<QsAchievement | null>(null);
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
    if (!visible) { setQsView('main'); setSelectedAch(null); setReasonsEditing(false); setUnlockOverlayAch(null); }
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
    if (!data) { clearInterval(intervalRef.current); return; }
    function tick() {
      // Guard a corrupt persisted quitDate (NaN → 0) and clamp negatives so a
      // bad or future date can never produce negative stats.
      const t = new Date(data!.quitDate).getTime();
      setElapsed(Number.isFinite(t) ? Math.max(0, Date.now() - t) : 0);
    }
    tick();
    intervalRef.current = setInterval(tick, 1000);
    return () => clearInterval(intervalRef.current);
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

  // Latest unlocked achievement → drives "Health improvements" highlight card
  const latestUnlocked = data
    ? [...QS_ACHIEVEMENTS].reverse().find(a => hours >= a.hours) ?? null
    : null;

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
      prevUnlockedRefGlobal.current = unlockedNow;
      return;
    }
    const newly: QsAchievement[] = [];
    for (const a of achList) {
      if (unlockedNow.has(a.id) && !prev.has(a.id)) newly.push(a);
    }
    if (newly.length > 0) {
      // Pick the highest-tier (last in list) for the centerpiece animation
      const headliner = newly[newly.length - 1];
      setUnlockOverlayAch(headliner);
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
            <View style={m.sheetHeader}>
              <Text style={m.sheetTitle}>🚭 Quit Setup</Text>
              <TouchableOpacity onPress={() => (data ? setShowSetup(false) : onClose())}><Ionicons name="close" size={24} color={colors.ink3} /></TouchableOpacity>
            </View>
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
        {/* ── Header: back-arrow on detail views, X close on main ─────────── */}
        <View style={m.sheetHeader}>
          {qsView === 'main' ? (
            <>
              <Text style={m.sheetTitle}>🚭 Quit Smoking</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
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
                >
                  <Ionicons name="pencil" size={20} color={colors.ink2} />
                </TouchableOpacity>
                <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                  <Ionicons name="close" size={22} color={colors.ink2} />
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <>
              <TouchableOpacity
                onPress={() => {
                  // Detail-view back navigation:
                  //  • 'achievement'                       → achievements list
                  //  • tip / quitline / breathing          → cravings list
                  //  • anything else (progress, ach list,
                  //    health, cravings)                   → main
                  if (qsView === 'achievement') { setSelectedAch(null); setQsView('achievements'); }
                  else if (qsView === 'tip' || qsView === 'quitline' || qsView === 'breathing' || qsView === 'rescue' || qsView === 'patterns') setQsView('cravings');
                  else if (qsView === 'goal') setQsView('progress');
                  else { setReasonsEditing(false); setQsView('main'); }
                }}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <BackChevron
                  size={28}
                  color={colors.green}
                />
              </TouchableOpacity>
              <Text style={m.sheetTitle}>
                {qsView === 'progress'     && 'Overall progress'}
                {qsView === 'achievements' && 'Achievements'}
                {qsView === 'achievement'  && ''}
                {qsView === 'health'       && 'Health improvements'}
                {qsView === 'cravings'     && 'Beat your cravings'}
                {qsView === 'tip'          && 'Tip of the day'}
                {qsView === 'quitline'     && 'Quit lines'}
                {qsView === 'breathing'    && 'Calm breathing'}
                {qsView === 'reasons'      && 'My reasons'}
                {qsView === 'nrt'          && 'NRT log'}
                {qsView === 'rescue'       && 'Ride the wave'}
                {qsView === 'patterns'     && 'Your patterns'}
                {qsView === 'goal'         && 'Money-saved goal'}
              </Text>
              {qsView === 'health' ? (
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
              ) : (
                <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                  <Ionicons name="close" size={22} color={colors.ink2} />
                </TouchableOpacity>
              )}
            </>
          )}
        </View>

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
                // moneySaved is in USD — convert to display currency so the bar
                // compares like-for-like with the stored goal amount.
                const savedDisplay = moneyPer.year > 0
                  ? (moneySaved * (moneyPer.day / Math.max(0.0001, moneySaved * (data?.cigsPerDay ?? 0) / 365)))
                  : 0;
                // Simpler: moneyPer.day is display-currency per day. cumulative
                // saved in display currency = moneyPer.day × full days quit. We
                // already compute hours; use hours/24 for the day fraction.
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
            const maxHour     = Math.max(0, ...hourCounts);
            // Bucket the 24 hours into 6 four-hour slots for a readable histogram
            const slots: Array<{ label: string; count: number }> = [
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

        {/* ════════════════════════════════════════════════════════════════
            ACHIEVEMENT UNLOCK CELEBRATION — full-screen overlay fired by
            the newly-unlocked diff effect (#6). Tap anywhere to dismiss.
        ════════════════════════════════════════════════════════════════ */}
        {unlockOverlayAch && (
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
              setUnlockOverlayAch(null);
            }}
            style={[
              StyleSheet.absoluteFillObject,
              {
                backgroundColor: colors.bg + 'F2',
                alignItems: 'center',
                justifyContent: 'center',
                padding: spacing.xl,
                zIndex: 50,
              },
            ]}
          >
            {/* Confetti — scattered theme-coloured shards framing the card */}
            <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
              <Svg width="100%" height="100%" viewBox="0 0 100 170" preserveAspectRatio="xMidYMid slice">
                {Array.from({ length: 30 }).map((_, i) => {
                  const palette = [colors.honey, colors.purple2, colors.purple3, colors.green, colors.sky, colors.rose, colors.lavender];
                  const fill = palette[i % palette.length];
                  const x = (i * 67 + 11) % 100;
                  const y = (i * 41 + 7) % 170;
                  if (i % 4 === 0) {
                    return (
                      <Path
                        key={`cf-${i}`}
                        d={`M ${x} ${y - 2.6} L ${x + 0.8} ${y - 0.8} L ${x + 2.6} ${y} L ${x + 0.8} ${y + 0.8} L ${x} ${y + 2.6} L ${x - 0.8} ${y + 0.8} L ${x - 2.6} ${y} L ${x - 0.8} ${y - 0.8} Z`}
                        fill={fill}
                        opacity={0.9}
                      />
                    );
                  }
                  return (
                    <Rect
                      key={`cf-${i}`}
                      x={x}
                      y={y}
                      width={3.2}
                      height={1.9}
                      rx={0.5}
                      fill={fill}
                      opacity={0.92}
                      transform={`rotate(${(i * 57) % 360} ${x + 1.6} ${y + 0.95})`}
                    />
                  );
                })}
              </Svg>
            </View>

            {/* Celebration card */}
            <View
              style={{
                width: '100%',
                maxWidth: 320,
                backgroundColor: colors.layer3,
                borderWidth: 1,
                borderColor: colors.line3,
                borderRadius: radius.lg,
                paddingVertical: spacing.xl,
                paddingHorizontal: spacing.lg,
                alignItems: 'center',
                gap: spacing.sm,
                shadowColor: colors.purple,
                shadowOpacity: 0.45,
                shadowRadius: 30,
                shadowOffset: { width: 0, height: 14 },
                elevation: 16,
              }}
            >
              <Text
                style={{
                  fontSize: fontSize.xs,
                  fontWeight: '700',
                  letterSpacing: 1.4,
                  color: colors.honey,
                  textTransform: 'uppercase',
                }}
              >
                Achievement unlocked
              </Text>

              <View style={{ width: 200, height: 143, alignItems: 'center', justifyContent: 'center' }}>
                <QsIllo kind={unlockOverlayAch.illo} id={unlockOverlayAch.id} />
              </View>

              <Text style={{ fontSize: fontSize.lg, fontWeight: '800', color: colors.ink, textAlign: 'center' }}>
                {unlockOverlayAch.title}
              </Text>

              <Text style={{ fontSize: fontSize.sm, color: colors.ink2, textAlign: 'center' }}>
                {formatAchStat(unlockOverlayAch, country, data?.productType ?? 'cigarettes')}
              </Text>

              <View
                style={{
                  marginTop: spacing.sm,
                  backgroundColor: colors.line,
                  borderWidth: 1,
                  borderColor: colors.line2,
                  borderRadius: radius.pill,
                  paddingHorizontal: spacing.md,
                  paddingVertical: spacing.xs,
                }}
              >
                <Text style={{ fontSize: fontSize.xs, fontWeight: '700', color: colors.ink3, letterSpacing: 0.8 }}>
                  TAP TO CONTINUE
                </Text>
              </View>
            </View>
          </TouchableOpacity>
        )}
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
        <View style={m.sheetHeader}>
          <Text style={m.sheetTitle}>Log a craving</Text>
          <TouchableOpacity onPress={() => setCravingFormOpen(false)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="close" size={22} color={colors.ink2} />
          </TouchableOpacity>
        </View>
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
        <View style={m.sheetHeader}>
          <Text style={m.sheetTitle}>Log NRT</Text>
          <TouchableOpacity onPress={() => setNrtFormOpen(false)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="close" size={22} color={colors.ink2} />
          </TouchableOpacity>
        </View>
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

// ── Quit Drinking Modal ───────────────────────────────────────────────────────
function QuitDrinkingModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { email } = useAuthStore();
  const country = useAppStore((s) => s.country);
  const KEYS = makeKeys(email ?? 'anon');
  const [data, setData] = useState<QdData | null>(null);
  const [slips, setSlips] = useState<string[]>([]);
  const [bestHours, setBestHours] = useState<number>(0);
  const [elapsed, setElapsed] = useState(0);
  const intervalRef = useRef<any>(null);
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
  // Confetti unlock overlay — fired when a new achievement unlocks. We diff the
  // unlocked set across renders so historical unlocks don't carpet-bomb the user
  // when they reopen the modal. Mirrors the QS implementation exactly.
  const [unlockOverlayAch, setUnlockOverlayAch] = useState<typeof QD_ACHIEVEMENTS[number] | null>(null);
  const [isSettled, setIsSettled] = useState(false);

  // Scroll to top whenever we change views — same UX as the QS modal.
  useEffect(() => {
    qdScrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [qdView]);

  // Reset detail-view state any time the modal closes so the next open lands on
  // the main view — mirrors QS, prevents resuming half-finished reasons-editor.
  useEffect(() => {
    if (!visible) { setQdView('main'); setSelectedAch(null); setReasonsEditing(false); setUnlockOverlayAch(null); }
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
    if (!data) { clearInterval(intervalRef.current); return; }
    function tick() {
      // Guard a corrupt persisted quitDate (NaN → 0) and clamp negatives so a
      // bad or future date can never produce negative stats.
      const t = new Date(data!.quitDate).getTime();
      setElapsed(Number.isFinite(t) ? Math.max(0, Date.now() - t) : 0);
    }
    tick();
    intervalRef.current = setInterval(tick, 1000);
    return () => clearInterval(intervalRef.current);
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
      prevQdUnlockedRefGlobal.current = unlockedNow;
      return;
    }
    const newly: typeof QD_ACHIEVEMENTS[number][] = [];
    for (const a of QD_ACHIEVEMENTS) {
      if (unlockedNow.has(String(a.hours)) && !prev.has(String(a.hours))) newly.push(a);
    }
    if (newly.length > 0) {
      // Pick the highest-tier (last in list) for the centerpiece celebration
      const headliner = newly[newly.length - 1];
      setUnlockOverlayAch(headliner);
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
            <View style={m.sheetHeader}>
              <Text style={m.sheetTitle}>🍺 Quit Drinking Setup</Text>
              <TouchableOpacity onPress={() => (data ? setShowSetup(false) : onClose())}><Ionicons name="close" size={24} color={colors.ink3} /></TouchableOpacity>
            </View>
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
        {/* ── Header: edit + X on main; back-arrow + dynamic title on detail ── */}
        <View style={m.sheetHeader}>
          {qdView === 'main' ? (
            <>
              <Text style={m.sheetTitle}>🍺 Quit Drinking</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
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
                >
                  <Ionicons name="pencil" size={20} color={colors.ink2} />
                </TouchableOpacity>
                <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                  <Ionicons name="close" size={24} color={colors.ink3} />
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <>
              <TouchableOpacity
                onPress={() => {
                  // Detail-view back navigation mirrors QuitSmokingModal:
                  //  • 'achievement'                       → achievements list
                  //  • tip / quitline / breathing          → cravings list
                  //  • anything else                       → main
                  if (qdView === 'achievement') { setSelectedAch(null); setQdView('achievements'); }
                  else if (qdView === 'tip' || qdView === 'quitline' || qdView === 'breathing') setQdView('cravings');
                  else { setReasonsEditing(false); setQdView('main'); }
                }}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <BackChevron size={28} color={colors.green} />
              </TouchableOpacity>
              <Text style={m.sheetTitle}>
                {qdView === 'progress'     && 'Overall progress'}
                {qdView === 'achievements' && 'Achievements'}
                {qdView === 'achievement'  && ''}
                {qdView === 'health'       && 'Health improvements'}
                {qdView === 'cravings'     && 'Beat your cravings'}
                {qdView === 'tip'          && 'Tip of the day'}
                {qdView === 'quitline'     && 'Helplines'}
                {qdView === 'breathing'    && 'Calm breathing'}
                {qdView === 'reasons'      && 'My reasons'}
                {qdView === 'support'      && 'Recovery support'}
              </Text>
              <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                <Ionicons name="close" size={22} color={colors.ink2} />
              </TouchableOpacity>
            </>
          )}
        </View>
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

        {/* ════════════════════════════════════════════════════════════════
            ACHIEVEMENT UNLOCK CELEBRATION — full-screen overlay fired by
            the newly-unlocked diff effect. Tap anywhere to dismiss.
            Confetti + celebration card mirror QS exactly so the moment is
            identical between programs.
        ════════════════════════════════════════════════════════════════ */}
        {unlockOverlayAch && (
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
              setUnlockOverlayAch(null);
            }}
            style={[
              StyleSheet.absoluteFillObject,
              {
                backgroundColor: colors.bg + 'F2',
                alignItems: 'center',
                justifyContent: 'center',
                padding: spacing.xl,
                zIndex: 50,
              },
            ]}
          >
            {/* Confetti — scattered theme-coloured shards framing the card */}
            <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
              <Svg width="100%" height="100%" viewBox="0 0 100 170" preserveAspectRatio="xMidYMid slice">
                {Array.from({ length: 30 }).map((_, i) => {
                  const palette = [colors.honey, colors.purple2, colors.purple3, colors.green, colors.sky, colors.rose, colors.lavender];
                  const fill = palette[i % palette.length];
                  const x = (i * 67 + 11) % 100;
                  const y = (i * 41 + 7) % 170;
                  if (i % 4 === 0) {
                    return (
                      <Path
                        key={`qd-cf-${i}`}
                        d={`M ${x} ${y - 2.6} L ${x + 0.8} ${y - 0.8} L ${x + 2.6} ${y} L ${x + 0.8} ${y + 0.8} L ${x} ${y + 2.6} L ${x - 0.8} ${y + 0.8} L ${x - 2.6} ${y} L ${x - 0.8} ${y - 0.8} Z`}
                        fill={fill}
                        opacity={0.9}
                      />
                    );
                  }
                  return (
                    <Rect
                      key={`qd-cf-${i}`}
                      x={x}
                      y={y}
                      width={3.2}
                      height={1.9}
                      rx={0.5}
                      fill={fill}
                      opacity={0.92}
                      transform={`rotate(${(i * 57) % 360} ${x + 1.6} ${y + 0.95})`}
                    />
                  );
                })}
              </Svg>
            </View>

            {/* Celebration card */}
            <View
              style={{
                width: '100%',
                maxWidth: 320,
                backgroundColor: colors.layer3,
                borderWidth: 1,
                borderColor: colors.line3,
                borderRadius: radius.lg,
                paddingVertical: spacing.xl,
                paddingHorizontal: spacing.lg,
                alignItems: 'center',
                gap: spacing.sm,
                shadowColor: colors.purple,
                shadowOpacity: 0.45,
                shadowRadius: 30,
                shadowOffset: { width: 0, height: 14 },
                elevation: 16,
              }}
            >
              <Text
                style={{
                  fontSize: fontSize.xs,
                  fontWeight: '700',
                  letterSpacing: 1.4,
                  color: colors.honey,
                  textTransform: 'uppercase',
                }}
              >
                Achievement unlocked
              </Text>

              {/* Hero illo — same QsIllo SVG family as the QS overlay so the
                  unlock moment reads as the same trophy class the user will
                  later revisit on the achievement-detail page. 200x143 frame
                  matches the QS overlay exactly. */}
              <View style={{ width: 200, height: 143, alignItems: 'center', justifyContent: 'center' }}>
                <QsIllo kind={unlockOverlayAch.illo} id={unlockOverlayAch.id} />
              </View>

              <Text style={{ fontSize: fontSize.lg, fontWeight: '800', color: colors.ink, textAlign: 'center' }}>
                {unlockOverlayAch.title}
              </Text>

              <Text style={{ fontSize: fontSize.sm, color: colors.ink2, textAlign: 'center' }}>
                {unlockOverlayAch.desc}
              </Text>

              <View
                style={{
                  marginTop: spacing.sm,
                  backgroundColor: colors.line,
                  borderWidth: 1,
                  borderColor: colors.line2,
                  borderRadius: radius.pill,
                  paddingHorizontal: spacing.md,
                  paddingVertical: spacing.xs,
                }}
              >
                <Text style={{ fontSize: fontSize.xs, fontWeight: '700', color: colors.ink3, letterSpacing: 0.8 }}>
                  TAP TO CONTINUE
                </Text>
              </View>
            </View>
          </TouchableOpacity>
        )}
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
        <View style={m.sheetHeader}>
          <Text style={m.sheetTitle}>Log a craving</Text>
          <TouchableOpacity onPress={() => setCravingFormOpen(false)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="close" size={22} color={colors.ink2} />
          </TouchableOpacity>
        </View>
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

// ── Pill Reminder constants ───────────────────────────────────────────────────
const STATUS_BG: Record<string, string> = {
  taken:    colors.green  + '18',
  skipped:  colors.honey  + '18',
  overdue:  colors.rose   + '18',
  upcoming: colors.layer2,
};
const STATUS_COLOR: Record<string, string> = {
  taken:    colors.green,
  skipped:  colors.honey,
  overdue:  colors.rose,
  upcoming: colors.ink3,
};
const STATUS_ICON: Record<string, string> = {
  taken:    '✓',
  skipped:  '–',
  overdue:  '!',
  upcoming: '○',
};
const DURATION_PRESETS = [7, 14, 30, 90];
// 0=Mon, 1=Tue, 2=Wed, 3=Thu, 4=Fri, 5=Sat, 6=Sun (Apple Health convention)
const DOW_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

const DOSAGE_UNITS = ['tab', 'caps', 'mg', 'mcg', 'g', 'IU', 'mL', 'drops', 'spray', 'puff', 'patch'];

function fmtPresetTime(t: string): string {
  const [hStr, mStr = '00'] = t.split(':');
  const h = parseInt(hStr, 10);
  const suffix = h < 12 ? 'AM' : 'PM';
  const display = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${String(display).padStart(2, '0')}:${mStr.padStart(2, '0')} ${suffix}`;
}
function buildDosageStr(qty: number, unit: string): string {
  return `${fmtFlex(qty, 1)} ${unit}`;
}

// ── Pill Reminder Modal ───────────────────────────────────────────────────────
function PillReminderModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { email } = useAuthStore();
  const KEYS = makeKeys(email ?? 'anon');
  const [meds, setMeds] = useState<Medication[]>([]);
  const [log, setLog] = useState<PillLog>({});
  const [weekHistory, setWeekHistory] = useState<Record<string, PillLog>>({});
  // Add/Edit sheet
  const [editSheet, setEditSheet] = useState(false);
  const [editMed, setEditMed] = useState<Medication | null>(null);
  const [formName, setFormName] = useState('');
  const [formDosageQty, setFormDosageQty] = useState<number>(1);
  const [formDosageUnit, setFormDosageUnit] = useState<string>('tab');
  const [formNotes, setFormNotes] = useState('');
  const [formTimes, setFormTimes] = useState<string[]>(['08:00']);
  const [formColor, setFormColor] = useState(PILL_COLORS[0]);
  const [formDurationDays, setFormDurationDays] = useState('');
  const [formStartDate, setFormStartDate] = useState(todayKey());
  const [formDaysOfWeek, setFormDaysOfWeek] = useState<number[] | null>(null);
  // Clock picker
  const [clockVisible,  setClockVisible]  = useState(false);
  const [clockEditIdx,  setClockEditIdx]  = useState<number>(-1); // -1 = add new
  // Calendar picker (start date)
  const [startDateOpen, setStartDateOpen] = useState(false);

  const today = todayKey();

  // Last 7 days (oldest→newest), used for per-med history strips
  const weekKeys = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - i));
    return d.toLocaleDateString('en-CA');
  });

  useEffect(() => {
    if (!visible) return;
    Promise.all([
      AsyncStorage.getItem(KEYS.PILLS),
      AsyncStorage.getItem(KEYS.PILL_LOG(today)),
    ]).then(([medsRaw, logRaw]) => {
      let parsedMeds: Medication[] = [];
      if (medsRaw) {
        try { parsedMeds = JSON.parse(medsRaw); }
        catch { void AsyncStorage.removeItem(KEYS.PILLS); }
      }
      let parsedLog: PillLog = {};
      if (logRaw) {
        try { parsedLog = JSON.parse(logRaw); }
        catch { void AsyncStorage.removeItem(KEYS.PILL_LOG(today)); }
      }
      setMeds(parsedMeds);
      setLog(parsedLog);
    });
  }, [visible]);

  function saveMeds(updated: Medication[]) {
    setMeds(updated);
    AsyncStorage.setItem(KEYS.PILLS, JSON.stringify(updated));
    // Re-schedule push notifications for every med × time, respecting daysOfWeek
    void schedulePillReminders(
      updated.map(m => ({ id: m.id, name: m.name, dosage: m.dosage, times: m.times, daysOfWeek: m.daysOfWeek }))
    );
  }

  function saveLog(updated: PillLog) {
    setLog(updated);
    AsyncStorage.setItem(KEYS.PILL_LOG(today), JSON.stringify(updated));
  }

  function incrementDose(medId: string, totalTimes: number) {
    const entry = log[medId] ?? { takenCount: 0, takenTimes: [], skippedSlots: [] };
    if (entry.takenCount >= totalTimes) return;
    const updated: PillLog = {
      ...log,
      [medId]: {
        takenCount: entry.takenCount + 1,
        takenTimes: [...entry.takenTimes, new Date().toISOString()],
        skippedSlots: entry.skippedSlots ?? [],
      },
    };
    saveLog(updated);
  }

  function undoDose(medId: string) {
    const entry = log[medId];
    if (!entry || entry.takenCount === 0) return;
    const updated: PillLog = {
      ...log,
      [medId]: {
        takenCount: entry.takenCount - 1,
        takenTimes: entry.takenTimes.slice(0, -1),
        skippedSlots: entry.skippedSlots ?? [],
      },
    };
    saveLog(updated);
  }

  function skipSlot(medId: string, slotIdx: number) {
    const entry = log[medId] ?? { takenCount: 0, takenTimes: [], skippedSlots: [] };
    if ((entry.skippedSlots ?? []).includes(slotIdx)) return;
    const updated: PillLog = {
      ...log,
      [medId]: { ...entry, skippedSlots: [...(entry.skippedSlots ?? []), slotIdx] },
    };
    saveLog(updated);
  }

  function unskipSlot(medId: string, slotIdx: number) {
    const entry = log[medId];
    if (!entry) return;
    const updated: PillLog = {
      ...log,
      [medId]: { ...entry, skippedSlots: (entry.skippedSlots ?? []).filter(s => s !== slotIdx) },
    };
    saveLog(updated);
  }

  function deleteMed(medId: string) {
    Alert.alert('Remove Medication', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => saveMeds(meds.filter(m => m.id !== medId)) },
    ]);
  }

  function openAdd() {
    setEditMed(null);
    setFormName(''); setFormDosageQty(1); setFormDosageUnit('tab'); setFormNotes('');
    setFormTimes(['08:00']); setFormColor(PILL_COLORS[0]);
    setFormDurationDays(''); setFormStartDate(todayKey());
    setFormDaysOfWeek(null);
    setEditSheet(true);
  }

  function openEdit(med: Medication) {
    setEditMed(med);
    setFormName(med.name);
    setFormDosageQty(med.dosageQty ?? 1);
    setFormDosageUnit(med.dosageUnit ?? 'tab');
    setFormNotes(med.notes);
    setFormTimes(med.times.length ? med.times : ['08:00']); setFormColor(med.color);
    setFormDurationDays(med.durationDays != null ? String(med.durationDays) : '');
    setFormStartDate(med.startDate ?? todayKey());
    setFormDaysOfWeek(med.daysOfWeek ?? null);
    setEditSheet(true);
  }

  function saveMedForm() {
    if (!formName.trim()) { Alert.alert('Name required'); return; }
    const parsedDays = parseInt(formDurationDays, 10);
    const med: Medication = {
      id: editMed?.id ?? Date.now().toString(),
      name: formName.trim(),
      dosage: buildDosageStr(formDosageQty, formDosageUnit),
      dosageQty: formDosageQty,
      dosageUnit: formDosageUnit,
      times: formTimes.filter(t => t.trim()).sort(),
      color: formColor,
      notes: formNotes.trim(),
      durationDays: formDurationDays.trim() && parsedDays > 0 ? parsedDays : null,
      startDate: formStartDate || todayKey(),
      daysOfWeek: formDaysOfWeek,
    };
    const updated = editMed ? meds.map(x => x.id === editMed.id ? med : x) : [...meds, med];
    saveMeds(updated);
    setEditSheet(false);
  }

  function openClock(idx: number) {
    setClockEditIdx(idx);
    setClockVisible(true);
  }

  function handleClockConfirm(time: string) {
    if (clockEditIdx === -1) {
      setFormTimes(prev => [...prev, time].sort());
    } else {
      setFormTimes(prev => prev.map((t, i) => i === clockEditIdx ? time : t).sort());
    }
    setClockVisible(false);
  }

  function removeTime(i: number) {
    if (formTimes.length <= 1) return;
    setFormTimes(prev => prev.filter((_, idx) => idx !== i));
  }

  function toggleDow(day: number) {
    if (formDaysOfWeek === null) {
      // Currently every day → remove just this day
      setFormDaysOfWeek([0, 1, 2, 3, 4, 5, 6].filter(d => d !== day));
    } else {
      const next = formDaysOfWeek.includes(day)
        ? formDaysOfWeek.filter(d => d !== day)
        : [...formDaysOfWeek, day].sort((a, b) => a - b);
      // If all 7 selected, collapse back to null (every day)
      setFormDaysOfWeek(next.length === 0 ? [day] : next.length === 7 ? null : next);
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────

  function isScheduledToday(med: Medication): boolean {
    if (!med.daysOfWeek) return true;
    const jsDay = new Date().getDay(); // 0=Sun … 6=Sat
    const appleDay = jsDay === 0 ? 6 : jsDay - 1; // 0=Mon … 6=Sun
    return med.daysOfWeek.includes(appleDay);
  }

  function slotStatus(med: Medication, slotIdx: number): 'taken' | 'skipped' | 'overdue' | 'upcoming' {
    const entry = log[med.id] ?? { takenCount: 0, takenTimes: [], skippedSlots: [] };
    if (slotIdx < entry.takenCount) return 'taken';
    if ((entry.skippedSlots ?? []).includes(slotIdx)) return 'skipped';
    const [h, mins] = (med.times[slotIdx] ?? '00:00').split(':').map(Number);
    const slot = new Date(); slot.setHours(h, mins, 0, 0);
    return new Date() > slot ? 'overdue' : 'upcoming';
  }

  function getWeekDots(med: Medication): ('full' | 'partial' | 'missed' | 'today')[] {
    return weekKeys.map((key) => {
      const dayLog = key === today ? log : (weekHistory[key] ?? {});
      const takenCount = Math.min(dayLog[med.id]?.takenCount ?? 0, med.times.length);
      const total = med.times.length;
      if (key === today) {
        if (takenCount >= total && total > 0) return 'full';
        if (takenCount > 0) return 'partial';
        return 'today';
      }
      if (takenCount === 0) return 'missed';
      if (takenCount >= total) return 'full';
      return 'partial';
    });
  }

  // Streak calculation: consecutive days all meds fully taken
  async function calcStreak(): Promise<number> {
    if (meds.length === 0) return 0;
    let streak = 0;
    for (let i = 0; i < 365; i++) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const key = d.toLocaleDateString('en-CA');
      const raw = await AsyncStorage.getItem(KEYS.PILL_LOG(key));
      let dayLog: PillLog = {};
      if (raw) {
        try { dayLog = JSON.parse(raw); }
        catch { void AsyncStorage.removeItem(KEYS.PILL_LOG(key)); }
      }
      const allDone = meds.every(med => (dayLog[med.id]?.takenCount ?? 0) >= med.times.length);
      if (allDone) streak++; else break;
    }
    return streak;
  }

  // 30-day adherence + 7-day history per med
  const [adherence, setAdherence] = useState<number | null>(null);
  const [streak, setStreak] = useState(0);

  useEffect(() => {
    if (!visible || meds.length === 0) { setAdherence(null); setStreak(0); setWeekHistory({}); return; }
    (async () => {
      let taken = 0, total = 0;
      const wh: Record<string, PillLog> = {};
      for (let i = 0; i < 30; i++) {
        const d = new Date(); d.setDate(d.getDate() - i);
        const key = d.toLocaleDateString('en-CA');
        const raw = await AsyncStorage.getItem(KEYS.PILL_LOG(key));
        let dayLog: PillLog = {};
        if (raw) {
          try { dayLog = JSON.parse(raw); }
          catch { void AsyncStorage.removeItem(KEYS.PILL_LOG(key)); }
        }
        // Store past 6 days (not today) for the history strips
        if (i >= 1 && i <= 6) wh[key] = dayLog;
        meds.forEach(med => {
          total += med.times.length;
          taken += Math.min(dayLog[med.id]?.takenCount ?? 0, med.times.length);
        });
      }
      setAdherence(total > 0 ? Math.round((taken / total) * 100) : 100);
      setStreak(await calcStreak());
      setWeekHistory(wh);
    })();
  }, [visible, meds, log]);

  const allDoneToday = meds.length > 0 && meds.every(med => (log[med.id]?.takenCount ?? 0) >= med.times.length);

  const todayPct = meds.length === 0 ? 0 : Math.round(
    (meds.reduce((acc, med) => acc + Math.min((log[med.id]?.takenCount ?? 0) / Math.max(med.times.length, 1), 1), 0) / meds.length) * 100
  );
  const todayDoneCount = meds.filter(med => (log[med.id]?.takenCount ?? 0) >= med.times.length).length;

  // SVG ring constants for today % ring
  const PR_R = 28;
  const PR_CIRC = 2 * Math.PI * PR_R;
  const prOffset = PR_CIRC * (1 - todayPct / 100);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={m.sheet} edges={['top', 'bottom']}>
        <View style={m.sheetHeader}>
          <Text style={m.sheetTitle}>💊 Pill Reminder</Text>
          <TouchableOpacity onPress={onClose}><Ionicons name="close" size={24} color={colors.ink3} /></TouchableOpacity>
        </View>

        {/* Add medication sheet */}
        <Modal visible={editSheet} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setEditSheet(false)}>
            <SafeAreaView style={m.sheet} edges={['top', 'bottom']}>
              <View style={m.sheetHeader}>
                <Text style={m.sheetTitle}>{editMed ? 'Edit Medication' : 'Add Medication'}</Text>
                <TouchableOpacity onPress={() => setEditSheet(false)}><Ionicons name="close" size={24} color={colors.ink3} /></TouchableOpacity>
              </View>
              <ScrollView
                contentContainerStyle={{ padding: spacing.md, gap: spacing.md }}
                automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
                keyboardShouldPersistTaps="handled"
              >
                <Text style={m.label}>Medication name *</Text>
                <TextInput
                  style={m.input}
                  value={formName}
                  onChangeText={setFormName}
                  placeholder="e.g. Vitamin D"
                  placeholderTextColor={colors.ink3}
                  returnKeyType="done"
                  onSubmitEditing={() => Keyboard.dismiss()}
                />

                <Text style={m.label}>Amount per dose</Text>
                {/* Quantity stepper */}
                <View style={m.doseStepperRow}>
                  <TouchableOpacity
                    style={m.doseStepBtn}
                    onPress={() => setFormDosageQty(q => Math.max(0.5, +(q - (q > 1 ? 1 : 0.5)).toFixed(1)))}
                  >
                    <Text style={m.doseStepBtnTxt}>−</Text>
                  </TouchableOpacity>
                  <Text style={m.doseStepVal}>{fmtFlex(formDosageQty, 1)}</Text>
                  <TouchableOpacity
                    style={m.doseStepBtn}
                    onPress={() => setFormDosageQty(q => Math.min(20, +(q + (q >= 1 ? 1 : 0.5)).toFixed(1)))}
                  >
                    <Text style={m.doseStepBtnTxt}>+</Text>
                  </TouchableOpacity>
                </View>
                {/* Unit chips */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.xs }}>
                  {DOSAGE_UNITS.map((u) => {
                    const sel = formDosageUnit === u;
                    return (
                      <TouchableOpacity
                        key={u}
                        style={[m.unitChip, sel && { backgroundColor: colors.purpleTint, borderColor: colors.line3 }]}
                        onPress={() => setFormDosageUnit(u)}
                      >
                        <Text style={[m.unitChipTxt, sel && { color: colors.purple }]}>{u}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
                <Text style={{ fontSize: fontSize.xs, color: colors.ink3, textAlign: 'center' }}>
                  Take {buildDosageStr(formDosageQty, formDosageUnit)} per dose
                </Text>

                <Text style={m.label}>Reminder times</Text>
                {/* Selected time chips — tap to edit, × to remove */}
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
                  {formTimes.map((t, i) => (
                    <View key={`${t}-${i}`} style={m.timeChip}>
                      <TouchableOpacity onPress={() => openClock(i)} style={{ flex: 1 }}>
                        <Text style={m.timeChipTxt} numberOfLines={1}>{fmtPresetTime(t)}</Text>
                      </TouchableOpacity>
                      {formTimes.length > 1 && (
                        <TouchableOpacity onPress={() => removeTime(i)} style={{ paddingLeft: spacing.xs }}>
                          <Text style={m.timeChipX}>×</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  ))}
                  {/* Add another time */}
                  <TouchableOpacity style={m.timeAddBtn} onPress={() => openClock(-1)}>
                    <Text style={m.timeAddBtnTxt}>+ Add time</Text>
                  </TouchableOpacity>
                </View>

                <Text style={m.label}>Schedule (days of week)</Text>
                <View style={m.dowRow}>
                  {DOW_LABELS.map((lbl, i) => {
                    const active = formDaysOfWeek === null || formDaysOfWeek.includes(i);
                    return (
                      <TouchableOpacity
                        key={i}
                        style={[m.dowBtn, active && { backgroundColor: colors.purple, borderColor: colors.purple }]}
                        onPress={() => toggleDow(i)}
                      >
                        <Text style={[m.dowBtnTxt, active && { color: colors.white }]}>{lbl}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                {formDaysOfWeek !== null && formDaysOfWeek.length < 7 && (
                  <TouchableOpacity onPress={() => setFormDaysOfWeek(null)}>
                    <Text style={{ fontSize: fontSize.xs, color: colors.purple, textAlign: 'center' }}>Tap to reset to every day</Text>
                  </TouchableOpacity>
                )}

                <Text style={m.label}>Duration</Text>
                <View style={m.durationRow}>
                  {DURATION_PRESETS.map((d) => {
                    const sel = formDurationDays === String(d);
                    return (
                      <TouchableOpacity
                        key={d}
                        style={[m.durationChip, sel && { backgroundColor: colors.purpleTint, borderColor: colors.line3 }]}
                        onPress={() => setFormDurationDays(sel ? '' : String(d))}
                      >
                        <Text style={[m.durationChipTxt, sel && { color: colors.purple }]}>{d}d</Text>
                      </TouchableOpacity>
                    );
                  })}
                  <TouchableOpacity
                    style={[m.durationChip, !formDurationDays && { backgroundColor: colors.purpleTint, borderColor: colors.line3 }]}
                    onPress={() => setFormDurationDays('')}
                  >
                    <Text style={[m.durationChipTxt, !formDurationDays && { color: colors.purple }]}>Ongoing</Text>
                  </TouchableOpacity>
                </View>
                {!!formDurationDays && (
                  <>
                    <Text style={{ fontSize: fontSize.xs, color: colors.teal }}>
                      📅 {parseInt(formDurationDays, 10) || 0}-day course
                    </Text>
                    <Text style={m.label}>Start date</Text>
                    <TouchableOpacity
                      style={[m.input, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}
                      onPress={() => {
                        Keyboard.dismiss();
                        setStartDateOpen(true);
                      }}
                      activeOpacity={0.7}
                    >
                      <Text style={{ color: formStartDate ? colors.ink : colors.ink3, fontSize: fontSize.base }}>
                        {formStartDate ? fmtFriendlyDate(formStartDate) : 'Pick a date'}
                      </Text>
                      <Ionicons name="calendar-outline" size={18} color={colors.ink3} />
                    </TouchableOpacity>
                  </>
                )}

                <Text style={m.label}>Color</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
                  {PILL_COLORS.map((c) => (
                    <TouchableOpacity key={c} onPress={() => setFormColor(c)}>
                      <View style={[m.colorDot, { backgroundColor: c, borderWidth: formColor === c ? 3 : 0, borderColor: colors.white }]} />
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={m.label}>Notes</Text>
                <TextInput
                  style={[m.input, { minHeight: 60, textAlignVertical: 'top' }]}
                  value={formNotes}
                  onChangeText={setFormNotes}
                  placeholder="e.g. Take with food"
                  placeholderTextColor={colors.ink3}
                  multiline
                />
                <TouchableOpacity style={m.primaryBtn} activeOpacity={0.85} onPress={saveMedForm}>
                  <LinearGradient colors={[colors.purple, colors.purpleGlow]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={m.primaryBtnGrad}>
                    <Text style={m.primaryBtnTxt}>{editMed ? 'Save Changes' : 'Add Medication'}</Text>
                  </LinearGradient>
                </TouchableOpacity>
                <View style={{ height: spacing.lg }} />
              </ScrollView>

              {/* Clock time picker — rendered inside editSheet so it stacks above pageSheet */}
              <ClockPickerModal
                visible={clockVisible}
                initial={clockEditIdx === -1 ? '08:00' : (formTimes[clockEditIdx] ?? '08:00')}
                label="SET REMINDER TIME"
                onConfirm={handleClockConfirm}
                onClose={() => setClockVisible(false)}
              />

              {/* Calendar picker for start date */}
              <CalendarPickerModal
                visible={startDateOpen}
                initial={formStartDate || todayKey()}
                label="PICK START DATE"
                onConfirm={(d) => {
                  setFormStartDate(d);
                  setStartDateOpen(false);
                }}
                onClose={() => setStartDateOpen(false)}
              />
            </SafeAreaView>
        </Modal>

        <ScrollView contentContainerStyle={{ padding: spacing.md, gap: spacing.md }} showsVerticalScrollIndicator={false}>
          {/* Today's overall completion */}
          {meds.length > 0 && (
            <>
              <View style={m.todayCard}>
                <View style={{ flex: 1, gap: spacing.xs }}>
                  <Text style={m.todaySectionLbl}>TODAY'S COMPLETION</Text>
                  <Text style={[m.todayPctBig, { color: allDoneToday ? colors.green : colors.purple }]}>
                    {todayPct}%
                  </Text>
                  <Text style={m.todaySub}>
                    {allDoneToday
                      ? '🎉 All medications taken!'
                      : `${todayDoneCount} of ${meds.length} medications done`}
                  </Text>
                  {/* Day progress bar */}
                  <View style={m.todayBarBg}>
                    <View style={[m.todayBarFill, {
                      width: `${todayPct}%` as any,
                      backgroundColor: allDoneToday ? colors.green : colors.purple,
                    }]} />
                  </View>
                </View>
                {/* SVG ring */}
                <View style={m.todayRingWrap}>
                  <Svg width={72} height={72}>
                    <Circle cx={36} cy={36} r={PR_R} stroke={colors.layer3} strokeWidth={6} fill="none" />
                    <Circle
                      cx={36} cy={36} r={PR_R}
                      stroke={allDoneToday ? colors.green : colors.purple}
                      strokeWidth={6} fill="none"
                      strokeDasharray={PR_CIRC}
                      strokeDashoffset={prOffset}
                      strokeLinecap="round"
                      rotation="-90"
                      origin="36,36"
                    />
                  </Svg>
                  <Text style={[m.todayRingPct, { color: allDoneToday ? colors.green : colors.purple }]}>
                    {todayPct}%
                  </Text>
                </View>
              </View>
              {/* Streak + adherence mini-row */}
              <View style={m.statsRow}>
                <View style={m.statCard}>
                  <Text style={m.statVal}>{streak}</Text>
                  <Text style={m.statLbl}>day streak 🔥</Text>
                </View>
                <View style={m.statCard}>
                  <Text style={m.statVal}>{adherence !== null ? `${adherence}%` : '—'}</Text>
                  <Text style={m.statLbl}>30-day avg</Text>
                </View>
              </View>
            </>
          )}

          {meds.length === 0 && (
            <View style={m.emptyState}>
              <Text style={m.emptyIcon}>💊</Text>
              <Text style={m.emptyTitle}>No medications added</Text>
              <Text style={m.emptyDesc}>Add your first medication to start tracking</Text>
            </View>
          )}

          {/* Med cards */}
          {meds.map((med) => {
            const entry = log[med.id] ?? { takenCount: 0, takenTimes: [], skippedSlots: [] };
            const total = med.times.length;
            const taken = entry.takenCount;
            const scheduledToday = isScheduledToday(med);
            const hasOverdue = scheduledToday && med.times.some((_, i) => slotStatus(med, i) === 'overdue');
            const weekDots = getWeekDots(med);

            // Course progress
            const daysSinceStart = Math.floor((Date.now() - new Date(`${med.startDate ?? todayKey()}T12:00:00`).getTime()) / 86400000);
            const courseProgress = med.durationDays != null
              ? Math.min(1, (daysSinceStart + 1) / med.durationDays) : null;
            const daysRemaining = med.durationDays != null
              ? Math.max(0, med.durationDays - daysSinceStart - 1) : null;
            const courseComplete = med.durationDays != null && daysSinceStart + 1 >= med.durationDays;

            return (
              <View key={med.id} style={[m.medCard, !scheduledToday && { opacity: 0.6 }]}>
                {/* Header row */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                  <View style={[m.medDot, { backgroundColor: med.color }]} />
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexWrap: 'wrap' }}>
                      <Text style={m.medName}>{med.name}</Text>
                      {!scheduledToday && (
                        <View style={m.notTodayBadge}><Text style={m.notTodayBadgeTxt}>NOT TODAY</Text></View>
                      )}
                      {scheduledToday && hasOverdue && taken < total && (
                        <View style={m.overdueBadge}><Text style={m.overdueBadgeTxt}>OVERDUE</Text></View>
                      )}
                    </View>
                    {med.dosage ? <Text style={m.medDosage}>{med.dosage}</Text> : null}
                  </View>
                  <TouchableOpacity onPress={() => openEdit(med)} style={{ padding: spacing.xs }}>
                    <Ionicons name="pencil" size={16} color={colors.ink3} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => deleteMed(med.id)} style={{ padding: spacing.xs }}>
                    <Ionicons name="trash-outline" size={16} color={colors.rose} />
                  </TouchableOpacity>
                </View>

                {/* Dose slot bubbles (only when scheduled today) */}
                {scheduledToday && (
                  <View style={m.slotRow}>
                    {med.times.map((time, i) => {
                      const status = slotStatus(med, i);
                      const icon = STATUS_ICON[status] ?? '○';
                      return (
                        <View key={i} style={m.slotWrap}>
                          <TouchableOpacity
                            style={[m.slotBtn, {
                              backgroundColor: STATUS_BG[status],
                              borderColor: STATUS_COLOR[status] + '55',
                            }]}
                            onPress={() => {
                              if (status === 'taken') undoDose(med.id);
                              else if (status === 'skipped') unskipSlot(med.id, i);
                              else incrementDose(med.id, total);
                            }}
                            activeOpacity={0.7}
                          >
                            <Text style={[m.slotIcon, { color: STATUS_COLOR[status] }]}>{icon}</Text>
                            <Text style={[m.slotTime, { color: STATUS_COLOR[status] }]} numberOfLines={1}>{fmtPresetTime(time)}</Text>
                            <Text style={[m.slotDosage, { color: STATUS_COLOR[status] + 'cc' }]}>
                              {buildDosageStr(med.dosageQty ?? 1, med.dosageUnit ?? 'tab')}
                            </Text>
                          </TouchableOpacity>
                          {status === 'overdue' && (
                            <TouchableOpacity onPress={() => skipSlot(med.id, i)} style={m.skipBtn}>
                              <Text style={m.skipBtnTxt}>Skip</Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      );
                    })}
                  </View>
                )}

                {/* Course progress (only if durationDays set) */}
                {med.durationDays != null && (
                  <View style={m.courseSectionWrap}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs }}>
                      <Text style={m.doseSectionLbl}>COURSE</Text>
                      <Text style={[m.dayPctTxt, { color: courseComplete ? colors.green : colors.teal }]}>
                        {courseComplete ? '✓ Complete' : `${Math.round((courseProgress ?? 0) * 100)}%`}
                      </Text>
                    </View>
                    <View style={m.doseBar}>
                      <View style={[m.doseFill, {
                        width: `${Math.round((courseProgress ?? 0) * 100)}%` as any,
                        backgroundColor: courseComplete ? colors.green : colors.teal,
                      }]} />
                    </View>
                    <Text style={[m.doseTxt, { marginTop: spacing.xs }, courseComplete && { color: colors.green }]}>
                      {courseComplete
                        ? `${med.durationDays}-day course complete 🎉`
                        : `Day ${Math.min(daysSinceStart + 1, med.durationDays)} of ${med.durationDays}${daysRemaining != null && daysRemaining > 0 ? ` · ${daysRemaining} day${daysRemaining !== 1 ? 's' : ''} left` : ''}`}
                    </Text>
                  </View>
                )}

                {/* 7-day adherence history strip */}
                <View style={m.historyStrip}>
                  {weekDots.map((status, i) => {
                    const dotColor =
                      status === 'full'    ? colors.green :
                      status === 'partial' ? colors.honey :
                      status === 'today'   ? colors.purple + '44' :
                      colors.rose + '44';  // missed
                    const dayLabel = new Date(weekKeys[i] + 'T12:00:00')
                      .toLocaleDateString([], { weekday: 'narrow' });
                    const isToday = i === 6;
                    return (
                      <View key={i} style={m.historyDayWrap}>
                        <View style={[
                          m.historyDot,
                          { backgroundColor: dotColor },
                          isToday && { borderWidth: 1, borderColor: colors.purple + '66' },
                        ]} />
                        <Text style={[m.historyLbl, isToday && { color: colors.purple }]}>{dayLabel}</Text>
                      </View>
                    );
                  })}
                </View>

                {med.notes ? <Text style={m.medNotes}>{med.notes}</Text> : null}
              </View>
            );
          })}

          <TouchableOpacity style={m.primaryBtn} activeOpacity={0.85} onPress={openAdd}>
            <LinearGradient colors={[colors.purple, colors.purpleGlow]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={m.primaryBtnGrad}>
              <Text style={m.primaryBtnTxt}>+ Add Medication</Text>
            </LinearGradient>
          </TouchableOpacity>
          <View style={{ height: 24 }} />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

// ── Grocery Planner ───────────────────────────────────────────────────────────
const GROCERY_CATS = [
  { id: 'produce',  icon: '🥦', label: 'Produce' },
  { id: 'protein',  icon: '🥩', label: 'Proteins' },
  { id: 'dairy',    icon: '🧀', label: 'Dairy' },
  { id: 'grains',   icon: '🌾', label: 'Grains' },
  { id: 'frozen',   icon: '❄️', label: 'Frozen' },
  { id: 'drinks',   icon: '🧃', label: 'Drinks' },
  { id: 'snacks',   icon: '🍿', label: 'Snacks' },
  { id: 'other',    icon: '📦', label: 'Other' },
];

interface GroceryItem {
  id: string;
  name: string;
  qty: string;
  category: string;
  checked: boolean;
}

function GroceryModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { email } = useAuthStore();
  const GROCERY_KEY = groceryKey(email);

  const [items, setItems] = useState<GroceryItem[]>([]);
  const [history, setHistory] = useState<GroceryHistory>({});
  const [newName, setNewName] = useState('');
  const [newQty, setNewQty] = useState('');
  const [newCat, setNewCat] = useState('produce');
  const qtyInputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (!visible) return;
    AsyncStorage.getItem(GROCERY_KEY).then(raw => {
      if (!raw) return;
      try { setItems(JSON.parse(raw)); }
      catch { void AsyncStorage.removeItem(GROCERY_KEY); }
    });
    loadGroceryHistory(email).then(setHistory);
  }, [visible]);

  function save(next: GroceryItem[]) {
    setItems(next);
    AsyncStorage.setItem(GROCERY_KEY, JSON.stringify(next));
  }

  function addItem() {
    if (!newName.trim()) return;
    save([...items, { id: `${Date.now()}`, name: newName.trim(), qty: newQty.trim(), category: newCat, checked: false }]);
    setNewName('');
    setNewQty('');
  }

  /** One-tap add from frequent suggestions. */
  function addFromHistory(h: GroceryHistoryItem) {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    save([
      ...items,
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: h.name,
        qty: '',
        category: h.category || 'other',
        checked: false,
      },
    ]);
  }

  /** Toggle checked. On unchecked→checked transition, record the purchase. */
  function toggleCheck(item: GroceryItem) {
    const wasChecked = item.checked;
    save(items.map(i => (i.id === item.id ? { ...i, checked: !wasChecked } : i)));
    if (!wasChecked) {
      void recordGroceryPurchase(email, item.name, item.category).then(setHistory);
    }
  }

  const checkedCount = items.filter(i => i.checked).length;
  const pct = items.length > 0 ? checkedCount / items.length : 0;
  const grouped = GROCERY_CATS
    .map(cat => ({ ...cat, items: items.filter(i => i.category === cat.id) }))
    .filter(g => g.items.length > 0);

  // Frequent quick-add: top items by purchase count, hiding anything already on the list.
  const itemNamesLc = new Set(items.map(i => i.name.trim().toLowerCase()));
  const catIconMap: Record<string, string> = Object.fromEntries(GROCERY_CATS.map(c => [c.id, c.icon]));
  const frequent = pickFrequentItems(history, 12).filter(h => !itemNamesLc.has(h.name.toLowerCase()));
  const showFrequent = frequent.length > 0;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={m.sheet} edges={['top', 'bottom']}>
        {/* Header */}
        <View style={m.sheetHeader}>
          <TouchableOpacity onPress={onClose} style={{ padding: spacing.xs }}>
            <Ionicons name="chevron-down" size={22} color={colors.ink2} />
          </TouchableOpacity>
          <Text style={m.sheetTitle}>Grocery List</Text>
          <TouchableOpacity onPress={() => save(items.filter(i => !i.checked))} disabled={checkedCount === 0} style={{ padding: spacing.xs }}>
            <Text style={{ fontSize: fontSize.sm, fontWeight: '600', color: checkedCount > 0 ? colors.green : colors.ink3 }}>Clear done</Text>
          </TouchableOpacity>
        </View>

        {/* Progress */}
        {items.length > 0 && (
          <View style={{ paddingHorizontal: spacing.md, paddingTop: spacing.xs, paddingBottom: spacing.sm, gap: 5 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: fontSize.sm, color: colors.ink3 }}>
                <Text style={{ color: colors.green, fontWeight: '700' }}>{checkedCount}</Text>/{items.length} items
              </Text>
              <Text style={{ fontSize: fontSize.sm, fontWeight: '700', color: colors.green }}>{Math.round(pct * 100)}%</Text>
            </View>
            <View style={{ height: 6, backgroundColor: colors.layer2, borderRadius: radius.pill, overflow: 'hidden' }}>
              <View style={{ height: '100%', width: `${Math.round(pct * 100)}%` as any, backgroundColor: colors.green, borderRadius: radius.pill }} />
            </View>
          </View>
        )}

        {/* Frequent quick-adds — learned from past purchases (one-tap re-add). */}
        {showFrequent && (
          <View style={{ paddingHorizontal: spacing.md, paddingTop: spacing.xs, paddingBottom: spacing.sm, gap: spacing.xs }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
              <Ionicons name="sparkles" size={fontSize.xs} color={colors.lavender} />
              <Text style={{ fontSize: fontSize.xs, fontWeight: '700', color: colors.ink3, letterSpacing: 1.1, textTransform: 'uppercase' }}>Frequent</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <View style={{ flexDirection: 'row', gap: spacing.xs, paddingVertical: 2 }}>
                {frequent.map(h => (
                  <TouchableOpacity
                    key={h.name.toLowerCase()}
                    onPress={() => addFromHistory(h)}
                    activeOpacity={0.75}
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
                      paddingHorizontal: spacing.sm, paddingVertical: spacing.xs,
                      borderRadius: radius.pill, borderWidth: 1,
                      backgroundColor: colors.purpleTint, borderColor: colors.line3,
                    }}
                  >
                    <Text style={{ fontSize: fontSize.sm }}>{catIconMap[h.category] ?? '📦'}</Text>
                    <Text style={{ fontSize: fontSize.xs, fontWeight: '700', color: colors.lavender }}>{h.name}</Text>
                    <Ionicons name="add" size={fontSize.sm} color={colors.lavender} />
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </View>
        )}

        {/* Add item */}
        <View style={{ paddingHorizontal: spacing.md, paddingBottom: spacing.sm, gap: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.line }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}>
            <View style={{ flexDirection: 'row', gap: spacing.xs, paddingVertical: 2 }}>
              {GROCERY_CATS.map(cat => (
                <TouchableOpacity key={cat.id} onPress={() => setNewCat(cat.id)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radius.pill, borderWidth: 1, backgroundColor: newCat === cat.id ? colors.purpleTint : colors.layer2, borderColor: newCat === cat.id ? colors.line3 : colors.line2 }}>
                  <Text style={{ fontSize: fontSize.sm }}>{cat.icon}</Text>
                  <Text style={{ fontSize: fontSize.xs, fontWeight: '600', color: newCat === cat.id ? colors.lavender : colors.ink3 }}>{cat.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <TextInput
              style={{ flex: 1, backgroundColor: colors.layer2, borderWidth: 1, borderColor: colors.line2, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, color: colors.ink, fontSize: fontSize.base }}
              placeholder="Item name…"
              placeholderTextColor={colors.ink3}
              value={newName}
              onChangeText={setNewName}
              returnKeyType="next"
              blurOnSubmit={false}
              onSubmitEditing={() => qtyInputRef.current?.focus()}
            />
            <TextInput
              ref={qtyInputRef}
              style={{ width: 76, backgroundColor: colors.layer2, borderWidth: 1, borderColor: colors.line2, borderRadius: radius.md, paddingHorizontal: spacing.sm, paddingVertical: spacing.sm, color: colors.ink, fontSize: fontSize.base, textAlign: 'center' }}
              placeholder="Qty"
              placeholderTextColor={colors.ink3}
              value={newQty}
              onChangeText={setNewQty}
              returnKeyType="done"
              onSubmitEditing={addItem}
            />
            <TouchableOpacity onPress={addItem} disabled={!newName.trim()} style={{ borderRadius: radius.md, overflow: 'hidden' }}>
              <LinearGradient
                colors={!newName.trim() ? [colors.layer2, colors.layer2] : [colors.purple, colors.purpleGlow]}
                start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
                style={{ width: 48, height: 48, justifyContent: 'center', alignItems: 'center' }}>
                <Ionicons name="add" size={24} color={!newName.trim() ? colors.ink3 : colors.ink} />
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>

        {/* List */}
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing.md, gap: spacing.lg }} keyboardShouldPersistTaps="handled">
          {grouped.length === 0 && (
            <View style={{ alignItems: 'center', paddingTop: spacing.xl + spacing.xl, gap: spacing.md }}>
              <Text style={{ fontSize: fontSize.xl + fontSize.lg }}>🛒</Text>
              <Text style={{ color: colors.ink3, fontSize: fontSize.base, textAlign: 'center', lineHeight: 22 }}>
                Your list is empty{'\n'}{showFrequent ? 'Tap a frequent item or add your own' : 'Add your first item above'}
              </Text>
            </View>
          )}
          {grouped.map(group => (
            <View key={group.id} style={{ gap: spacing.xs }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingBottom: 4 }}>
                <Text style={{ fontSize: fontSize.sm }}>{group.icon}</Text>
                <Text style={{ fontSize: fontSize.xs, fontWeight: '700', color: colors.ink3, letterSpacing: 1.1, textTransform: 'uppercase' }}>{group.label}</Text>
              </View>
              {group.items.map(item => (
                <TouchableOpacity
                  key={item.id}
                  onPress={() => toggleCheck(item)}
                  activeOpacity={0.75}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: item.checked ? colors.layer1 : colors.layer2, borderWidth: 1, borderColor: item.checked ? colors.line : colors.line2, borderRadius: radius.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.md }}
                >
                  <View style={{ width: 24, height: 24, borderRadius: radius.pill, borderWidth: 2, borderColor: item.checked ? colors.green : colors.line3, backgroundColor: item.checked ? colors.green : colors.bg, alignItems: 'center', justifyContent: 'center' }}>
                    {item.checked && <Ionicons name="checkmark" size={fontSize.sm} color={colors.bg} />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: fontSize.base, fontWeight: '500', color: item.checked ? colors.ink3 : colors.ink, textDecorationLine: item.checked ? 'line-through' : 'none' }}>{item.name}</Text>
                    {!!item.qty && <Text style={{ fontSize: fontSize.xs, color: colors.ink3, marginTop: 1 }}>{item.qty}</Text>}
                  </View>
                  <TouchableOpacity onPress={() => save(items.filter(i => i.id !== item.id))} hitSlop={8} style={{ padding: spacing.xs }}>
                    <Ionicons name="close" size={fontSize.md} color={colors.ink3} />
                  </TouchableOpacity>
                </TouchableOpacity>
              ))}
            </View>
          ))}
          <View style={{ height: spacing.xl }} />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

// ── Apple-style row inside a grouped card ─────────────────────────────────────
type ProgramRowProps = {
  icon: string;
  name: string;
  description: string;
  color: string;
  isLast?: boolean;
  onPress: () => void;
};

function ProgramRow({ icon, name, description, color, isLast = false, onPress }: ProgramRowProps) {
  return (
    <TouchableOpacity
      style={[st.row, !isLast && st.rowDivider]}
      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onPress(); }}
      activeOpacity={0.55}
    >
      <View style={[st.iconWrap, { backgroundColor: color + '26' }]}>
        <Text style={st.progIcon}>{icon}</Text>
      </View>
      <View style={st.rowBody}>
        <Text style={st.rowTitle}>{name}</Text>
        <Text style={st.rowSubtitle} numberOfLines={2}>{description}</Text>
      </View>
      <Ionicons name="chevron-forward" size={17} color={colors.ink3} />
    </TouchableOpacity>
  );
}

// ── Main Programs Screen ──────────────────────────────────────────────────────
export default function ProgramsScreen() {
  const { setMessagesOpen, hasUnread } = useAppStore();
  const [qsVisible, setQsVisible] = useState(false);
  const [qdVisible, setQdVisible] = useState(false);
  const [pillVisible, setPillVisible] = useState(false);
  const [fastingVisible, setFastingVisible] = useState(false);
  const [groceryVisible, setGroceryVisible] = useState(false);

  return (
    <SafeAreaView style={st.safe} edges={['top']}>
      {/* App header — matches Diary / Recipes / Progress pattern */}
      <View style={st.appHeader}>
        <Text style={st.appTitle}>Programs</Text>
        <View style={st.headerRight}>
          <TouchableOpacity style={st.iconBtn} onPress={() => setMessagesOpen(true)}>
            <Ionicons name="notifications-outline" size={22} color={colors.ink2} />
            {hasUnread && <View style={st.notifDot} />}
          </TouchableOpacity>
          <TouchableOpacity style={st.iconBtn} onPress={() => router.push('/(tabs)/profile')}>
            <Ionicons name="person-outline" size={22} color={colors.ink2} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={st.scroll} showsVerticalScrollIndicator={false}>
        {/* HABITS TO BREAK */}
        <Text style={st.sectionLabel}>Habits to break</Text>
        <View style={st.group}>
          <ProgramRow
            icon="🚭" name="Quit Smoking"
            description="Track smoke-free days and savings"
            color={colors.rose}
            onPress={() => setQsVisible(true)}
          />
          <ProgramRow
            icon="🍺" name="Quit Drinking"
            description="Track alcohol-free days and benefits"
            color={colors.honey}
            isLast
            onPress={() => setQdVisible(true)}
          />
        </View>

        {/* TOOLS */}
        <Text style={st.sectionLabel}>Tools</Text>
        <View style={st.group}>
          <ProgramRow
            icon="⏱️" name="Intermittent Fasting"
            description="16:8, 18:6, 20:4, OMAD timer"
            color={colors.teal}
            onPress={() => setFastingVisible(true)}
          />
          <ProgramRow
            icon="🛒" name="Grocery Planner"
            description="Build your weekly shopping list"
            color={colors.green}
            isLast
            onPress={() => setGroceryVisible(true)}
          />
        </View>

        {/* REMINDERS */}
        <Text style={st.sectionLabel}>Reminders</Text>
        <View style={st.group}>
          <ProgramRow
            icon="💊" name="Pill Reminder"
            description="Daily medication reminders"
            color={colors.purple2}
            isLast
            onPress={() => setPillVisible(true)}
          />
        </View>

        <View style={{ height: spacing.xl }} />
      </ScrollView>

      <QuitSmokingModal  visible={qsVisible}      onClose={() => setQsVisible(false)} />
      <QuitDrinkingModal visible={qdVisible}      onClose={() => setQdVisible(false)} />
      <PillReminderModal visible={pillVisible}    onClose={() => setPillVisible(false)} />
      <FastingModal      visible={fastingVisible} onClose={() => setFastingVisible(false)} />
      <GroceryModal      visible={groceryVisible} onClose={() => setGroceryVisible(false)} />
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const st = StyleSheet.create({
  safe:      { flex: 1, backgroundColor: colors.bg },
  appHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  appTitle:  { fontSize: fontSize.xl, fontWeight: '800', color: colors.ink },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  iconBtn:   { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  notifDot:  { position: 'absolute', top: 8, right: 6, width: 6, height: 6, borderRadius: 3, backgroundColor: colors.rose },

  scroll:    { paddingHorizontal: spacing.md, paddingBottom: spacing.lg, paddingTop: spacing.sm },

  // Section labels (iOS Settings style)
  sectionLabel:   { fontSize: fontSize.xs, fontWeight: '700', color: colors.ink3, letterSpacing: 1.2, textTransform: 'uppercase', marginTop: spacing.lg, marginBottom: spacing.sm, marginLeft: spacing.sm },

  // iOS Settings-style grouped card
  group:          {
    backgroundColor: colors.layer1,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: 'hidden',
    ...(Platform.OS === 'ios' ? { borderCurve: 'continuous' as const } : null),
  },
  row:            { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.md, paddingVertical: spacing.md, minHeight: 64 },
  rowDivider:     { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },

  iconWrap:       {
    width: 40, height: 40,
    borderRadius: radius.sm,
    alignItems: 'center', justifyContent: 'center',
    ...(Platform.OS === 'ios' ? { borderCurve: 'continuous' as const } : null),
  },
  progIcon:       { fontSize: fontSize.lg },

  rowBody:        { flex: 1 },
  rowTitle:       { fontSize: fontSize.base, fontWeight: '600', color: colors.ink, letterSpacing: -0.2 },
  rowSubtitle:    { fontSize: fontSize.xs, color: colors.ink3, marginTop: 2, lineHeight: 16 },
});

// Modal shared styles
const m = StyleSheet.create({
  sheet:       { flex: 1, backgroundColor: colors.bg },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.line },
  sheetTitle:  { fontSize: fontSize.md, fontWeight: '700', color: colors.ink },

  timerCard:  { alignItems: 'center', backgroundColor: colors.layer1, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.line2 },
  timerLabel: { fontSize: fontSize.sm, color: colors.ink3 },
  timerValue: { fontSize: fontSize['2xl'], fontWeight: '800', color: colors.ink, marginVertical: 4, fontVariant: ['tabular-nums'] },
  timerSub:   { fontSize: fontSize.xs, color: colors.ink3 },

  statsRow:  { flexDirection: 'row', gap: spacing.sm },
  statCard:  { flex: 1, alignItems: 'center', backgroundColor: colors.layer1, borderRadius: radius.md, padding: spacing.sm, borderWidth: 1, borderColor: colors.line },
  statVal:   { fontSize: fontSize.md, fontWeight: '800', color: colors.ink },
  statLbl:   { fontSize: fontSize.xs, color: colors.ink3, marginTop: 2, textAlign: 'center' },

  sectionTitle: { fontSize: fontSize.sm, fontWeight: '700', color: colors.ink3, textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 4 },

  achieveRow:    { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.layer1, borderRadius: radius.md, padding: spacing.sm, borderWidth: 1, borderColor: colors.line },
  achieveLocked: { opacity: 0.55 },
  achieveIcon:   { fontSize: fontSize.lg + 2, width: 32, textAlign: 'center' },
  achieveTitle:  { fontSize: fontSize.sm, fontWeight: '700', color: colors.ink },
  achieveDesc:   { fontSize: fontSize.xs, color: colors.ink3, marginTop: 1 },

  milestoneRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  milestoneDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.layer3, borderWidth: 1, borderColor: colors.line },
  milestoneIcon:{ fontSize: fontSize.base + 1, width: 24, textAlign: 'center' },
  milestoneTxt: { fontSize: fontSize.xs, color: colors.ink2, flex: 1 },

  label:      { fontSize: fontSize.xs, color: colors.ink3, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  input:      { backgroundColor: colors.layer2, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.line2, color: colors.ink, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, fontSize: fontSize.sm },

  primaryBtn:    { borderRadius: radius.md, overflow: 'hidden' },
  primaryBtnGrad: { alignItems: 'center', paddingVertical: spacing.sm + 4 },
  primaryBtnTxt: { color: colors.white, fontWeight: '700', fontSize: fontSize.sm },
  dangerBtn:     { borderRadius: radius.md, alignItems: 'center', paddingVertical: spacing.sm + 2, backgroundColor: colors.rose + '1e', borderWidth: 1, borderColor: colors.rose + '40' },
  dangerBtnTxt:  { color: colors.rose, fontWeight: '600', fontSize: fontSize.sm },
  ghostBtn:      { borderRadius: radius.md, alignItems: 'center', paddingVertical: spacing.sm, backgroundColor: colors.layer1 },
  ghostBtnTxt:   { color: colors.ink2, fontSize: fontSize.sm },

  // Pill-specific
  medCard:   { backgroundColor: colors.layer1, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.line, gap: spacing.xs },
  medDot:    { width: 14, height: 14, borderRadius: 7 },
  medName:   { fontSize: fontSize.sm, fontWeight: '700', color: colors.ink },
  medDosage: { fontSize: fontSize.xs, color: colors.ink2, marginTop: 1 },
  medTimes:  { fontSize: fontSize.xs, color: colors.ink3, marginTop: 1 },
  medNotes:  { fontSize: fontSize.xs, color: colors.ink3, fontStyle: 'italic', marginTop: spacing.xs, paddingTop: spacing.xs, borderTopWidth: 1, borderTopColor: colors.line },
  doseBar:   { height: 7, backgroundColor: colors.layer2, borderRadius: radius.sm, overflow: 'hidden' },
  doseFill:  { height: '100%', borderRadius: radius.sm },
  doseTxt:   { fontSize: fontSize.xs, color: colors.ink3 },
  doseBtn:   { borderRadius: radius.sm, alignItems: 'center', paddingVertical: spacing.sm, borderWidth: 1 },
  doseBtnTxt:{ fontSize: fontSize.xs, fontWeight: '700' },
  undoBtn:   { backgroundColor: colors.layer2, borderRadius: radius.sm, paddingHorizontal: spacing.sm, justifyContent: 'center', borderWidth: 1, borderColor: colors.line2 },
  doseSectionWrap:  { backgroundColor: colors.layer2, borderRadius: radius.sm, padding: spacing.sm, gap: spacing.xs },
  courseSectionWrap:{ backgroundColor: colors.teal + '0e', borderRadius: radius.sm, padding: spacing.sm, gap: spacing.xs, borderWidth: 1, borderColor: colors.teal + '33' },
  doseSectionLbl:   { fontSize: fontSize.xs - 1, fontWeight: '700', color: colors.ink3, letterSpacing: 1.1, textTransform: 'uppercase' },
  dayPctTxt:        { fontSize: fontSize.sm, fontWeight: '800' },
  todayCard:        { backgroundColor: colors.layer1, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line2, padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  todaySectionLbl:  { fontSize: fontSize.xs - 1, fontWeight: '700', color: colors.ink3, letterSpacing: 1.1, textTransform: 'uppercase' },
  todayPctBig:      { fontSize: fontSize['2xl'] - 2, fontWeight: '800' },
  todaySub:         { fontSize: fontSize.xs, color: colors.ink2 },
  todayBarBg:       { height: 6, backgroundColor: colors.layer3, borderRadius: 3, overflow: 'hidden', marginTop: spacing.xs },
  todayBarFill:     { height: '100%', borderRadius: 3 },
  todayRingWrap:    { width: 72, height: 72, alignItems: 'center', justifyContent: 'center' },
  todayRingPct:     { position: 'absolute', fontSize: fontSize.xs + 1, fontWeight: '800' },
  colorDot:  { width: 28, height: 28, borderRadius: radius.pill },
  emptyState:{ alignItems: 'center', paddingVertical: spacing.xl, gap: spacing.xs + 2 },
  emptyIcon: { fontSize: fontSize['2xl'] + 10 },
  emptyTitle:{ fontSize: fontSize.md, fontWeight: '700', color: colors.ink },
  emptyDesc: { fontSize: fontSize.sm, color: colors.ink3, textAlign: 'center' },

  // ── Apple-style slot bubbles ──────────────────────────────────────────────
  slotRow:         { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs },
  slotWrap:        { alignItems: 'center', gap: spacing.xs },
  slotBtn:         { borderRadius: radius.sm, borderWidth: 1, alignItems: 'center', paddingVertical: spacing.xs, paddingHorizontal: spacing.sm, minWidth: 84 },
  slotIcon:        { fontSize: fontSize.sm, fontWeight: '800' },
  slotTime:        { fontSize: fontSize.xs, fontWeight: '600', marginTop: 2 },
  skipBtn:         { backgroundColor: colors.honey + '18', borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 2, borderWidth: 1, borderColor: colors.honey + '44' },
  skipBtnTxt:      { fontSize: fontSize.xs, color: colors.honey, fontWeight: '700' },

  // Badges
  overdueBadge:    { backgroundColor: colors.rose + '1e', borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 2, borderWidth: 1, borderColor: colors.rose + '40' },
  overdueBadgeTxt: { fontSize: fontSize.xs, fontWeight: '800', color: colors.rose, letterSpacing: 0.5 },
  notTodayBadge:   { backgroundColor: colors.line, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 2, borderWidth: 1, borderColor: colors.line2 },
  notTodayBadgeTxt:{ fontSize: fontSize.xs, fontWeight: '700', color: colors.ink3, letterSpacing: 0.4 },

  // 7-day history strip
  historyStrip:    { flexDirection: 'row', justifyContent: 'space-between', paddingTop: spacing.xs, borderTopWidth: 1, borderTopColor: colors.line, marginTop: spacing.xs },
  historyDayWrap:  { alignItems: 'center', gap: spacing.xs },
  historyDot:      { width: 9, height: 9, borderRadius: 5 },
  historyLbl:      { fontSize: fontSize.xs, color: colors.ink3 },

  // Days-of-week selector
  dowRow:          { flexDirection: 'row', gap: spacing.xs },
  dowBtn:          { flex: 1, alignItems: 'center', paddingVertical: spacing.xs, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.line2, backgroundColor: colors.layer2 },
  dowBtnTxt:       { fontSize: fontSize.xs, fontWeight: '700', color: colors.ink3 },

  // Duration preset chips
  durationRow:     { flexDirection: 'row', gap: spacing.xs },
  durationChip:    { flex: 1, alignItems: 'center', paddingVertical: spacing.xs, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.line2, backgroundColor: colors.layer2 },
  durationChipTxt: { fontSize: fontSize.xs, fontWeight: '700', color: colors.ink3 },

  // ── Dosage stepper ─────────────────────────────────────────────────────────
  doseStepperRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  doseStepBtn:     { width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.layer2, borderWidth: 1, borderColor: colors.line2, alignItems: 'center', justifyContent: 'center' },
  doseStepBtnTxt:  { fontSize: fontSize.xl, fontWeight: '700', color: colors.ink },
  doseStepVal:     { fontSize: fontSize.xl, fontWeight: '800', color: colors.ink, minWidth: 52, textAlign: 'center' },
  unitChip:        { paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.line2, backgroundColor: colors.layer2 },
  unitChipTxt:     { fontSize: fontSize.sm, fontWeight: '700', color: colors.ink3 },

  // ── Time chips (tap-to-edit) ──────────────────────────────────────────────────
  timeChip:        { flexDirection: 'row', alignItems: 'center', paddingLeft: spacing.sm, paddingRight: spacing.xs, paddingVertical: spacing.xs, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.purple + '55', backgroundColor: colors.purpleTint, minWidth: 100 },
  timeChipTxt:     { fontSize: fontSize.sm, fontWeight: '700', color: colors.purple, flex: 1, textAlign: 'center' },
  timeChipX:       { fontSize: fontSize.base, fontWeight: '700', color: colors.purple, lineHeight: fontSize.base + 2 },
  timeAddBtn:      { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.line2, backgroundColor: colors.layer2, justifyContent: 'center' },
  timeAddBtnTxt:   { fontSize: fontSize.xs, fontWeight: '700', color: colors.ink3 },

  // ── Slot dosage label ────────────────────────────────────────────────────────
  slotDosage:      { fontSize: fontSize.xs, fontWeight: '600', marginTop: 1 },

  // ── Quit Smoking — QuitNow-inspired layout ───────────────────────────────────
  qsHero: {
    alignItems: 'center',
    backgroundColor: colors.layer1,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line2,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    overflow: 'hidden',
    shadowColor: colors.purple,
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  qsHeroArt: {
    width: 124, height: 124,
    alignItems: 'center', justifyContent: 'center',
  },

  qsHeading:    { fontSize: fontSize.md, fontWeight: '800', color: colors.white, letterSpacing: -0.2 },

  qsProgCard:   { backgroundColor: colors.layer1, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line2, padding: spacing.md, gap: spacing.md },
  qsProgRow:    { flexDirection: 'row', justifyContent: 'space-between' },
  qsProgStat:   { alignItems: 'center', flex: 1, gap: 2 },
  qsProgCircle: { width: 50, height: 50, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  qsProgNum:    { fontSize: fontSize.md + 1, fontWeight: '800', color: colors.ink, marginTop: 6, fontVariant: ['tabular-nums'] },
  qsProgLbl:    { fontSize: fontSize.xs - 1, color: colors.ink3, textAlign: 'center', marginTop: 1, lineHeight: fontSize.xs + 3 },

  qsSectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  qsSeeAll:      { fontSize: fontSize.sm, fontWeight: '700', color: colors.purple },

  qsAchScroll:   { paddingVertical: spacing.xs, gap: spacing.sm, paddingRight: spacing.sm },
  qsAchTile:     {
    width: 140, minHeight: 150,
    borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.line2,
    backgroundColor: colors.layer1,
    alignItems: 'center', justifyContent: 'center',
    padding: spacing.sm, gap: spacing.xs,
    position: 'relative',
  },
  qsAchTileLocked: { opacity: 0.6, backgroundColor: colors.layer2 },
  qsAchTileBadge:  {
    width: 56, height: 56,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 2,
  },
  qsAchTileIcon:   { fontSize: fontSize['2xl'] },
  qsAchTileTitle:  { fontSize: fontSize.sm, fontWeight: '800', color: colors.ink, textAlign: 'center' },
  qsAchTileDesc:   { fontSize: fontSize.xs - 1, color: colors.ink3, textAlign: 'center', lineHeight: fontSize.xs + 3 },
  qsAchCheck:      {
    position: 'absolute', top: spacing.xs, right: spacing.xs,
    width: 22, height: 22, borderRadius: radius.pill,
    backgroundColor: colors.green,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: colors.layer1,
  },
  qsAchSub:        { fontSize: fontSize.xs, color: colors.ink3, marginTop: -spacing.xs, marginBottom: spacing.xs },

  // ── Achievements detail (2-col grid, QuitNow style) ─────────────────────────
  qsAchGrid2: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    justifyContent: 'space-between',
  },
  qsAchCard: {
    width: '48%',
    backgroundColor: colors.layer1,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line2,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    gap: spacing.xs,
    position: 'relative',
    minHeight: 200,
  },
  qsAchCardArt: {
    width: '100%',
    aspectRatio: 1.4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qsAchCardTitle: {
    fontSize: fontSize.sm,
    fontWeight: '800',
    color: colors.ink,
    textAlign: 'center',
    marginTop: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
  qsAchCardStat: {
    fontSize: fontSize.xs,
    color: colors.ink3,
    textAlign: 'center',
    lineHeight: fontSize.xs + 4,
    paddingHorizontal: spacing.xs,
  },
  qsAchCardSeal: {
    position: 'absolute',
    top: spacing.xs,
    right: spacing.xs,
  },

  qsHealthCard:    {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.layer1,
    borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.line2,
    padding: spacing.md,
  },
  qsHealthDesc: {
    fontSize: fontSize.sm,
    color: colors.ink,
    fontWeight: '600',
    lineHeight: fontSize.sm + 5,
  },

  // ── Overall Progress detail (compact QuitNow-style — plain titles, tight rows) ─
  qsDetailSectionTitle: {
    fontSize: fontSize.md,
    fontWeight: '800',
    color: colors.white,
    letterSpacing: -0.2,
    marginTop: 4,
    marginBottom: 0,
    lineHeight: fontSize.md + 2,
    includeFontPadding: false,
  },
  qsDetailRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 1,
    borderBottomWidth: 1, borderBottomColor: colors.line,
  },
  qsDetailRowLast:   { borderBottomWidth: 0 },
  qsDetailRowLbl:    { fontSize: fontSize.sm, color: colors.ink2, lineHeight: fontSize.sm + 2, includeFontPadding: false },
  qsDetailRowVal:    { fontSize: fontSize.sm, fontWeight: '800', color: colors.ink, fontVariant: ['tabular-nums'], lineHeight: fontSize.sm + 2, includeFontPadding: false },
  qsDetailArt:       { alignItems: 'center', justifyContent: 'center', marginTop: spacing.sm },

  // ── Achievement DETAIL view (QuitNow-style: floating illo + docked share)──
  // Hero illo — no card frame, sits directly on the modal bg. The QsIllo's
  // own internal Backdrop ellipse provides the "dark oval behind subject" look.
  qsAchDetailArt: {
    width: '100%',
    aspectRatio: 140 / 100,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.lg,
  },
  // Title + stat + date chip stack — tight typography below the hero.
  qsAchDetailTitleWrap: {
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  qsAchDetailTitle:   {
    fontSize: fontSize.xl, fontWeight: '800',
    color: colors.ink, textAlign: 'center',
    letterSpacing: -0.4,
  },
  qsAchDetailStat:    {
    fontSize: fontSize.base, color: colors.ink3,
    textAlign: 'center', fontWeight: '500',
  },
  // Borderless date chip — inline checkmark + timestamp, no bg/border.
  qsAchDetailDate: {
    flexDirection: 'row', alignItems: 'center',
    marginTop: spacing.sm,
  },
  qsAchDetailDateTxt: {
    fontSize: fontSize.sm, fontWeight: '700',
    color: colors.ink3,
    fontVariant: ['tabular-nums'],
  },

  // Locked state — subtle in-flow note (NO docked share bar in this case).
  qsAchDetailLockedNote: {
    backgroundColor: colors.layer1,
    borderRadius: radius.lg,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    gap: spacing.xs,
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  qsAchDetailLockedTitle: {
    fontSize: fontSize.lg, fontWeight: '800',
    color: colors.ink, textAlign: 'center',
  },
  qsAchDetailLockedSub:   {
    fontSize: fontSize.sm, color: colors.ink3,
    textAlign: 'center', lineHeight: fontSize.sm + 6,
  },

  // ── Docked share bar (sticky footer, outside ScrollView) ──────────────────
  // QuitNow-style bottom card: rounded rectangle pinned to screen bottom,
  // left-aligned title/subtitle on top, centered button row below.
  qsAchDetailDock: {
    backgroundColor: colors.layer1,
    borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.line2,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    gap: spacing.xs,
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    shadowColor: colors.purple,
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  qsAchDockTitle: {
    fontSize: fontSize.lg, fontWeight: '800',
    color: colors.ink, textAlign: 'left',
  },
  qsAchDockSub: {
    fontSize: fontSize.sm, color: colors.ink3,
    textAlign: 'left',
  },

  // Social share row — 5 circular brand-colored buttons, centered.
  qsAchSocialRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-evenly',
    width: '100%',
    marginTop: spacing.md,
  },
  qsAchSocialBtn: {
    width: 48, height: 48,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  qsAchSocialGrad: {
    width: '100%', height: '100%',
    alignItems: 'center', justifyContent: 'center',
  },
  qsAchSocialX: {
    color: colors.white,
    fontSize: fontSize.md, fontWeight: '900',
  },

  // ── Health improvements detail (QuitNow-style per-milestone rows) ─────────
  qsHealthList: { gap: spacing.sm2 },
  qsHealthRow: {
    gap: spacing.xs,
  },
  qsHealthBarRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  qsHealthPct: {
    fontSize: fontSize.sm,
    fontWeight: '800',
    minWidth: 32,
    textAlign: 'left',
    fontVariant: ['tabular-nums'],
  },
  qsHealthBarTrack: {
    flex: 1,
    height: 14,
    backgroundColor: colors.layer2,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  qsHealthBarFill: { height: '100%', borderRadius: radius.pill },
  qsHealthBarEnd: {
    fontSize: fontSize.sm,
    color: colors.ink3,
    fontWeight: '700',
    minWidth: 28,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  qsHealthBody: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingRight: spacing.xs,
  },
  qsHealthText: {
    flex: 1,
    fontSize: fontSize.base,
    color: colors.ink,
    lineHeight: 22,
  },
  qsHealthWhoBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    flexWrap: 'wrap',
  },
  qsHealthFootnote: {
    fontSize: fontSize.xs,
    color: colors.ink3,
    textAlign: 'center',
  },
  qsHealthHeartCount: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  qsHealthHeartCountTxt: {
    fontSize: fontSize.base,
    fontWeight: '800',
    color: colors.ink,
    fontVariant: ['tabular-nums'],
  },

  // ── Cravings list view (Tip / Quit lines / Calm breathing) ────────────────
  qsCravingsIntro: {
    fontSize: fontSize.sm,
    color: colors.ink3,
    lineHeight: fontSize.sm + 6,
    paddingHorizontal: spacing.xs,
    marginBottom: spacing.xs,
  },
  qsCravingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.layer1,
    borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.line2,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  qsCravingCardArt: {
    width: 88, height: 88,
    alignItems: 'center', justifyContent: 'center',
  },
  qsCravingCardTitle: {
    fontSize: fontSize.base,
    fontWeight: '800',
    color: colors.ink,
    marginBottom: 2,
  },
  qsCravingCardDesc: {
    fontSize: fontSize.sm,
    color: colors.ink3,
    lineHeight: fontSize.sm + 5,
  },

  // ── Craving 7-day summary strip (above the Log button) ────────────────────
  qsCravingSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: colors.layer1,
    borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.line2,
    paddingVertical: spacing.sm2,
    paddingHorizontal: spacing.sm,
  },
  qsCravingSummaryCell: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  qsCravingSummaryDiv: {
    width: 1,
    height: 28,
    backgroundColor: colors.line,
  },
  qsCravingSummaryVal: {
    fontSize: fontSize.lg,
    fontWeight: '800',
    color: colors.ink,
    fontVariant: ['tabular-nums'],
  },
  qsCravingSummaryLbl: {
    fontSize: fontSize.xs,
    color: colors.ink3,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    fontWeight: '700',
  },

  // ── "Log a craving" CTA ───────────────────────────────────────────────────
  qsCravingLogBtnWrap: {
    borderRadius: radius.md,
    overflow: 'hidden',
    shadowColor: colors.purple,
    shadowOpacity: 0.4,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  qsCravingLogBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm2,
  },
  qsCravingLogBtnTxt: {
    fontSize: fontSize.base,
    fontWeight: '800',
    color: colors.white,
    letterSpacing: 0.3,
  },

  // ── Craving form modal ────────────────────────────────────────────────────
  qsCravingFormLbl: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.ink3,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  qsCravingFormHint: {
    fontSize: fontSize.xs,
    color: colors.ink3,
    lineHeight: fontSize.xs + 4,
  },
  qsCravingIntensityRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  qsCravingIntensityCell: {
    width: 34,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
    borderWidth: 1, borderColor: colors.line2,
    backgroundColor: colors.layer2,
  },
  qsCravingIntensityNum: {
    fontSize: fontSize.base,
    fontWeight: '700',
    color: colors.ink2,
    fontVariant: ['tabular-nums'],
  },
  qsCravingChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  qsCravingChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.layer2,
    borderWidth: 1, borderColor: colors.line2,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  qsCravingChipActive: {
    backgroundColor: colors.purpleTint,
    borderColor: colors.line3,
  },
  qsCravingChipIcon: {
    fontSize: fontSize.base,
  },
  qsCravingChipLbl: {
    fontSize: fontSize.sm,
    color: colors.ink2,
    fontWeight: '600',
  },
  qsCravingOutcomeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  qsCravingOutcomeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.line2,
    backgroundColor: colors.layer2,
  },
  qsCravingOutcomeTxt: {
    fontSize: fontSize.base,
    fontWeight: '700',
    color: colors.ink2,
  },
  qsCravingSaveBtnWrap: {
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  qsCravingSaveBtn: {
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  qsCravingSaveBtnTxt: {
    fontSize: fontSize.base,
    fontWeight: '800',
    color: colors.white,
    letterSpacing: 0.4,
  },

  // ── Tip of the day detail view ────────────────────────────────────────────
  qsTipHero: {
    alignItems: 'center', justifyContent: 'center',
    paddingVertical: spacing.lg,
  },
  qsTipDate: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.ink3,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  qsTipTitle: {
    fontSize: fontSize.xl,
    fontWeight: '800',
    color: colors.ink,
    textAlign: 'center',
    marginTop: spacing.xs,
    paddingHorizontal: spacing.md,
    letterSpacing: -0.4,
  },
  qsTipBody: {
    fontSize: fontSize.base,
    color: colors.ink2,
    textAlign: 'center',
    lineHeight: fontSize.base + 8,
    paddingHorizontal: spacing.md,
    marginTop: spacing.sm,
  },
  qsTipDivider: {
    height: 1,
    backgroundColor: colors.line,
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
  },
  qsTipFootRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
  },
  qsTipFootTxt: {
    fontSize: fontSize.xs,
    color: colors.ink3,
    textAlign: 'center',
  },

  // ── Quit lines detail view ────────────────────────────────────────────────
  qsQuitlineHero: {
    alignItems: 'center', justifyContent: 'center',
    paddingTop: spacing.md, paddingBottom: spacing.sm,
  },
  qsQuitlineIntro: {
    fontSize: fontSize.sm,
    color: colors.ink2,
    lineHeight: fontSize.sm + 6,
    textAlign: 'center',
    paddingHorizontal: spacing.md,
    marginBottom: spacing.xs,
  },
  qsQuitlineGroup: {
    backgroundColor: colors.layer1,
    borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.line2,
    paddingHorizontal: spacing.md,
  },
  qsQuitlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm2,
    paddingVertical: spacing.sm + 4,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  qsQuitlineRowLast: { borderBottomWidth: 0 },
  qsQuitlineFlag: {
    fontSize: fontSize.xl,
    width: 30,
    textAlign: 'center',
  },
  qsQuitlineRegion: {
    fontSize: fontSize.sm,
    fontWeight: '800',
    color: colors.ink,
  },
  qsQuitlineHours: {
    fontSize: fontSize.xs,
    color: colors.ink3,
    marginTop: 1,
  },
  qsQuitlineCallBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.green,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs,
  },
  qsQuitlineNumber: {
    fontSize: fontSize.xs,
    fontWeight: '800',
    color: colors.white,
    fontVariant: ['tabular-nums'],
  },
  qsQuitlineFootnote: {
    fontSize: fontSize.xs,
    color: colors.ink3,
    textAlign: 'center',
    paddingHorizontal: spacing.md,
    marginTop: spacing.sm,
    fontStyle: 'italic',
  },

  // ── Calm breathing detail view (animated 4-7-8 cycle) ──────────────────────
  qsBreathingIntro: {
    fontSize: fontSize.sm,
    color: colors.ink2,
    lineHeight: fontSize.sm + 6,
    textAlign: 'center',
    paddingHorizontal: spacing.md,
  },
  qsBreathingDots: {
    flexDirection: 'row',
    alignSelf: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  qsBreathingDot: {
    width: 9,
    height: 9,
    borderRadius: radius.pill,
  },
  qsBreathingStage: {
    alignSelf: 'center',
    width: 320, height: 320,
    alignItems: 'center', justifyContent: 'center',
    marginVertical: spacing.lg,
  },
  qsBreathingGuideOuter: {
    position: 'absolute',
    width: 280, height: 280,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line3,
    borderStyle: 'dashed',
  },
  qsBreathingGuideMid: {
    position: 'absolute',
    width: 230, height: 230,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line2,
  },
  qsBreathingCircle: {
    width: 190, height: 190,
    borderRadius: radius.pill,
    overflow: 'hidden',
    shadowColor: colors.purple,
    shadowOpacity: 0.55,
    shadowRadius: 44,
    shadowOffset: { width: 0, height: 0 },
    elevation: 14,
  },
  qsBreathingCircleHighlight: {
    position: 'absolute',
    top: 14, left: 28,
    width: 90, height: 60,
    borderRadius: radius.pill,
    backgroundColor: colors.white,
    opacity: 0.18,
    transform: [{ rotate: '-20deg' }],
  },
  qsBreathingPhaseWrap: {
    position: 'absolute',
    width: 190, height: 190,
    alignItems: 'center', justifyContent: 'center',
  },
  qsBreathingPhase: {
    fontSize: fontSize.lg,
    fontWeight: '800',
    color: colors.white,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  qsBreathingPhaseSub: {
    fontSize: fontSize.xs,
    color: colors.ink2,
    textAlign: 'center',
    marginTop: 4,
    fontVariant: ['tabular-nums'],
  },
  qsBreathingBtnWrap: {
    alignSelf: 'center',
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  qsBreathingBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg + 4,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.pill,
    minWidth: 160,
  },
  qsBreathingBtnTxt: {
    fontSize: fontSize.base,
    fontWeight: '800',
    color: colors.white,
  },
  qsBreathingTips: {
    backgroundColor: colors.layer1,
    borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.line2,
    padding: spacing.md,
    marginTop: spacing.lg,
    gap: spacing.xs,
  },
  qsBreathingTipsHead: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.ink3,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  qsBreathingTipsBody: {
    fontSize: fontSize.sm,
    color: colors.ink2,
    lineHeight: fontSize.sm + 6,
  },

  // ── My reasons view ───────────────────────────────────────────────────────
  qsReasonsIntro: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: colors.layer1,
    borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.line2,
    padding: spacing.md,
  },
  qsReasonsIntroTxt: {
    flex: 1,
    fontSize: fontSize.sm,
    color: colors.ink2,
    lineHeight: fontSize.sm + 6,
  },
  qsTextInput: {
    backgroundColor: colors.layer2,
    borderWidth: 1, borderColor: colors.line2,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.ink,
    fontSize: fontSize.base,
  },
  qsReasonAddRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  qsReasonAddBtn: {
    width: 46, height: 46,
    borderRadius: radius.md,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.purple,
  },
  qsReasonsEmptyHint: {
    fontSize: fontSize.sm,
    color: colors.ink3,
    textAlign: 'center',
    paddingVertical: spacing.md,
  },
  qsReasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.layer1,
    borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.line2,
    padding: spacing.md,
  },
  qsReasonNum: {
    width: 28, height: 28,
    borderRadius: radius.pill,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.rose + '22',
  },
  qsReasonNumTxt: {
    fontSize: fontSize.sm,
    fontWeight: '800',
    color: colors.rose,
    fontVariant: ['tabular-nums'],
  },
  qsReasonRowTxt: {
    flex: 1,
    fontSize: fontSize.base,
    color: colors.ink,
    fontWeight: '600',
    lineHeight: fontSize.base + 5,
  },
  qsReasonsEditBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm2,
    borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.line2,
    backgroundColor: colors.layer1,
  },
  qsReasonsEditBtnTxt: {
    fontSize: fontSize.base,
    fontWeight: '700',
    color: colors.purple,
  },
  qsReasonsEmptyWrap: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
  },
  qsReasonsEmptyIcon: {
    width: 84, height: 84,
    borderRadius: radius.pill,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.rose + '22',
    marginBottom: spacing.xs,
  },
  qsReasonsEmptyTitle: {
    fontSize: fontSize.lg,
    fontWeight: '800',
    color: colors.ink,
    textAlign: 'center',
  },
  qsReasonsEmptyBody: {
    fontSize: fontSize.sm,
    color: colors.ink2,
    textAlign: 'center',
    lineHeight: fontSize.sm + 6,
    marginBottom: spacing.sm,
  },

  // ── NRT log view ──────────────────────────────────────────────────────────
  qsNrtStatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.layer1,
    borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.line2,
    paddingVertical: spacing.md,
  },
  qsNrtStatCell: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  qsNrtStatDiv: {
    width: 1,
    alignSelf: 'stretch',
    backgroundColor: colors.line,
  },
  qsNrtStatVal: {
    fontSize: fontSize.xl,
    fontWeight: '800',
    color: colors.ink,
    fontVariant: ['tabular-nums'],
  },
  qsNrtStatLbl: {
    fontSize: fontSize.xs,
    color: colors.ink3,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  qsNrtRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.layer1,
    borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.line2,
    padding: spacing.md,
  },
  qsNrtRowIcon: {
    width: 40, height: 40,
    borderRadius: radius.pill,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.teal + '22',
  },
  qsNrtRowIconTxt: {
    fontSize: fontSize.md,
  },
  qsNrtRowTitle: {
    fontSize: fontSize.base,
    fontWeight: '700',
    color: colors.ink,
  },
  qsNrtRowTime: {
    fontSize: fontSize.xs,
    color: colors.ink3,
    marginTop: 1,
  },
  qsNrtRowNote: {
    fontSize: fontSize.sm,
    color: colors.ink2,
    marginTop: 3,
    lineHeight: fontSize.sm + 4,
  },
  qsNrtOptional: {
    color: colors.ink3,
    fontWeight: '600',
    letterSpacing: 0.3,
    textTransform: 'none',
  },
  qsNrtNoteInput: {
    minHeight: 76,
    textAlignVertical: 'top',
  },

  // ── QS setup · "what are you quitting" product picker ──────────────────────
  qsProductPickerRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  qsProductChip: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.layer2,
    borderWidth: 1, borderColor: colors.line2,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  qsProductChipActive: {
    backgroundColor: colors.purpleTint,
    borderColor: colors.line3,
  },
  qsProductChipEmoji: {
    fontSize: fontSize.xl,
  },
  qsProductChipTxt: {
    fontSize: fontSize.sm,
    color: colors.ink2,
    fontWeight: '600',
    textAlign: 'center',
  },
  qsProductChipTxtActive: {
    color: colors.ink,
    fontWeight: '700',
  },

  // ── Cravings view · "read your reasons" anchor banner ──────────────────────
  qsReasonsBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.rose + '18',
    borderWidth: 1, borderColor: colors.rose + '33',
    borderRadius: radius.md,
    padding: spacing.md,
  },
  qsReasonsBannerIcon: {
    width: 36, height: 36,
    borderRadius: radius.pill,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.rose + '22',
  },
  qsReasonsBannerLbl: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.rose,
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  qsReasonsBannerTxt: {
    fontSize: fontSize.sm,
    color: colors.ink,
    fontStyle: 'italic',
    lineHeight: 19,
  },
  qsReasonsBannerEmpty: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.layer1,
    borderWidth: 1, borderColor: colors.line2,
    borderStyle: 'dashed',
    borderRadius: radius.md,
    padding: spacing.md,
  },
  qsReasonsBannerEmptyTxt: {
    flex: 1,
    fontSize: fontSize.sm,
    color: colors.ink2,
    fontWeight: '600',
  },

  // ── Tip of the day · like / skip reaction buttons ──────────────────────────
  qsTipReactRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  qsTipReactBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.layer2,
    borderWidth: 1, borderColor: colors.line2,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
  },
  qsTipReactBtnLiked: {
    backgroundColor: colors.rose + '18',
    borderColor: colors.rose + '44',
  },
  qsTipReactBtnSkipped: {
    backgroundColor: colors.honey + '18',
    borderColor: colors.honey + '44',
  },
  qsTipReactTxt: {
    fontSize: fontSize.sm,
    color: colors.ink2,
    fontWeight: '700',
  },

  // ── Rescue (in-the-moment craving) CTA on cravings list ───────────────────
  qsRescueBtnWrap: {
    borderRadius: radius.md,
    overflow: 'hidden',
    shadowColor: colors.rose,
    shadowOpacity: 0.45,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  qsRescueBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm2,
    paddingVertical: spacing.sm2,
    paddingHorizontal: spacing.md,
  },
  qsRescueBtnIcon: {
    width: 38, height: 38,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.line3,
  },
  qsRescueBtnTitle: {
    fontSize: fontSize.base,
    fontWeight: '800',
    color: colors.white,
    letterSpacing: 0.2,
    lineHeight: fontSize.base + 4,
  },
  qsRescueBtnSub: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.white,
    opacity: 0.9,
    marginTop: 2,
    letterSpacing: 0.2,
  },

  // ── Rescue view · "Remember why" reasons card ─────────────────────────────
  qsRescueReasonCard: {
    backgroundColor: colors.layer1,
    borderWidth: 1, borderColor: colors.line2,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm2,
  },
  qsRescueReasonHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  qsRescueReasonHeadTxt: {
    fontSize: fontSize.xs,
    fontWeight: '800',
    color: colors.ink3,
    letterSpacing: 1.1,
  },
  qsRescueReasonTxt: {
    fontSize: fontSize.base,
    color: colors.ink,
    fontWeight: '600',
    lineHeight: fontSize.base + 6,
    fontStyle: 'italic',
  },

  // ── Rescue view · timer display (replaces the phase label) ────────────────
  qsRescueTimer: {
    fontSize: fontSize.xl,
    fontWeight: '800',
    color: colors.white,
    letterSpacing: 0.5,
    lineHeight: fontSize.xl + 2,
  },

  // ── Rescue view · success / "you rode it out" state ───────────────────────
  qsRescueDoneHero: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
  qsRescueDoneTitle: {
    fontSize: fontSize.lg,
    fontWeight: '800',
    color: colors.white,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  qsRescueDoneBody: {
    fontSize: fontSize.sm,
    color: colors.ink2,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: fontSize.sm + 6,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.lg,
  },
  qsRescueAgainBtn: {
    alignSelf: 'center',
    marginTop: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  qsRescueAgainBtnTxt: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.ink2,
    letterSpacing: 0.3,
  },

  // ── Patterns view · empty hint + cards ────────────────────────────────────
  qsPatternsEmpty: {
    fontSize: fontSize.sm,
    color: colors.ink3,
    fontWeight: '600',
    lineHeight: fontSize.sm + 4,
    paddingVertical: spacing.sm,
  },
  qsPatternsCard: {
    backgroundColor: colors.layer1,
    borderWidth: 1, borderColor: colors.line2,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },

  // ── Patterns · horizontal bar chart (triggers, coping) ────────────────────
  qsPatternsBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 4,
  },
  qsPatternsBarIcon: {
    fontSize: fontSize.md,
    width: 22,
    textAlign: 'center',
  },
  qsPatternsBarLbl: {
    fontSize: fontSize.sm,
    color: colors.ink,
    fontWeight: '700',
    flex: 1,
  },
  qsPatternsBarTrack: {
    flex: 1.6,
    height: 10,
    backgroundColor: colors.layer2,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  qsPatternsBarFill: {
    height: '100%',
    borderRadius: radius.pill,
  },
  qsPatternsBarCount: {
    fontSize: fontSize.sm,
    color: colors.ink2,
    fontWeight: '800',
    minWidth: 22,
    textAlign: 'right',
  },

  // ── Patterns · 6-slot hour-of-day histogram ───────────────────────────────
  qsPatternsHistRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: spacing.xs,
    height: 132,
  },
  qsPatternsHistCol: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  qsPatternsHistBarWrap: {
    width: '100%',
    height: 80,
    justifyContent: 'flex-end',
    alignItems: 'center',
    backgroundColor: colors.layer2,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  qsPatternsHistBar: {
    width: '70%',
    borderTopLeftRadius: radius.sm,
    borderTopRightRadius: radius.sm,
  },
  qsPatternsHistLbl: {
    fontSize: fontSize.xs,
    color: colors.ink3,
    fontWeight: '700',
    marginTop: 2,
    letterSpacing: 0.3,
  },
  qsPatternsHistCount: {
    fontSize: fontSize.xs,
    color: colors.ink2,
    fontWeight: '800',
  },
  qsPatternsHistCaption: {
    fontSize: fontSize.xs,
    color: colors.ink3,
    fontWeight: '600',
    lineHeight: fontSize.xs + 4,
    marginTop: spacing.sm,
    fontStyle: 'italic',
    textAlign: 'center',
  },

  // ── Money-saved goal card (progress detail) ───────────────────────────────
  qsGoalCard: {
    backgroundColor: colors.layer1,
    borderWidth: 1, borderColor: colors.line2,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  qsGoalHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  qsGoalLabel: {
    fontSize: fontSize.md,
    fontWeight: '800',
    color: colors.white,
    letterSpacing: -0.1,
    lineHeight: fontSize.md + 4,
  },
  qsGoalSub: {
    fontSize: fontSize.xs,
    color: colors.ink3,
    fontWeight: '700',
    marginTop: 2,
    letterSpacing: 0.3,
  },
  qsGoalBadge: {
    width: 32, height: 32,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.layer2,
    borderWidth: 1,
    borderColor: colors.line2,
  },
  qsGoalBarTrack: {
    height: 12,
    backgroundColor: colors.layer2,
    borderRadius: radius.pill,
    overflow: 'hidden',
    marginTop: 4,
  },
  qsGoalBarFill: {
    height: '100%',
    borderRadius: radius.pill,
  },
  qsGoalFootnote: {
    fontSize: fontSize.sm,
    color: colors.ink2,
    fontWeight: '700',
    marginTop: 2,
  },
  qsGoalActionsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  qsGoalActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: colors.layer2,
    borderWidth: 1, borderColor: colors.line2,
    borderRadius: radius.pill,
  },
  qsGoalActionTxt: {
    fontSize: fontSize.xs,
    color: colors.ink2,
    fontWeight: '700',
    letterSpacing: 0.3,
  },

  // ── Goal · empty (no goal set yet) entry card ─────────────────────────────
  qsGoalEmpty: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm2,
    backgroundColor: colors.layer1,
    borderWidth: 1, borderColor: colors.line2,
    borderStyle: 'dashed',
    borderRadius: radius.lg,
    padding: spacing.md,
    marginTop: spacing.xs,
  },
  qsGoalEmptyIcon: {
    width: 38, height: 38,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.layer2,
    borderWidth: 1,
    borderColor: colors.line2,
  },
  qsGoalEmptyTitle: {
    fontSize: fontSize.base,
    fontWeight: '800',
    color: colors.white,
    letterSpacing: -0.1,
    lineHeight: fontSize.base + 4,
  },
  qsGoalEmptySub: {
    fontSize: fontSize.xs,
    color: colors.ink3,
    fontWeight: '600',
    marginTop: 2,
    lineHeight: fontSize.xs + 4,
  },

  // ── Resilience strip (main view · slips + personal best) ──────────────────
  qsResilienceStrip: {
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: colors.layer1,
    borderWidth: 1, borderColor: colors.line2,
    borderRadius: radius.lg,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm2,
    marginTop: spacing.sm,
  },
  qsResilienceCell: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  qsResilienceLbl: {
    fontSize: fontSize.xs,
    color: colors.ink3,
    fontWeight: '700',
    letterSpacing: 0.4,
    marginBottom: 1,
  },
  qsResilienceVal: {
    fontSize: fontSize.sm,
    color: colors.ink,
    fontWeight: '800',
    letterSpacing: -0.1,
  },
  qsResilienceDiv: {
    width: 1,
    backgroundColor: colors.line2,
    marginHorizontal: spacing.sm,
  },
});

