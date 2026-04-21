import { useState, useEffect } from 'react';
import { View, Text, Modal, StyleSheet, TouchableOpacity } from 'react-native';
import Svg, { Circle, Line as SvgLine } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { colors, spacing, fontSize, radius } from '../theme';

// ── Clock geometry constants ──────────────────────────────────────────────────
const CK_SIZE   = 260;
const CK_CX     = CK_SIZE / 2;   // 130
const CK_CY     = CK_SIZE / 2;
const CK_FACE_R = 118;
const CK_NUM_R  = 94;             // number labels radius
const CK_HAND_R = 84;             // hand length
const CK_SEL_R  = 19;             // selection circle

function ckAngle(val: number, total: number): number {
  return (val / total) * 2 * Math.PI - Math.PI / 2;
}
function ckPos(r: number, angle: number): { x: number; y: number } {
  return { x: CK_CX + r * Math.cos(angle), y: CK_CY + r * Math.sin(angle) };
}

// ── ClockPickerModal ──────────────────────────────────────────────────────────
export function ClockPickerModal({
  visible,
  initial,
  onConfirm,
  onClose,
}: {
  visible: boolean;
  /** Initial time as "HH:MM" (24-hour) */
  initial: string;
  onConfirm: (time: string) => void;
  onClose: () => void;
}) {
  const [mode, setMode]     = useState<'hour' | 'minute'>('hour');
  const [hour24, setHour24] = useState(8);
  const [minute, setMinute] = useState(0);

  useEffect(() => {
    if (!visible) return;
    setMode('hour');
    const parts = initial.split(':');
    const h = parseInt(parts[0]) || 8;
    const m = Math.round((parseInt(parts[1]) || 0) / 5) * 5 % 60;
    setHour24(h);
    setMinute(m);
  }, [visible, initial]);

  const isAm   = hour24 < 12;
  const hour12 = hour24 % 12 || 12;

  function selectHour(h: number) {
    const h24 = isAm ? (h === 12 ? 0 : h) : (h === 12 ? 12 : h + 12);
    setHour24(h24);
    setMode('minute');
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }

  function selectMinute(mn: number) {
    setMinute(mn);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const h  = String(hour24).padStart(2, '0');
    const mm = String(mn).padStart(2, '0');
    onConfirm(`${h}:${mm}`);
  }

  function toggleAmPm() {
    setHour24(h => (h < 12 ? h + 12 : h - 12));
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }

  const handAngle = mode === 'hour'
    ? ckAngle(hour12 === 12 ? 0 : hour12, 12)
    : ckAngle(minute, 60);
  const handEnd = ckPos(CK_HAND_R, handAngle);

  const HOURS   = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  const MINUTES = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

  return (
    <Modal visible={visible} animationType="fade" transparent statusBarTranslucent>
      <View style={ck.overlay}>
        <View style={ck.card}>

          {/* ── Time header ── */}
          <View style={ck.timeRow}>
            <TouchableOpacity onPress={() => setMode('hour')}>
              <Text style={[ck.timePart, mode === 'hour' && ck.timePartActive]}>
                {String(hour12).padStart(2, '\u2007')}
              </Text>
            </TouchableOpacity>
            <Text style={ck.timeColon}>:</Text>
            <TouchableOpacity onPress={() => setMode('minute')}>
              <Text style={[ck.timePart, mode === 'minute' && ck.timePartActive]}>
                {String(minute).padStart(2, '0')}
              </Text>
            </TouchableOpacity>

            {/* AM / PM */}
            <View style={ck.ampmWrap}>
              <TouchableOpacity
                style={[ck.ampmBtn, isAm && ck.ampmActive]}
                onPress={() => { if (!isAm) toggleAmPm(); }}
              >
                <Text style={[ck.ampmTxt, isAm && ck.ampmTxtActive]}>AM</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[ck.ampmBtn, !isAm && ck.ampmActive]}
                onPress={() => { if (isAm) toggleAmPm(); }}
              >
                <Text style={[ck.ampmTxt, !isAm && ck.ampmTxtActive]}>PM</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* ── Mode label ── */}
          <Text style={ck.modeLabel}>
            {mode === 'hour' ? 'SELECT HOUR' : 'TAP MINUTE TO CONFIRM'}
          </Text>

          {/* ── Clock face ── */}
          <View style={{ width: CK_SIZE, height: CK_SIZE }}>
            <Svg width={CK_SIZE} height={CK_SIZE} style={StyleSheet.absoluteFill}>
              {/* Face background */}
              <Circle cx={CK_CX} cy={CK_CY} r={CK_FACE_R} fill={colors.bg2} />
              {/* Tick marks */}
              {(mode === 'hour' ? HOURS : MINUTES).map((n, i) => {
                const a = mode === 'hour'
                  ? ckAngle(n === 12 ? 0 : n, 12)
                  : ckAngle(n, 60);
                const outer = ckPos(CK_FACE_R - 4, a);
                const inner = ckPos(CK_FACE_R - 14, a);
                return (
                  <SvgLine
                    key={i}
                    x1={outer.x} y1={outer.y}
                    x2={inner.x} y2={inner.y}
                    stroke={colors.line2} strokeWidth={2}
                  />
                );
              })}
              {/* Hand */}
              <SvgLine
                x1={CK_CX} y1={CK_CY}
                x2={handEnd.x} y2={handEnd.y}
                stroke={colors.purple} strokeWidth={3} strokeLinecap="round"
              />
              {/* Selection circle at hand tip */}
              <Circle cx={handEnd.x} cy={handEnd.y} r={CK_SEL_R} fill={colors.purple} />
              {/* Center dot */}
              <Circle cx={CK_CX} cy={CK_CY} r={5} fill={colors.purple} />
            </Svg>

            {/* Hour labels */}
            {mode === 'hour' && HOURS.map((h) => {
              const angle = ckAngle(h === 12 ? 0 : h, 12);
              const pos   = ckPos(CK_NUM_R, angle);
              const isSel = hour12 === h;
              return (
                <TouchableOpacity
                  key={h}
                  style={[ck.numBtn, { left: pos.x - 20, top: pos.y - 20 }]}
                  onPress={() => selectHour(h)}
                  activeOpacity={0.75}
                >
                  <Text style={[ck.numTxt, isSel && ck.numTxtSel]}>{h}</Text>
                </TouchableOpacity>
              );
            })}

            {/* Minute labels */}
            {mode === 'minute' && MINUTES.map((mn) => {
              const angle = ckAngle(mn, 60);
              const pos   = ckPos(CK_NUM_R, angle);
              const isSel = minute === mn;
              return (
                <TouchableOpacity
                  key={mn}
                  style={[ck.numBtn, { left: pos.x - 20, top: pos.y - 20 }]}
                  onPress={() => selectMinute(mn)}
                  activeOpacity={0.75}
                >
                  <Text style={[ck.numTxt, ck.numTxtMin, isSel && ck.numTxtSel]}>
                    {String(mn).padStart(2, '0')}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* ── Footer ── */}
          <View style={ck.footer}>
            <TouchableOpacity style={ck.cancelBtn} onPress={onClose}>
              <Text style={ck.cancelTxt}>Cancel</Text>
            </TouchableOpacity>
            {mode === 'hour' && (
              <TouchableOpacity style={ck.okBtn} onPress={() => setMode('minute')}>
                <Text style={ck.okTxt}>Next →</Text>
              </TouchableOpacity>
            )}
          </View>

        </View>
      </View>
    </Modal>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const ck = StyleSheet.create({
  overlay:        { flex: 1, backgroundColor: colors.dim, justifyContent: 'center', alignItems: 'center' },
  card:           { backgroundColor: colors.layer1, borderRadius: radius.xl, padding: spacing.lg, alignItems: 'center', gap: spacing.md, borderWidth: 1, borderColor: colors.line2, width: CK_SIZE + spacing.lg * 2 },
  timeRow:        { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  timePart:       { fontSize: fontSize['2xl'] + 14, fontWeight: '800', color: colors.ink3, fontVariant: ['tabular-nums'], backgroundColor: colors.layer2, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.xs, minWidth: 72, textAlign: 'center' },
  timePartActive: { color: colors.purple, backgroundColor: colors.purpleTint },
  timeColon:      { fontSize: fontSize['2xl'] + 6, fontWeight: '800', color: colors.ink2, marginHorizontal: spacing.xs },
  ampmWrap:       { gap: spacing.xs, marginLeft: spacing.xs },
  ampmBtn:        { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.line2, backgroundColor: colors.layer2, minWidth: 46, alignItems: 'center' },
  ampmActive:     { backgroundColor: colors.purpleTint, borderColor: colors.line3 },
  ampmTxt:        { fontSize: fontSize.sm, fontWeight: '700', color: colors.ink3 },
  ampmTxtActive:  { color: colors.purple },
  modeLabel:      { fontSize: fontSize.xs, fontWeight: '700', color: colors.ink3, letterSpacing: 1.1, textTransform: 'uppercase' },
  numBtn:         { position: 'absolute', width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  numTxt:         { fontSize: fontSize.base, fontWeight: '700', color: colors.ink },
  numTxtMin:      { fontSize: fontSize.xs, fontWeight: '700' },
  numTxtSel:      { color: colors.white },
  footer:         { flexDirection: 'row', justifyContent: 'space-between', width: '100%', marginTop: spacing.xs },
  cancelBtn:      { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.md },
  cancelTxt:      { fontSize: fontSize.sm, fontWeight: '600', color: colors.ink3 },
  okBtn:          { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radius.md, backgroundColor: colors.purple },
  okTxt:          { fontSize: fontSize.sm, fontWeight: '700', color: colors.white },
});
