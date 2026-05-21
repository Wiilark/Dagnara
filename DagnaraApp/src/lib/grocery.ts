/**
 * grocery.ts — shared helper for the grocery list.
 *
 * The grocery list lives at AsyncStorage key `dagnara_grocery_${email}` and
 * is read by `GroceryModal` in `app/(tabs)/programs.tsx` whenever it opens.
 *
 * This module exposes:
 *   - GroceryItem  : the persisted item shape (matches GroceryModal's local type)
 *   - groceryKey() : storage-key builder
 *   - categorize() : best-effort keyword-based category assignment
 *   - addRecipesToGrocery() : append/merge ingredients from one or more recipes
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface GroceryItem {
  id: string;
  name: string;
  qty: string;
  category: string;
  checked: boolean;
}

export interface RecipeForGrocery {
  id: string;
  name: string;
  ingredients: Array<{ qty: string; name: string }>;
}

export function groceryKey(email: string | null | undefined): string {
  return `dagnara_grocery_${email ?? 'anon'}`;
}

// ── Purchase history ──────────────────────────────────────────────────────────
// Tracks what the user actually buys (not just what they list) so the modal can
// surface frequent / recent items as one-tap quick-adds. Research: 90% of
// shoppers use digital saved-lists/favorites; 78% of additions are "ran out"
// re-buys — both are well served by a frequent-items quick-add panel.
export interface GroceryHistoryItem {
  name: string;
  category: string;
  count: number;       // total times purchased
  lastUsedAt: number;  // ms epoch
}
export type GroceryHistory = Record<string, GroceryHistoryItem>;

export function groceryHistoryKey(email: string | null | undefined): string {
  return `dagnara_grocery_history_${email ?? 'anon'}`;
}

export async function loadGroceryHistory(
  email: string | null | undefined,
): Promise<GroceryHistory> {
  const raw = await AsyncStorage.getItem(groceryHistoryKey(email));
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch { return {}; }
}

/** Records that the user bought this item. Idempotent on lowercase name. */
export async function recordGroceryPurchase(
  email: string | null | undefined,
  name: string,
  category: string,
): Promise<GroceryHistory> {
  const trimmed = name.trim();
  if (!trimmed) return loadGroceryHistory(email);
  const k = trimmed.toLowerCase();
  const history = await loadGroceryHistory(email);
  const prev = history[k];
  history[k] = {
    name: prev?.name ?? trimmed,
    category: category || prev?.category || 'other',
    count: (prev?.count ?? 0) + 1,
    lastUsedAt: Date.now(),
  };
  await AsyncStorage.setItem(groceryHistoryKey(email), JSON.stringify(history));
  return history;
}

/** Top-N frequent items (by count, recency tiebreak). */
export function pickFrequentItems(history: GroceryHistory, limit = 8): GroceryHistoryItem[] {
  return Object.values(history)
    .sort((a, b) => (b.count - a.count) || (b.lastUsedAt - a.lastUsedAt))
    .slice(0, limit);
}

// ── Category keywords ─────────────────────────────────────────────────────────
// Order matters — earlier entries win on first substring match.
const CATEGORY_KEYWORDS: Array<{ id: string; keywords: string[] }> = [
  // Frozen first — "frozen X" should trump produce/protein
  { id: 'frozen',  keywords: ['frozen', 'ice cream'] },

  // Plant milks / juices → drinks (before dairy catches "milk")
  { id: 'drinks',  keywords: ['almond milk', 'oat milk', 'soy milk', 'coconut milk', 'rice milk', 'cashew milk', 'juice', 'soda'] },

  // Snacks
  { id: 'snacks',  keywords: ['chocolate', 'cookie', 'cracker', 'candy', 'dark chocolate chip', 'chip'] },

  // Proteins (animal + plant proteins like tofu/falafel)
  { id: 'protein', keywords: [
    'chicken', 'beef', 'pork', 'turkey', 'lamb', 'mince', 'ground ',
    'salmon', 'tuna', 'cod', 'shrimp', 'prawn', 'fish', 'crab',
    'ham', 'bacon', 'sausage', 'meatball',
    'tofu', 'tempeh', 'falafel', 'edamame',
  ] },

  // Dairy + eggs
  { id: 'dairy',   keywords: [
    'milk', 'cheese', 'yogurt', 'butter', 'cream',
    'feta', 'parmesan', 'mozzarella', 'ricotta', 'cottage', 'cheddar',
    'egg',
  ] },

  // Grains / pantry dry goods
  { id: 'grains',  keywords: [
    'rice', 'pasta', 'noodle', 'bread', 'tortilla', 'pita', 'ramen',
    'oat', 'quinoa', 'bulgur', 'couscous', 'granola', 'cereal',
    'flour', 'breadcrumb', 'cornbread', 'pancake',
    'lentil', 'chickpea', 'beans',
  ] },

  // Produce — vegetables, fruits, herbs
  { id: 'produce', keywords: [
    'tomato', 'cucumber', 'lettuce', 'romaine', 'greens', 'spinach', 'kale',
    'broccoli', 'carrot', 'onion', 'garlic', 'bell pepper', 'pepper strip',
    'avocado', 'lemon', 'lime', 'apple', 'banana',
    'berry', 'berries', 'blueberr', 'strawberr', 'raspberr',
    'mushroom', 'zucchini', 'asparagus', 'bok choy',
    'potato', 'cabbage', 'celery', 'corn', 'beet', 'radish',
    'leek', 'scallion', 'chive', 'green onion',
    'basil', 'parsley', 'cilantro', 'mint', 'rosemary', 'ginger',
    'bamboo shoot', 'cranberr', 'olive',
  ] },
];

export function categorize(name: string): string {
  const n = name.toLowerCase();
  for (const cat of CATEGORY_KEYWORDS) {
    if (cat.keywords.some(k => n.includes(k))) return cat.id;
  }
  return 'other';
}

// ── Add recipes → grocery list ────────────────────────────────────────────────
/**
 * Appends ingredients from `recipes` to the user's grocery list.
 *
 * Behaviour:
 *   - Within the batch: combines same-name ingredients across recipes (qty joined with ' + ').
 *   - Versus existing list: if an UNCHECKED item with the same lowercase name already
 *     exists, its qty is appended to. Otherwise a new item is added.
 *   - Checked items are NEVER touched (user already bought them; new-need is separate).
 *
 * Returns counts so the UI can report e.g. "Added 12 items, merged 3".
 */
export async function addRecipesToGrocery(
  email: string | null | undefined,
  recipes: RecipeForGrocery[],
): Promise<{ added: number; merged: number; total: number }> {
  const key = groceryKey(email);
  const raw = await AsyncStorage.getItem(key);
  let existing: GroceryItem[] = [];
  if (raw) {
    try { existing = JSON.parse(raw); } catch { existing = []; }
  }

  // Step 1: combine within incoming batch by lowercase name.
  // Map: lc-name → { name (display), qtys[], category }
  const incoming = new Map<string, { name: string; qtys: string[]; category: string }>();
  for (const r of recipes) {
    for (const ing of r.ingredients) {
      const k = ing.name.trim().toLowerCase();
      const existing_entry = incoming.get(k);
      if (existing_entry) {
        if (ing.qty) existing_entry.qtys.push(ing.qty);
      } else {
        incoming.set(k, {
          name: ing.name.trim(),
          qtys: ing.qty ? [ing.qty] : [],
          category: categorize(ing.name),
        });
      }
    }
  }

  // Step 2: merge incoming into existing.
  const next = [...existing];
  let added = 0;
  let merged = 0;
  let i = 0;
  for (const [lc, entry] of incoming) {
    const idx = next.findIndex(e => !e.checked && e.name.trim().toLowerCase() === lc);
    const qtyStr = entry.qtys.join(' + ');
    if (idx >= 0) {
      const oldQty = next[idx].qty;
      next[idx] = {
        ...next[idx],
        qty: oldQty ? (qtyStr ? `${oldQty} + ${qtyStr}` : oldQty) : qtyStr,
      };
      merged++;
    } else {
      next.push({
        id: `${Date.now()}-${i++}-${Math.random().toString(36).slice(2, 7)}`,
        name: entry.name,
        qty: qtyStr,
        category: entry.category,
        checked: false,
      });
      added++;
    }
  }

  await AsyncStorage.setItem(key, JSON.stringify(next));
  return { added, merged, total: incoming.size };
}
