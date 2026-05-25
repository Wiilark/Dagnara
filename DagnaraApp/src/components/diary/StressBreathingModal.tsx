import { useState, useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, G } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { BackChevron } from '../BackChevron';
import { colors, spacing, fontSize, radius } from '../../theme';

type BreathPhase = { label: string; duration: number };
type BreathExercise = { name: string; icon: string; color: string; desc: string; totalSecs: number; phases: BreathPhase[] };

const BREATH_EXERCISES: BreathExercise[] = [
  { name: '4-7-8 Breathing', icon: '🌊', color: colors.purple,
    desc: 'Inhale 4s · Hold 7s · Exhale 8s · 8 min', totalSecs: 480,
    phases: [{ label: 'Inhale', duration: 4 }, { label: 'Hold', duration: 7 }, { label: 'Exhale', duration: 8 }] },
  { name: 'Box Breathing', icon: '🔲', color: colors.sky,
    desc: 'Inhale 4s · Hold 4s · Exhale 4s · Hold 4s · 4 min', totalSecs: 240,
    phases: [{ label: 'Inhale', duration: 4 }, { label: 'Hold', duration: 4 }, { label: 'Exhale', duration: 4 }, { label: 'Hold', duration: 4 }] },
  { name: 'Deep Breathing', icon: '💨', color: colors.green,
    desc: 'Slow deep breaths · 2 min', totalSecs: 120,
    phases: [{ label: 'Inhale', duration: 6 }, { label: 'Exhale', duration: 6 }] },
];

const STRESS_EMOJIS = ['😌', '😊', '😐', '😟', '😩'];
const STRESS_LABELS = ['Calm', 'OK', 'Neutral', 'Stressed', 'Overwhelmed'];

function BreathingGuideModal({ exercise, onClose }: { exercise: BreathExercise; onClose: () => void }) {
  const phaseIdxRef  = useRef(0);
  const countdownRef = useRef(exercise.phases[0].duration);
  const totalRef     = useRef(exercise.totalSecs);
  const [phaseIdx, setPhaseIdx]   = useState(0);
  const [countdown, setCountdown] = useState(exercise.phases[0].duration);
  const [totalLeft, setTotalLeft] = useState(exercise.totalSecs);
  const [running, setRunning]     = useState(true);
  const [done, setDone]           = useState(false);

  useEffect(() => {
    if (!running || done) return;
    const id = setInterval(() => {
      countdownRef.current -= 1;
      totalRef.current     -= 1;
      if (countdownRef.current <= 0) {
        phaseIdxRef.current = (phaseIdxRef.current + 1) % exercise.phases.length;
        countdownRef.current = exercise.phases[phaseIdxRef.current].duration;
        setPhaseIdx(phaseIdxRef.current);
      }
      setCountdown(countdownRef.current);
      setTotalLeft(totalRef.current);
      if (totalRef.current <= 0) { clearInterval(id); setDone(true); }
    }, 1000);
    return () => clearInterval(id);
  }, [running, done]);

  const phase   = exercise.phases[phaseIdx];
  const elapsed = phase.duration - countdown;
  const R = 80; const CIRC = 2 * Math.PI * R;
  const dash = Math.min(1, elapsed / phase.duration) * CIRC;
  const mins = Math.floor(totalLeft / 60);
  const secs = totalLeft % 60;

  return (
    <Modal visible animationType="fade" presentationStyle="fullScreen" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top', 'bottom']}>
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: spacing.md, paddingTop: spacing.sm }}>
          <TouchableOpacity style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }} onPress={onClose}>
            <Ionicons name="close" size={28} color={colors.ink3} />
          </TouchableOpacity>
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: fontSize.md, fontWeight: '700', color: colors.ink, marginBottom: spacing.xl }}>{exercise.icon} {exercise.name}</Text>
        <View style={{ alignItems: 'center', justifyContent: 'center', marginBottom: 32 }}>
          <Svg width={200} height={200} viewBox="0 0 200 200">
            <Circle cx={100} cy={100} r={R} fill="none" stroke={exercise.color + '22'} strokeWidth={14} />
            <G rotation="-90" origin="100, 100">
              <Circle cx={100} cy={100} r={R} fill="none" stroke={exercise.color} strokeWidth={14}
                strokeLinecap="round" strokeDasharray={`${dash} ${CIRC}`} />
            </G>
          </Svg>
          <View style={{ position: 'absolute', alignItems: 'center' }}>
            <Text style={{ fontSize: fontSize.md, fontWeight: '700', color: exercise.color }}>{phase.label}</Text>
            <Text style={{ fontSize: fontSize['2xl'], fontWeight: '900', color: colors.ink }}>{countdown}</Text>
          </View>
        </View>
        {done ? (
          <View style={{ alignItems: 'center', gap: 16, marginTop: 16 }}>
            <Text style={{ fontSize: fontSize['2xl'] + 10 }}>✅</Text>
            <Text style={{ fontSize: fontSize.md, fontWeight: '700', color: colors.ink }}>Session complete!</Text>
            <TouchableOpacity style={{ backgroundColor: exercise.color, borderRadius: radius.md, paddingHorizontal: spacing.xl, paddingVertical: spacing.md, marginTop: 8 }} onPress={onClose}>
              <Text style={{ color: colors.white, fontWeight: '700', fontSize: fontSize.sm }}>Done · +20 XP</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <Text style={{ color: colors.ink3, fontSize: fontSize.sm, marginBottom: 32 }}>{mins}:{String(secs).padStart(2, '0')} remaining</Text>
            <TouchableOpacity onPress={() => setRunning(r => !r)}
              style={{ backgroundColor: exercise.color + '22', borderWidth: 1, borderColor: exercise.color + '44', borderRadius: radius.pill, width: 64, height: 64, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name={running ? 'pause' : 'play'} size={28} color={exercise.color} />
            </TouchableOpacity>
          </>
        )}
        </View>
      </SafeAreaView>
    </Modal>
  );
}

export function StressBreathingModal({ visible, onClose, onSave }: {
  visible: boolean;
  onClose: () => void;
  onSave: (level: number) => void;
}) {
  const [stressLevel, setStressLevel]       = useState<number | null>(null);
  const [activeExercise, setActiveExercise] = useState<BreathExercise | null>(null);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      {activeExercise && <BreathingGuideModal exercise={activeExercise} onClose={() => setActiveExercise(null)} />}
      <SafeAreaView style={sbst.safe} edges={['bottom']}>
        <View style={sbst.header}>
          <TouchableOpacity onPress={onClose} style={sbst.backBtn}><BackChevron size={20} /></TouchableOpacity>
          <Text style={sbst.title}>Stress & Breathing</Text>
          <View style={{ width: 34 }} />
        </View>
        <ScrollView contentContainerStyle={{ padding: spacing.md, gap: spacing.md }}>
          <Text style={sbst.sectionLbl}>HOW STRESSED ARE YOU?</Text>
          <View style={sbst.emojiRow}>
            {STRESS_EMOJIS.map((em, i) => (
              <TouchableOpacity key={i} style={[sbst.emojiBtn, stressLevel === i && sbst.emojiBtnSel]} onPress={() => setStressLevel(i)}>
                <Text style={sbst.emoji}>{em}</Text>
                <Text style={[sbst.emojiLbl, stressLevel === i && { color: colors.ink }]}>{STRESS_LABELS[i]}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {stressLevel !== null && (
            <TouchableOpacity style={sbst.saveBtn} onPress={() => { onSave(stressLevel); onClose(); }}>
              <Text style={sbst.saveBtnTxt}>Log Stress Level</Text>
            </TouchableOpacity>
          )}
          <Text style={[sbst.sectionLbl, { marginTop: 8 }]}>BREATHING EXERCISES</Text>
          {BREATH_EXERCISES.map((ex) => (
            <TouchableOpacity key={ex.name} style={[sbst.breathCard, { borderColor: ex.color + '25', backgroundColor: ex.color + '0d' }]} onPress={() => setActiveExercise(ex)}>
              <Text style={{ fontSize: fontSize.xl, flexShrink: 0 }}>{ex.icon}</Text>
              <View style={{ flex: 1 }}>
                <Text style={sbst.breathName}>{ex.name}</Text>
                <Text style={sbst.breathDesc}>{ex.desc}</Text>
              </View>
              <Text style={{ fontSize: fontSize.md + 1, color: colors.ink3 }}>▶</Text>
            </TouchableOpacity>
          ))}
          <View style={{ height: 40 }} />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const sbst = StyleSheet.create({
  safe:       { flex: 1, backgroundColor: colors.bg },
  header:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.line },
  backBtn:    { padding: 8, backgroundColor: colors.layer2, borderRadius: radius.lg },
  title:      { fontSize: fontSize.md, fontWeight: '700', color: colors.ink },
  sectionLbl: { fontSize: fontSize.xs, fontWeight: '700', letterSpacing: 1.2, color: colors.ink3, textTransform: 'uppercase' },
  emojiRow:   { flexDirection: 'row', gap: 4 },
  emojiBtn:   { flex: 1, alignItems: 'center', padding: spacing.sm, borderRadius: radius.md, backgroundColor: colors.layer2, borderWidth: 1.5, borderColor: colors.layer2 },
  emojiBtnSel:{ borderColor: colors.teal, backgroundColor: colors.teal + '11' },
  emoji:      { fontSize: fontSize.lg },
  emojiLbl:   { fontSize: fontSize.xs, color: colors.ink3, marginTop: 4, textAlign: 'center' },
  saveBtn:    { backgroundColor: colors.teal, borderRadius: radius.md, alignItems: 'center', paddingVertical: spacing.sm },
  saveBtnTxt: { color: colors.white, fontWeight: '700', fontSize: fontSize.sm },
  breathCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderWidth: 1, borderRadius: radius.lg, padding: spacing.md },
  breathName: { fontSize: fontSize.sm, fontWeight: '700', color: colors.ink },
  breathDesc: { fontSize: fontSize.xs, color: colors.ink3, marginTop: 2 },
});
