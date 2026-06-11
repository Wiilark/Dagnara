import { useState, useEffect, useRef } from 'react';
import { Tabs, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  View, TouchableOpacity, StyleSheet, Text, Modal,
  ScrollView, TextInput, Alert, Pressable, Animated,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, spacing, fontSize, radius } from '../../src/theme';
import { BackChevron } from '../../src/components/BackChevron';
import { FloatingModalHeader } from '../../src/components/FloatingModalHeader';
import { formatWeight } from '../../src/lib/units';
import { fmt } from '../../src/lib/format';
import { useAppStore } from '../../src/store/appStore';
import { useAuthStore } from '../../src/store/authStore';
import { useDiaryStore } from '../../src/store/diaryStore';
import { sendCoachMessage, type CoachMessage } from '../../src/lib/api';
import { MESSAGES, MSG_COLORS, groupMessages, countUnread } from '../../src/lib/messages';

const TODAY = () => new Date().toLocaleDateString('en-CA');

// ── FAB Tab Button ────────────────────────────────────────────────────────────
function FabTabButton({ onPress }: { onPress: () => void }) {
  return (
    <TouchableOpacity style={st.fabWrap} onPress={onPress} activeOpacity={0.8}>
      <View style={st.fab}>
        <Ionicons name="add" size={20} color={colors.white} />
      </View>
      <Text style={st.fabLabel}>Log</Text>
    </TouchableOpacity>
  );
}



// ── AI Nutrition Coach Modal ──────────────────────────────────────────────────
function CoachModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { profile } = useAuthStore();
  const { weightGoal, activityLevel, calorieGoal } = useAppStore();
  const [messages, setMessages] = useState<CoachMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (!visible) { setMessages([]); setInput(''); setLoading(false); }
  }, [visible]);

  useEffect(() => {
    if (messages.length > 0) setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
  }, [messages]);

  const context = [
    profile.name ? `Name: ${profile.name}` : null,
    profile.age ? `Age: ${profile.age}` : null,
    profile.weight ? `Weight: ${profile.weight}kg` : null,
    `Goal: ${weightGoal}`,
    `Activity: ${activityLevel}`,
    `Calorie target: ${calorieGoal} kcal`,
    profile.sex ? `Sex: ${profile.sex}` : null,
  ].filter(Boolean).join(', ');

  async function handleSend() {
    const text = input.trim();
    if (!text || loading) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const next: CoachMessage[] = [...messages, { role: 'user', content: text }];
    setMessages(next);
    setInput('');
    setLoading(true);
    try {
      const reply = await sendCoachMessage(next, context);
      setMessages(m => [...m, { role: 'assistant', content: reply }]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Something went wrong';
      setMessages(m => [...m, { role: 'assistant', content: `Sorry, I couldn't respond right now. (${msg})` }]);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={coach.safe} edges={['top', 'bottom']}>
        <LinearGradient
          colors={['rgba(124,77,255,0.18)', 'transparent']}
          style={StyleSheet.absoluteFillObject}
          start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 0.3 }}
          pointerEvents="none"
        />
        <View style={coach.header}>
          <TouchableOpacity onPress={onClose} style={coach.closeBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="close" size={22} color={colors.ink2} />
          </TouchableOpacity>
          <View style={coach.headerCenter}>
            <Text style={coach.headerTitle}>AI Coach</Text>
            <Text style={coach.headerSub}>Nutrition · Macros · Habits</Text>
          </View>
          <View style={{ width: 36 }} />
        </View>

        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={coach.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {messages.length === 0 && (
            <View style={coach.emptyWrap}>
              <Text style={coach.emptyIcon}>🥗</Text>
              <Text style={coach.emptyTitle}>Your nutrition coach</Text>
              <Text style={coach.emptySub}>Ask me anything about nutrition, macros, meal ideas, or healthy habits.</Text>
              <View style={coach.suggestionRow}>
                {[
                  'What should I eat before a workout?',
                  'How much protein do I need?',
                  'Help me plan a high-protein day',
                ].map(s => (
                  <TouchableOpacity key={s} style={coach.suggestion} onPress={() => setInput(s)} activeOpacity={0.75}>
                    <Text style={coach.suggestionTxt}>{s}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}
          {messages.map((m, i) => (
            <View key={i} style={[coach.bubble, m.role === 'user' ? coach.bubbleUser : coach.bubbleAssistant]}>
              {m.role === 'assistant' && (
                <View style={coach.avatarDot}>
                  <Text style={coach.avatarEmoji}>🥗</Text>
                </View>
              )}
              <View style={[coach.bubbleInner, m.role === 'user' ? coach.bubbleInnerUser : coach.bubbleInnerAssistant]}>
                <Text style={[coach.bubbleTxt, m.role === 'user' && coach.bubbleTxtUser]}>{m.content}</Text>
              </View>
            </View>
          ))}
          {loading && (
            <View style={[coach.bubble, coach.bubbleAssistant]}>
              <View style={coach.avatarDot}><Text style={coach.avatarEmoji}>🥗</Text></View>
              <View style={[coach.bubbleInner, coach.bubbleInnerAssistant]}>
                <Text style={coach.typingDots}>· · ·</Text>
              </View>
            </View>
          )}
        </ScrollView>

        <View style={coach.inputRow}>
          <TextInput
            style={coach.input}
            value={input}
            onChangeText={setInput}
            placeholder="Ask your coach…"
            placeholderTextColor={colors.ink3}
            multiline
            maxLength={500}
            returnKeyType="send"
            blurOnSubmit={false}
            onSubmitEditing={handleSend}
          />
          <TouchableOpacity
            style={[coach.sendBtn, (!input.trim() || loading) && coach.sendBtnDisabled]}
            onPress={handleSend}
            activeOpacity={0.8}
            disabled={!input.trim() || loading}
          >
            <Ionicons name="arrow-up" size={18} color={colors.white} />
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

// ── Messages Modal ────────────────────────────────────────────────────────────
function MessagesModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const readMessageIds = useAppStore((s) => s.readMessageIds);
  const markMessageRead = useAppStore((s) => s.markMessageRead);
  const isUnread = (m: typeof MESSAGES[number]) => !!m.unread && !readMessageIds.includes(m.id);
  const unreadCount = countUnread(readMessageIds);
  const groups = groupMessages();

  // Floating header — blur + centered title fade in on scroll, mirroring the profile header.
  const scrollY = useRef(new Animated.Value(0)).current;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={msg.safe} edges={['top', 'bottom']}>
        <LinearGradient
          colors={['rgba(124,77,255,0.18)', 'transparent']}
          style={StyleSheet.absoluteFillObject}
          start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 0.32 }}
          pointerEvents="none"
        />

        <FloatingModalHeader scrollY={scrollY} title="Inbox" onBack={onClose} />

        <Animated.ScrollView
          contentContainerStyle={msg.scroll}
          showsVerticalScrollIndicator={false}
          scrollEventThrottle={16}
          onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })}
        >
          {/* Big left-aligned title + unread counter badge */}
          <View style={msg.titleRow}>
            <Text style={msg.bigTitle}>Inbox</Text>
            {unreadCount > 0 && (
              <View style={msg.countBadge}>
                <Text style={msg.countTxt}>{unreadCount}</Text>
              </View>
            )}
          </View>

          {MESSAGES.length === 0 ? (
            <View style={msg.emptyWrap}>
              <Text style={msg.emptyIcon}>📬</Text>
              <Text style={msg.emptyTitle}>Your inbox</Text>
              <Text style={msg.emptySub}>Get science-backed content on nutrition and behaviour created by experts, new app features, and more.</Text>
            </View>
          ) : (
            groups.map((group, gi) => (
              <View key={group.label} style={gi > 0 ? { marginTop: spacing.lg } : undefined}>
                <Text style={msg.groupLbl}>{group.label}</Text>
                {group.items.map((m) => {
                  const accent = MSG_COLORS[m.type] ?? colors.lavender;
                  const unread = isUnread(m);
                  const onPress = () => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    markMessageRead(m.id);
                    if (m.route) { router.push(m.route); onClose(); }
                  };
                  return (
                    <TouchableOpacity key={m.id} style={[msg.card, unread && msg.cardUnread]} onPress={onPress} activeOpacity={0.85}>
                      <View style={msg.cardRow}>
                        <View style={[msg.iconWrap, { backgroundColor: `${accent}22` }]}>
                          <Text style={msg.iconTxt}>{m.icon}</Text>
                          {unread && <View style={msg.unreadDot} />}
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[msg.cardTitle, unread && msg.cardTitleUnread]}>{m.title}</Text>
                          <Text style={msg.cardBody}>{m.body}</Text>
                          {!!m.cta && (
                            <TouchableOpacity style={msg.ctaPill} onPress={onPress} activeOpacity={0.8}>
                              <Text style={msg.ctaTxt}>{m.cta}</Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))
          )}
        </Animated.ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

// ── Quick-Add FAB Sheet ───────────────────────────────────────────────────────
function QuickAddSheet({ visible, onClose, onExercise, onWeight, onMood, onSleep, onActivity }: {
  visible: boolean;
  onClose: () => void;
  onExercise: () => void;
  onWeight: () => void;
  onMood: () => void;
  onSleep: () => void;
  onActivity: () => void;
}) {
  const { setPendingAddMeal } = useAppStore();

  function openMeal(meal: string) {
    onClose();
    setPendingAddMeal(meal);
    setTimeout(() => router.push('/(tabs)/diary'), 220);
  }

  function open(cb: () => void) { onClose(); setTimeout(cb, 280); }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={fab.backdrop} onPress={onClose}>
        <Pressable style={fab.sheet} onPress={() => {}}>
          {/* Exercise */}
          <TouchableOpacity
            style={fab.exerciseBtn}
            onPress={() => open(onExercise)}
            activeOpacity={0.75}
          >
            <Text style={fab.exerciseIcon}>🏋️</Text>
            <Text style={fab.exerciseLabel}>Exercise</Text>
          </TouchableOpacity>

          {/* Meal Grid */}
          <View style={fab.grid}>
            {[
              { icon: '🍳', label: 'Breakfast', meal: 'breakfast' },
              { icon: '🥗', label: 'Lunch',     meal: 'lunch'     },
              { icon: '🍽️', label: 'Dinner',    meal: 'dinner'    },
              { icon: '🍎', label: 'Snack',      meal: 'snack'     },
            ].map(item => (
              <TouchableOpacity key={item.meal} style={fab.gridItem} onPress={() => openMeal(item.meal)} activeOpacity={0.75}>
                <Text style={fab.gridIcon}>{item.icon}</Text>
                <Text style={fab.gridLabel}>{item.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Quick loggers row */}
          <View style={fab.smallRow}>
            {[
              { icon: '⚖️', label: 'Weight',   cb: onWeight   },
              { icon: '😊', label: 'Mood',     cb: onMood     },
              { icon: '😴', label: 'Sleep',    cb: onSleep    },
              { icon: '🏃', label: 'Activity', cb: onActivity },
            ].map(item => (
              <TouchableOpacity key={item.label} style={fab.smallItem} onPress={() => open(item.cb)} activeOpacity={0.75}>
                <Text style={fab.smallIcon}>{item.icon}</Text>
                <Text style={fab.smallLabel}>{item.label}</Text>
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
  const { addXp } = useAppStore();
  const { logMood } = useDiaryStore();

  useEffect(() => {
    if (!visible) { setSelected(2); }
  }, [visible]);

  async function handleLog() {
    await logMood(TODAY(), selected);
    addXp(10);
    Alert.alert('Mood logged!', `${MOODS[selected]} Feeling ${MOOD_LABELS[selected]} saved. +10 XP`);
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
          <TouchableOpacity style={ml.logBtn} onPress={handleLog} activeOpacity={0.85}>
            <LinearGradient colors={[colors.purple, colors.purpleGlow]} style={ml.logBtnGrad}>
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
  const { logSleep } = useDiaryStore();
  const [bedtime, setBedtime] = useState('22:30');
  const [waketime, setWaketime] = useState('06:00');
  const [quality, setQuality] = useState(2);
  const QUALITIES = ['😫', '😕', '😐', '😊', '🌟'];

  useEffect(() => {
    if (!visible) { setBedtime('22:30'); setWaketime('06:00'); setQuality(2); }
  }, [visible]);

  function getDuration() {
    const [bh, bm] = bedtime.split(':').map(Number);
    const [wh, wm] = waketime.split(':').map(Number);
    let mins = (wh * 60 + wm) - (bh * 60 + bm);
    if (mins < 0) mins += 24 * 60;
    return `${Math.floor(mins / 60)}h ${mins % 60}m`;
  }

  async function handleSave() {
    const duration = getDuration();
    await logSleep(TODAY(), { bedtime, waketime, quality, duration });
    await addXp(20);
    Alert.alert('Sleep logged!', `${duration} sleep saved. +20 XP`);
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={sl.backdrop} onPress={onClose}>
        <Pressable style={sl.sheet} onPress={() => {}}>
          <View style={sl.handle} />
          <View style={sl.header}>
            <TouchableOpacity onPress={onClose} style={sl.backBtn}>
              <BackChevron size={20} />
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
          <TouchableOpacity style={sl.saveBtn} onPress={handleSave} activeOpacity={0.85}>
            <LinearGradient colors={[colors.purpleGlow, colors.purple]} style={sl.saveGrad}>
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
  const { addCaloriesBurned } = useDiaryStore();
  const [search, setSearch] = useState('');
  const [exTab, setExTab] = useState<'list' | 'calories'>('list');
  const [duration, setDuration] = useState('30');
  const [manualKcal, setManualKcal] = useState('');
  const [selected, setSelected] = useState<typeof EXERCISE_CATS[0] | null>(null);

  useEffect(() => {
    if (!visible) { setSearch(''); setExTab('list'); setDuration('30'); setManualKcal(''); setSelected(null); }
  }, [visible]);

  const filtered = search.length > 0
    ? EXERCISE_CATS.filter(e => e.name.toLowerCase().includes(search.toLowerCase()))
    : EXERCISE_CATS;

  async function handleAdd(ex: typeof EXERCISE_CATS[0]) {
    const mins = parseInt(duration, 10) || 30;
    const kcal = ex.kcalPerMin * mins;
    const todayKey = TODAY();
    await addCaloriesBurned(todayKey, kcal);
    addXp(Math.round(kcal / 10));
    Alert.alert('Exercise logged!', `${ex.icon} ${ex.name} – ${kcal} kcal burned in ${mins} min. +${Math.round(kcal / 10)} XP`);
    setSearch('');
    setSelected(null);
    onClose();
  }

  async function handleManualAdd() {
    const k = parseInt(manualKcal, 10);
    if (!k || k <= 0) { Alert.alert('Enter a valid calorie amount'); return; }
    const todayKey = TODAY();
    await addCaloriesBurned(todayKey, k);
    addXp(Math.round(k / 10));
    Alert.alert('Calories logged!', `${k} kcal burned. +${Math.round(k / 10)} XP`);
    setManualKcal('');
    onClose();
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <SafeAreaView style={el.safe} edges={['top', 'bottom']}>
        <View style={el.header}>
          <TouchableOpacity onPress={onClose} style={el.closeBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="close" size={22} color={colors.ink2} />
          </TouchableOpacity>
          <Text style={el.title}>Exercise</Text>
          <TouchableOpacity onPress={() => Alert.alert('Add exercise', 'Custom exercise coming soon.')}>
            <Text style={el.addTxt}>+ Add</Text>
          </TouchableOpacity>
        </View>
        {/* Search */}
        <View style={el.searchWrap}>
          <Ionicons name="search" size={16} color={colors.ink2} />
          <TextInput style={el.searchInput} value={search} onChangeText={setSearch}
            placeholder="Search Exercise" placeholderTextColor={colors.ink3} />
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
              placeholderTextColor={colors.ink3} />
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
  const { logSteps } = useDiaryStore();
  const [steps, setSteps] = useState(0);
  const STEP_GOAL = 8000;

  useEffect(() => {
    if (!visible) setSteps(0);
  }, [visible]);

  function addSteps(n: number) { setSteps(s => Math.min(s + n, 30000)); }

  async function handleSave() {
    if (steps <= 0) { Alert.alert('No steps', 'Tap a quick-add button to log steps.'); return; }
    await logSteps(TODAY(), steps);
    const xpEarned = Math.round(steps / 100);
    addXp(xpEarned);
    Alert.alert('Steps logged!', `${fmt(steps)} steps saved. +${fmt(xpEarned)} XP`);
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
              <BackChevron size={20} />
            </TouchableOpacity>
            <Text style={al.title}>Daily Steps</Text>
            <View style={{ width: 34 }} />
          </View>
          {/* Progress display */}
          <View style={al.progressCard}>
            <Text style={al.stepsEmoji}>👟</Text>
            <Text style={al.stepsNum}>{fmt(steps)}</Text>
            <Text style={al.stepsGoal}>of {fmt(STEP_GOAL)} goal</Text>
            <View style={al.progressBarBg}>
              <View style={[al.progressBarFill, { width: `${pct * 100}%` }]} />
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
            <LinearGradient colors={[colors.purple, colors.purpleGlow]} style={al.saveGrad}>
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
  const { addWeightEntry, addXp, unitSystem, weightHistory } = useAppStore();

  useEffect(() => {
    if (visible) {
      const last = weightHistory.length > 0 ? weightHistory[weightHistory.length - 1].kg : 70.0;
      setValueKg(last);
    }
  }, [visible]);

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
          {/* Stepper */}
          <View style={wl.stepperRow}>
            <TouchableOpacity style={wl.stepBtn} onPress={dec} activeOpacity={0.75}>
              <Text style={wl.stepBtnTxt}>−</Text>
            </TouchableOpacity>
            <Text style={wl.stepValue}>{formatWeight(valueKg, unitSystem)}</Text>
            <TouchableOpacity style={wl.stepBtn} onPress={inc} activeOpacity={0.75}>
              <Text style={wl.stepBtnTxt}>+</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={wl.saveBtn} onPress={handleSave} activeOpacity={0.85}>
            <LinearGradient colors={[colors.purple, colors.purpleGlow]} style={wl.saveBtnGrad}>
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
  const coachOpen = useAppStore((s) => s.coachOpen);
  const setCoachOpen = useAppStore((s) => s.setCoachOpen);
  const [fabOpen, setFabOpen] = useState(false);
  const [exerciseOpen, setExerciseOpen] = useState(false);
  const [weightOpen, setWeightOpen] = useState(false);
  const [moodOpen, setMoodOpen] = useState(false);
  const [sleepOpen, setSleepOpen] = useState(false);
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
          tabBarActiveTintColor: colors.white,
          tabBarInactiveTintColor: colors.ink3,
          tabBarLabelStyle: { fontSize: fontSize.xs - 0.5, fontWeight: '500' },
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
        onExercise={() => setExerciseOpen(true)}
        onWeight={() => setWeightOpen(true)}
        onMood={() => setMoodOpen(true)}
        onSleep={() => setSleepOpen(true)}
        onActivity={() => setActivityOpen(true)}
      />
      <ExerciseLogger visible={exerciseOpen} onClose={() => setExerciseOpen(false)} />
      <WeightLogger visible={weightOpen} onClose={() => setWeightOpen(false)} />
      <MoodLogger visible={moodOpen} onClose={() => setMoodOpen(false)} />
      <SleepLogger visible={sleepOpen} onClose={() => setSleepOpen(false)} />
      <ActivityLogger visible={activityOpen} onClose={() => setActivityOpen(false)} />
      <MessagesModal visible={messagesOpen} onClose={() => setMessagesOpen(false)} />
      <CoachModal visible={coachOpen} onClose={() => setCoachOpen(false)} />
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
    borderRadius: radius.lg,
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
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: colors.ink3,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
});

// ── Command Center styles ─────────────────────────────────────────────────────

// Quick-Add Sheet
const fab = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: colors.dim,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.layer1,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.lg,
    paddingBottom: spacing.xl + spacing.md,
    gap: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.line2,
  },
  smallRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  smallItem: {
    flex: 1,
    backgroundColor: colors.layer2,
    borderWidth: 1,
    borderColor: colors.line2,
    borderRadius: radius.sm,
    alignItems: 'center',
    paddingVertical: spacing.sm + 4,
    gap: spacing.xs,
  },
  smallIcon: { fontSize: fontSize.lg },
  smallLabel: { fontSize: fontSize.xs, fontWeight: '600', color: colors.ink2 },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  gridItem: {
    width: '47%',
    backgroundColor: colors.layer2,
    borderWidth: 1,
    borderColor: colors.line2,
    borderRadius: radius.sm,
    alignItems: 'center',
    paddingVertical: spacing.md,
    gap: spacing.xs,
  },
  gridIcon: { fontSize: fontSize.xl },
  gridLabel: { fontSize: fontSize.xs, fontWeight: '600', color: colors.ink2 },
  closeRow: {
    alignItems: 'center',
    paddingTop: 4,
  },
  closeCircle: {
    width: 44,
    height: 44,
    borderRadius: radius.xl,
    backgroundColor: colors.layer2,
    borderWidth: 1,
    borderColor: colors.line2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exerciseBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.layer2,
    borderWidth: 1,
    borderColor: colors.line2,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
  },
  exerciseIcon: { fontSize: fontSize.xl },
  exerciseLabel: { fontSize: fontSize.base, fontWeight: '700', color: colors.ink },
});

// Mood Logger
const ml = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: colors.dim,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.layer1,
    borderTopLeftRadius: radius.lg + 2,
    borderTopRightRadius: radius.lg + 2,
    padding: spacing.lg,
    paddingBottom: spacing.xl + spacing.md - 2,
    gap: spacing.md + 2,
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
    fontSize: fontSize.md + 3,
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
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.md - 2,
    backgroundColor: colors.layer2,
    borderWidth: 1.5,
    borderColor: colors.layer2,
    gap: 4,
  },
  emojiBtnActive: {
    borderColor: colors.lavender,
    backgroundColor: colors.purple + '1e',
  },
  emoji: { fontSize: fontSize.lg + 6 },
  emojiLbl: { fontSize: fontSize.xs - 2, color: colors.ink3, fontWeight: '600' },
  emojiLblActive: { color: colors.lavender },
  logBtn: {
    borderRadius: radius.md - 2,
    overflow: 'hidden',
  },
  logBtnGrad: {
    paddingVertical: spacing.md - 1,
    alignItems: 'center',
    borderRadius: radius.md - 2,
  },
  logBtnTxt: {
    fontSize: fontSize.sm + 1,
    fontWeight: '700',
    color: colors.ink,
    letterSpacing: 0.6,
  },
});

// Weight Logger
const wl = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.dim, justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.layer1, borderTopLeftRadius: radius.lg + 2, borderTopRightRadius: radius.lg + 2, padding: spacing.lg, paddingBottom: spacing.xl + spacing.md - 2, gap: spacing.lg - 4, borderTopWidth: 1, borderTopColor: colors.line2 },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.line2, alignSelf: 'center' },
  title: { fontSize: fontSize.lg, fontWeight: '700', color: colors.ink, textAlign: 'center' },
  unitRow: { flexDirection: 'row', justifyContent: 'center', gap: spacing.sm },
  unitPill: { paddingHorizontal: spacing.lg - 2, paddingVertical: spacing.xs + 2, borderRadius: radius.lg - 2, backgroundColor: colors.layer2, borderWidth: 1.5, borderColor: colors.line2 },
  unitPillActive: { backgroundColor: colors.purple + '26', borderColor: colors.lavender },
  unitPillTxt: { fontSize: fontSize.sm + 1, fontWeight: '600', color: colors.ink3 },
  unitPillTxtActive: { color: colors.lavender },
  stepperRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xl - 8 },
  stepBtn: { width: 56, height: 56, borderRadius: radius.xl - 2, backgroundColor: colors.layer2, borderWidth: 1.5, borderColor: colors.lavender, alignItems: 'center', justifyContent: 'center' },
  stepBtnTxt: { fontSize: fontSize['2xl'] - 8, fontWeight: '300', color: colors.lavender, lineHeight: 34 },
  stepValue: { fontSize: fontSize['2xl'] + 14, fontWeight: '800', color: colors.ink, fontFamily: 'monospace', minWidth: 130, textAlign: 'center' },
  saveBtn: { borderRadius: radius.md - 2, overflow: 'hidden' },
  saveBtnGrad: { paddingVertical: spacing.md - 1, alignItems: 'center', borderRadius: radius.md - 2 },
  saveTxt: { fontSize: fontSize.sm + 1, fontWeight: '700', color: colors.ink, letterSpacing: 0.6 },
});

// Activity Logger
const al = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.dim, justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.bg, borderTopLeftRadius: radius.lg + 2, borderTopRightRadius: radius.lg + 2, paddingBottom: spacing.xl + spacing.md - 2, borderTopWidth: 1, borderTopColor: colors.line2 },
  handle: { width: 38, height: 4, backgroundColor: colors.layer3, borderRadius: 2, alignSelf: 'center', marginTop: spacing.sm, marginBottom: 4 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.line2 },
  closeBtn: { width: 34, height: 34, borderRadius: radius.md + 1, backgroundColor: colors.layer2, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: fontSize.md, fontWeight: '700', color: colors.ink },
  progressCard: { margin: spacing.md, backgroundColor: colors.layer1, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md + 2, padding: spacing.lg - 4, alignItems: 'center', gap: 6 },
  stepsEmoji: { fontSize: fontSize['2xl'] - 2, marginBottom: 4 },
  stepsNum: { fontSize: fontSize['2xl'] + 4, fontWeight: '800', color: colors.lavender, fontFamily: 'monospace' },
  stepsGoal: { fontSize: fontSize.sm, color: colors.ink3 },
  progressBarBg: { width: '100%', height: 8, backgroundColor: colors.layer3, borderRadius: 4, overflow: 'hidden', marginTop: 4 },
  progressBarFill: { height: '100%', backgroundColor: colors.lavender, borderRadius: 4 },
  progressPct: { fontSize: fontSize.xs + 1, color: colors.ink3, fontWeight: '600' },
  sectionLbl: { marginHorizontal: spacing.md, fontSize: fontSize.xs - 1, fontWeight: '700', color: colors.ink3, letterSpacing: 1.2, textTransform: 'uppercase' },
  quickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs + 2, marginHorizontal: spacing.md, marginTop: spacing.xs + 2 },
  quickBtn: { flex: 1, minWidth: '17%', backgroundColor: colors.layer2, borderWidth: 1, borderColor: colors.lavender, borderRadius: radius.sm + 2, paddingVertical: spacing.sm, alignItems: 'center' },
  quickBtnTxt: { fontSize: fontSize.sm, fontWeight: '700', color: colors.lavender },
  resetBtn: { alignSelf: 'center', marginTop: 2, paddingVertical: 4, paddingHorizontal: spacing.md },
  resetTxt: { fontSize: fontSize.xs + 1, color: colors.ink3, textDecorationLine: 'underline' },
  saveBtn: { margin: spacing.md, marginTop: spacing.sm + 4, borderRadius: radius.md - 2, overflow: 'hidden' },
  saveGrad: { paddingVertical: spacing.md - 1, alignItems: 'center', borderRadius: radius.md - 2 },
  saveTxt: { fontSize: fontSize.sm + 1, fontWeight: '700', color: colors.ink, letterSpacing: 0.6 },
});

// Messages modal styles
const msg = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  scroll: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xl + spacing.sm,
    paddingBottom: spacing.xl,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  bigTitle: {
    fontSize: fontSize['2xl'],
    fontWeight: '800',
    color: colors.ink,
    letterSpacing: -0.5,
  },
  countBadge: {
    minWidth: spacing.lg + spacing.xs,
    height: spacing.lg + spacing.xs,
    borderRadius: radius.sm,
    backgroundColor: colors.rose,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
  },
  countTxt: {
    fontSize: fontSize.base,
    fontWeight: '800',
    color: colors.white,
  },
  emptyWrap: {
    alignItems: 'center',
    paddingTop: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  emptyIcon: { fontSize: fontSize['2xl'], marginBottom: spacing.md },
  emptyTitle: {
    fontSize: fontSize.lg,
    fontWeight: '800',
    color: colors.ink,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  emptySub: {
    fontSize: fontSize.base,
    color: colors.ink2,
    lineHeight: 22,
    textAlign: 'center',
    fontWeight: '400',
  },
  groupLbl: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    color: colors.ink3,
    marginBottom: spacing.sm,
  },
  card: {
    backgroundColor: colors.layer1,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  cardUnread: {
    backgroundColor: colors.purpleTint,
    borderColor: colors.line2,
  },
  cardRow: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'flex-start',
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  iconTxt: { fontSize: fontSize.lg },
  unreadDot: {
    position: 'absolute',
    top: -3,
    right: -3,
    width: 14,
    height: 14,
    borderRadius: radius.pill,
    backgroundColor: colors.rose,
    borderWidth: 2,
    borderColor: colors.bg,
  },
  cardTitle: {
    fontSize: fontSize.base,
    fontWeight: '600',
    color: colors.ink2,
    marginBottom: spacing.xs,
  },
  cardTitleUnread: {
    fontWeight: '800',
    color: colors.ink,
  },
  cardBody: {
    fontSize: fontSize.sm,
    color: colors.ink3,
    lineHeight: 18,
  },
  ctaPill: {
    alignSelf: 'flex-start',
    backgroundColor: colors.purple,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    marginTop: spacing.md,
  },
  ctaTxt: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.white,
  },
});

// ── Sleep Logger styles ────────────────────────────────────────────────────────
const sl = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.dim, justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.bg, borderTopLeftRadius: radius.lg + 2, borderTopRightRadius: radius.lg + 2, paddingBottom: spacing.xl + spacing.md - 2, maxHeight: '90%' },
  handle: { width: 38, height: 4, backgroundColor: colors.layer3, borderRadius: 2, alignSelf: 'center', marginTop: spacing.sm, marginBottom: 4 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.line2 },
  backBtn: { width: 34, height: 34, borderRadius: radius.md + 1, backgroundColor: colors.layer2, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: fontSize.md, fontWeight: '700', color: colors.ink },
  durationCard: { margin: spacing.md, backgroundColor: colors.layer1, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md + 2, padding: spacing.lg - 4, alignItems: 'center', gap: 4 },
  durationNum: { fontSize: fontSize['2xl'] - 6, fontWeight: '800', color: colors.metricSleep },
  durationLbl: { fontSize: fontSize.sm, color: colors.ink3 },
  sectionLbl: { fontSize: fontSize.xs - 1, fontWeight: '700', letterSpacing: 1.2, color: colors.ink3, textTransform: 'uppercase', paddingHorizontal: spacing.md, marginBottom: spacing.xs + 2 },
  timeRow: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.md, marginBottom: spacing.lg - 4 },
  timeCard: { backgroundColor: colors.layer1, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md - 2, padding: spacing.sm + 4 },
  timeIcon: { fontSize: fontSize.sm, color: colors.ink3, fontWeight: '600', marginBottom: 4 },
  timeInput: { fontSize: fontSize.lg, fontWeight: '800', color: colors.ink },
  qualityRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: spacing.md, marginBottom: spacing.md },
  qualityBtn: { width: 52, height: 52, borderRadius: radius.md - 2, backgroundColor: colors.layer2, borderWidth: 1.5, borderColor: colors.layer2, alignItems: 'center', justifyContent: 'center' },
  qualityBtnSel: { borderColor: colors.purple, backgroundColor: colors.purple + '22' },
  qualityEmoji: { fontSize: fontSize.xl - 2 },
  saveBtn: { marginHorizontal: spacing.md, borderRadius: radius.md - 2, overflow: 'hidden' },
  saveGrad: { paddingVertical: spacing.md, alignItems: 'center' },
  saveTxt: { fontSize: fontSize.sm + 1, fontWeight: '700', color: colors.ink, letterSpacing: 0.6 },
});

// ── Exercise Logger styles ────────────────────────────────────────────────────
const el = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md + 2, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.line },
  closeBtn: { width: 36, height: 36, borderRadius: radius.md + 2, backgroundColor: colors.layer2, borderWidth: 1, borderColor: colors.line2, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: fontSize.md, fontWeight: '700', color: colors.ink },
  addTxt: { fontSize: fontSize.sm, fontWeight: '600', color: colors.lavender },
  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, margin: spacing.sm + 4, backgroundColor: colors.layer2, borderWidth: 1.5, borderColor: colors.line2, borderRadius: radius.lg + 2, paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 1 },
  searchInput: { flex: 1, color: colors.ink, fontSize: fontSize.sm + 1, fontWeight: '300' },
  tabs: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.line },
  tab: { flex: 1, paddingVertical: spacing.sm, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: colors.bg },
  tabActive: { borderBottomColor: colors.lavender },
  tabTxt: { fontSize: fontSize.xs + 1, fontWeight: '700', letterSpacing: 0.5, color: colors.ink3 },
  tabTxtActive: { color: colors.lavender },
  sectionLbl: { fontSize: fontSize.xs, fontWeight: '700', letterSpacing: 1.2, color: colors.ink3, textTransform: 'uppercase', marginBottom: spacing.sm },
  exCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 4, backgroundColor: colors.layer1, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md - 2, padding: spacing.sm + 4 },
  exIcon: { fontSize: fontSize.lg + 6 },
  exName: { fontSize: fontSize.base, fontWeight: '600', color: colors.ink, marginBottom: 2 },
  exSub: { fontSize: fontSize.xs, color: colors.ink2 },
  calInput: { backgroundColor: colors.layer2, borderWidth: 1.5, borderColor: colors.line2, borderRadius: radius.md - 2, padding: spacing.md, color: colors.ink, fontSize: fontSize.md + 1, fontWeight: '700', textAlign: 'center' },
  saveBtn: { backgroundColor: colors.purple, borderRadius: radius.md - 2, paddingVertical: spacing.md, alignItems: 'center' },
  saveTxt: { fontSize: fontSize.sm + 1, fontWeight: '700', color: colors.ink, letterSpacing: 0.6 },
  durationPicker: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: colors.bg2, borderTopWidth: 1, borderTopColor: colors.line, padding: spacing.md, gap: spacing.sm + 2 },
  durationTitle: { fontSize: fontSize.base + 1, fontWeight: '700', color: colors.ink },
  durationRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 2 },
  durInput: { backgroundColor: colors.layer2, borderWidth: 1, borderColor: colors.line2, borderRadius: radius.sm + 2, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, color: colors.ink, fontSize: fontSize.md + 1, fontWeight: '700', minWidth: 80, textAlign: 'center' },
  durUnit: { fontSize: fontSize.sm + 1, color: colors.ink2 },
  logBtn: { flex: 1, backgroundColor: colors.purple, borderRadius: radius.sm + 2, paddingVertical: spacing.sm + 2, alignItems: 'center' },
  logBtnTxt: { fontSize: fontSize.sm + 1, fontWeight: '700', color: colors.ink },
});

// ── AI Coach styles ───────────────────────────────────────────────────────────
const coach = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2, borderBottomWidth: 1, borderBottomColor: colors.line2 },
  closeBtn: { width: 36, height: 36, borderRadius: radius.md, backgroundColor: colors.layer2, borderWidth: 1, borderColor: colors.line2, alignItems: 'center', justifyContent: 'center' },
  headerCenter: { alignItems: 'center' },
  headerTitle: { fontSize: fontSize.md, fontWeight: '700', color: colors.ink },
  headerSub: { fontSize: fontSize.xs, color: colors.ink3, marginTop: 1 },
  scroll: { padding: spacing.md, paddingBottom: spacing.xl, gap: spacing.sm },
  emptyWrap: { alignItems: 'center', paddingTop: spacing.xl, paddingHorizontal: spacing.md, gap: spacing.md },
  emptyIcon: { fontSize: fontSize['2xl'] },
  emptyTitle: { fontSize: fontSize.lg, fontWeight: '800', color: colors.ink, textAlign: 'center' },
  emptySub: { fontSize: fontSize.base, color: colors.ink2, textAlign: 'center', lineHeight: 22 },
  suggestionRow: { width: '100%', gap: spacing.xs + 2, marginTop: spacing.xs },
  suggestion: { backgroundColor: colors.layer1, borderWidth: 1, borderColor: colors.line2, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2 },
  suggestionTxt: { fontSize: fontSize.sm, color: colors.lavender, fontWeight: '500' },
  bubble: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  bubbleUser: { flexDirection: 'row-reverse' },
  bubbleAssistant: {},
  avatarDot: { width: 30, height: 30, borderRadius: radius.pill, backgroundColor: colors.purpleTint, borderWidth: 1, borderColor: colors.line2, alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginBottom: 2 },
  avatarEmoji: { fontSize: fontSize.sm },
  bubbleInner: { maxWidth: '80%', borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2 },
  bubbleInnerUser: { backgroundColor: colors.purple, borderBottomRightRadius: spacing.xs },
  bubbleInnerAssistant: { backgroundColor: colors.layer1, borderWidth: 1, borderColor: colors.line2, borderBottomLeftRadius: spacing.xs },
  bubbleTxt: { fontSize: fontSize.base, color: colors.ink, lineHeight: 22 },
  bubbleTxtUser: { color: colors.white },
  typingDots: { fontSize: fontSize.md, color: colors.ink3, letterSpacing: 4 },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2, borderTopWidth: 1, borderTopColor: colors.line2, backgroundColor: colors.bg },
  input: { flex: 1, backgroundColor: colors.layer2, borderWidth: 1, borderColor: colors.line2, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, color: colors.ink, fontSize: fontSize.base, maxHeight: 100 },
  sendBtn: { width: 38, height: 38, borderRadius: radius.pill, backgroundColor: colors.purple, alignItems: 'center', justifyContent: 'center', shadowColor: colors.purple, shadowOpacity: 0.4, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 4 },
  sendBtnDisabled: { backgroundColor: colors.layer3, shadowOpacity: 0 },
});

