import { useState, useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  View, Text, ScrollView, TouchableOpacity, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';
import { colors, spacing, fontSize, radius } from '../../theme';
import { BackChevron } from '../BackChevron';
import { useAuthStore } from '../../store/authStore';
import { useDiaryStore } from '../../store/diaryStore';

// ── Intermittent Fasting Constants ───────────────────────────────────────────
const IF_MODES = [
  { id: '12:12', label: '12:12', fasting: 12, eating: 12, desc: 'Beginner friendly' },
  { id: '16:8',  label: '16:8',  fasting: 16, eating: 8,  desc: 'Most popular' },
  { id: '18:6',  label: '18:6',  fasting: 18, eating: 6,  desc: 'Intermediate' },
  { id: '20:4',  label: '20:4',  fasting: 20, eating: 4,  desc: 'Advanced' },
  { id: '23:1',  label: 'OMAD',  fasting: 23, eating: 1,  desc: 'One meal a day' },
];

const RING_SIZE = 220;
const RING_R = 95;
const RING_STROKE = 10;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_R;

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

interface FastingRecord { startTime: string; endTime: string; mode: string; completed: boolean; }
interface FastingState {
  mode: string;
  active: boolean;
  startTime: string | null;
  history: FastingRecord[];
}

export function FastingModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { email } = useAuthStore();
  const logFastingInterval = useDiaryStore((s) => s.logFastingInterval);
  const FASTING_KEY = `dagnara_fasting_${email ?? 'anon'}`;

  const [state, setState] = useState<FastingState>({ mode: '16:8', active: false, startTime: null, history: [] });
  const [elapsed, setElapsed] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!visible) return;
    AsyncStorage.getItem(FASTING_KEY).then((raw) => {
      if (!raw) return;
      try { setState(JSON.parse(raw)); }
      catch { void AsyncStorage.removeItem(FASTING_KEY); }
    });
  }, [visible]);

  useEffect(() => {
    if (!state.active || !state.startTime) { if (intervalRef.current) clearInterval(intervalRef.current); return; }
    function tick() { setElapsed(Date.now() - new Date(state.startTime!).getTime()); }
    tick();
    intervalRef.current = setInterval(tick, 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [state.active, state.startTime]);

  async function save(next: FastingState) {
    setState(next);
    await AsyncStorage.setItem(FASTING_KEY, JSON.stringify(next));
  }

  function deleteHistoryItem(index: number) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    const nextHistory = [...state.history];
    nextHistory.splice(index, 1);
    save({ ...state, history: nextHistory });
  }

  function toggleFast() {
    const modeInfo = IF_MODES.find(m => m.id === state.mode)!;
    if (state.active) {
      const endTime = new Date().toISOString();
      const actualHours = elapsed / 3600000;
      const completed = actualHours >= modeInfo.fasting;
      const record: FastingRecord = { startTime: state.startTime!, endTime, mode: state.mode, completed };
      save({ ...state, active: false, startTime: null, history: [record, ...state.history].slice(0, 14) });
      // Log to today's DiaryEntry so fasting is part of the unified daily timeline
      const date = new Date(state.startTime!).toLocaleDateString('en-CA');
      logFastingInterval(date, {
        startTime: state.startTime!,
        endTime,
        mode: state.mode,
        targetHours: modeInfo.fasting,
        actualHours,
        completed,
      });
      setElapsed(0);
    } else {
      save({ ...state, active: true, startTime: new Date().toISOString() });
    }
  }

  const modeInfo = IF_MODES.find(m => m.id === state.mode) ?? IF_MODES[1];
  const fastingMs = modeInfo.fasting * 3600000;
  const eatingMs = modeInfo.eating * 3600000;
  const progress = Math.min(1, elapsed / fastingMs); // Capped at 1 (100%)
  const progressPct = Math.min(100, Math.round((elapsed / fastingMs) * 100));
  const elapsedHrs = elapsed / 3600000;
  const remainingHrs = Math.max(0, modeInfo.fasting - elapsedHrs);
  const inEatingWindow = state.active && elapsedHrs >= modeInfo.fasting;
  const statusColor = inEatingWindow ? colors.green : state.active ? colors.purple : colors.ink3;

  // Computed times
  const fastEndIso = state.startTime
    ? new Date(new Date(state.startTime).getTime() + fastingMs).toISOString() : null;
  const eatEndIso = state.startTime
    ? new Date(new Date(state.startTime).getTime() + fastingMs + eatingMs).toISOString() : null;

  // Weekly stats
  const oneWeekAgo = Date.now() - 7 * 24 * 3600000;
  const weekFasts = state.history.filter(r => new Date(r.endTime).getTime() > oneWeekAgo);
  const weekCompleted = weekFasts.filter(r => r.completed).length;
  const longestFastHrs = state.history.length > 0
    ? Math.max(...state.history.map(r => (new Date(r.endTime).getTime() - new Date(r.startTime).getTime()) / 3600000))
    : 0;

  function fmtHM(hrs: number) {
    const h = Math.floor(hrs);
    const mm = Math.floor((hrs - h) * 60);
    return `${h}h ${String(mm).padStart(2, '0')}m`;
  }

  function fmtHMS(ms: number) {
    const totalSec = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  // Live countdowns
  const fastRemainingMs    = Math.max(0, fastingMs - elapsed);
  const eatingRemainingMs  = Math.max(0, fastingMs + eatingMs - elapsed);
  const countdownDisplay   = state.active
    ? (inEatingWindow ? fmtHMS(eatingRemainingMs) : fmtHMS(fastRemainingMs))
    : `${String(modeInfo.fasting).padStart(2, '0')}:00:00`;
  const countdownLabel = state.active
    ? (inEatingWindow ? 'EATING ENDS IN' : 'FASTING ENDS IN')
    : 'READY TO START';

  const strokeDashoffset = RING_CIRCUMFERENCE * (1 - progress);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['bottom']}>
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.sm }}>
          <TouchableOpacity
            onPress={onClose}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
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
          <Text style={{ flex: 1, textAlign: 'center', fontSize: fontSize.md, fontWeight: '700', color: colors.ink }}>Intermittent Fasting</Text>
          <View style={{ width: spacing.xl + spacing.sm }} />
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing.md, gap: spacing.md }} showsVerticalScrollIndicator={false}>
          {/* Mode selector */}
          <View style={{ gap: spacing.xs }}>
            <Text style={{ fontSize: fontSize.xs, fontWeight: '700', color: colors.ink3, letterSpacing: 1.1 }}>FASTING PROTOCOL</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.xs }}>
              {IF_MODES.map((m) => {
                const sel = state.mode === m.id;
                return (
                  <TouchableOpacity
                    key={m.id}
                    onPress={() => { if (!state.active) save({ ...state, mode: m.id }); }}
                    style={{ backgroundColor: sel ? colors.purpleTint : colors.layer1, borderWidth: 1, borderColor: sel ? colors.line3 : colors.line, borderRadius: radius.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, alignItems: 'center', minWidth: 72 }}
                  >
                    <Text style={{ fontSize: fontSize.md, fontWeight: '800', color: sel ? colors.purple : colors.ink }}>{m.label}</Text>
                    <Text style={{ fontSize: fontSize.xs, color: sel ? colors.purple : colors.ink3, marginTop: 2 }}>{m.desc}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* SVG Timer ring */}
          <View style={{ alignItems: 'center', paddingVertical: spacing.sm }}>
            {/* Phase badge */}
            <View style={{
              backgroundColor: inEatingWindow ? colors.green + '22' : state.active ? colors.purple + '22' : colors.line,
              borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
              marginBottom: spacing.md, borderWidth: 1,
              borderColor: inEatingWindow ? colors.green + '55' : state.active ? colors.purple + '55' : colors.line2,
            }}>
              <Text style={{ fontSize: fontSize.xs, fontWeight: '800', letterSpacing: 1.2, color: inEatingWindow ? colors.green : state.active ? colors.purple : colors.ink3 }}>
                {inEatingWindow ? 'EATING WINDOW' : state.active ? 'FASTING' : 'READY'}
              </Text>
            </View>

            <View style={{ width: RING_SIZE, height: RING_SIZE, alignItems: 'center', justifyContent: 'center' }}>
              <Svg width={RING_SIZE} height={RING_SIZE} viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`} style={{ position: 'absolute' }}>
                <Circle
                  cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={RING_R}
                  stroke={colors.line} strokeWidth={RING_STROKE} fill="none"
                />
                {state.active && (
                  <Circle
                    cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={RING_R}
                    stroke={statusColor} strokeWidth={RING_STROKE} fill="none"
                    strokeDasharray={RING_CIRCUMFERENCE}
                    strokeDashoffset={strokeDashoffset}
                    strokeLinecap="round"
                    rotation="-90"
                    origin={`${RING_SIZE / 2}, ${RING_SIZE / 2}`}
                  />
                )}
              </Svg>
              <TouchableOpacity
                onPress={toggleFast}
                activeOpacity={0.7}
                style={{
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: RING_R * 2 - RING_STROKE * 2,
                  height: RING_R * 2 - RING_STROKE * 2,
                  borderRadius: RING_R,
                }}
              >
                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.6}
                  style={{
                    fontSize: fontSize.xl,
                    fontWeight: '800',
                    color: statusColor,
                    fontVariant: ['tabular-nums'],
                    letterSpacing: 0,
                  }}
                >
                  {countdownDisplay}
                </Text>
                <Text
                  numberOfLines={1}
                  style={{
                    fontSize: fontSize.xs,
                    fontWeight: '700',
                    color: colors.ink3,
                    letterSpacing: 1.1,
                    marginTop: 4,
                  }}
                >
                  {countdownLabel}
                </Text>
                {state.active && (
                  <Text
                    numberOfLines={1}
                    style={{ fontSize: fontSize.xs, color: colors.ink3, marginTop: 2 }}
                  >
                    {progressPct}% · {inEatingWindow ? `${fmtHM(elapsedHrs - modeInfo.fasting)} eaten` : `${fmtHM(elapsedHrs)} fasted`}
                  </Text>
                )}
                <Text
                  numberOfLines={1}
                  style={{
                    fontSize: fontSize.xs,
                    fontWeight: '700',
                    color: state.active ? colors.rose : colors.purple,
                    letterSpacing: 1.1,
                    marginTop: spacing.sm,
                  }}
                >
                  {state.active ? 'TAP TO END' : 'TAP TO START'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Time stats row */}
            {state.active && (
              <View style={{ marginTop: spacing.md, flexDirection: 'row', gap: spacing.lg }}>
                <View style={{ alignItems: 'center' }}>
                  <Text style={{ fontSize: fontSize.md, fontWeight: '800', color: colors.purple, fontVariant: ['tabular-nums'] }}>{fmtHM(elapsedHrs)}</Text>
                  <Text style={{ fontSize: fontSize.xs, color: colors.ink3, marginTop: 2 }}>Fasted</Text>
                </View>
                {!inEatingWindow && (
                  <View style={{ alignItems: 'center' }}>
                    <Text style={{ fontSize: fontSize.md, fontWeight: '800', color: colors.honey, fontVariant: ['tabular-nums'] }}>{fmtHM(remainingHrs)}</Text>
                    <Text style={{ fontSize: fontSize.xs, color: colors.ink3, marginTop: 2 }}>Remaining</Text>
                  </View>
                )}
                <View style={{ alignItems: 'center' }}>
                  <Text style={{ fontSize: fontSize.md, fontWeight: '800', color: colors.teal }}>
                    {inEatingWindow ? fmtHM(Math.max(0, modeInfo.fasting + modeInfo.eating - elapsedHrs)) : `${modeInfo.eating}h`}
                  </Text>
                  <Text style={{ fontSize: fontSize.xs, color: colors.ink3, marginTop: 2 }}>
                    {inEatingWindow ? 'Eating left' : 'Eating window'}
                  </Text>
                </View>
              </View>
            )}

            {/* Scheduled times */}
            {state.active && fastEndIso && eatEndIso && (
              <View style={{ marginTop: spacing.md, flexDirection: 'row', gap: spacing.sm }}>
                <View style={{ flex: 1, backgroundColor: colors.layer1, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, padding: spacing.sm, alignItems: 'center' }}>
                  <Text style={{ fontSize: fontSize.xs, color: colors.ink3 }}>Started</Text>
                  <Text style={{ fontSize: fontSize.sm, fontWeight: '700', color: colors.ink, marginTop: 2 }}>{fmtTime(state.startTime!)}</Text>
                </View>
                <View style={{ flex: 1, backgroundColor: colors.layer1, borderRadius: radius.md, borderWidth: 1, borderColor: inEatingWindow ? colors.green + '44' : colors.line, padding: spacing.sm, alignItems: 'center' }}>
                  <Text style={{ fontSize: fontSize.xs, color: colors.ink3 }}>Eat from</Text>
                  <Text style={{ fontSize: fontSize.sm, fontWeight: '700', color: inEatingWindow ? colors.green : colors.ink, marginTop: 2 }}>{fmtTime(fastEndIso)}</Text>
                </View>
                <View style={{ flex: 1, backgroundColor: colors.layer1, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, padding: spacing.sm, alignItems: 'center' }}>
                  <Text style={{ fontSize: fontSize.xs, color: colors.ink3 }}>Window ends</Text>
                  <Text style={{ fontSize: fontSize.sm, fontWeight: '700', color: colors.ink, marginTop: 2 }}>{fmtTime(eatEndIso)}</Text>
                </View>
              </View>
            )}
          </View>

          {/* Weekly stats */}
          {state.history.length > 0 && (
            <View style={{ gap: spacing.sm }}>
              <Text style={{ fontSize: fontSize.xs, fontWeight: '700', color: colors.ink3, letterSpacing: 1.1 }}>THIS WEEK</Text>
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                <View style={{ flex: 1, backgroundColor: colors.layer1, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, padding: spacing.md, alignItems: 'center' }}>
                  <Text style={{ fontSize: fontSize.xl, fontWeight: '800', color: colors.purple }}>{weekFasts.length}</Text>
                  <Text style={{ fontSize: fontSize.xs, color: colors.ink3, marginTop: 2 }}>Fasts</Text>
                </View>
                <View style={{ flex: 1, backgroundColor: colors.layer1, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, padding: spacing.md, alignItems: 'center' }}>
                  <Text style={{ fontSize: fontSize.xl, fontWeight: '800', color: colors.green }}>{weekCompleted}</Text>
                  <Text style={{ fontSize: fontSize.xs, color: colors.ink3, marginTop: 2 }}>Goals met</Text>
                </View>
                <View style={{ flex: 1, backgroundColor: colors.layer1, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, padding: spacing.md, alignItems: 'center' }}>
                  <Text style={{ fontSize: fontSize.xl, fontWeight: '800', color: colors.teal }}>{Math.round(longestFastHrs)}h</Text>
                  <Text style={{ fontSize: fontSize.xs, color: colors.ink3, marginTop: 2 }}>Best fast</Text>
                </View>
              </View>
            </View>
          )}

          {/* History */}
          {state.history.length > 0 && (
            <View style={{ gap: spacing.sm }}>
              <Text style={{ fontSize: fontSize.xs, fontWeight: '700', color: colors.ink3, letterSpacing: 1.1 }}>RECENT FASTS</Text>
              {state.history.slice(0, 10).map((rec, i) => {
                const dur = (new Date(rec.endTime).getTime() - new Date(rec.startTime).getTime()) / 3600000;
                const mInfo = IF_MODES.find(m => m.id === rec.mode) ?? IF_MODES[1];
                return (
                  <View key={i} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.layer1, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, padding: spacing.md, gap: spacing.sm }}>
                    <Text style={{ fontSize: fontSize.md }}>{rec.completed ? '✅' : '⭕'}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: fontSize.sm, fontWeight: '600', color: colors.ink }}>{mInfo.label} — {fmtHM(dur)}</Text>
                      <Text style={{ fontSize: fontSize.xs, color: colors.ink3 }}>{new Date(rec.startTime).toLocaleDateString()}</Text>
                    </View>
                    <View style={{ backgroundColor: rec.completed ? colors.green + '22' : colors.honey + '22', borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 3, marginRight: spacing.xs }}>
                      <Text style={{ fontSize: fontSize.xs, fontWeight: '700', color: rec.completed ? colors.green : colors.honey }}>{rec.completed ? 'Goal met' : 'Partial'}</Text>
                    </View>
                    <TouchableOpacity onPress={() => deleteHistoryItem(i)} hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}>
                      <Ionicons name="close-circle" size={26} color={colors.rose} />
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          )}

          <View style={{ height: 32 }} />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}
