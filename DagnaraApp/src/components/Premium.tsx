/**
 * Premium — the single source of truth for Pro-tier gating.
 *
 * `usePremium()` reads the persisted `premium` flag from appStore. During the
 * launch period this flag defaults to `true`, so every user has Pro for free —
 * but the gating wiring is already in place, so flipping the default (or a
 * future real-billing entitlement) instantly re-locks the premium surfaces.
 *
 * `PremiumBadge` is the small "PREMIUM" chip shown on premium features. While
 * Premium is free-during-launch it reads "PREMIUM · FREE" to set the
 * expectation that this will eventually be a paid tier.
 *
 * `PremiumLock` wraps any premium surface: on Standard it blurs the content,
 * pins a small diamond badge to the top-right corner, and shows an "unlock"
 * label. On Premium it renders its children untouched. This is the one pattern
 * every locked feature uses so the look stays consistent.
 */
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, fontSize, radius } from '../theme';
import { useAppStore } from '../store/appStore';

/** True when the user has Pro. Free-during-launch ⇒ true for everyone today. */
export function usePremium(): boolean {
  return useAppStore((s) => s.premium);
}

type BadgeProps = {
  /** Show the "free" launch suffix. Default true while Pro is free for all. */
  launch?: boolean;
};

export function PremiumBadge({ launch = true }: BadgeProps) {
  return (
    <View style={s.badge}>
      <Ionicons name="diamond" size={fontSize.xs} color={colors.lavender} />
      <Text style={s.badgeTxt}>{launch ? 'PREMIUM · FREE' : 'PREMIUM'}</Text>
    </View>
  );
}

/** Small diamond chip pinned to a card corner to mark a premium feature. */
export function PremiumDiamond() {
  return (
    <View style={s.diamond}>
      <Ionicons name="diamond" size={fontSize.sm} color={colors.lavender} />
    </View>
  );
}

type LockProps = {
  /** When false, blur + diamond + label overlay the children. */
  unlocked: boolean;
  /** Tapping the locked surface (e.g. deep-link to the Plans screen). */
  onLockedPress?: () => void;
  /** Label under the diamond when locked. */
  label?: string;
  children: React.ReactNode;
};

/**
 * Premium gate. Premium users see `children` as-is. Standard users see the
 * children blurred behind a frosted overlay, a diamond badge in the top-right
 * corner, and a tappable "unlock" label routing to the Plans screen.
 */
export function PremiumLock({ unlocked, onLockedPress, label = 'Unlock with Premium', children }: LockProps) {
  if (unlocked) return <>{children}</>;
  return (
    <TouchableOpacity activeOpacity={0.85} onPress={onLockedPress} style={s.lockWrap}>
      {/* The real content sits underneath, dimmed; the blur frosts it. */}
      <View pointerEvents="none" style={s.lockContent}>{children}</View>
      <BlurView tint="dark" intensity={22} style={StyleSheet.absoluteFill} pointerEvents="none" />
      <PremiumDiamond />
      <View style={s.lockLabelWrap} pointerEvents="none">
        <Ionicons name="lock-closed" size={fontSize.sm} color={colors.lavender} />
        <Text style={s.lockLabel}>{label}</Text>
      </View>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs / 2,
    backgroundColor: colors.purpleTint,
    borderWidth: 1,
    borderColor: colors.line3,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs / 2,
  },
  badgeTxt: {
    fontSize: fontSize.xs,
    fontWeight: '800',
    color: colors.lavender,
    letterSpacing: 0.6,
  },
  diamond: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.purpleTint,
    borderWidth: 1,
    borderColor: colors.line3,
    zIndex: 2,
  },
  lockWrap: {
    position: 'relative',
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  lockContent: {
    opacity: 0.5,
  },
  lockLabelWrap: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  lockLabel: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.lavender,
  },
});
