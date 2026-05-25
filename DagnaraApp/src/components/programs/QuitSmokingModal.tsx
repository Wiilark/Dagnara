import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  View, Text, ScrollView, TouchableOpacity,
  Modal, Alert, TextInput, Platform, Keyboard, Share,
  Animated, Linking, Easing, StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle, G, Path, Line, Rect, Polygon, Text as SvgText } from 'react-native-svg';
import { colors, spacing, fontSize, radius } from '../../theme';
import { useAppStore } from '../../store/appStore';
import { useAuthStore } from '../../store/authStore';
import { scheduleQsNotifications, cancelQsNotifications } from '../../lib/notifications';
import { formatMoneyFromUsd, usdToLocal, localToUsd, minorUnits } from '../../lib/currency';
import { fmt } from '../../lib/format';

// ── Types ─────────────────────────────────────────────────────────────────────
type QsProduct = 'cigarettes' | 'vape' | 'pouches';
interface QsData {
  quitDate: string;
  cigsPerDay: number;
  costPerPack: number;
  cigsPerPack: number;
  productType?: QsProduct;
}

const QS_PRODUCT_LABELS: Record<QsProduct, any> = {
  cigarettes: {
    unit: 'cigarette', unitPlural: 'cigarettes', short: 'cig',
    pack: 'pack', pkgFieldLbl: 'Cigarettes per pack',
    perDayLbl: 'Cigarettes per day', perPackLbl: 'Cost per pack',
    emoji: '🚬', productName: 'Cigarettes',
  },
  vape: {
    unit: 'pod', unitPlural: 'pods', short: 'pod',
    pack: 'box', pkgFieldLbl: 'Pods per box',
    perDayLbl: 'Pods per day', perPackLbl: 'Cost per box',
    emoji: '💨', productName: 'Vape pods',
  },
  pouches: {
    unit: 'pouch', unitPlural: 'pouches', short: 'pouch',
    pack: 'tin', pkgFieldLbl: 'Pouches per tin',
    perDayLbl: 'Pouches per day', perPackLbl: 'Cost per tin',
    emoji: '🟢', productName: 'Nicotine pouches',
  },
};

interface QsAchievement { id: string; label: string; icon: string; hours?: number; cigs?: number; money?: number; }

const ACH_LIST: QsAchievement[] = [
  { id: 'h1',    label: 'First hour',     icon: '🌱', hours: 1 },
  { id: 'h4',    label: '4 hours',        icon: '💨', hours: 4 },
  { id: 'h12',   label: 'Half day',       icon: '🌗', hours: 12 },
  { id: 'd1',    label: '24 hours',       icon: '☀️', hours: 24 },
  { id: 'd3',    label: '3 days',         icon: '🔋', hours: 72 },
  { id: 'w1',    label: '1 week',         icon: '💎', hours: 168 },
  { id: 'm1',    label: '1 month',        icon: '🚀', hours: 720 },
  { id: 'y1',    label: '1 year',         icon: '👑', hours: 8760 },
  { id: 'c100',  label: '100 avoided',    icon: '🚭', cigs: 100 },
  { id: 'c1000', label: '1,000 avoided',  icon: '🧘', cigs: 1000 },
  { id: 's50',   label: 'Saved $50',      icon: '💵', money: 50 },
  { id: 's200',  label: 'Saved $200',     icon: '🏦', money: 200 },
];

const prevUnlockedRefGlobal = { current: null as Set<string> | null };

export function QuitSmokingModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { email } = useAuthStore();
  const country = useAppStore((s) => s.country);
  const FASTING_KEY = `dagnara_qs_data_${email ?? 'anon'}`;
  
  const [data, setData] = useState<QsData | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [isSettled, setIsSettled] = useState(false);
  const [unlockOverlayAch, setUnlockOverlayAch] = useState<QsAchievement | null>(null);

  useEffect(() => {
    if (!visible) { setIsSettled(false); return; }
    AsyncStorage.getItem(FASTING_KEY).then(raw => {
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
  const labels = QS_PRODUCT_LABELS[data?.productType ?? 'cigarettes'];
  
  const cigsAvoided = data ? Math.floor(days * data.cigsPerDay) : 0;
  const moneySavedUsd = data ? (cigsAvoided / data.cigsPerPack) * data.costPerPack : 0;
  const moneySavedLocal = usdToLocal(moneySavedUsd, country);

  useEffect(() => {
    if (!data || !isSettled) return;
    const unlockedNow = new Set<string>(
      ACH_LIST.filter(a => {
        if (a.hours) return hours >= a.hours;
        if (a.cigs) return cigsAvoided >= a.cigs;
        if (a.money) return moneySavedUsd >= a.money;
        return false;
      }).map(a => a.id)
    );
    const prev = prevUnlockedRefGlobal.current;
    if (prev == null) {
      prevUnlockedRefGlobal.current = unlockedNow;
      return;
    }
    const newly = ACH_LIST.filter(a => unlockedNow.has(a.id) && !prev.has(a.id));
    if (newly.length > 0) {
      setUnlockOverlayAch(newly[newly.length - 1]);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    prevUnlockedRefGlobal.current = unlockedNow;
  }, [hours, cigsAvoided, moneySavedUsd, isSettled]);

  if (!data && isSettled) {
    return (
      <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
        <SafeAreaView style={qs.safe}>
           <View style={qs.header}>
             <TouchableOpacity onPress={onClose}><Ionicons name="close" size={24} color={colors.ink} /></TouchableOpacity>
             <Text style={qs.title}>Quit Smoking</Text>
             <View style={{width: 24}} />
           </View>
           <ScrollView contentContainerStyle={qs.scroll}>
             <Text style={qs.setupTxt}>Ready to quit? Enter your details to track your progress and money saved.</Text>
             <TouchableOpacity style={qs.startBtn} onPress={async () => {
                const newData = { quitDate: new Date().toISOString(), cigsPerDay: 20, costPerPack: 12, cigsPerPack: 20, productType: 'cigarettes' as QsProduct };
                setData(newData);
                await AsyncStorage.setItem(FASTING_KEY, JSON.stringify(newData));
             }}>
                <Text style={qs.startBtnTxt}>Start Tracking</Text>
             </TouchableOpacity>
           </ScrollView>
        </SafeAreaView>
      </Modal>
    );
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={qs.safe}>
        <View style={qs.header}>
          <TouchableOpacity onPress={onClose}><Ionicons name="close" size={24} color={colors.ink} /></TouchableOpacity>
          <Text style={qs.title}>Smoke Free</Text>
          <TouchableOpacity onPress={() => { Alert.alert('Reset Data', 'Start over?', [{ text: 'Cancel' }, { text: 'Reset', style: 'destructive', onPress: async () => { setData(null); await AsyncStorage.removeItem(FASTING_KEY); } }]) }}>
            <Ionicons name="refresh" size={20} color={colors.ink3} />
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={qs.scroll}>
          <View style={qs.heroCard}>
            <Text style={qs.heroVal}>{Math.floor(hours)}h {Math.floor((hours % 1) * 60)}m</Text>
            <Text style={qs.heroLbl}>Time Smoke Free</Text>
          </View>
          
          <View style={qs.statsRow}>
            <View style={qs.statCard}>
              <Text style={qs.statVal}>{cigsAvoided}</Text>
              <Text style={qs.statLbl}>{labels.unitPlural} avoided</Text>
            </View>
            <View style={qs.statCard}>
              <Text style={[qs.statVal, { color: colors.green }]}>{formatMoneyFromUsd(moneySavedUsd, country)}</Text>
              <Text style={qs.statLbl}>Money saved</Text>
            </View>
          </View>

          <Text style={qs.sectionHdr}>ACHIEVEMENTS</Text>
          <View style={qs.achGrid}>
            {ACH_LIST.map(a => {
              const isUnlocked = (a.hours && hours >= a.hours) || (a.cigs && cigsAvoided >= a.cigs) || (a.money && moneySavedUsd >= a.money);
              return (
                <View key={a.id} style={[qs.achCard, !isUnlocked && { opacity: 0.4 }]}>
                  <Text style={{ fontSize: 24 }}>{a.icon}</Text>
                  <Text style={qs.achLbl}>{a.label}</Text>
                </View>
              );
            })}
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const qs = StyleSheet.create({
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
  achCard: { width: '31%', backgroundColor: colors.layer1, borderRadius: 12, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: colors.line },
  achLbl: { fontSize: 10, fontWeight: '700', color: colors.ink, marginTop: 6, textAlign: 'center' },
});
