import { useState, useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  View, Text, ScrollView, TouchableOpacity, Modal, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, fontSize, radius } from '../../theme';
import { BackChevron } from '../BackChevron';
import { useAuthStore } from '../../store/authStore';
import { groceryKey, loadGroceryHistory, recordGroceryPurchase, pickFrequentItems, type GroceryHistory, type GroceryHistoryItem } from '../../lib/grocery';
import {
  m,
} from './shared';

// ── Grocery Planner ───────────────────────────────────────────────────────────
const GROCERY_CATS = [
  { id: 'produce',  icon: '🥦', label: 'Produce' },
  { id: 'protein',  icon: '🥩', label: 'Proteins' },
  { id: 'dairy',    icon: '🧀', label: 'Dairy' },
  { id: 'grains',   icon: '🌾', label: 'Grains' },
  { id: 'frozen',   icon: '❄️', label: 'Frozen' },
  { id: 'drinks',   icon: '🧃', label: 'Drinks' },
  { id: 'snacks',   icon: '🍿', label: 'Snacks' },
  { id: 'other',    icon: '📦', label: 'Other' },
];

interface GroceryItem {
  id: string;
  name: string;
  qty: string;
  category: string;
  checked: boolean;
}

export function GroceryModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { email } = useAuthStore();
  const GROCERY_KEY = groceryKey(email);

  const [items, setItems] = useState<GroceryItem[]>([]);
  const [history, setHistory] = useState<GroceryHistory>({});
  const [newName, setNewName] = useState('');
  const [newQty, setNewQty] = useState('');
  const [newCat, setNewCat] = useState('produce');
  const qtyInputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (!visible) { setNewName(''); setNewQty(''); return; }
    AsyncStorage.getItem(GROCERY_KEY).then(raw => {
      if (!raw) return;
      try { setItems(JSON.parse(raw)); }
      catch { void AsyncStorage.removeItem(GROCERY_KEY); }
    });
    loadGroceryHistory(email).then(setHistory);
  }, [visible]);

  function save(next: GroceryItem[]) {
    setItems(next);
    AsyncStorage.setItem(GROCERY_KEY, JSON.stringify(next));
  }

  function addItem() {
    if (!newName.trim()) return;
    // Random suffix so two adds in the same millisecond can't collide — a shared id
    // would make toggling/deleting one item silently hit its twin (see addFromHistory).
    save([...items, { id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, name: newName.trim(), qty: newQty.trim(), category: newCat, checked: false }]);
    setNewName('');
    setNewQty('');
  }

  /** One-tap add from frequent suggestions. */
  function addFromHistory(h: GroceryHistoryItem) {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    save([
      ...items,
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: h.name,
        qty: '',
        category: h.category || 'other',
        checked: false,
      },
    ]);
  }

  /** Toggle checked. On unchecked→checked transition, record the purchase. */
  function toggleCheck(item: GroceryItem) {
    const wasChecked = item.checked;
    save(items.map(i => (i.id === item.id ? { ...i, checked: !wasChecked } : i)));
    if (!wasChecked) {
      void recordGroceryPurchase(email, item.name, item.category).then(setHistory);
    }
  }

  const checkedCount = items.filter(i => i.checked).length;
  const pct = items.length > 0 ? checkedCount / items.length : 0;
  const grouped = GROCERY_CATS
    .map(cat => ({ ...cat, items: items.filter(i => i.category === cat.id) }))
    .filter(g => g.items.length > 0);

  // Frequent quick-add: top items by purchase count, hiding anything already on the list.
  const itemNamesLc = new Set(items.map(i => i.name.trim().toLowerCase()));
  const catIconMap: Record<string, string> = Object.fromEntries(GROCERY_CATS.map(c => [c.id, c.icon]));
  const frequent = pickFrequentItems(history, 12).filter(h => !itemNamesLc.has(h.name.toLowerCase()));
  const showFrequent = frequent.length > 0;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={m.sheet} edges={['top', 'bottom']}>
        {/* Header */}
        <View style={m.sheetHeader}>
          <TouchableOpacity
            onPress={onClose}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={{
              width: spacing.xl + spacing.sm,
              height: spacing.xl + spacing.sm,
              borderRadius: radius.pill,
              backgroundColor: colors.layer2,
              borderWidth: 1.5,
              borderColor: colors.line2,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <BackChevron size={22} color={colors.ink} />
          </TouchableOpacity>
          <Text style={m.sheetTitle}>Grocery List</Text>
          <TouchableOpacity
            onPress={() => save(items.filter(i => !i.checked))}
            disabled={checkedCount === 0}
            activeOpacity={0.85}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={{
              height: spacing.xl + spacing.sm,
              paddingHorizontal: spacing.md,
              borderRadius: radius.pill,
              backgroundColor: colors.purpleTint,
              borderWidth: 1.5,
              borderColor: colors.line3,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: checkedCount > 0 ? 1 : 0.4,
            }}
          >
            <Text style={{ fontSize: fontSize.base, fontWeight: '700', color: colors.lavender }}>Clear</Text>
          </TouchableOpacity>
        </View>

        {/* Progress */}
        {items.length > 0 && (
          <View style={{ paddingHorizontal: spacing.md, paddingTop: spacing.xs, paddingBottom: spacing.sm, gap: 5 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: fontSize.sm, color: colors.ink3 }}>
                <Text style={{ color: colors.green, fontWeight: '700' }}>{checkedCount}</Text>/{items.length} items
              </Text>
              <Text style={{ fontSize: fontSize.sm, fontWeight: '700', color: colors.green }}>{Math.round(pct * 100)}%</Text>
            </View>
            <View style={{ height: 6, backgroundColor: colors.layer2, borderRadius: radius.pill, overflow: 'hidden' }}>
              <View style={{ height: '100%', width: `${Math.round(pct * 100)}%`, backgroundColor: colors.green, borderRadius: radius.pill }} />
            </View>
          </View>
        )}

        {/* Frequent quick-adds — learned from past purchases (one-tap re-add). */}
        {showFrequent && (
          <View style={{ paddingHorizontal: spacing.md, paddingTop: spacing.xs, paddingBottom: spacing.sm, gap: spacing.xs }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
              <Ionicons name="sparkles" size={fontSize.xs} color={colors.lavender} />
              <Text style={{ fontSize: fontSize.xs, fontWeight: '700', color: colors.ink3, letterSpacing: 1.1, textTransform: 'uppercase' }}>Frequent</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <View style={{ flexDirection: 'row', gap: spacing.xs, paddingVertical: 2 }}>
                {frequent.map(h => (
                  <TouchableOpacity
                    key={h.name.toLowerCase()}
                    onPress={() => addFromHistory(h)}
                    activeOpacity={0.75}
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
                      paddingHorizontal: spacing.sm, paddingVertical: spacing.xs,
                      borderRadius: radius.pill, borderWidth: 1,
                      backgroundColor: colors.purpleTint, borderColor: colors.line3,
                    }}
                  >
                    <Text style={{ fontSize: fontSize.sm }}>{catIconMap[h.category] ?? '📦'}</Text>
                    <Text style={{ fontSize: fontSize.xs, fontWeight: '700', color: colors.lavender }}>{h.name}</Text>
                    <Ionicons name="add" size={fontSize.sm} color={colors.lavender} />
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </View>
        )}

        {/* Add item */}
        <View style={{ paddingHorizontal: spacing.md, paddingBottom: spacing.sm, gap: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.line }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}>
            <View style={{ flexDirection: 'row', gap: spacing.xs, paddingVertical: 2 }}>
              {GROCERY_CATS.map(cat => (
                <TouchableOpacity key={cat.id} onPress={() => setNewCat(cat.id)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radius.pill, borderWidth: 1, backgroundColor: newCat === cat.id ? colors.purpleTint : colors.layer2, borderColor: newCat === cat.id ? colors.line3 : colors.line2 }}>
                  <Text style={{ fontSize: fontSize.sm }}>{cat.icon}</Text>
                  <Text style={{ fontSize: fontSize.xs, fontWeight: '600', color: newCat === cat.id ? colors.lavender : colors.ink3 }}>{cat.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <TextInput
              style={{ flex: 1, backgroundColor: colors.layer2, borderWidth: 1, borderColor: colors.line2, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, color: colors.ink, fontSize: fontSize.base }}
              placeholder="Item name…"
              placeholderTextColor={colors.ink3}
              value={newName}
              onChangeText={setNewName}
              returnKeyType="next"
              blurOnSubmit={false}
              onSubmitEditing={() => qtyInputRef.current?.focus()}
            />
            <TextInput
              ref={qtyInputRef}
              style={{ width: 76, backgroundColor: colors.layer2, borderWidth: 1, borderColor: colors.line2, borderRadius: radius.md, paddingHorizontal: spacing.sm, paddingVertical: spacing.sm, color: colors.ink, fontSize: fontSize.base, textAlign: 'center' }}
              placeholder="Qty"
              placeholderTextColor={colors.ink3}
              value={newQty}
              onChangeText={setNewQty}
              returnKeyType="done"
              onSubmitEditing={addItem}
            />
            <TouchableOpacity onPress={addItem} disabled={!newName.trim()} style={{ borderRadius: radius.md, overflow: 'hidden' }}>
              <LinearGradient
                colors={!newName.trim() ? [colors.layer2, colors.layer2] : [colors.purple, colors.purpleGlow]}
                start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
                style={{ width: 48, height: 48, justifyContent: 'center', alignItems: 'center' }}>
                <Ionicons name="add" size={24} color={!newName.trim() ? colors.ink3 : colors.ink} />
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>

        {/* List */}
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing.md, gap: spacing.lg }} keyboardShouldPersistTaps="handled">
          {grouped.length === 0 && (
            <View style={{ alignItems: 'center', paddingTop: spacing.xl + spacing.xl, gap: spacing.md }}>
              <Text style={{ fontSize: fontSize.xl + fontSize.lg }}>🛒</Text>
              <Text style={{ color: colors.ink3, fontSize: fontSize.base, textAlign: 'center', lineHeight: 22 }}>
                Your list is empty{'\n'}{showFrequent ? 'Tap a frequent item or add your own' : 'Add your first item above'}
              </Text>
            </View>
          )}
          {grouped.map(group => (
            <View key={group.id} style={{ gap: spacing.xs }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingBottom: 4 }}>
                <Text style={{ fontSize: fontSize.sm }}>{group.icon}</Text>
                <Text style={{ fontSize: fontSize.xs, fontWeight: '700', color: colors.ink3, letterSpacing: 1.1, textTransform: 'uppercase' }}>{group.label}</Text>
              </View>
              {group.items.map(item => (
                <TouchableOpacity
                  key={item.id}
                  onPress={() => toggleCheck(item)}
                  activeOpacity={0.75}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: item.checked ? colors.layer1 : colors.layer2, borderWidth: 1, borderColor: item.checked ? colors.line : colors.line2, borderRadius: radius.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.md }}
                >
                  <View style={{ width: 24, height: 24, borderRadius: radius.pill, borderWidth: 2, borderColor: item.checked ? colors.green : colors.line3, backgroundColor: item.checked ? colors.green : colors.bg, alignItems: 'center', justifyContent: 'center' }}>
                    {item.checked && <Ionicons name="checkmark" size={fontSize.sm} color={colors.bg} />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: fontSize.base, fontWeight: '500', color: item.checked ? colors.ink3 : colors.ink, textDecorationLine: item.checked ? 'line-through' : 'none' }}>{item.name}</Text>
                    {!!item.qty && <Text style={{ fontSize: fontSize.xs, color: colors.ink3, marginTop: 1 }}>{item.qty}</Text>}
                  </View>
                  <TouchableOpacity onPress={() => save(items.filter(i => i.id !== item.id))} hitSlop={8} style={{ padding: spacing.xs }}>
                    <Ionicons name="close" size={fontSize.md} color={colors.ink3} />
                  </TouchableOpacity>
                </TouchableOpacity>
              ))}
            </View>
          ))}
          <View style={{ height: spacing.xl }} />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

