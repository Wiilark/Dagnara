import { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  View, Text, ScrollView, TouchableOpacity, Modal, Alert, TextInput, Platform, Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';
import { colors, spacing, fontSize, radius } from '../../theme';
import { ClockPickerModal } from '../ClockPickerModal';
import { CalendarPickerModal } from '../CalendarPickerModal';
import { BackChevron } from '../BackChevron';
import { useAuthStore } from '../../store/authStore';
import { schedulePillReminders } from '../../lib/notifications';
import { fmtFlex } from '../../lib/format';
import {
  Medication, PILL_COLORS, PillLog, ProgramSheetHeader, fmtFriendlyDate, makeKeys, todayKey, m,
} from './shared';

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
export function PillReminderModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
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

  // Live clock so a slot flips from "upcoming" to "overdue" the moment its time
  // passes — slotStatus() reads new Date() and without a ticker the status only
  // re-evaluated on an unrelated re-render (e.g. a tap). 30s granularity is plenty
  // for minute-precision dose times and is the same cadence the fasting lock uses.
  const [, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!visible) return;
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, [visible]);

  // Last 7 days (oldest→newest), used for per-med history strips
  const weekKeys = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - i));
    return d.toLocaleDateString('en-CA');
  });

  // Depend on `today` as well as `visible`: if the modal is left open across
  // midnight the 30s ticker re-renders, `today` rolls to the new date, and this
  // effect re-fires to load the new day's (empty) log. Without that, `log` state
  // would still hold yesterday's dose counts while writes target today's key —
  // showing yesterday's doses as taken today and corrupting the new day's file.
  useEffect(() => {
    if (!visible) { setEditSheet(false); setEditMed(null); return; }
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
  }, [visible, today]);

  function saveMeds(updated: Medication[]) {
    setMeds(updated);
    AsyncStorage.setItem(KEYS.PILLS, JSON.stringify(updated));
    // Re-schedule push notifications for every med × time, respecting daysOfWeek
    void schedulePillReminders(
      updated.map(m => ({
        id: m.id, name: m.name, dosage: m.dosage, times: m.times,
        daysOfWeek: m.daysOfWeek, durationDays: m.durationDays, startDate: m.startDate,
      }))
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
    const skipped = entry.skippedSlots ?? [];
    // An explicit skip always wins — it must never be reclassified as taken.
    if (skipped.includes(slotIdx)) return 'skipped';
    // `takenCount` is a scalar, so taken doses fill the lowest-index slots that
    // aren't skipped. Ranking by non-skipped position keeps the taken state on
    // the slot the user actually tapped when an earlier slot was skipped.
    const rankAmongActive = slotIdx - skipped.filter(s => s < slotIdx).length;
    if (rankAmongActive < entry.takenCount) return 'taken';
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
          <TouchableOpacity
            onPress={onClose}
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
          <Text style={[m.sheetTitle, { flex: 1, textAlign: 'center' }]}>Pill Reminder</Text>
          <View style={{ width: spacing.xl + spacing.sm }} />
        </View>

        {/* Add medication sheet */}
        <Modal visible={editSheet} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setEditSheet(false)}>
            <SafeAreaView style={m.sheet} edges={['top', 'bottom']}>
              <ProgramSheetHeader title={editMed ? 'Edit Medication' : 'Add Medication'} onBack={() => setEditSheet(false)} />
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
                      width: `${todayPct}%`,
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
                        width: `${Math.round((courseProgress ?? 0) * 100)}%`,
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
