/**
 * CalendarPickerModal — interactive month-grid date picker.
 *
 * Props:
 *   visible  — show/hide
 *   initial  — seed date as "YYYY-MM-DD"
 *   label    — optional CAPS label shown above the grid (e.g. "START DATE")
 *   minDate  — optional lower bound as "YYYY-MM-DD" (inclusive)
 *   maxDate  — optional upper bound as "YYYY-MM-DD" (inclusive)
 *   onConfirm(date: string) — called with "YYYY-MM-DD" on confirm
 *   onClose  — called on cancel / backdrop tap
 */
import { useState, useEffect, useMemo } from 'react';
import {
  View, Text, Modal, StyleSheet, TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { colors, spacing, fontSize, radius } from '../theme';

// ── Helpers ───────────────────────────────────────────────────────────────────
const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const;
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Parse "YYYY-MM-DD" → { y, m (0-indexed), d } */
function parseDateKey(key: string): { y: number; m: number; d: number } {
  const parts = key.split('-');
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10) - 1;
  const d = parseInt(parts[2], 10);
  const now = new Date();
  if (isNaN(y) || isNaN(m) || isNaN(d)) {
    return { y: now.getFullYear(), m: now.getMonth(), d: now.getDate() };
  }
  return { y, m, d };
}

/** Format { y, m (0-indexed), d } → "YYYY-MM-DD" */
function formatDateKey(y: number, m: number, d: number): string {
  return `${y}-${pad2(m + 1)}-${pad2(d)}`;
}

/** Compare two YYYY-MM-DD strings; returns -1 / 0 / 1 */
function cmpKeys(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function todayKey(): string {
  return new Date().toLocaleDateString('en-CA');
}

// ── Component ─────────────────────────────────────────────────────────────────
export function CalendarPickerModal({
  visible,
  initial,
  onConfirm,
  onClose,
  label,
  minDate,
  maxDate,
}: {
  visible: boolean;
  initial: string;
  onConfirm: (date: string) => void;
  onClose: () => void;
  label?: string;
  minDate?: string;
  maxDate?: string;
}) {
  // Selected date state (the confirmed choice-to-be)
  const [selected, setSelected] = useState<string>(() => initial || todayKey());
  // Month currently being viewed (may differ from selected month)
  const [viewYear, setViewYear]   = useState<number>(() => parseDateKey(initial || todayKey()).y);
  const [viewMonth, setViewMonth] = useState<number>(() => parseDateKey(initial || todayKey()).m);

  // Reseed every time the modal opens
  useEffect(() => {
    if (!visible) return;
    const seed = initial || todayKey();
    const p    = parseDateKey(seed);
    setSelected(seed);
    setViewYear(p.y);
    setViewMonth(p.m);
  }, [visible, initial]);

  const today = useMemo(() => todayKey(), []);

  // Build the 42-cell grid for the current view month
  const cells = useMemo(() => {
    const firstDayOfMonth = new Date(viewYear, viewMonth, 1).getDay(); // 0=Sun
    const daysInMonth     = new Date(viewYear, viewMonth + 1, 0).getDate();
    const out: Array<{ key: string; day: number; inMonth: boolean; disabled: boolean }> = [];

    // Previous month's trailing days (fillers)
    const prevDaysInMonth = new Date(viewYear, viewMonth, 0).getDate();
    for (let i = firstDayOfMonth - 1; i >= 0; i--) {
      const d = prevDaysInMonth - i;
      const m = viewMonth === 0 ? 11 : viewMonth - 1;
      const y = viewMonth === 0 ? viewYear - 1 : viewYear;
      const k = formatDateKey(y, m, d);
      out.push({ key: k, day: d, inMonth: false, disabled: true });
    }

    // Current month's days
    for (let d = 1; d <= daysInMonth; d++) {
      const k = formatDateKey(viewYear, viewMonth, d);
      let disabled = false;
      if (minDate && cmpKeys(k, minDate) < 0) disabled = true;
      if (maxDate && cmpKeys(k, maxDate) > 0) disabled = true;
      out.push({ key: k, day: d, inMonth: true, disabled });
    }

    // Trailing fillers so the grid is 42 cells (6 rows × 7 cols)
    const remaining = 42 - out.length;
    for (let i = 1; i <= remaining; i++) {
      const m = viewMonth === 11 ? 0 : viewMonth + 1;
      const y = viewMonth === 11 ? viewYear + 1 : viewYear;
      const k = formatDateKey(y, m, i);
      out.push({ key: k, day: i, inMonth: false, disabled: true });
    }
    return out;
  }, [viewYear, viewMonth, minDate, maxDate]);

  function goPrevMonth() {
    void Haptics.selectionAsync();
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear(viewYear - 1);
    } else {
      setViewMonth(viewMonth - 1);
    }
  }

  function goNextMonth() {
    void Haptics.selectionAsync();
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear(viewYear + 1);
    } else {
      setViewMonth(viewMonth + 1);
    }
  }

  function jumpToToday() {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const p = parseDateKey(today);
    setViewYear(p.y);
    setViewMonth(p.m);
    setSelected(today);
  }

  function pickDay(key: string, disabled: boolean) {
    if (disabled) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelected(key);
  }

  function confirm() {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onConfirm(selected);
  }

  // Can we navigate backwards/forwards given min/max constraints?
  const canPrev = !minDate || (() => {
    const firstOfView = formatDateKey(viewYear, viewMonth, 1);
    return cmpKeys(firstOfView, minDate) > 0;
  })();
  const canNext = !maxDate || (() => {
    const lastOfView = formatDateKey(viewYear, viewMonth, new Date(viewYear, viewMonth + 1, 0).getDate());
    return cmpKeys(lastOfView, maxDate) < 0;
  })();

  return (
    <Modal visible={visible} animationType="fade" transparent statusBarTranslucent>
      <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity style={s.card} activeOpacity={1} onPress={() => { /* swallow */ }}>

          {label != null && <Text style={s.label}>{label}</Text>}

          {/* Month nav header */}
          <View style={s.navRow}>
            <TouchableOpacity
              onPress={goPrevMonth}
              disabled={!canPrev}
              style={[s.navBtn, !canPrev && s.navBtnDisabled]}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="chevron-back" size={22} color={canPrev ? colors.ink : colors.ink3} />
            </TouchableOpacity>

            <TouchableOpacity onPress={jumpToToday} activeOpacity={0.7}>
              <Text style={s.monthTitle}>
                {MONTH_NAMES[viewMonth]} {viewYear}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={goNextMonth}
              disabled={!canNext}
              style={[s.navBtn, !canNext && s.navBtnDisabled]}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="chevron-forward" size={22} color={canNext ? colors.ink : colors.ink3} />
            </TouchableOpacity>
          </View>

          {/* Weekday header */}
          <View style={s.weekRow}>
            {WEEKDAYS.map((w, i) => (
              <View key={i} style={s.weekCell}>
                <Text style={s.weekTxt}>{w}</Text>
              </View>
            ))}
          </View>

          {/* Day grid */}
          <View style={s.grid}>
            {cells.map((c, i) => {
              const isSelected = c.key === selected && c.inMonth;
              const isToday    = c.key === today    && c.inMonth;
              const dim        = !c.inMonth || c.disabled;

              return (
                <TouchableOpacity
                  key={`${c.key}-${i}`}
                  style={s.dayCell}
                  activeOpacity={dim ? 1 : 0.6}
                  onPress={() => pickDay(c.key, c.disabled || !c.inMonth)}
                  disabled={c.disabled || !c.inMonth}
                >
                  <View style={[
                    s.dayDot,
                    isToday && !isSelected && s.dayDotToday,
                    isSelected && s.dayDotSelected,
                  ]}>
                    <Text style={[
                      s.dayTxt,
                      dim && s.dayTxtDim,
                      isSelected && s.dayTxtSelected,
                      isToday && !isSelected && s.dayTxtToday,
                    ]}>
                      {c.day}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Footer */}
          <View style={s.footer}>
            <TouchableOpacity style={s.cancelBtn} onPress={onClose}>
              <Text style={s.cancelTxt}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.confirmBtn} onPress={confirm}>
              <Text style={s.confirmTxt}>Set Date</Text>
            </TouchableOpacity>
          </View>

        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const CELL = 40;

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.dim,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  card: {
    backgroundColor: colors.layer1,
    borderRadius: radius.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.line2,
    shadowColor: colors.purple,
    shadowOpacity: 0.25,
    shadowRadius: 32,
    shadowOffset: { width: 0, height: 8 },
    elevation: 16,
    width: '100%',
    maxWidth: 360,
  },
  label: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.ink3,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xs,
  },
  navBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.layer2,
    borderWidth: 1,
    borderColor: colors.line2,
  },
  navBtnDisabled: {
    opacity: 0.4,
  },
  monthTitle: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.ink,
    letterSpacing: 0.4,
  },
  weekRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xs,
  },
  weekCell: {
    width: CELL,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xs,
  },
  weekTxt: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.ink3,
    letterSpacing: 1.1,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xs,
  },
  dayCell: {
    width: CELL,
    height: CELL,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayDot: {
    width: CELL - 6,
    height: CELL - 6,
    borderRadius: (CELL - 6) / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayDotToday: {
    backgroundColor: colors.purpleTint,
    borderWidth: 1,
    borderColor: colors.line3,
  },
  dayDotSelected: {
    backgroundColor: colors.purple,
  },
  dayTxt: {
    fontSize: fontSize.base,
    fontWeight: '600',
    color: colors.ink,
  },
  dayTxtDim: {
    color: colors.ink3,
    opacity: 0.4,
  },
  dayTxtToday: {
    color: colors.purple2,
    fontWeight: '700',
  },
  dayTxtSelected: {
    color: colors.white,
    fontWeight: '800',
  },
  footer: {
    flexDirection: 'row',
    gap: spacing.sm,
    width: '100%',
    marginTop: spacing.xs,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: spacing.sm + 2,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.line2,
    borderRadius: radius.md,
    backgroundColor: colors.layer2,
  },
  cancelTxt: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.ink3,
  },
  confirmBtn: {
    flex: 2,
    paddingVertical: spacing.sm + 2,
    alignItems: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.purple,
  },
  confirmTxt: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.white,
  },
});
