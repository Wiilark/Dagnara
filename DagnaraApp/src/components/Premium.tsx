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
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
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
      <Ionicons name="star" size={fontSize.xs} color={colors.lavender} />
      <Text style={s.badgeTxt}>{launch ? 'PREMIUM · FREE' : 'PREMIUM'}</Text>
    </View>
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
});
