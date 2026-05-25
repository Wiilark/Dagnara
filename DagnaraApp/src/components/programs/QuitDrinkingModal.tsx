import { useState, useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  View, Text, ScrollView, TouchableOpacity,
  Modal, Alert, StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, fontSize, radius } from '../../theme';
import { useAppStore } from '../../store/appStore';
import { useAuthStore } from '../../store/authStore';
import { formatMoneyFromUsd, usdToLocal } from '../../lib/currency';

interface QdAchievement { hours: number; label: string; icon: string; }
const QD_ACHIEVEMENTS: QdAchievement[] = [
  { hours: 24, label: '24 Hours', icon: '🌅' },
  { hours: 72, label: '3 Days',   icon: '🔋' },
  { hours: 168, label: '1 Week',  icon: '💎' },
  { hours: 720, label: '1 Month', icon: '🚀' },
];

const prevQdUnlockedRefGlobal = { current: null as Set<string> | null };

export function QuitDrinkingModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { email } = useAuthStore();
  const country = useAppStore((s) => s.country);
  const QD_KEY = `dagnara_qd_data_${email ?? 'anon'}`;

  const [data, setData] = useState<{ quitDate: string; drinksPerDay: number; costPerDrink: number } | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [isSettled, setIsSettled] = useState(false);

  useEffect(() => {
    if (!visible) { setIsSettled(false); return; }
    AsyncStorage.getItem(QD_KEY).then(raw => {
      if (raw) setData(JSON.parse(raw));
      else setIsSettled(true);
    });
  }, [visible]);

  useEffect(() => {
    if (!data) return;
    const tick = () => {
      const t = new Date(data.quitDate).getTime();
      setElapsed(Math.max(0, Date.now() - t));
      setIsSettled(true);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [data]);

  const hours = elapsed / 3600000;
  const days = hours / 24;
  const drinksAvoided = data ? Math.floor(days * data.drinksPerDay) : 0;
  const moneySavedUsd = data ? drinksAvoided * data.costPerDrink : 0;

  useEffect(() => {
    if (!data || !isSettled) return;
    const unlockedNow = new Set<string>(
      QD_ACHIEVEMENTS.filter(a => hours >= a.hours).map(a => String(a.hours))
    );
    const prev = prevQdUnlockedRefGlobal.current;
    if (prev == null) {
      prevQdUnlockedRefGlobal.current = unlockedNow;
      return;
    }
    const newly = QD_ACHIEVEMENTS.filter(a => unlockedNow.has(String(a.hours)) && !prev.has(String(a.hours)));
    if (newly.length > 0) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    prevQdUnlockedRefGlobal.current = unlockedNow;
  }, [hours, isSettled]);

  if (!data && isSettled) {
    return (
      <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
        <SafeAreaView style={qd.safe}>
           <View style={qd.header}>
             <TouchableOpacity onPress={onClose}><Ionicons name="close" size={24} color={colors.ink} /></TouchableOpacity>
             <Text style={qd.title}>Quit Drinking</Text>
             <View style={{width: 24}} />
           </View>
           <ScrollView contentContainerStyle={qd.scroll}>
             <Text style={qd.setupTxt}>Take control of your health. Track your sobriety and money saved from avoiding alcohol.</Text>
             <TouchableOpacity style={qd.startBtn} onPress={async () => {
                const newData = { quitDate: new Date().toISOString(), drinksPerDay: 2, costPerDrink: 8 };
                setData(newData);
                await AsyncStorage.setItem(QD_KEY, JSON.stringify(newData));
             }}>
                <Text style={qd.startBtnTxt}>Start Sobriety Journey</Text>
             </TouchableOpacity>
           </ScrollView>
        </SafeAreaView>
      </Modal>
    );
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={qd.safe}>
        <View style={qd.header}>
          <TouchableOpacity onPress={onClose}><Ionicons name="close" size={24} color={colors.ink} /></TouchableOpacity>
          <Text style={qd.title}>Sober Time</Text>
          <TouchableOpacity onPress={() => { Alert.alert('Reset Sobriety', 'Start over?', [{ text: 'Cancel' }, { text: 'Reset', style: 'destructive', onPress: async () => { setData(null); await AsyncStorage.removeItem(QD_KEY); } }]) }}>
            <Ionicons name="refresh" size={20} color={colors.ink3} />
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={qd.scroll}>
          <View style={qd.heroCard}>
            <Text style={qd.heroVal}>{Math.floor(days)}d {Math.floor(hours % 24)}h</Text>
            <Text style={qd.heroLbl}>Days Sober</Text>
          </View>
          
          <View style={qd.statsRow}>
            <View style={qd.statCard}>
              <Text style={qd.statVal}>{drinksAvoided}</Text>
              <Text style={qd.statLbl}>Drinks avoided</Text>
            </View>
            <View style={qd.statCard}>
              <Text style={[qd.statVal, { color: colors.teal }]}>{formatMoneyFromUsd(moneySavedUsd, country)}</Text>
              <Text style={qd.statLbl}>Money saved</Text>
            </View>
          </View>

          <Text style={qd.sectionHdr}>SOBRIETY MILESTONES</Text>
          <View style={qd.achGrid}>
            {QD_ACHIEVEMENTS.map(a => {
              const isUnlocked = hours >= a.hours;
              return (
                <View key={a.hours} style={[qd.achCard, !isUnlocked && { opacity: 0.4 }]}>
                  <Text style={{ fontSize: 24 }}>{a.icon}</Text>
                  <Text style={qd.achLbl}>{a.label}</Text>
                </View>
              );
            })}
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const qd = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.line },
  title: { fontSize: 17, fontWeight: '700', color: colors.ink },
  scroll: { padding: spacing.md, gap: spacing.md },
  setupTxt: { fontSize: 15, color: colors.ink2, textAlign: 'center', marginTop: 40 },
  startBtn: { backgroundColor: colors.purple, borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 24 },
  startBtnTxt: { color: colors.white, fontWeight: '700', fontSize: 16 },
  heroCard: { backgroundColor: colors.layer1, borderRadius: 20, padding: 24, alignItems: 'center', borderWidth: 1, borderColor: colors.line },
  heroVal: { fontSize: 32, fontWeight: '900', color: colors.purple },
  heroLbl: { fontSize: 13, fontWeight: '700', color: colors.ink3, marginTop: 4, textTransform: 'uppercase' },
  statsRow: { flexDirection: 'row', gap: 12 },
  statCard: { flex: 1, backgroundColor: colors.layer1, borderRadius: 16, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: colors.line },
  statVal: { fontSize: 20, fontWeight: '800', color: colors.ink },
  statLbl: { fontSize: 11, fontWeight: '600', color: colors.ink3, marginTop: 4, textAlign: 'center' },
  sectionHdr: { fontSize: 12, fontWeight: '800', color: colors.ink3, textTransform: 'uppercase', letterSpacing: 1, marginTop: 12 },
  achGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  achCard: { width: '48.5%', backgroundColor: colors.layer1, borderRadius: 12, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: colors.line },
  achLbl: { fontSize: 11, fontWeight: '700', color: colors.ink, marginTop: 6, textAlign: 'center' },
});
