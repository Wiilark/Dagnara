import { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Modal, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient as ExpoLinearGradient } from 'expo-linear-gradient';
import { ClockPickerModal } from '../ClockPickerModal';
import { BackChevron } from '../BackChevron';
import { colors, spacing, fontSize, radius } from '../../theme';

const SLEEP_QUALITY = ['😫', '😕', '😐', '😊', '🌟'];

export type SleepSaveData = { bedtime: string; waketime: string; quality: number; duration: string };

/** Format a 24-h "HH:MM" string as "10:30 PM" for display */
function fmtSleepTime(t: string): string {
  const parts = t.split(':');
  const h24 = parseInt(parts[0], 10) || 0;
  const m   = parseInt(parts[1], 10) || 0;
  const suffix = h24 < 12 ? 'AM' : 'PM';
  const h12  = h24 % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

export function SleepModal({ visible, onClose, onSave }: {
  visible: boolean;
  onClose: () => void;
  onSave: (data: SleepSaveData) => void;
}) {
  const [bedtime, setBedtime]   = useState('22:30');
  const [waketime, setWaketime] = useState('06:00');
  const [quality, setQuality]   = useState(2);
  const [clockTarget, setClockTarget] = useState<'bed' | 'wake' | null>(null);

  function calcDuration(): string {
    const [bh, bm] = bedtime.split(':').map(Number);
    const [wh, wm] = waketime.split(':').map(Number);
    if ([bh, bm, wh, wm].some(n => isNaN(n))) return '—';
    let mins = (wh * 60 + wm) - (bh * 60 + bm);
    if (mins < 0) mins += 24 * 60;
    return `${Math.floor(mins / 60)}h ${mins % 60}m`;
  }

  function handleClockConfirm(time: string) {
    if (clockTarget === 'bed') setBedtime(time);
    else setWaketime(time);
    setClockTarget(null);
  }

  return (
    <>
      <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
        <SafeAreaView style={sl.safe} edges={['bottom']}>
          <View style={sl.header}>
            <TouchableOpacity onPress={onClose} style={sl.backBtn}>
              <BackChevron size={20} />
            </TouchableOpacity>
            <Text style={sl.title}>Log Sleep</Text>
            <View style={{ width: 34 }} />
          </View>
          <ScrollView contentContainerStyle={sl.content}>
            <View style={sl.durationDisplay}>
              <Text style={sl.durNum}>{calcDuration()}</Text>
              <Text style={sl.durLbl}>Sleep duration</Text>
            </View>
            <Text style={sl.sectionLbl}>BEDTIME & WAKE TIME</Text>
            <View style={sl.timeRow}>
              <TouchableOpacity
                style={[sl.timeCard, { borderColor: colors.purple + '80', backgroundColor: colors.purpleTint }]}
                onPress={() => setClockTarget('bed')}
                activeOpacity={0.75}
              >
                <Text style={sl.timeCardLbl}>🌙 Bedtime</Text>
                <Text style={sl.timeVal}>{fmtSleepTime(bedtime)}</Text>
                <Text style={sl.timeCardHint}>tap to change</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={sl.timeCard}
                onPress={() => setClockTarget('wake')}
                activeOpacity={0.75}
              >
                <Text style={sl.timeCardLbl}>☀️ Wake time</Text>
                <Text style={sl.timeVal}>{fmtSleepTime(waketime)}</Text>
                <Text style={sl.timeCardHint}>tap to change</Text>
              </TouchableOpacity>
            </View>
            <Text style={sl.sectionLbl}>SLEEP QUALITY</Text>
            <View style={sl.qualityRow}>
              {SLEEP_QUALITY.map((em, i) => (
                <TouchableOpacity key={i} style={[sl.qBtn, quality === i && sl.qBtnSel]} onPress={() => setQuality(i)}>
                  <Text style={sl.qEmoji}>{em}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={sl.insight}>
              <Text style={sl.insightLbl}>✦ Insight</Text>
              <Text style={sl.insightTxt}>On days following 8h+ sleep, your step count is 34% higher. Your mood also improves on average.</Text>
            </View>
            <TouchableOpacity style={sl.saveBtn} activeOpacity={0.85} onPress={() => {
              const duration = calcDuration();
              if (duration === '—') { Alert.alert('Invalid time', 'Check your times and try again.'); return; }
              onSave({ bedtime, waketime, quality, duration });
              onClose();
            }}>
              <ExpoLinearGradient colors={[colors.purple, colors.purpleGlow]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={sl.saveGrad}>
                <Text style={sl.saveTxt}>Save Sleep Log</Text>
              </ExpoLinearGradient>
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Clock picker — rendered outside the pageSheet Modal to avoid z-index issues */}
      <ClockPickerModal
        visible={clockTarget !== null}
        initial={clockTarget === 'bed' ? bedtime : waketime}
        label={clockTarget === 'bed' ? 'SET BEDTIME' : 'SET WAKE TIME'}
        onConfirm={handleClockConfirm}
        onClose={() => setClockTarget(null)}
      />
    </>
  );
}

const sl = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.md },
  backBtn: { width: 34, height: 34, borderRadius: radius.pill, backgroundColor: colors.layer2, borderWidth: 1, borderColor: colors.line2, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: fontSize.md, fontWeight: '700', color: colors.ink },
  content: { padding: spacing.md, gap: spacing.md },
  durationDisplay: { alignItems: 'center', paddingVertical: spacing.lg },
  durNum: { fontSize: fontSize['2xl'], fontWeight: '800', color: colors.ink },
  durLbl: { fontSize: fontSize.sm, color: colors.ink3, marginTop: 4 },
  sectionLbl: { fontSize: fontSize.xs, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase', color: colors.ink3 },
  timeRow: { flexDirection: 'row', gap: spacing.sm },
  timeCard: { flex: 1, backgroundColor: colors.layer1, borderWidth: 1, borderColor: colors.line2, borderRadius: radius.md, padding: spacing.md, alignItems: 'center' },
  timeCardLbl: { fontSize: fontSize.xs, color: colors.ink3, marginBottom: spacing.sm },
  timeVal: { fontSize: fontSize.md, fontWeight: '700', color: colors.ink, textAlign: 'center' },
  timeCardHint: { fontSize: fontSize.xs, color: colors.ink3, marginTop: 4, opacity: 0.7 },
  qualityRow: { flexDirection: 'row', justifyContent: 'space-between' },
  qBtn: { width: 52, height: 52, borderRadius: radius.pill, backgroundColor: colors.layer2, alignItems: 'center', justifyContent: 'center' },
  qBtnSel: { backgroundColor: colors.purple + '33', borderWidth: 2, borderColor: colors.purple },
  qEmoji: { fontSize: fontSize.xl - 2 },
  insight: { backgroundColor: colors.layer1, borderWidth: 1, borderColor: colors.line2, borderRadius: radius.md, padding: spacing.md },
  insightLbl: { fontSize: fontSize.xs, fontWeight: '700', color: colors.purple2, marginBottom: 6 },
  insightTxt: { fontSize: fontSize.sm, color: colors.ink2, lineHeight: 20 },
  saveBtn: { borderRadius: radius.md, overflow: 'hidden' },
  saveGrad: { padding: spacing.md, alignItems: 'center' },
  saveTxt: { color: colors.white, fontWeight: '700', fontSize: fontSize.base },
});
