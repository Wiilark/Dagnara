/**
 * FloatingModalHeader — the universal sub-screen / modal header.
 *
 * Layout: [ circular back button (left) | dead-centered title | save pill (right) ].
 * The title and a dark BlurView fade in as the body scrolls, matching the Profile
 * header exactly. Drop it at the top of any `<SafeAreaView>`-rooted modal and wire
 * its `scrollY` to that screen's `Animated.ScrollView`.
 *
 * Extracted from app/(tabs)/profile.tsx so every screen shares one header instead
 * of re-implementing the blur + centered-title + proportional-action pattern.
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, Animated } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, spacing, fontSize, radius } from '../theme';
import { BackChevron } from './BackChevron';

type Props = {
  scrollY: Animated.Value;
  title: string;
  onBack: () => void;
  action?: { label: string; onPress: () => void };
  /** Always show the title (for pages with no big in-body header to fade past). */
  staticTitle?: boolean;
};

export function FloatingModalHeader({ scrollY, title, onBack, action, staticTitle }: Props) {
  const blurOp = scrollY.interpolate({ inputRange: [10, 70], outputRange: [0, 1], extrapolate: 'clamp' });
  const titleOp = staticTitle ? 1 : scrollY.interpolate({ inputRange: [40, 90], outputRange: [0, 1], extrapolate: 'clamp' });
  const titleTY = staticTitle ? 0 : scrollY.interpolate({ inputRange: [40, 90], outputRange: [12, 0], extrapolate: 'clamp' });

  return (
    <View style={s.fixedHeader}>
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: blurOp }]}>
        <BlurView tint="dark" intensity={Platform.OS === 'ios' ? 80 : 100} style={StyleSheet.absoluteFill} />
        <LinearGradient
          colors={['transparent', colors.bg]}
          style={s.bottomFade}
          start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} pointerEvents="none"
        />
      </Animated.View>
      <View style={s.fixedHeaderRow}>
        <TouchableOpacity style={s.closeBtn} onPress={onBack} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <BackChevron size={22} color={colors.ink} />
        </TouchableOpacity>
        <Animated.Text style={[s.modalHeaderTitle, { opacity: titleOp, transform: [{ translateY: titleTY }] }]} numberOfLines={1} pointerEvents="none">
          {title}
        </Animated.Text>
        {action ? (
          <TouchableOpacity onPress={action.onPress} activeOpacity={0.85} style={s.modalAction} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={s.modalActionTxt}>{action.label}</Text>
          </TouchableOpacity>
        ) : (
          <View style={s.spacer} />
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  fixedHeader: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10, overflow: 'hidden' },
  bottomFade: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 18 },
  fixedHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  closeBtn: {
    width: spacing.xl + spacing.sm,
    height: spacing.xl + spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.layer2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.line2,
  },
  // Absolutely centered so the title sits dead-center regardless of side button widths.
  modalHeaderTitle: { position: 'absolute', left: 0, right: 0, textAlign: 'center', color: colors.ink, fontSize: fontSize.md, fontWeight: '800' },
  // Right action: a pill the same height as the circular back button (proportional to the left).
  modalAction: {
    height: spacing.xl + spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.purpleTint,
    borderWidth: 1.5,
    borderColor: colors.line3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalActionTxt: { color: colors.lavender, fontSize: fontSize.base, fontWeight: '700' },
  spacer: { width: spacing.xl + spacing.sm, height: spacing.xl + spacing.sm },
});
