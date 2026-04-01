import { useState, useEffect } from 'react';
import { Tabs, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  View, TouchableOpacity, StyleSheet, Text, Modal,
  ScrollView, TextInput, Alert, Pressable, Dimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Line, Defs, LinearGradient as SvgLG, Stop } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '../../src/theme';
import { useAppStore, getXpLevel } from '../../src/store/appStore';
import { useAuthStore } from '../../src/store/authStore';
import { useDiaryStore } from '../../src/store/diaryStore';

const { width: SW, height: SH } = Dimensions.get('window');
const TODAY = () => new Date().toISOString().split('T')[0];

// ── Dagnara Logo SVG ──────────────────────────────────────────────────────────
function DagnaraLogo({ size = 28, color = colors.lavender }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 28 28">
      <Line x1="14" y1="2" x2="14" y2="26" stroke={color} strokeWidth="0.8" opacity="0.35" />
      <Line x1="2" y1="14" x2="26" y2="14" stroke={color} strokeWidth="0.8" opacity="0.35" />
      <Circle cx="14" cy="14" r="11" stroke={color} strokeWidth="1.4" fill="none" />
      <Circle cx="14" cy="14" r="2.5" fill={color} />
      <Line x1="14" y1="2" x2="14" y2="6.5" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <Line x1="14" y1="21.5" x2="14" y2="26" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <Line x1="2" y1="14" x2="6.5" y2="14" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <Line x1="21.5" y1="14" x2="26" y2="14" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </Svg>
  );
}

// ── FAB Tab Button ────────────────────────────────────────────────────────────
function FabTabButton({ onPress }: { onPress: () => void }) {
  return (
    <TouchableOpacity style={st.fabWrap} onPress={onPress} activeOpacity={0.8}>
      <View style={st.fab}>
        <Ionicons name="add" size={20} color="#fff" />
      </View>
      <Text style={st.fabLabel}>Log</Text>
    </TouchableOpacity>
  );
}

// ── Command Center Calorie Ring ───────────────────────────────────────────────
const CC_R = 46; const CC_SW = 8; const CC_CIRC = 2 * Math.PI * CC_R;
function CcRing({ eaten, goal }: { eaten: number; goal: number }) {
  const pct = Math.min(1, goal > 0 ? eaten / goal : 0);
  const dash = pct * CC_CIRC;
  return (
    <Svg width={108} height={108} viewBox="0 0 108 108">
      <Defs>
        <SvgLG id="ccRingGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0%" stopColor="#c084fc" />
          <Stop offset="100%" stopColor="#7c3aed" />
        </SvgLG>
      </Defs>
      <Circle cx="54" cy="54" r={CC_R} stroke="rgba(255,255,255,0.07)" strokeWidth={CC_SW} fill="none" />
      <Circle cx="54" cy="54" r={CC_R} stroke="url(#ccRingGrad)" strokeWidth={CC_SW} fill="none"
        strokeDasharray={`${dash} ${CC_CIRC - dash}`}
        strokeDashoffset={0} strokeLinecap="round"
        transform="rotate(-90 54 54)" />
      <Circle cx="54" cy="54" r="30" fill="rgba(255,255,255,0.04)" />
    </Svg>
  );
}

// ── Command Center Modal ──────────────────────────────────────────────────────
function CommandCenterModal({ visible, onClose, onNavigate }: {
  visible: boolean;
  onClose: () => void;
  onNavigate: (tab: string) => void;
}) {
  const { lifeScore, weightHistory, xp, programs, calorieGoal, streak } = useAppStore();
  const { email, profile } = useAuthStore();
  const { entries } = useDiaryStore();
  const [clock, setClock] = useState('');

  const today = TODAY();
  const todayEntry = entries[today];
  const foods = todayEntry?.foods ?? [];
  const eaten = foods.reduce((s: number, f: any) => s + f.kcal, 0);
  const water = todayEntry?.water ?? 0;
  const carbs = foods.reduce((s: number, f: any) => s + f.carbs, 0);
  const protein = foods.reduce((s: number, f: any) => s + f.protein, 0);
  const fat = foods.reduce((s: number, f: any) => s + f.fat, 0);
  const latestWeight = weightHistory.length > 0 ? weightHistory[weightHistory.length - 1].kg : null;
  const KCAL_GOAL = calorieGoal || 2000;
  // Macro goals derived from calorie goal (50% carbs / 30% protein / ~29% fat)
  const CARBS_GOAL = Math.round(KCAL_GOAL * 0.50 / 4);
  const PROTEIN_GOAL = Math.round(KCAL_GOAL * 0.30 / 4);
  const FAT_GOAL = Math.round(KCAL_GOAL * 0.293 / 9);
  const xpInfo = getXpLevel(xp);
  const displayName = (profile as any)?.name || (email ? email.split('@')[0] : 'User');

  useEffect(() => {
    if (!visible) return;
    const update = () => {
      const now = new Date();
      setClock(now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }));
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [visible]);

  const modules = [
    { icon: '🚭', label: 'Quit Smoking',  key: 'quit_smoking',  tab: '/(tabs)/programs' },
    { icon: '🍺', label: 'Quit Drinking', key: 'quit_drinking', tab: '/(tabs)/programs' },
    { icon: '💊', label: 'Pill Reminder', key: 'pill_reminder', tab: '/(tabs)/programs' },
  ];

  return (
    <Modal visible={visible} animationType="fade" presentationStyle="fullScreen">
      <View style={cc.root}>
        {/* Grid background */}
        <View style={cc.gridBg} pointerEvents="none">
          <Svg width={SW} height={SH} viewBox={`0 0 ${SW} ${SH}`}>
            {Array.from({ length: Math.ceil(SW / 40) + 1 }, (_, i) => (
              <Line key={`v${i}`} x1={i * 40} y1="0" x2={i * 40} y2={SH}
                stroke="rgba(124,77,255,0.07)" strokeWidth="1" />
            ))}
            {Array.from({ length: Math.ceil(SH / 40) + 1 }, (_, i) => (
              <Line key={`h${i}`} x1="0" y1={i * 40} x2={SW} y2={i * 40}
                stroke="rgba(124,77,255,0.07)" strokeWidth="1" />
            ))}
          </Svg>
        </View>

        <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
          {/* Header */}
          <View style={cc.header}>
            <View style={cc.headerLeft}>
              <View style={cc.pulseDot} />
              <Text style={cc.headerTitle}>DAGNARA // COMMAND CENTER</Text>
            </View>
            <View style={cc.headerRight}>
              <Text style={cc.clock}>{clock}</Text>
              <TouchableOpacity onPress={onClose} style={cc.closeBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                <Ionicons name="close" size={20} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>

          <ScrollView contentContainerStyle={cc.scroll} showsVerticalScrollIndicator={false}>
            {/* User Banner — tap to go to profile */}
            <TouchableOpacity onPress={() => onNavigate('/(tabs)/profile')} activeOpacity={0.85}>
              <LinearGradient colors={['rgba(124,77,255,0.18)', 'rgba(124,77,255,0.05)']}
                style={cc.userBanner}>
                <View style={cc.avatarCircle}>
                  <Ionicons name="person" size={26} color={colors.lavender} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={cc.userName}>{displayName}</Text>
                  <Text style={cc.userEmail}>{email ?? 'Not signed in'}</Text>
                  <Text style={cc.userScore}>Life Score: <Text style={{ color: colors.lavender }}>{lifeScore ?? '--'}</Text>  ·  🔥 {streak} day streak</Text>
                </View>
                <View style={cc.xpBadge}>
                  <Text style={cc.xpBadgeTxt}>{xpInfo.level}</Text>
                </View>
              </LinearGradient>
            </TouchableOpacity>

            {/* Stats Row — tap to go to diary */}
            <TouchableOpacity onPress={() => onNavigate('/(tabs)/diary')} activeOpacity={0.85}>
              <View style={cc.statsRow}>
                {[
                  { icon: '⚖️', val: latestWeight ? `${latestWeight}kg` : '--', lbl: 'Weight' },
                  { icon: '🔥', val: String(eaten), lbl: 'kcal today' },
                  { icon: '💧', val: String(water), lbl: 'Glasses' },
                ].map((s, i) => (
                  <View key={s.lbl} style={[cc.statTile, i === 1 && cc.statTileMid]}>
                    <Text style={cc.statIcon}>{s.icon}</Text>
                    <Text style={cc.statVal}>{s.val}</Text>
                    <Text style={cc.statLbl}>{s.lbl}</Text>
                  </View>
                ))}
              </View>
            </TouchableOpacity>

            {/* Calorie Ring + Macros — tap to go to diary */}
            <TouchableOpacity onPress={() => onNavigate('/(tabs)/diary')} activeOpacity={0.85}>
              <View style={cc.ringSection}>
                <View style={cc.ringWrap}>
                  <CcRing eaten={eaten} goal={KCAL_GOAL} />
                  <View style={cc.ringCenter}>
                    <Text style={cc.ringVal}>{Math.max(0, KCAL_GOAL - eaten)}</Text>
                    <Text style={cc.ringLbl}>kcal left</Text>
                  </View>
                </View>
                <View style={cc.macrosGrid}>
                  {[
                    { label: 'Carbs', val: carbs, goal: CARBS_GOAL, color: colors.honey },
                    { label: 'Protein', val: protein, goal: PROTEIN_GOAL, color: colors.purple2 },
                    { label: 'Fat', val: fat, goal: FAT_GOAL, color: colors.sky },
                  ].map(m => (
                    <View key={m.label} style={cc.macroRow}>
                      <Text style={cc.macroLbl}>{m.label}</Text>
                      <View style={cc.macroBarBg}>
                        <View style={[cc.macroBarFill, {
                          width: `${Math.min(100, m.goal > 0 ? m.val / m.goal * 100 : 0)}%` as any,
                          backgroundColor: m.color,
                        }]} />
                      </View>
                      <Text style={cc.macroVal}>{m.val}g</Text>
                    </View>
                  ))}
                </View>
              </View>
            </TouchableOpacity>

            {/* Active Mission — tap to go to diary */}
            <TouchableOpacity onPress={() => onNavigate('/(tabs)/diary')} activeOpacity={0.85}>
              <View style={cc.missionCard}>
                <View style={cc.missionHead}>
                  <Text style={cc.missionTitle}>DAILY NUTRITION GOAL</Text>
                  <Text style={cc.missionPct}>{Math.round(Math.min(100, eaten / KCAL_GOAL * 100))}%</Text>
                </View>
                <View style={cc.missionBar}>
                  <View style={[cc.missionFill, {
                    width: `${Math.min(100, KCAL_GOAL > 0 ? eaten / KCAL_GOAL * 100 : 0)}%` as any,
                  }]} />
                </View>
                <Text style={cc.missionSub}>{eaten} / {KCAL_GOAL} kcal logged</Text>
              </View>
            </TouchableOpacity>

            {/* XP Progress — tap to go to progress */}
            <TouchableOpacity onPress={() => onNavigate('/(tabs)/progress')} activeOpacity={0.85}>
              <View style={cc.xpCard}>
                <View style={cc.xpCardHead}>
                  <Text style={cc.xpCardTitle}>XP PROGRESS</Text>
                  <Text style={cc.xpCardVal}>{xp} XP</Text>
                </View>
                <View style={cc.xpBar}>
                  <View style={[cc.xpFill, { width: `${xpInfo.progress * 100}%` as any }]} />
                </View>
                <Text style={cc.xpMeta}>{xpInfo.name} · {xpInfo.toNext} XP to next level</Text>
              </View>
            </TouchableOpacity>

            {/* 30-Day Calendar — tap to go to progress */}
            <TouchableOpacity onPress={() => onNavigate('/(tabs)/progress')} activeOpacity={0.85}>
              <CalendarGrid entries={entries} dark />
            </TouchableOpacity>

            {/* 7-Day Chart — tap to go to progress */}
            <TouchableOpacity onPress={() => onNavigate('/(tabs)/progress')} activeOpacity={0.85}>
              <WeekChart entries={entries} dark />
            </TouchableOpacity>

            {/* Programs Status — tap to go to programs */}
            <View style={cc.modulesCard}>
              <Text style={cc.moduleTitle}>PROGRAMS</Text>
              <View style={cc.modulesGrid}>
                {modules.map(m => {
                  const on = !!programs[m.key];
                  return (
                    <TouchableOpacity key={m.key} onPress={() => onNavigate(m.tab)}
                      style={[cc.moduleItem, on && cc.moduleItemOn]} activeOpacity={0.75}>
                      <Text style={cc.moduleIcon}>{m.icon}</Text>
                      <Text style={[cc.moduleLbl, on && { color: colors.lavender }]}>{m.label}</Text>
                      <View style={[cc.moduleDot, { backgroundColor: on ? '#4ade80' : 'rgba(255,255,255,0.15)' }]} />
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Exit button at the bottom */}
            <TouchableOpacity onPress={onClose} style={cc.exitBtn} activeOpacity={0.8}>
              <Ionicons name="close-circle-outline" size={18} color="rgba(196,181,255,0.7)" />
              <Text style={cc.exitBtnTxt}>CLOSE COMMAND CENTER</Text>
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

// ── Calendar helpers ─────────────────────────────────────────────────────────
function buildCalDays(entries: Record<string, any>) {
  const days: { date: string; status: 'logged' | 'partial' | 'none' | 'future' }[] = [];
  const today = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    const entry = entries[dateStr];
    const foods = entry?.foods ?? [];
    const kcal = foods.reduce((s: number, f: any) => s + f.kcal, 0);
    let status: 'logged' | 'partial' | 'none' = kcal >= 1200 ? 'logged' : kcal > 0 ? 'partial' : 'none';
    days.push({ date: dateStr, status });
  }
  return days;
}

function CalendarGrid({ entries, dark = false }: { entries: Record<string, any>; dark?: boolean }) {
  const days = buildCalDays(entries);
  const today = new Date();
  // Find what weekday Monday=0 the first day falls on
  const firstDate = new Date(days[0].date);
  const startPad = (firstDate.getDay() + 6) % 7; // 0=Mon
  const cells = [...Array(startPad).fill(null), ...days];
  const loggedCount = days.filter(d => d.status !== 'none').length;
  const weekDays = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const txt = dark ? 'rgba(196,181,255,0.4)' : colors.ink3;
  const bgCard = dark ? 'rgba(124,77,255,0.07)' : colors.layer2;
  const border = dark ? 'rgba(124,77,255,0.18)' : colors.line2;

  return (
    <View style={[cal.card, { backgroundColor: bgCard, borderColor: border }]}>
      <View style={cal.cardHead}>
        <Text style={[cal.sectionLbl, { color: dark ? 'rgba(196,181,255,0.4)' : colors.ink3 }]}>30-Day Logging Streak</Text>
        <Text style={[cal.countLbl, { color: dark ? 'rgba(196,181,255,0.35)' : colors.ink3 }]}>{loggedCount}/30 days</Text>
      </View>
      <View style={cal.weekRow}>
        {weekDays.map((d, i) => <Text key={i} style={[cal.weekLbl, { color: dark ? 'rgba(196,181,255,0.25)' : colors.ink3 }]}>{d}</Text>)}
      </View>
      <View style={cal.grid}>
        {cells.map((cell, i) => {
          if (!cell) return <View key={`pad-${i}`} style={cal.cell} />;
          const bg = cell.status === 'logged' ? '#4ade80'
            : cell.status === 'partial' ? 'rgba(245,158,11,0.75)'
            : dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
          return <View key={cell.date} style={[cal.cell, { backgroundColor: bg }]} />;
        })}
      </View>
      <View style={cal.legend}>
        {[
          { color: '#4ade80', label: 'Goal met' },
          { color: 'rgba(245,158,11,0.75)', label: 'Partial' },
          { color: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)', label: 'No log' },
        ].map(l => (
          <View key={l.label} style={cal.legendItem}>
            <View style={[cal.legendDot, { backgroundColor: l.color }]} />
            <Text style={[cal.legendTxt, { color: txt }]}>{l.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function WeekChart({ entries, dark = false }: { entries: Record<string, any>; dark?: boolean }) {
  const bars: { day: string; kcal: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    const foods = entries[dateStr]?.foods ?? [];
    const kcal = foods.reduce((s: number, f: any) => s + f.kcal, 0);
    bars.push({ day: d.toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 1), kcal });
  }
  const maxKcal = Math.max(...bars.map(b => b.kcal), 500);
  const avg = Math.round(bars.reduce((s, b) => s + b.kcal, 0) / 7);
  const bgCard = dark ? 'rgba(124,77,255,0.07)' : colors.layer2;
  const border = dark ? 'rgba(124,77,255,0.18)' : colors.line2;
  const txt = dark ? 'rgba(196,181,255,0.4)' : colors.ink3;

  return (
    <View style={[wch.card, { backgroundColor: bgCard, borderColor: border }]}>
      <View style={wch.head}>
        <Text style={[wch.title, { color: dark ? 'rgba(196,181,255,0.4)' : colors.ink3 }]}>7-Day Calorie Trend</Text>
        <Text style={[wch.avg, { color: dark ? 'rgba(196,181,255,0.35)' : colors.ink3 }]}>avg {avg > 0 ? avg : '—'}</Text>
      </View>
      <View style={wch.barsRow}>
        {bars.map((b, i) => {
          const h = maxKcal > 0 ? Math.max(4, (b.kcal / maxKcal) * 60) : 4;
          const isToday = i === 6;
          return (
            <View key={i} style={wch.barWrap}>
              <View style={[wch.bar, {
                height: h,
                backgroundColor: isToday ? colors.lavender : dark ? 'rgba(124,77,255,0.4)' : 'rgba(124,77,255,0.3)',
              }]} />
            </View>
          );
        })}
      </View>
      <View style={wch.labelsRow}>
        {bars.map((b, i) => (
          <Text key={i} style={[wch.barLabel, { color: i === 6 ? colors.lavender : txt }]}>{b.day}</Text>
        ))}
      </View>
    </View>
  );
}

// ── Messages Modal ────────────────────────────────────────────────────────────
const MESSAGES = [
  { id: 1, icon: '✦', type: 'insight', title: 'Sleep × activity insight', time: 'Today', body: 'On the 3 nights you slept 8+ hours this week, your step count was 34% higher. Your sleep is your biggest lever right now.' },
  { id: 2, icon: '🍎', type: 'nutrition', title: 'Why protein timing matters', time: 'Yesterday', body: 'Eating 30g+ of protein within 2 hours of waking improves satiety and reduces afternoon cravings by up to 25%.' },
  { id: 3, icon: '🚭', type: 'quit', title: '18 days smoke-free 🎉', time: '2 days ago', body: 'Your lung cilia are now fully active again. Breathing will feel noticeably easier over the next week.' },
  { id: 4, icon: '😴', type: 'sleep', title: 'The science of deep sleep', time: '3 days ago', body: 'Deep sleep (NREM stage 3) is when your body repairs muscle tissue and consolidates memory. A consistent bedtime is the #1 predictor.' },
  { id: 5, icon: '🏃', type: 'activity', title: '14-day step streak', time: '4 days ago', body: "You've hit your step goal every day for two weeks. 14 days is the threshold where a behaviour becomes automatic. You've built a habit." },
  { id: 6, icon: '💡', type: 'insight', title: 'Hydration & cognitive performance', time: '1 week ago', body: 'Even mild dehydration (1–2% body weight) reduces focus, working memory, and reaction time. Your daily water goal is set for peak performance.', group: 'Last month' },
];

const MSG_COLORS: Record<string, string> = {
  insight: '#a78bfa', nutrition: '#34d399', quit: '#f87171', sleep: '#60a5fa', activity: '#fbbf24',
};

function MessagesModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [dismissed, setDismissed] = useState<number[]>([]);
  const visible_msgs = MESSAGES.filter(m => !dismissed.includes(m.id));
  const thisWeek = visible_msgs.filter(m => !m.group);
  const lastMonth = visible_msgs.filter(m => m.group === 'Last month');

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={msg.safe} edges={['top', 'bottom']}>
        <View style={msg.header}>
          <TouchableOpacity style={msg.closeBtn} onPress={onClose}>
            <Ionicons name="close" size={16} color={colors.ink2} />
          </TouchableOpacity>
          <Text style={msg.title}>Messages</Text>
          <View style={{ width: 34 }} />
        </View>
        <ScrollView contentContainerStyle={msg.scroll} showsVerticalScrollIndicator={false}>
          {visible_msgs.length === 0 ? (
            <View style={msg.emptyWrap}>
              <Text style={msg.emptyIcon}>📬</Text>
              <Text style={msg.emptyTitle}>Your inbox</Text>
              <Text style={msg.emptySub}>Get science-backed content on nutrition and behaviour created by experts, new app features, and more.</Text>
            </View>
          ) : (
            <>
              {thisWeek.length > 0 && (
                <>
                  <Text style={msg.groupLbl}>This week</Text>
                  {thisWeek.map(m => (
                    <TouchableOpacity key={m.id} style={msg.card}
                      onPress={() => setDismissed(d => [...d, m.id])} activeOpacity={0.75}>
                      <View style={[msg.iconWrap, { backgroundColor: `${MSG_COLORS[m.type] ?? '#a78bfa'}22` }]}>
                        <Text style={msg.iconTxt}>{m.icon}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <View style={msg.cardHead}>
                          <Text style={msg.cardTitle}>{m.title}</Text>
                          <Text style={msg.cardTime}>{m.time}</Text>
                        </View>
                        <Text style={msg.cardBody} numberOfLines={3}>{m.body}</Text>
                      </View>
                      <View style={[msg.unreadDot, { backgroundColor: MSG_COLORS[m.type] ?? colors.lavender }]} />
                    </TouchableOpacity>
                  ))}
                </>
              )}
              {lastMonth.length > 0 && (
                <>
                  <Text style={[msg.groupLbl, { marginTop: 20 }]}>Last month</Text>
                  {lastMonth.map(m => (
                    <TouchableOpacity key={m.id} style={msg.card}
                      onPress={() => setDismissed(d => [...d, m.id])} activeOpacity={0.75}>
                      <View style={[msg.iconWrap, { backgroundColor: `${MSG_COLORS[m.type] ?? '#a78bfa'}22` }]}>
                        <Text style={msg.iconTxt}>{m.icon}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <View style={msg.cardHead}>
                          <Text style={msg.cardTitle}>{m.title}</Text>
                          <Text style={msg.cardTime}>{m.time}</Text>
                        </View>
                        <Text style={msg.cardBody} numberOfLines={3}>{m.body}</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </>
              )}
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

// ── Quick-Add FAB Sheet ───────────────────────────────────────────────────────
function QuickAddSheet({ visible, onClose, onCommandCenter, onMood, onWeight, onSleep, onExercise, onActivity }: {
  visible: boolean;
  onClose: () => void;
  onCommandCenter: () => void;
  onMood: () => void;
  onWeight: () => void;
  onSleep: () => void;
  onExercise: () => void;
  onActivity: () => void;
}) {
  const { addWater, selectedDate } = useDiaryStore();
  const { addXp } = useAppStore();

  function handleWater() {
    addWater(selectedDate);
    addXp(5);
    onClose();
  }
  function navTo(path: string) {
    onClose();
    setTimeout(() => router.push(path as any), 220);
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={fab.backdrop} onPress={onClose}>
        <Pressable style={fab.sheet} onPress={() => {}}>
          {/* Hero — Command Center */}
          <TouchableOpacity style={fab.heroItem} activeOpacity={0.85}
            onPress={() => { onClose(); setTimeout(onCommandCenter, 280); }}>
            <LinearGradient colors={['rgba(124,77,255,0.22)', 'rgba(124,77,255,0.06)']}
              style={fab.heroGrad}>
              <View style={fab.heroIconCircle}>
                <DagnaraLogo size={36} color={colors.lavender} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={fab.heroLabel}>Command Center</Text>
                <Text style={fab.heroSub}>Full overview dashboard</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.ink3} />
            </LinearGradient>
          </TouchableOpacity>

          {/* Small row */}
          <View style={fab.smallRow}>
            {[
              { icon: '⚖️', label: 'Weight', onPress: () => { onClose(); setTimeout(onWeight, 280); } },
              { icon: '🥤', label: 'Water', onPress: handleWater },
              { icon: '🏋️', label: 'Exercise', onPress: () => { onClose(); setTimeout(onExercise, 280); } },
              { icon: '👟', label: 'Steps', onPress: () => { onClose(); setTimeout(onActivity, 280); } },
            ].map(item => (
              <TouchableOpacity key={item.label} style={fab.smallItem} onPress={item.onPress} activeOpacity={0.75}>
                <Text style={fab.smallIcon}>{item.icon}</Text>
                <Text style={fab.smallLabel}>{item.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Grid */}
          <View style={fab.grid}>
            {[
              { icon: '🍳', label: 'Breakfast', onPress: () => navTo('/(tabs)/diary') },
              { icon: '🥗', label: 'Lunch', onPress: () => navTo('/(tabs)/diary') },
              { icon: '🍽️', label: 'Dinner', onPress: () => navTo('/(tabs)/diary') },
              { icon: '🍎', label: 'Snack', onPress: () => navTo('/(tabs)/diary') },
              { icon: '😴', label: 'Sleep', onPress: () => { onClose(); setTimeout(onSleep, 280); } },
              { icon: '😊', label: 'Mood', onPress: () => { onClose(); setTimeout(onMood, 280); } },
            ].map(item => (
              <TouchableOpacity key={item.label} style={fab.gridItem} onPress={item.onPress} activeOpacity={0.75}>
                <Text style={fab.gridIcon}>{item.icon}</Text>
                <Text style={fab.gridLabel}>{item.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Close */}
          <TouchableOpacity style={fab.closeRow} onPress={onClose} activeOpacity={0.8}>
            <View style={fab.closeCircle}>
              <Ionicons name="close" size={20} color={colors.ink2} />
            </View>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ── Mood Logger ───────────────────────────────────────────────────────────────
const MOODS = ['😩', '😕', '😐', '😊', '🤩'];
const MOOD_LABELS = ['Awful', 'Bad', 'Okay', 'Good', 'Amazing'];

function MoodLogger({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [selected, setSelected] = useState(2);
  const [notes, setNotes] = useState('');
  const { addXp } = useAppStore();

  function handleLog() {
    addXp(10);
    Alert.alert('Mood logged!', `${MOODS[selected]} Feeling ${MOOD_LABELS[selected]} saved. +10 XP`);
    setNotes('');
    setSelected(2);
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={ml.backdrop} onPress={onClose}>
        <Pressable style={ml.sheet} onPress={() => {}}>
          <View style={ml.handle} />
          <Text style={ml.title}>How are you feeling?</Text>
          <View style={ml.emojiRow}>
            {MOODS.map((m, i) => (
              <TouchableOpacity key={i} style={[ml.emojiBtn, selected === i && ml.emojiBtnActive]}
                onPress={() => setSelected(i)} activeOpacity={0.75}>
                <Text style={ml.emoji}>{m}</Text>
                <Text style={[ml.emojiLbl, selected === i && ml.emojiLblActive]}>{MOOD_LABELS[i]}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TextInput
            style={ml.notes}
            placeholder="Add a note... (optional)"
            placeholderTextColor={colors.ink3}
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={3}
          />
          <TouchableOpacity style={ml.logBtn} onPress={handleLog} activeOpacity={0.85}>
            <LinearGradient colors={[colors.purple, '#6d28d9']} style={ml.logBtnGrad}>
              <Text style={ml.logBtnTxt}>LOG MOOD +10 XP</Text>
            </LinearGradient>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ── Sleep Log Modal ───────────────────────────────────────────────────────────
function SleepLogger({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { addXp } = useAppStore();
  const [bedtime, setBedtime] = useState('22:30');
  const [waketime, setWaketime] = useState('06:00');
  const [quality, setQuality] = useState(2);
  const [notes, setNotes] = useState('');
  const QUALITIES = ['😫', '😕', '😐', '😊', '🌟'];

  function getDuration() {
    const [bh, bm] = bedtime.split(':').map(Number);
    const [wh, wm] = waketime.split(':').map(Number);
    let mins = (wh * 60 + wm) - (bh * 60 + bm);
    if (mins < 0) mins += 24 * 60;
    return `${Math.floor(mins / 60)}h ${mins % 60}m`;
  }

  function handleSave() {
    addXp(20);
    Alert.alert('Sleep logged!', `${getDuration()} sleep saved. +20 XP`);
    setNotes('');
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={sl.backdrop} onPress={onClose}>
        <Pressable style={sl.sheet} onPress={() => {}}>
          <View style={sl.handle} />
          <View style={sl.header}>
            <TouchableOpacity onPress={onClose} style={sl.backBtn}>
              <Ionicons name="chevron-back" size={18} color={colors.ink2} />
            </TouchableOpacity>
            <Text style={sl.title}>Log Sleep</Text>
            <View style={{ width: 34 }} />
          </View>
          {/* Duration */}
          <View style={sl.durationCard}>
            <Text style={sl.durationNum}>{getDuration()}</Text>
            <Text style={sl.durationLbl}>Sleep duration</Text>
          </View>
          {/* Time pickers */}
          <Text style={sl.sectionLbl}>BEDTIME & WAKE TIME</Text>
          <View style={sl.timeRow}>
            <View style={[sl.timeCard, { flex: 1 }]}>
              <Text style={sl.timeIcon}>🌙 Bedtime</Text>
              <TextInput style={sl.timeInput} value={bedtime} onChangeText={setBedtime}
                keyboardType="numbers-and-punctuation" placeholder="22:30" placeholderTextColor={colors.ink3} />
            </View>
            <View style={[sl.timeCard, { flex: 1 }]}>
              <Text style={sl.timeIcon}>☀️ Wake time</Text>
              <TextInput style={sl.timeInput} value={waketime} onChangeText={setWaketime}
                keyboardType="numbers-and-punctuation" placeholder="06:00" placeholderTextColor={colors.ink3} />
            </View>
          </View>
          {/* Quality */}
          <Text style={sl.sectionLbl}>SLEEP QUALITY</Text>
          <View style={sl.qualityRow}>
            {QUALITIES.map((q, i) => (
              <TouchableOpacity key={i} style={[sl.qualityBtn, quality === i && sl.qualityBtnSel]}
                onPress={() => setQuality(i)}>
                <Text style={sl.qualityEmoji}>{q}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {/* Notes */}
          <TextInput style={sl.notes} placeholder="How was your sleep? Any dreams?"
            placeholderTextColor={colors.ink3} value={notes} onChangeText={setNotes}
            multiline numberOfLines={3} />
          <TouchableOpacity style={sl.saveBtn} onPress={handleSave} activeOpacity={0.85}>
            <LinearGradient colors={['#6d28d9', colors.purple]} style={sl.saveGrad}>
              <Text style={sl.saveTxt}>SAVE SLEEP LOG +20 XP</Text>
            </LinearGradient>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ── Exercise Log Modal ─────────────────────────────────────────────────────────
const EXERCISE_CATS = [
  { icon: '🏃', name: 'Running', kcalPerMin: 10 },
  { icon: '🚴', name: 'Cycling', kcalPerMin: 8 },
  { icon: '🏊', name: 'Swimming', kcalPerMin: 9 },
  { icon: '🏋️', name: 'Weight Training', kcalPerMin: 6 },
  { icon: '🧘', name: 'Yoga', kcalPerMin: 3 },
  { icon: '⚽', name: 'Football', kcalPerMin: 8 },
  { icon: '🎾', name: 'Tennis', kcalPerMin: 7 },
  { icon: '🤸', name: 'HIIT', kcalPerMin: 12 },
  { icon: '🚶', name: 'Walking', kcalPerMin: 4 },
  { icon: '🥊', name: 'Boxing', kcalPerMin: 11 },
  { icon: '🏄', name: 'Surfing', kcalPerMin: 6 },
  { icon: '🧗', name: 'Climbing', kcalPerMin: 9 },
];

function ExerciseLogger({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { addXp } = useAppStore();
  const [search, setSearch] = useState('');
  const [exTab, setExTab] = useState<'list' | 'calories'>('list');
  const [duration, setDuration] = useState('30');
  const [manualKcal, setManualKcal] = useState('');
  const [selected, setSelected] = useState<typeof EXERCISE_CATS[0] | null>(null);

  const filtered = search.length > 0
    ? EXERCISE_CATS.filter(e => e.name.toLowerCase().includes(search.toLowerCase()))
    : EXERCISE_CATS;

  function handleAdd(ex: typeof EXERCISE_CATS[0]) {
    const mins = parseInt(duration) || 30;
    const kcal = ex.kcalPerMin * mins;
    addXp(Math.round(kcal / 10));
    Alert.alert('Exercise logged!', `${ex.icon} ${ex.name} – ${kcal} kcal burned in ${mins} min. +${Math.round(kcal / 10)} XP`);
    setSearch('');
    setSelected(null);
    onClose();
  }

  function handleManualAdd() {
    const k = parseInt(manualKcal);
    if (!k || k <= 0) { Alert.alert('Enter a valid calorie amount'); return; }
    addXp(Math.round(k / 10));
    Alert.alert('Calories logged!', `${k} kcal burned. +${Math.round(k / 10)} XP`);
    setManualKcal('');
    onClose();
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <SafeAreaView style={el.safe}>
        <View style={el.header}>
          <TouchableOpacity onPress={onClose} style={el.closeBtn}>
            <Ionicons name="close" size={16} color="#fff" />
          </TouchableOpacity>
          <Text style={el.title}>Exercise</Text>
          <TouchableOpacity onPress={() => Alert.alert('Add exercise', 'Custom exercise coming soon.')}>
            <Text style={el.addTxt}>+ Add</Text>
          </TouchableOpacity>
        </View>
        {/* Search */}
        <View style={el.searchWrap}>
          <Ionicons name="search" size={16} color="rgba(255,255,255,0.4)" />
          <TextInput style={el.searchInput} value={search} onChangeText={setSearch}
            placeholder="Search Exercise" placeholderTextColor="rgba(255,255,255,0.3)" />
        </View>
        {/* Tabs */}
        <View style={el.tabs}>
          {(['list', 'calories'] as const).map(t => (
            <TouchableOpacity key={t} style={[el.tab, exTab === t && el.tabActive]} onPress={() => setExTab(t)}>
              <Text style={[el.tabTxt, exTab === t && el.tabTxtActive]}>
                {t === 'list' ? 'EXERCISE LIST' : 'CALORIES'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        {exTab === 'list' ? (
          <ScrollView contentContainerStyle={{ padding: 14, gap: 10, paddingBottom: 50 }}>
            <Text style={el.sectionLbl}>ALL EXERCISES</Text>
            {filtered.map((ex) => (
              <TouchableOpacity key={ex.name} style={el.exCard} onPress={() => setSelected(ex)} activeOpacity={0.75}>
                <Text style={el.exIcon}>{ex.icon}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={el.exName}>{ex.name}</Text>
                  <Text style={el.exSub}>{ex.kcalPerMin} kcal/min</Text>
                </View>
                <Ionicons name="add-circle" size={22} color={colors.lavender} />
              </TouchableOpacity>
            ))}
          </ScrollView>
        ) : (
          <View style={{ padding: 16, gap: 16 }}>
            <Text style={el.sectionLbl}>CALORIES BURNED</Text>
            <TextInput style={el.calInput} value={manualKcal} onChangeText={setManualKcal}
              keyboardType="number-pad" placeholder="Enter calories burned"
              placeholderTextColor="rgba(255,255,255,0.3)" />
            <TouchableOpacity style={el.saveBtn} onPress={handleManualAdd} activeOpacity={0.85}>
              <Text style={el.saveTxt}>LOG CALORIES</Text>
            </TouchableOpacity>
          </View>
        )}
        {/* Duration selector when exercise selected */}
        {selected && exTab === 'list' && (
          <View style={el.durationPicker}>
            <Text style={el.durationTitle}>{selected.icon} {selected.name}</Text>
            <View style={el.durationRow}>
              <TextInput style={el.durInput} value={duration} onChangeText={setDuration}
                keyboardType="number-pad" />
              <Text style={el.durUnit}>min</Text>
              <TouchableOpacity style={el.logBtn} onPress={() => handleAdd(selected)}>
                <Text style={el.logBtnTxt}>LOG</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
}

// ── Activity / Steps Logger ───────────────────────────────────────────────────
function ActivityLogger({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { addXp } = useAppStore();
  const [steps, setSteps] = useState(0);
  const STEP_GOAL = 8000;

  function addSteps(n: number) { setSteps(s => Math.min(s + n, 30000)); }

  function handleSave() {
    if (steps <= 0) { Alert.alert('No steps', 'Tap a quick-add button to log steps.'); return; }
    const xpEarned = Math.round(steps / 100);
    addXp(xpEarned);
    Alert.alert('Steps logged!', `${steps.toLocaleString()} steps saved. +${xpEarned} XP`);
    setSteps(0);
    onClose();
  }

  const pct = Math.min(1, steps / STEP_GOAL);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={al.backdrop} onPress={onClose}>
        <Pressable style={al.sheet} onPress={() => {}}>
          <View style={al.handle} />
          <View style={al.header}>
            <TouchableOpacity onPress={onClose} style={al.closeBtn}>
              <Ionicons name="chevron-back" size={18} color={colors.ink2} />
            </TouchableOpacity>
            <Text style={al.title}>Daily Steps</Text>
            <View style={{ width: 34 }} />
          </View>
          {/* Progress display */}
          <View style={al.progressCard}>
            <Text style={al.stepsEmoji}>👟</Text>
            <Text style={al.stepsNum}>{steps.toLocaleString()}</Text>
            <Text style={al.stepsGoal}>of {STEP_GOAL.toLocaleString()} goal</Text>
            <View style={al.progressBarBg}>
              <View style={[al.progressBarFill, { width: `${pct * 100}%` as any }]} />
            </View>
            <Text style={al.progressPct}>{Math.round(pct * 100)}% complete</Text>
          </View>
          {/* Quick add row */}
          <Text style={al.sectionLbl}>QUICK ADD</Text>
          <View style={al.quickRow}>
            {[1000, 2000, 5000, 8000, 10000].map(n => (
              <TouchableOpacity key={n} style={al.quickBtn} onPress={() => addSteps(n)} activeOpacity={0.75}>
                <Text style={al.quickBtnTxt}>+{n >= 1000 ? `${n / 1000}k` : n}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {steps > 0 && (
            <TouchableOpacity style={al.resetBtn} onPress={() => setSteps(0)}>
              <Text style={al.resetTxt}>Reset</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={al.saveBtn} onPress={handleSave} activeOpacity={0.85}>
            <LinearGradient colors={[colors.purple, '#6d28d9']} style={al.saveGrad}>
              <Text style={al.saveTxt}>LOG STEPS {steps > 0 ? `+${Math.round(steps / 100)} XP` : ''}</Text>
            </LinearGradient>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ── Weight Logger ─────────────────────────────────────────────────────────────
function WeightLogger({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [valueKg, setValueKg] = useState(70.0);
  const [unit, setUnit] = useState<'kg' | 'lbs'>('kg');
  const { addWeightEntry, addXp } = useAppStore();

  const displayVal = unit === 'kg' ? valueKg : Math.round(valueKg * 2.2046 * 10) / 10;

  function inc() { setValueKg(v => Math.round((v + 0.1) * 10) / 10); }
  function dec() { setValueKg(v => Math.max(20, Math.round((v - 0.1) * 10) / 10)); }

  function handleSave() {
    addWeightEntry(valueKg);
    addXp(15);
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={wl.backdrop} onPress={onClose}>
        <Pressable style={wl.sheet} onPress={() => {}}>
          <View style={wl.handle} />
          <Text style={wl.title}>Log Weight</Text>
          {/* Unit toggle */}
          <View style={wl.unitRow}>
            {(['kg', 'lbs'] as const).map(u => (
              <TouchableOpacity key={u} style={[wl.unitPill, unit === u && wl.unitPillActive]}
                onPress={() => setUnit(u)} activeOpacity={0.75}>
                <Text style={[wl.unitPillTxt, unit === u && wl.unitPillTxtActive]}>{u}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {/* Stepper */}
          <View style={wl.stepperRow}>
            <TouchableOpacity style={wl.stepBtn} onPress={dec} activeOpacity={0.75}>
              <Text style={wl.stepBtnTxt}>−</Text>
            </TouchableOpacity>
            <Text style={wl.stepValue}>{displayVal.toFixed(1)}</Text>
            <TouchableOpacity style={wl.stepBtn} onPress={inc} activeOpacity={0.75}>
              <Text style={wl.stepBtnTxt}>+</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={wl.saveBtn} onPress={handleSave} activeOpacity={0.85}>
            <LinearGradient colors={[colors.purple, '#6d28d9']} style={wl.saveBtnGrad}>
              <Text style={wl.saveTxt}>SAVE +15 XP</Text>
            </LinearGradient>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ── Tab Layout ────────────────────────────────────────────────────────────────
export default function TabLayout() {
  const loadApp = useAppStore((s) => s.loadApp);
  const messagesOpen = useAppStore((s) => s.messagesOpen);
  const setMessagesOpen = useAppStore((s) => s.setMessagesOpen);
  const [fabOpen, setFabOpen] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [moodOpen, setMoodOpen] = useState(false);
  const [weightOpen, setWeightOpen] = useState(false);
  const [sleepOpen, setSleepOpen] = useState(false);
  const [exerciseOpen, setExerciseOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);

  useEffect(() => { loadApp(); }, []);

  return (
    <>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            backgroundColor: colors.layer1,
            borderTopColor: colors.line2,
            borderTopWidth: 1,
          },
          tabBarActiveTintColor: colors.lavender,
          tabBarInactiveTintColor: 'rgba(90,77,122,1)',
          tabBarLabelStyle: { fontSize: 10.5, fontWeight: '500' },
        }}
      >
        <Tabs.Screen
          name="diary"
          options={{
            title: 'Diary',
            tabBarIcon: ({ color, focused }) => (
              <View style={focused ? st.activeTab : undefined}>
                <Ionicons name={focused ? 'calendar' : 'calendar-outline'} size={22} color={color} />
              </View>
            ),
          }}
        />
        <Tabs.Screen
          name="progress"
          options={{
            title: 'Progress',
            tabBarIcon: ({ color, focused }) => (
              <View style={focused ? st.activeTab : undefined}>
                <Ionicons name={focused ? 'trending-up' : 'trending-up-outline'} size={22} color={color} />
              </View>
            ),
          }}
        />
        <Tabs.Screen
          name="log"
          options={{
            title: '',
            tabBarButton: () => <FabTabButton onPress={() => setFabOpen(true)} />,
          }}
        />
        <Tabs.Screen
          name="programs"
          options={{
            title: 'Programs',
            tabBarIcon: ({ color, focused }) => (
              <View style={focused ? st.activeTab : undefined}>
                <Ionicons name={focused ? 'grid' : 'grid-outline'} size={22} color={color} />
              </View>
            ),
          }}
        />
        <Tabs.Screen
          name="recipes"
          options={{
            title: 'Recipes',
            tabBarIcon: ({ color, focused }) => (
              <View style={focused ? st.activeTab : undefined}>
                <Ionicons name={focused ? 'restaurant' : 'restaurant-outline'} size={22} color={color} />
              </View>
            ),
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            href: null,
            tabBarStyle: { display: 'none' },
          }}
        />
      </Tabs>

      <QuickAddSheet
        visible={fabOpen}
        onClose={() => setFabOpen(false)}
        onCommandCenter={() => setCmdOpen(true)}
        onMood={() => setMoodOpen(true)}
        onWeight={() => setWeightOpen(true)}
        onSleep={() => setSleepOpen(true)}
        onExercise={() => setExerciseOpen(true)}
        onActivity={() => setActivityOpen(true)}
      />
      <CommandCenterModal visible={cmdOpen} onClose={() => setCmdOpen(false)} onNavigate={(tab) => { setCmdOpen(false); router.push(tab as any); }} />
      <MoodLogger visible={moodOpen} onClose={() => setMoodOpen(false)} />
      <WeightLogger visible={weightOpen} onClose={() => setWeightOpen(false)} />
      <SleepLogger visible={sleepOpen} onClose={() => setSleepOpen(false)} />
      <ExerciseLogger visible={exerciseOpen} onClose={() => setExerciseOpen(false)} />
      <ActivityLogger visible={activityOpen} onClose={() => setActivityOpen(false)} />
      <MessagesModal visible={messagesOpen} onClose={() => setMessagesOpen(false)} />
    </>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const st = StyleSheet.create({
  activeTab: {
    borderBottomWidth: 2,
    borderBottomColor: colors.lavender,
    paddingBottom: 2,
  },
  fabWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  fab: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.purple,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.purple,
    shadowOpacity: 0.45,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 6,
  },
  fabLabel: {
    fontSize: 9.5,
    fontWeight: '600',
    color: 'rgba(196,181,255,0.45)',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
});

// Command Center
const cc = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#060612',
  },
  gridBg: {
    ...StyleSheet.absoluteFillObject,
    opacity: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(124,77,255,0.2)',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  pulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#a855f7',
  },
  headerTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(196,181,255,0.85)',
    letterSpacing: 1.2,
    fontFamily: 'monospace',
    flexShrink: 1,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  clock: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.lavender,
    fontFamily: 'monospace',
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  exitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(196,181,255,0.2)',
    backgroundColor: 'rgba(196,181,255,0.05)',
    marginTop: 4,
    marginBottom: 8,
  },
  exitBtnTxt: {
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(196,181,255,0.7)',
    letterSpacing: 1.2,
    fontFamily: 'monospace',
  },
  scroll: {
    padding: 16,
    gap: 14,
  },
  userBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(124,77,255,0.25)',
  },
  avatarCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(124,77,255,0.18)',
    borderWidth: 2,
    borderColor: 'rgba(124,77,255,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  userName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 2,
  },
  userEmail: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.45)',
    marginBottom: 4,
  },
  userScore: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
  },
  xpBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(124,77,255,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(124,77,255,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  xpBadgeTxt: {
    fontSize: 18,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  statTile: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
    gap: 4,
  },
  statTileMid: {
    borderColor: 'rgba(124,77,255,0.3)',
    backgroundColor: 'rgba(124,77,255,0.08)',
  },
  statIcon: { fontSize: 20 },
  statVal: { fontSize: 18, fontWeight: '700', color: '#fff' },
  statLbl: { fontSize: 10, color: 'rgba(255,255,255,0.45)', textAlign: 'center' },
  ringSection: {
    flexDirection: 'row',
    gap: 14,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    borderRadius: 16,
    padding: 16,
  },
  ringWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  ringCenter: {
    position: 'absolute',
    alignItems: 'center',
  },
  ringVal: { fontSize: 16, fontWeight: '700', color: '#fff' },
  ringLbl: { fontSize: 9, color: 'rgba(255,255,255,0.45)' },
  macrosGrid: {
    flex: 1,
    gap: 12,
  },
  macroRow: {
    gap: 4,
  },
  macroLbl: { fontSize: 10, color: 'rgba(255,255,255,0.5)', fontWeight: '600', letterSpacing: 0.5 },
  macroBarBg: {
    height: 5,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  macroBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  macroVal: { fontSize: 11, color: 'rgba(255,255,255,0.7)', fontWeight: '600' },
  missionCard: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(124,77,255,0.2)',
    borderRadius: 16,
    padding: 16,
    gap: 8,
  },
  missionHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  missionTitle: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.lavender,
    letterSpacing: 1.2,
    fontFamily: 'monospace',
  },
  missionPct: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.lavender,
  },
  missionName: { fontSize: 15, fontWeight: '600', color: '#fff' },
  missionBar: {
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  missionFill: {
    height: '100%',
    backgroundColor: colors.lavender,
    borderRadius: 3,
  },
  missionSub: { fontSize: 12, color: 'rgba(255,255,255,0.45)' },
  xpCard: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    borderRadius: 16,
    padding: 16,
    gap: 8,
  },
  xpCardHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  xpCardTitle: {
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(196,181,255,0.6)',
    letterSpacing: 1.2,
    fontFamily: 'monospace',
  },
  xpCardVal: { fontSize: 14, fontWeight: '700', color: colors.lavender },
  xpBar: {
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  xpFill: {
    height: '100%',
    backgroundColor: colors.lavender,
    borderRadius: 3,
  },
  xpMeta: { fontSize: 11, color: 'rgba(255,255,255,0.4)' },
  modulesCard: {
    backgroundColor: 'rgba(124,77,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(124,77,255,0.18)',
    borderRadius: 16,
    padding: 14,
  },
  moduleTitle: {
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(196,181,255,0.4)',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  modulesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  moduleItem: {
    width: '30%',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    borderRadius: 12,
    padding: 10,
    alignItems: 'center',
    gap: 4,
  },
  moduleItemOn: {
    borderColor: 'rgba(124,77,255,0.35)',
    backgroundColor: 'rgba(124,77,255,0.1)',
  },
  moduleIcon: { fontSize: 18 },
  moduleLbl: { fontSize: 9, color: 'rgba(255,255,255,0.45)', fontWeight: '600', textAlign: 'center' },
  moduleDot: { width: 6, height: 6, borderRadius: 3, marginTop: 2 },
});

// Quick-Add Sheet
const fab = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.layer1,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 50,
    gap: 16,
    borderTopWidth: 1,
    borderTopColor: colors.line2,
  },
  heroItem: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  heroGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(124,77,255,0.3)',
    borderRadius: 16,
  },
  heroIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(124,77,255,0.15)',
    borderWidth: 1.5,
    borderColor: 'rgba(124,77,255,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.ink,
    marginBottom: 2,
  },
  heroSub: {
    fontSize: 12,
    color: colors.ink3,
  },
  smallRow: {
    flexDirection: 'row',
    gap: 10,
  },
  smallItem: {
    flex: 1,
    backgroundColor: colors.layer2,
    borderWidth: 1,
    borderColor: colors.line2,
    borderRadius: 14,
    alignItems: 'center',
    paddingVertical: 14,
    gap: 6,
  },
  smallIcon: { fontSize: 24 },
  smallLabel: { fontSize: 11, fontWeight: '600', color: colors.ink2 },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  gridItem: {
    width: '47%',
    backgroundColor: colors.layer2,
    borderWidth: 1,
    borderColor: colors.line2,
    borderRadius: 14,
    alignItems: 'center',
    paddingVertical: 16,
    gap: 6,
  },
  gridIcon: { fontSize: 26 },
  gridLabel: { fontSize: 12, fontWeight: '600', color: colors.ink2 },
  closeRow: {
    alignItems: 'center',
    paddingTop: 4,
  },
  closeCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.layer2,
    borderWidth: 1,
    borderColor: colors.line2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

// Mood Logger
const ml = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.layer1,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 50,
    gap: 18,
    borderTopWidth: 1,
    borderTopColor: colors.line2,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.line2,
    alignSelf: 'center',
    marginBottom: 4,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.ink,
    textAlign: 'center',
  },
  emojiRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 6,
  },
  emojiBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: colors.layer2,
    borderWidth: 1.5,
    borderColor: 'transparent',
    gap: 4,
  },
  emojiBtnActive: {
    borderColor: colors.lavender,
    backgroundColor: 'rgba(124,77,255,0.12)',
  },
  emoji: { fontSize: 28 },
  emojiLbl: { fontSize: 9, color: colors.ink3, fontWeight: '600' },
  emojiLblActive: { color: colors.lavender },
  notes: {
    backgroundColor: colors.layer2,
    borderWidth: 1,
    borderColor: colors.line2,
    borderRadius: 14,
    padding: 14,
    color: colors.ink,
    fontSize: 14,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  logBtn: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  logBtnGrad: {
    paddingVertical: 15,
    alignItems: 'center',
    borderRadius: 14,
  },
  logBtnTxt: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.6,
  },
});

// Weight Logger
const wl = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.layer1, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 50, gap: 20, borderTopWidth: 1, borderTopColor: colors.line2 },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.line2, alignSelf: 'center' },
  title: { fontSize: 22, fontWeight: '700', color: colors.ink, textAlign: 'center' },
  unitRow: { flexDirection: 'row', justifyContent: 'center', gap: 10 },
  unitPill: { paddingHorizontal: 22, paddingVertical: 8, borderRadius: 20, backgroundColor: colors.layer2, borderWidth: 1.5, borderColor: colors.line2 },
  unitPillActive: { backgroundColor: 'rgba(124,77,255,0.15)', borderColor: colors.lavender },
  unitPillTxt: { fontSize: 14, fontWeight: '600', color: colors.ink3 },
  unitPillTxtActive: { color: colors.lavender },
  stepperRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 28 },
  stepBtn: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.layer2, borderWidth: 1.5, borderColor: colors.lavender, alignItems: 'center', justifyContent: 'center' },
  stepBtnTxt: { fontSize: 30, fontWeight: '300', color: colors.lavender, lineHeight: 34 },
  stepValue: { fontSize: 52, fontWeight: '800', color: colors.ink, fontFamily: 'monospace', minWidth: 130, textAlign: 'center' },
  saveBtn: { borderRadius: 14, overflow: 'hidden' },
  saveBtnGrad: { paddingVertical: 15, alignItems: 'center', borderRadius: 14 },
  saveTxt: { fontSize: 14, fontWeight: '700', color: '#fff', letterSpacing: 0.6 },
});

// Activity Logger
const al = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 50, borderTopWidth: 1, borderTopColor: colors.line2 },
  handle: { width: 38, height: 4, backgroundColor: colors.layer3, borderRadius: 2, alignSelf: 'center', marginTop: 10, marginBottom: 4 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.line2 },
  closeBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.layer2, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 17, fontWeight: '700', color: colors.ink },
  progressCard: { margin: 16, backgroundColor: colors.layer1, borderWidth: 1, borderColor: colors.line, borderRadius: 18, padding: 20, alignItems: 'center', gap: 6 },
  stepsEmoji: { fontSize: 36, marginBottom: 4 },
  stepsNum: { fontSize: 42, fontWeight: '800', color: colors.lavender, fontFamily: 'monospace' },
  stepsGoal: { fontSize: 13, color: colors.ink3 },
  progressBarBg: { width: '100%', height: 8, backgroundColor: colors.layer3, borderRadius: 4, overflow: 'hidden', marginTop: 4 },
  progressBarFill: { height: '100%', backgroundColor: colors.lavender, borderRadius: 4 },
  progressPct: { fontSize: 12, color: colors.ink3, fontWeight: '600' },
  sectionLbl: { marginHorizontal: 16, fontSize: 10, fontWeight: '700', color: colors.ink3, letterSpacing: 1.2, textTransform: 'uppercase' },
  quickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginHorizontal: 16, marginTop: 8 },
  quickBtn: { flex: 1, minWidth: '17%', backgroundColor: colors.layer2, borderWidth: 1, borderColor: colors.lavender, borderRadius: 12, paddingVertical: 10, alignItems: 'center' },
  quickBtnTxt: { fontSize: 13, fontWeight: '700', color: colors.lavender },
  resetBtn: { alignSelf: 'center', marginTop: 2, paddingVertical: 4, paddingHorizontal: 16 },
  resetTxt: { fontSize: 12, color: colors.ink3, textDecorationLine: 'underline' },
  saveBtn: { margin: 16, marginTop: 14, borderRadius: 14, overflow: 'hidden' },
  saveGrad: { paddingVertical: 15, alignItems: 'center', borderRadius: 14 },
  saveTxt: { fontSize: 14, fontWeight: '700', color: '#fff', letterSpacing: 0.6 },
});

// Calendar styles
const cal = StyleSheet.create({
  card: {
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
  },
  cardHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionLbl: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  countLbl: {
    fontSize: 11,
    fontFamily: 'monospace',
  },
  weekRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  weekLbl: {
    flex: 1,
    textAlign: 'center',
    fontSize: 8,
    fontFamily: 'monospace',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 3,
  },
  cell: {
    flex: 1,
    minWidth: '12%',
    maxWidth: '14%',
    aspectRatio: 1,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  legend: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 10,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 2,
  },
  legendTxt: {
    fontSize: 10,
  },
});

// Week chart styles
const wch = StyleSheet.create({
  card: {
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
  },
  head: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  avg: {
    fontSize: 11,
    fontFamily: 'monospace',
  },
  barsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 64,
    gap: 4,
  },
  barWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    height: '100%',
  },
  bar: {
    width: '80%',
    borderRadius: 4,
    minHeight: 4,
  },
  labelsRow: {
    flexDirection: 'row',
    marginTop: 6,
  },
  barLabel: {
    flex: 1,
    textAlign: 'center',
    fontSize: 9,
    fontFamily: 'monospace',
  },
});

// Command Center module styles (added to cc)
// Messages modal styles
const msg = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.line2,
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.layer2,
    borderWidth: 1,
    borderColor: colors.line2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.ink,
    letterSpacing: -0.01 * 16,
  },
  scroll: {
    padding: 16,
    paddingBottom: 50,
    gap: 10,
  },
  emptyWrap: {
    alignItems: 'center',
    paddingTop: 40,
    paddingHorizontal: 32,
    gap: 14,
  },
  emptyIcon: { fontSize: 64 },
  emptyTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.ink,
    letterSpacing: -0.025 * 28,
    textAlign: 'center',
  },
  emptySub: {
    fontSize: 15,
    color: colors.ink2,
    lineHeight: 24,
    textAlign: 'center',
    fontWeight: '300',
  },
  groupLbl: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: colors.ink3,
    marginBottom: 4,
  },
  card: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: colors.layer2,
    borderWidth: 1,
    borderColor: colors.line2,
    borderRadius: 16,
    padding: 14,
    alignItems: 'flex-start',
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  iconTxt: { fontSize: 16 },
  cardHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 4,
    gap: 8,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.ink,
    flex: 1,
  },
  cardTime: {
    fontSize: 11,
    color: colors.ink3,
    flexShrink: 0,
  },
  cardBody: {
    fontSize: 13,
    color: colors.ink2,
    lineHeight: 19,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 4,
    flexShrink: 0,
  },
});

// ── Sleep Logger styles ────────────────────────────────────────────────────────
const sl = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 50, maxHeight: '90%' },
  handle: { width: 38, height: 4, backgroundColor: colors.layer3, borderRadius: 2, alignSelf: 'center', marginTop: 10, marginBottom: 4 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.line2 },
  backBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.layer2, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 17, fontWeight: '700', color: colors.ink },
  durationCard: { margin: 16, backgroundColor: colors.layer1, borderWidth: 1, borderColor: colors.line, borderRadius: 18, padding: 20, alignItems: 'center', gap: 4 },
  durationNum: { fontSize: 32, fontWeight: '800', color: colors.violet },
  durationLbl: { fontSize: 13, color: colors.ink3 },
  sectionLbl: { fontSize: 10, fontWeight: '700', letterSpacing: 1.2, color: colors.ink3, textTransform: 'uppercase', paddingHorizontal: 16, marginBottom: 8 },
  timeRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, marginBottom: 20 },
  timeCard: { backgroundColor: colors.layer1, borderWidth: 1, borderColor: colors.line, borderRadius: 14, padding: 14 },
  timeIcon: { fontSize: 13, color: colors.ink3, fontWeight: '600', marginBottom: 4 },
  timeInput: { fontSize: 22, fontWeight: '800', color: colors.ink },
  qualityRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 16 },
  qualityBtn: { width: 52, height: 52, borderRadius: 14, backgroundColor: colors.layer2, borderWidth: 1.5, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  qualityBtnSel: { borderColor: colors.purple, backgroundColor: colors.purple + '22' },
  qualityEmoji: { fontSize: 26 },
  notes: { marginHorizontal: 16, backgroundColor: colors.layer2, borderWidth: 1, borderColor: colors.line2, borderRadius: 14, padding: 12, color: colors.ink, fontSize: 14, minHeight: 70, marginBottom: 14, textAlignVertical: 'top' },
  saveBtn: { marginHorizontal: 16, borderRadius: 14, overflow: 'hidden' },
  saveGrad: { paddingVertical: 16, alignItems: 'center' },
  saveTxt: { fontSize: 14, fontWeight: '700', color: '#fff', letterSpacing: 0.6 },
});

// ── Exercise Logger styles ────────────────────────────────────────────────────
const el = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0c0818' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)' },
  closeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 17, fontWeight: '700', color: '#fff' },
  addTxt: { fontSize: 13, fontWeight: '600', color: colors.lavender },
  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: 10, margin: 14, backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.14)', borderRadius: 24, paddingHorizontal: 16, paddingVertical: 11 },
  searchInput: { flex: 1, color: '#fff', fontSize: 14, fontWeight: '300' },
  tabs: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)' },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: colors.lavender },
  tabTxt: { fontSize: 12, fontWeight: '700', letterSpacing: 0.5, color: 'rgba(255,255,255,0.35)' },
  tabTxtActive: { color: colors.lavender },
  sectionLbl: { fontSize: 11, fontWeight: '700', letterSpacing: 1.2, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', marginBottom: 8 },
  exCard: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', borderRadius: 14, padding: 14 },
  exIcon: { fontSize: 28 },
  exName: { fontSize: 15, fontWeight: '600', color: '#fff', marginBottom: 2 },
  exSub: { fontSize: 11, color: 'rgba(255,255,255,0.4)' },
  calInput: { backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.14)', borderRadius: 14, padding: 16, color: '#fff', fontSize: 18, fontWeight: '700', textAlign: 'center' },
  saveBtn: { backgroundColor: colors.purple, borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  saveTxt: { fontSize: 14, fontWeight: '700', color: '#fff', letterSpacing: 0.6 },
  durationPicker: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#1a1a2e', borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)', padding: 16, gap: 12 },
  durationTitle: { fontSize: 16, fontWeight: '700', color: '#fff' },
  durationRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  durInput: { backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10, color: '#fff', fontSize: 18, fontWeight: '700', minWidth: 80, textAlign: 'center' },
  durUnit: { fontSize: 14, color: 'rgba(255,255,255,0.5)' },
  logBtn: { flex: 1, backgroundColor: colors.purple, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  logBtnTxt: { fontSize: 14, fontWeight: '700', color: '#fff' },
});

