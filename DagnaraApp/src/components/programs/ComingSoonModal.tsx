/**
 * ComingSoonModal — placeholder sheet for Programs tiles that aren't built yet.
 *
 * Uses the shared FloatingModalHeader so it matches every other sub-screen,
 * with a centered icon + playful "coming soon" message in the body.
 */
import { useRef } from 'react';
import { View, Text, Animated, StyleSheet, Platform, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, fontSize, radius } from '../../theme';
import { FloatingModalHeader } from '../FloatingModalHeader';

type Props = {
  visible: boolean;
  onClose: () => void;
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
};

export function ComingSoonModal({ visible, onClose, title, icon, color }: Props) {
  const scrollY = useRef(new Animated.Value(0)).current;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
        <FloatingModalHeader scrollY={scrollY} title={title} onBack={onClose} staticTitle />
        <View style={s.body}>
          <View style={[s.iconWrap, { backgroundColor: color + '26' }]}>
            <Ionicons name={icon} size={48} color={colors.ink} />
          </View>
          <Text style={s.heading}>{title}</Text>
          <Text style={s.sub}>Cooking up something special. ✨{'\n'}Check back soon!</Text>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl, gap: spacing.md },
  iconWrap: {
    width: 96, height: 96,
    borderRadius: radius.xl,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: spacing.sm,
    ...(Platform.OS === 'ios' ? { borderCurve: 'continuous' as const } : null),
  },
  heading: { fontSize: fontSize['2xl'], fontWeight: '800', color: colors.ink, textAlign: 'center' },
  sub: { fontSize: fontSize.base, color: colors.ink2, textAlign: 'center', lineHeight: 22 },
});
