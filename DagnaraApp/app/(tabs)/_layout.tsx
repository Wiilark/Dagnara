import { useState, useEffect } from 'react';
import { Tabs, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  View, TouchableOpacity, StyleSheet, Text, Modal,
  ScrollView, TextInput, Alert, Pressable,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, spacing, fontSize, radius } from '../../src/theme';
import { formatWeight } from '../../src/lib/units';
import { useAppStore, getXpLevel } from '../../src/store/appStore';
import { useDiaryStore } from '../../src/store/diaryStore';

const TODAY = () => new Date().toISOString().split('T')[0];

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
  insight: colors.violet, nutrition: colors.green, quit: colors.rose, sleep: colors.sky, activity: colors.honey,
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
                      <View style={[msg.iconWrap, { backgroundColor: `${MSG_COLORS[m.type] ?? colors.lavender}22` }]}>
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
                      <View style={[msg.iconWrap, { backgroundColor: `${MSG_COLORS[m.type] ?? colors.lavender}22` }]}>
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
function QuickAddSheet({ visible, onClose, onExercise }: {
  visible: boolean;
  onClose: () => void;
  onExercise: () => void;
}) {
  const { setPendingAddMeal } = useAppStore();

  function openMeal(meal: string) {
    onClose();
    setPendingAddMeal(meal);
    setTimeout(() => router.push('/(tabs)/diary' as any), 220);
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={fab.backdrop} onPress={onClose}>
        <Pressable style={fab.sheet} onPress={() => {}}>
          {/* Exercise */}
          <TouchableOpacity
            style={fab.exerciseBtn}
            onPress={() => { onClose(); setTimeout(onExercise, 280); }}
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
  const [notes, setNotes] = useState('');
  const QUALITIES = ['😫', '😕', '😐', '😊', '🌟'];

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
  const { entries, updateCaloriesBurned } = useDiaryStore();
  const [search, setSearch] = useState('');
  const [exTab, setExTab] = useState<'list' | 'calories'>('list');
  const [duration, setDuration] = useState('30');
  const [manualKcal, setManualKcal] = useState('');
  const [selected, setSelected] = useState<typeof EXERCISE_CATS[0] | null>(null);

  const filtered = search.length > 0
    ? EXERCISE_CATS.filter(e => e.name.toLowerCase().includes(search.toLowerCase()))
    : EXERCISE_CATS;

  async function handleAdd(ex: typeof EXERCISE_CATS[0]) {
    const mins = parseInt(duration) || 30;
    const kcal = ex.kcalPerMin * mins;
    const todayKey = TODAY();
    const current = entries[todayKey]?.calories_burned ?? 0;
    await updateCaloriesBurned(todayKey, current + kcal);
    addXp(Math.round(kcal / 10));
    Alert.alert('Exercise logged!', `${ex.icon} ${ex.name} – ${kcal} kcal burned in ${mins} min. +${Math.round(kcal / 10)} XP`);
    setSearch('');
    setSelected(null);
    onClose();
  }

  async function handleManualAdd() {
    const k = parseInt(manualKcal);
    if (!k || k <= 0) { Alert.alert('Enter a valid calorie amount'); return; }
    const todayKey = TODAY();
    const current = entries[todayKey]?.calories_burned ?? 0;
    await updateCaloriesBurned(todayKey, current + k);
    addXp(Math.round(k / 10));
    Alert.alert('Calories logged!', `${k} kcal burned. +${Math.round(k / 10)} XP`);
    setManualKcal('');
    onClose();
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <SafeAreaView style={el.safe} edges={['top', 'bottom']}>
        <View style={el.header}>
          <TouchableOpacity onPress={onClose} style={el.closeBtn}>
            <Ionicons name="close" size={16} color={colors.ink} />
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
  const { addWeightEntry, addXp, unitSystem } = useAppStore();

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
  const [fabOpen, setFabOpen] = useState(false);
  const [exerciseOpen, setExerciseOpen] = useState(false);

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
        onExercise={() => setExerciseOpen(true)}
      />
      <ExerciseLogger visible={exerciseOpen} onClose={() => setExerciseOpen(false)} />
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

// Messages modal styles
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
  sectionLbl: { fontSize: fontSize.xs, fontWeight: '700', letterSpacing: 1.2, color: colors.ink3, textTransform: 'uppercase', marginBottom: spacing.sm },
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

