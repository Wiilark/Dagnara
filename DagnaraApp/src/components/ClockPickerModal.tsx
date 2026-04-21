/**
 * ClockPickerModal — drum/wheel time picker (iOS-style scrollable columns).
 *
 * Props:
 *   visible  — show/hide
 *   initial  — seed time as "HH:MM" (24-hour)
 *   label    — optional CAPS label shown above the drums (e.g. "SET BEDTIME")
 *   onConfirm(time: string) — called with "HH:MM" (24-hour) on confirm
 *   onClose  — called on cancel / backdrop tap
 */
import { useState, useEffect, useRef } from 'react';
import {
  View, Text, Modal, StyleSheet, TouchableOpacity, ScrollView,
  Platform, NativeScrollEvent, NativeSyntheticEvent,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { colors, spacing, fontSize, radius } from '../theme';

// ── Drum geometry ─────────────────────────────────────────────────────────────
const ITEM_H  = 54;
const VISIBLE = 5;            // rows visible at once (odd → center = selected)
const DRUM_H  = ITEM_H * VISIBLE;  // 270
const PAD     = ITEM_H * Math.floor(VISIBLE / 2);  // 108 — top/bottom padding

// ── Data ──────────────────────────────────────────────────────────────────────
const HOURS   = ['1','2','3','4','5','6','7','8','9','10','11','12'] as const;
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));
const AMPM    = ['AM', 'PM'] as const;

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

// ── DrumColumn ────────────────────────────────────────────────────────────────
function DrumColumn({
  items,
  selected,
  onSelect,
  width,
}: {
  items: readonly string[];
  selected: number;
  onSelect: (i: number) => void;
  width: number;
}) {
  const ref  = useRef<ScrollView>(null);
  const prog = useRef(false); // true while a programmatic scrollTo is in flight

  // Sync scroll position whenever `selected` changes
  useEffect(() => {
    prog.current = true;
    ref.current?.scrollTo({ y: selected * ITEM_H, animated: false });
    const t = setTimeout(() => { prog.current = false; }, 80);
    return () => clearTimeout(t);
  }, [selected]);

  function handleEnd(e: NativeSyntheticEvent<NativeScrollEvent>) {
    if (prog.current) return;
    const y   = e.nativeEvent.contentOffset.y;
    const idx = clamp(Math.round(y / ITEM_H), 0, items.length - 1);
    if (idx !== selected) {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onSelect(idx);
    }
  }

  return (
    <ScrollView
      ref={ref}
      style={{ width, height: DRUM_H }}
      contentContainerStyle={{ paddingVertical: PAD }}
      snapToInterval={ITEM_H}
      decelerationRate={Platform.OS === 'ios' ? 'fast' : 0.9}
      showsVerticalScrollIndicator={false}
      onMomentumScrollEnd={handleEnd}
      // On Android momentum may not fire after a slow careful drag
      onScrollEndDrag={Platform.OS === 'android' ? handleEnd : undefined}
      nestedScrollEnabled
    >
      {items.map((item, i) => {
        const dist = Math.abs(i - selected);
        return (
          <TouchableOpacity
            key={i}
            style={[dp.item, { width }]}
            onPress={() => {
              onSelect(i);
              ref.current?.scrollTo({ y: i * ITEM_H, animated: true });
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }}
            activeOpacity={0.6}
          >
            <Text
              style={{
                fontSize:   dist === 0 ? fontSize.xl  : dist === 1 ? fontSize.base : fontSize.sm,
                fontWeight: dist === 0 ? '800'         : dist === 1 ? '500'         : '400',
                color:      dist === 0 ? colors.ink    : dist === 1 ? colors.ink2   : colors.ink3,
                opacity:    dist >= 3  ? 0.3           : 1,
                textAlign:  'center',
              }}
            >
              {item}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

// ── ClockPickerModal ──────────────────────────────────────────────────────────
export function ClockPickerModal({
  visible,
  initial,
  onConfirm,
  onClose,
  label,
}: {
  visible: boolean;
  /** Seed time as "HH:MM" in 24-hour format */
  initial: string;
  onConfirm: (time: string) => void;
  onClose: () => void;
  /** Optional CAPS label shown above the drum (e.g. "SET BEDTIME") */
  label?: string;
}) {
  const [hourIdx, setHourIdx] = useState(7);   // HOURS[7] = '8'
  const [minIdx,  setMinIdx]  = useState(0);   // MINUTES[0] = '00'
  const [amIdx,   setAmIdx]   = useState(0);   // 0 = AM, 1 = PM

  // Seed state from `initial` each time the modal opens
  useEffect(() => {
    if (!visible) return;
    const parts = initial.split(':');
    const h24   = parseInt(parts[0]) || 8;
    const m     = clamp(parseInt(parts[1]) || 0, 0, 59);
    const h12   = h24 === 0 ? 12 : h24 > 12 ? h24 - 12 : h24;
    setHourIdx(h12 - 1);    // HOURS is '1'..'12', so h12=8 → idx=7
    setMinIdx(m);
    setAmIdx(h24 < 12 ? 0 : 1);
  }, [visible, initial]);

  function confirm() {
    const h12  = parseInt(HOURS[hourIdx]);
    const isAm = amIdx === 0;
    const h24  = isAm
      ? (h12 === 12 ? 0 : h12)
      : (h12 === 12 ? 12 : h12 + 12);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onConfirm(`${String(h24).padStart(2, '0')}:${MINUTES[minIdx]}`);
  }

  return (
    <Modal visible={visible} animationType="fade" transparent statusBarTranslucent>
      {/* Backdrop closes on tap */}
      <TouchableOpacity style={dp.overlay} activeOpacity={1} onPress={onClose}>
        {/* Card — swallow taps so they don't bubble to backdrop */}
        <TouchableOpacity style={dp.card} activeOpacity={1} onPress={() => { /* noop */ }}>

          {label != null && <Text style={dp.label}>{label}</Text>}

          {/* Drum columns */}
          <View style={dp.drumsRow}>
            {/* Highlight bar behind columns */}
            <View pointerEvents="none" style={dp.highlight} />

            <DrumColumn items={HOURS}  selected={hourIdx} onSelect={setHourIdx} width={72} />

            <Text style={dp.colon}>:</Text>

            <DrumColumn items={MINUTES} selected={minIdx} onSelect={setMinIdx} width={80} />

            <View style={{ width: spacing.sm }} />

            <DrumColumn items={AMPM} selected={amIdx} onSelect={setAmIdx} width={60} />
          </View>

          {/* Footer */}
          <View style={dp.footer}>
            <TouchableOpacity style={dp.cancelBtn} onPress={onClose}>
              <Text style={dp.cancelTxt}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={dp.confirmBtn} onPress={confirm}>
              <Text style={dp.confirmTxt}>Set Time</Text>
            </TouchableOpacity>
          </View>

        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const dp = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.dim,
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    backgroundColor: colors.layer1,
    borderRadius: radius.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.line2,
    shadowColor: colors.purple,
    shadowOpacity: 0.25,
    shadowRadius: 32,
    shadowOffset: { width: 0, height: 8 },
    elevation: 16,
    minWidth: 300,
  },
  label: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.ink3,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    alignSelf: 'flex-start',
  },
  drumsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  // Positioned relative to drumsRow — sits behind the columns
  highlight: {
    position: 'absolute',
    top: PAD,
    left: 0,
    right: 0,
    height: ITEM_H,
    backgroundColor: colors.purpleTint,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.line3,
    borderRadius: radius.sm,
  },
  colon: {
    fontSize: fontSize.xl,
    fontWeight: '800',
    color: colors.ink2,
    alignSelf: 'center',
    marginBottom: 2,
  },
  item: {
    height: ITEM_H,
    alignItems: 'center',
    justifyContent: 'center',
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
