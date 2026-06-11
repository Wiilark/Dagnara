import { useState, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Platform, Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, fontSize, radius } from '../../src/theme';
import { useAppStore } from '../../src/store/appStore';
import { useAuthStore } from '../../src/store/authStore';
import { FastingModal } from '../../src/components/programs/FastingModal';
import { QuitSmokingModal } from '../../src/components/programs/QuitSmokingModal';
import { QuitDrinkingModal } from '../../src/components/programs/QuitDrinkingModal';
import { PillReminderModal } from '../../src/components/programs/PillReminderModal';
import { GroceryModal } from '../../src/components/programs/GroceryModal';

// ── Revolut-style product tile (icon-square + label) ──────────────────────────
type ProgramTileProps = {
  icon: keyof typeof Ionicons.glyphMap;
  name: string;
  color: string;
  onPress: () => void;
};

function ProgramTile({ icon, name, color, onPress }: ProgramTileProps) {
  return (
    <TouchableOpacity
      style={st.tile}
      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onPress(); }}
      activeOpacity={0.6}
    >
      <View style={[st.tileIcon, { backgroundColor: color + '26' }]}>
        <Ionicons name={icon} size={26} color={colors.ink} />
      </View>
      <Text style={st.tileLabel} numberOfLines={2}>{name}</Text>
    </TouchableOpacity>
  );
}

// ── Main Programs Screen ──────────────────────────────────────────────────────
export default function ProgramsScreen() {
  const { hasUnread } = useAppStore();
  const { email: authEmail, profile } = useAuthStore();
  const [qsVisible, setQsVisible] = useState(false);
  const [qdVisible, setQdVisible] = useState(false);
  const [pillVisible, setPillVisible] = useState(false);
  const [fastingVisible, setFastingVisible] = useState(false);
  const [groceryVisible, setGroceryVisible] = useState(false);

  const insets = useSafeAreaInsets();
  const scrollY = useRef(new Animated.Value(0)).current;
  const headerBlurOpacity = scrollY.interpolate({ inputRange: [20, 120], outputRange: [0, 1], extrapolate: 'clamp' });
  const headerH = 50 + insets.top + 16;
  const scrollPaddingTop = 60 + insets.top;

  return (
    <View style={st.safe}>
      <View style={[st.fixedHeader, { paddingTop: insets.top, height: headerH }]}>
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: headerBlurOpacity }]}>
          <BlurView tint="dark" intensity={Platform.OS === 'ios' ? 80 : 100} style={StyleSheet.absoluteFill} />
          <LinearGradient colors={['transparent', colors.bg]} style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 18 }} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} pointerEvents="none" />
        </Animated.View>
        <View style={st.appHeader}>
          <TouchableOpacity onPress={() => router.push('/(tabs)/profile')} style={st.avatarBtn}>
            <View style={st.avatarThumb}>
              <Text style={st.avatarInitial}>{(() => { const p = (profile?.name ?? '').trim().split(/\s+/).filter(Boolean); return p.length >= 2 ? (p[0][0] + p[p.length-1][0]).toUpperCase() : (p[0]?.[0] ?? authEmail?.[0] ?? '?').toUpperCase(); })()}</Text>
            </View>
            {hasUnread && <View style={st.avatarDot} />}
          </TouchableOpacity>
          <View style={st.appTitleWrap} pointerEvents="none"><Text style={st.appTitle}>Programs</Text></View>
          <View style={st.headerRight} />
        </View>
      </View>

      <Animated.ScrollView
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })}
        scrollEventThrottle={16}
        contentContainerStyle={[st.scroll, { paddingTop: scrollPaddingTop }]}
        showsVerticalScrollIndicator={false}>
        {/* Single Revolut-style "Products" card: 3-wide icon grid, no sections */}
        <Text style={st.sectionLabel}>Programs</Text>
        <View style={st.group}>
          <View style={st.grid}>
            <ProgramTile icon="ban"    name="Quit Smoking"   color={colors.rose}    onPress={() => setQsVisible(true)} />
            <ProgramTile icon="wine"   name="Quit Drinking"  color={colors.honey}   onPress={() => setQdVisible(true)} />
            <ProgramTile icon="timer"  name="Fasting"        color={colors.teal}    onPress={() => setFastingVisible(true)} />
            <ProgramTile icon="cart"   name="Grocery"        color={colors.green}   onPress={() => setGroceryVisible(true)} />
            <ProgramTile icon="medkit" name="Pill Reminder"  color={colors.purple2} onPress={() => setPillVisible(true)} />
            <ProgramTile icon="restaurant" name="Recipes"   color={colors.sky}     onPress={() => router.push('/(tabs)/recipes')} />
          </View>
        </View>

        <View style={{ height: spacing.xl }} />
      </Animated.ScrollView>

      <QuitSmokingModal  visible={qsVisible}      onClose={() => setQsVisible(false)} />
      <QuitDrinkingModal visible={qdVisible}      onClose={() => setQdVisible(false)} />
      <PillReminderModal visible={pillVisible}    onClose={() => setPillVisible(false)} />
      <FastingModal      visible={fastingVisible} onClose={() => setFastingVisible(false)} />
      <GroceryModal      visible={groceryVisible} onClose={() => setGroceryVisible(false)} />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const st = StyleSheet.create({
  safe:      { flex: 1, backgroundColor: colors.bg },
  fixedHeader: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10, overflow: 'hidden' },
  appHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingTop: spacing.xs, paddingBottom: spacing.lg, flex: 1 },
  appTitleWrap: { position: 'absolute', left: 0, right: 0, top: spacing.xs, bottom: spacing.lg, alignItems: 'center', justifyContent: 'center', zIndex: 0 },
  appTitle:  { fontSize: fontSize.xl, fontWeight: '800', color: colors.ink, textAlign: 'center' },
  avatarBtn: { width: spacing.xl + spacing.sm, height: spacing.xl + spacing.sm, zIndex: 1 },
  avatarThumb: { width: spacing.xl + spacing.sm, height: spacing.xl + spacing.sm, borderRadius: radius.pill, backgroundColor: colors.purple, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: colors.purple2 },
  avatarInitial: { color: colors.white, fontSize: fontSize.sm + 1, fontWeight: '800' },
  headerRight: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4, width: spacing.xl + spacing.sm, zIndex: 1 },
  iconBtn:   { width: spacing.xl + spacing.sm, height: spacing.xl + spacing.sm, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  notifDot:  { position: 'absolute', top: 8, right: 6, width: 6, height: 6, borderRadius: 3, backgroundColor: colors.rose },
  avatarDot: { position: 'absolute', top: -2, right: -2, width: 9, height: 9, borderRadius: radius.pill, backgroundColor: colors.rose, borderWidth: 1.5, borderColor: colors.bg },

  scroll:    { paddingHorizontal: spacing.md, paddingBottom: spacing.lg, paddingTop: spacing.sm },

  // Section labels (iOS Settings style)
  sectionLabel:   { fontSize: fontSize.xs, fontWeight: '700', color: colors.ink3, letterSpacing: 1.2, textTransform: 'uppercase', marginTop: spacing.lg, marginBottom: spacing.sm, marginLeft: spacing.sm },

  // Revolut-style "Products" container holding the whole grid
  group:          {
    backgroundColor: colors.layer1,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.md,
    ...(Platform.OS === 'ios' ? { borderCurve: 'continuous' as const } : null),
  },
  // Fixed 25% columns guarantee exactly 4 tiles per row: the 5th (Pill
  // Reminder) always wraps to row 2 and lands under the first (Quit Smoking).
  // Negative side margins widen the columns (more gap between icons) and pull
  // the first tile (Quit Smoking) closer to the card's left edge.
  grid:           { flexDirection: 'row', flexWrap: 'wrap', rowGap: spacing.md, marginHorizontal: -spacing.md },

  // Each tile is a 1/4-width column: tinted icon-square + label beneath.
  tile:           {
    width: '25%',
    alignItems: 'center',
    gap: spacing.sm,
  },
  tileIcon:       {
    width: 60, height: 60,
    borderRadius: radius.md,
    alignItems: 'center', justifyContent: 'center',
    ...(Platform.OS === 'ios' ? { borderCurve: 'continuous' as const } : null),
  },
  tileLabel:      { fontSize: fontSize.xs, fontWeight: '600', color: colors.ink, textAlign: 'center', lineHeight: 15 },
});

// Modal shared styles
