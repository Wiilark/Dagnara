// Shared building blocks for the Programs modals: storage keys, the sheet
// header, all program types/constants, helper + art components, and the `m`
// stylesheet used by every modal. Extracted mechanically from programs.tsx —
// call sites stay byte-identical (`m.foo`, helper names unchanged).
import { type ReactNode } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Svg, { Circle, Ellipse, G, Line, Rect, Path, Polygon, Text as SvgText } from 'react-native-svg';
import { colors, spacing, fontSize, radius } from '../../theme';
import { BackChevron } from '../BackChevron';
import { formatMoneyFromUsd } from '../../lib/currency';
import { fmt } from '../../lib/format';

export function makeKeys(email: string) {
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

// ── Shared program sheet header ───────────────────────────────────────────────
// Profile-style header for every sheet/detail view inside Programs: a circular
// back-chevron pill on the left, a dead-centered title, and an optional right
// node (status badge / action). When `right` is omitted a same-width spacer
// keeps the title perfectly centered. Mirrors src/components/FloatingModalHeader.
export function ProgramSheetHeader({ title, onBack, right }: { title: string; onBack: () => void; right?: ReactNode }) {
  return (
    <View style={m.sheetHeader}>
      <TouchableOpacity
        onPress={onBack}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        style={{
          width: spacing.xl + spacing.sm,
          height: spacing.xl + spacing.sm,
          borderRadius: radius.pill,
          backgroundColor: colors.layer2,
          borderWidth: 1.5,
          borderColor: colors.line2,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <BackChevron size={22} color={colors.ink} />
      </TouchableOpacity>
      <Text style={[m.sheetTitle, { flex: 1, textAlign: 'center' }]} numberOfLines={1}>{title}</Text>
      {right != null ? (
        <View style={{ minWidth: spacing.xl + spacing.sm, alignItems: 'flex-end', justifyContent: 'center' }}>{right}</View>
      ) : (
        <View style={{ width: spacing.xl + spacing.sm }} />
      )}
    </View>
  );
}

// ── Types ─────────────────────────────────────────────────────────────────────
// `productType` defaults to 'cigarettes' when missing (legacy users). For vape
// and pouches we keep the same numeric fields (units/day, units/pack, $/pack)
// and only change the labels — keeps math identical across products.
export type QsProduct = 'cigarettes' | 'vape' | 'pouches';
export interface QsData {
  quitDate: string;     // ISO date string
  cigsPerDay: number;   // units per day (cigs / pods / pouches)
  costPerPack: number;  // $/pack (USD-normalized)
  cigsPerPack: number;  // units per pack
  productType?: QsProduct;
}

// Per-product display labels. Math is identical across products — these only
// drive copy and short unit words used in counters / setup form.
export const QS_PRODUCT_LABELS: Record<QsProduct, {
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
export function productLabels(d: QsData | null | undefined): typeof QS_PRODUCT_LABELS[QsProduct] {
  return QS_PRODUCT_LABELS[d?.productType ?? 'cigarettes'];
}

// ── NRT tracker ───────────────────────────────────────────────────────────────
// Nicotine Replacement Therapy log. Kept intentionally small — type + optional
// strength + ISO timestamp. We don't track adherence ratios or doses-per-day
// here; this surfaces "how much NRT are you actually using" so the user can
// see their own tapering.
export interface NrtEntry {
  ts: string;
  kind: 'patch' | 'gum' | 'lozenge' | 'spray' | 'inhaler' | 'pouch' | 'other';
  strength?: string;   // e.g. "21mg", "4mg" — free text, optional
  note?: string;       // optional free-text
}
export const NRT_TYPES: { key: NrtEntry['kind']; label: string; icon: string }[] = [
  { key: 'patch',    label: 'Patch',    icon: '🩹' },
  { key: 'gum',      label: 'Gum',      icon: '🍬' },
  { key: 'lozenge',  label: 'Lozenge',  icon: '🟠' },
  { key: 'spray',    label: 'Spray',    icon: '💧' },
  { key: 'inhaler',  label: 'Inhaler',  icon: '🌬️' },
  { key: 'pouch',    label: 'Pouch',    icon: '🟢' },
  { key: 'other',    label: 'Other',    icon: '•' },
];
// Compact relative time for NRT log rows ("Just now", "12m ago", "3h ago", "2d ago").
export function nrtRelTime(iso: string): string {
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
export interface TipPrefs {
  liked: string[];
  skipped: string[];
}
export const DEFAULT_TIP_PREFS: TipPrefs = { liked: [], skipped: [] };

export interface QdData {
  quitDate: string;
  drinksPerDay: number;
  costPerDrink: number;
}

// Single craving log entry. Captures the moment + how the user rode the wave.
// `gaveIn=false` is a win — surface those count prominently on the main view.
export interface Craving {
  ts: string;            // ISO timestamp
  intensity: number;     // 1..10
  trigger?: string;      // e.g. 'stress' | 'social' | 'meal' | 'boredom' | 'alcohol' | 'other'
  coping?: string;       // e.g. 'breath' | 'walk' | 'water' | 'snack' | 'distract' | 'other'
  gaveIn: boolean;       // did the craving win
}

// Trigger and coping options for the craving logger — keep them short so the
// chip row stays one line on small phones.
export const CRAVING_TRIGGERS: { key: string; label: string; icon: string }[] = [
  { key: 'stress',  label: 'Stress',  icon: '😣' },
  { key: 'social',  label: 'Social',  icon: '👥' },
  { key: 'meal',    label: 'Meal',    icon: '🍽' },
  { key: 'boredom', label: 'Bored',   icon: '🥱' },
  { key: 'alcohol', label: 'Drinks',  icon: '🥂' },
  { key: 'other',   label: 'Other',   icon: '•' },
];
export const CRAVING_COPING: { key: string; label: string; icon: string }[] = [
  { key: 'breath',   label: 'Breathe',  icon: '🫁' },
  { key: 'walk',     label: 'Walk',     icon: '🚶' },
  { key: 'water',    label: 'Water',    icon: '💧' },
  { key: 'snack',    label: 'Snack',    icon: '🥜' },
  { key: 'distract', label: 'Distract', icon: '🎧' },
  { key: 'other',    label: 'Other',    icon: '•' },
];

export interface Medication {
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

export interface DoseEntry {
  takenCount: number;
  takenTimes: string[];
  skippedSlots?: number[];   // slot indices the user explicitly skipped
}

export interface PillLog {
  [medId: string]: DoseEntry;
}

// ── Pill colors ───────────────────────────────────────────────────────────────
export const PILL_COLORS = [
  colors.sky, colors.green, colors.honey, colors.rose,
  colors.violet, colors.teal, colors.purple2, colors.lavender,
];

// ── 82 quit-smoking achievements split across 4 stat types ────────────────────
// Each entry: emoji (legacy badge), illo (custom Dagnara SVG kind), title, desc.
// Time-based (28).
export const QS_ACHIEVEMENTS = [
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
export const QS_CIG_ACHIEVEMENTS = [
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
export const QS_MONEY_ACHIEVEMENTS = [
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
export const QS_LIFE_ACHIEVEMENTS = [
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
export const QS_MILESTONES = [
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
export const QD_ACHIEVEMENTS = [
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

export const QD_MILESTONES = [
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
export const QD_TIPS: { id: string; title: string; body: string }[] = [
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
export const QD_QUITLINES: { code: string; region: string; flag: string; number: string; hours: string; href: string }[] = [
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
export const QD_CRAVING_TRIGGERS: { key: string; label: string; icon: string }[] = [
  { key: 'stress',      label: 'Stress',      icon: '😣' },
  { key: 'social',      label: 'Social',      icon: '👥' },
  { key: 'celebration', label: 'Celebration', icon: '🎉' },
  { key: 'boredom',     label: 'Bored',       icon: '🥱' },
  { key: 'emotion',     label: 'Low mood',    icon: '😔' },
  { key: 'habit',       label: 'Habit',       icon: '🕰' },
  { key: 'other',       label: 'Other',       icon: '•' },
];
export const QD_CRAVING_COPING: { key: string; label: string; icon: string }[] = [
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
export const QD_SUPPORT: {
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
export function pickDailyQdTip(prefs?: TipPrefs): { id: string; title: string; body: string } {
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
export function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  return `${m}:${String(s).padStart(2,'0')}`;
}

export function todayKey(): string {
  return new Date().toLocaleDateString('en-CA');
}

export function fmtFriendlyDate(key: string): string {
  // "YYYY-MM-DD" → "Apr 24, 2026"
  const parts = key.split('-');
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10) - 1;
  const d = parseInt(parts[2], 10);
  if (isNaN(y) || isNaN(m) || isNaN(d)) return key;
  const date = new Date(y, m, d);
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// SVG ring constants
export const RING_SIZE = 220;
export const RING_R = 88;
export const RING_STROKE = 14;
export const RING_CIRCUMFERENCE = 2 * Math.PI * RING_R;

// ── Quit-Smoking achievement palette (matches QuitNow's category coloring) ────
export const QS_CAT_COLORS = {
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
export function HeroBadgeArt({ size = 132 }: { size?: number }) {
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
export function ProgressSceneArt({ width = 260 }: { width?: number }) {
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
export function illoVariant(id: string): { tint: string; accent: string; pop: string; spin: number } {
  let h = 5381;
  for (let i = 0; i < id.length; i++) h = ((h * 33) ^ id.charCodeAt(i)) >>> 0;
  const palettes: [string, string, string][] = [
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
export function QsIllo({ kind, locked = false, id = '' }: { kind: string; locked?: boolean; id?: string }) {
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
export function QsAchBadge({ icon, color, locked }: { icon: string; color: string; locked: boolean }) {
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
export type QsAchType = 'time' | 'cigs' | 'money' | 'life';
export interface QsAchievement {
  id:        string;        // type-prefixed (t_…, c_…, m_…, l_…) to avoid collisions
  type:      QsAchType;
  threshold: number;        // hours | cigs avoided | dollars saved | life-hours (varies by type)
  icon:      string;        // emoji for the legacy small badge (horizontal scroll)
  illo:      string;        // Dagnara SVG illustration kind (rocket | calendar | trophy | …)
  title:     string;
  desc:      string;
}

// Average life lost per cigarette, in minutes (CDC estimate).
export const MIN_PER_CIG = 11;

/** Combine all four source arrays into one unified list. */
export function buildAchList(): QsAchievement[] {
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
export function estimateAchHours(
  a: QsAchievement, cigsPerDay: number, cigsPerPack: number, costPerPack: number,
): number {
  if (a.type === 'time')  return a.threshold;
  // Runtime unlock keys off cigsAvoided = floor(hours × cigsPerDay/24), so a
  // partial cig never counts — round cig-derived thresholds UP to the whole cig
  // that actually trips the unlock, keeping the estimated date on the real one.
  if (a.type === 'cigs')  return cigsPerDay > 0 ? (Math.ceil(a.threshold) * 24) / cigsPerDay : Infinity;
  if (a.type === 'life') {
    // life-hours → cigs needed → real hours of abstinence
    const cigsNeeded = Math.ceil((a.threshold * 60) / MIN_PER_CIG);
    return cigsPerDay > 0 ? (cigsNeeded * 24) / cigsPerDay : Infinity;
  }
  // money → cigs equivalent → hours
  const moneyPerCig = cigsPerPack > 0 ? (costPerPack / cigsPerPack) : 0;
  if (moneyPerCig <= 0 || cigsPerDay <= 0) return Infinity;
  const cigs = Math.ceil(a.threshold / moneyPerCig);
  return (cigs * 24) / cigsPerDay;
}

/** Unlock check against current totals. */
export function isAchUnlocked(
  a: QsAchievement, hours: number, cigsAvoided: number, moneySaved: number,
): boolean {
  if (a.type === 'time')  return hours       >= a.threshold;
  if (a.type === 'cigs')  return cigsAvoided >= a.threshold;
  if (a.type === 'life')  return (cigsAvoided * MIN_PER_CIG) / 60 >= a.threshold;
  return moneySaved >= a.threshold;
}

/** Date the achievement was earned (estimated from the user's setup). null if locked. */
export function unlockedAchAt(
  a: QsAchievement, quitISO: string, cpd: number, cip: number, cpp: number,
): Date | null {
  const est = estimateAchHours(a, cpd, cip, cpp);
  if (!isFinite(est)) return null;
  const t = new Date(quitISO).getTime() + est * 3600_000;
  if (t > Date.now()) return null;
  return new Date(t);
}

/** Sentence-form stat for the detail hero ("1 day without smoking"). */
export function formatAchStat(a: QsAchievement, country: string = 'US', product: QsProduct = 'cigarettes'): string {
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
export function achColor(type: QsAchType): string {
  if (type === 'time')  return QS_CAT_COLORS.time;
  if (type === 'cigs')  return QS_CAT_COLORS.cigs;
  if (type === 'life')  return colors.green;
  return QS_CAT_COLORS.money;
}

// ── Beat Your Cravings — content data ────────────────────────────────────────
// Rotated daily; picked deterministically from local date so the "tip of the day"
// is stable for the whole day (no surprise change on re-open).
// IDs are stable across builds so liked/skipped prefs in storage survive reorders.
export const QS_TIPS: { id: string; title: string; body: string }[] = [
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
export const QS_QUITLINES: { code: string; region: string; flag: string; number: string; hours: string; href: string }[] = [
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
export function pickDailyTip(prefs?: TipPrefs): { id: string; title: string; body: string } {
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
export function MeditationArt({ size = 96 }: { size?: number }) {
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
export function TipBulbArt({ size = 96 }: { size?: number }) {
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
export function QuitlinePhoneArt({ size = 96 }: { size?: number }) {
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
export function PatternsArt({ size = 96 }: { size?: number }) {
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
export const prevUnlockedRefGlobal = { current: null as Set<string> | null };
export const prevQdUnlockedRefGlobal = { current: null as Set<string> | null };

export const m = StyleSheet.create({
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


