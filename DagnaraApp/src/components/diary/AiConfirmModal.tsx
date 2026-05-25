import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Modal, ActivityIndicator
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, fontSize, radius } from '../../theme';
import { fmt } from '../../lib/format';

export interface AiItem {
  icon: string;
  name: string;
  kcal: number;
  carbs: number;
  protein: number;
  fat: number;
  unit: string;
  weight_g?: number;
  per100?: {
    kcal: number;
    carbs: number;
    protein: number;
    fat: number;
  };
  multiplier: number;
}

interface AiConfirmModalProps {
  visible: boolean;
  items: AiItem[];
  onConfirm: (items: AiItem[]) => void;
  onClose: () => void;
}

export function AiConfirmModal({ visible, items, onConfirm, onClose }: AiConfirmModalProps) {
  const [list, setList] = useState<AiItem[]>([]);

  useEffect(() => {
    setList(items.map(item => ({ ...item, multiplier: item.multiplier || 1 })));
  }, [items, visible]);

  function setMultiplier(idx: number, m: number) {
    setList(prev => prev.map((it, i) => {
      if (i !== idx) return it;
      
      // Calculate base values from multiplier if per100 is not available
      const base = it.per100 && it.weight_g 
        ? {
            kcal: (it.per100.kcal * it.weight_g) / 100,
            carbs: (it.per100.carbs * it.weight_g) / 100,
            protein: (it.per100.protein * it.weight_g) / 100,
            fat: (it.per100.fat * it.weight_g) / 100
          }
        : {
            kcal: it.kcal / it.multiplier,
            carbs: it.carbs / it.multiplier,
            protein: it.protein / it.multiplier,
            fat: it.fat / it.multiplier
          };

      return {
        ...it,
        multiplier: m,
        kcal: Math.round(base.kcal * m),
        carbs: Math.round(base.carbs * m),
        protein: Math.round(base.protein * m),
        fat: Math.round(base.fat * m)
      };
    }));
  }

  const totalKcal = list.reduce((s, it) => s + it.kcal, 0);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={st.safe} edges={['bottom']}>
        <View style={st.modalHdr}>
          <TouchableOpacity onPress={onClose} style={st.closeBtn}>
            <Ionicons name="close" size={22} color={colors.ink2} />
          </TouchableOpacity>
          <Text style={st.modalTitle}>AI Detected Food</Text>
          <View style={{ width: 36 }} />
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={st.scrollContent}>
          {list.map((item, idx) => (
            <View key={idx} style={st.aiItemCard}>
              <View style={st.aiItemHeader}>
                <Text style={st.aiItemEmoji}>{item.icon}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={st.aiItemName}>{item.name}</Text>
                  <Text style={st.aiItemMeta}>
                    {item.unit}{item.weight_g ? ` · ~${Math.round(item.weight_g * item.multiplier)}g` : ''}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={st.aiItemKcal}>{fmt(item.kcal)} kcal</Text>
                </View>
              </View>

              <View style={st.multRow}>
                {[0.5, 1, 1.5, 2].map(m => (
                  <TouchableOpacity
                    key={m}
                    onPress={() => setMultiplier(idx, m)}
                    style={[st.multBtn, item.multiplier === m && st.multBtnActive]}
                  >
                    <Text style={[st.multTxt, item.multiplier === m && st.multTxtActive]}>
                      {m}×
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ))}
        </ScrollView>

        <View style={st.modalFooter}>
          <TouchableOpacity onPress={() => onConfirm(list)} style={st.primaryBtn}>
            <Text style={st.primaryBtnTxt}>
              LOG {list.length} ITEMS · {fmt(totalKcal)} KCAL
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  modalHdr: {
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: colors.line
  },
  modalTitle: { color: colors.ink, fontSize: fontSize.md, fontWeight: '700' },
  closeBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.layer2,
    borderRadius: 18
  },
  scrollContent: { padding: spacing.md, gap: spacing.sm, paddingBottom: 120 },
  aiItemCard: {
    backgroundColor: colors.layer1,
    borderWidth: 1,
    borderColor: colors.line2,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm
  },
  aiItemHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  aiItemEmoji: { fontSize: fontSize.xl },
  aiItemName: { color: colors.ink, fontSize: fontSize.base, fontWeight: '600' },
  aiItemMeta: { color: colors.ink3, fontSize: fontSize.xs },
  aiItemKcal: { color: colors.lavender, fontSize: fontSize.md, fontWeight: '800' },
  multRow: { flexDirection: 'row', gap: spacing.xs },
  multBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: radius.sm,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.line2,
    backgroundColor: colors.layer2
  },
  multBtnActive: { borderColor: colors.purple, backgroundColor: colors.purple + '15' },
  multTxt: { color: colors.ink3, fontSize: fontSize.xs, fontWeight: '700' },
  multTxtActive: { color: colors.lavender },
  modalFooter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: spacing.lg,
    backgroundColor: colors.bg,
    borderTopWidth: 1,
    borderTopColor: colors.line
  },
  primaryBtn: {
    backgroundColor: colors.purple,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center'
  },
  primaryBtnTxt: { color: colors.white, fontSize: fontSize.base, fontWeight: '800' },
});
