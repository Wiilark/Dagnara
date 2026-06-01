# Sarah 24-Hour Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the full Sarah persona 24-hour loop — onboarding intake, pill card on diary, sectioned grocery list, personalized recipe filter, and fasting caloric lock.

**Architecture:** All new preferences (fasting window, pill timing, dietary prefs) are stored in `appStore.ts` alongside existing goals, then consumed by onboarding (capture), diary (pill card + fasting lock), recipes (default filter), and programs (grocery sections). No new stores needed.

**Tech Stack:** React Native / Expo 54, Zustand v5, AsyncStorage, expo-haptics, expo-linear-gradient, theme tokens from `@/theme`.

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `DagnaraApp/src/store/appStore.ts` | Modify | Add `fastingWindow`, `dietaryPreferences`, `pillDefaultTime` fields + setters |
| `DagnaraApp/app/onboarding.tsx` | Modify | Add 3 new steps: Fasting Window, Pill Timing, Dietary Preferences |
| `DagnaraApp/app/(tabs)/diary.tsx` | Modify | Add pill card with mark-taken animation; fasting lock on meal add buttons |
| `DagnaraApp/app/(tabs)/programs.tsx` | Modify | Section grocery list by category |
| `DagnaraApp/app/(tabs)/recipes.tsx` | Modify | Pre-select filter from stored `dietaryPreferences` |

---

## Task 1: Extend appStore with Sarah's preferences

**Files:**
- Modify: `DagnaraApp/src/store/appStore.ts`

- [ ] **Step 1: Add three fields to `PersistedData` interface**

In `appStore.ts`, find the `PersistedData` interface (line 49) and add after `country: string;`:

```typescript
  fastingWindow: string | null;       // e.g. '16:8', '18:6', '14:10' — null = not set
  dietaryPreferences: string | null;  // maps to a DIET_FILTERS value: 'High Protein', 'Vegan', etc.
  pillDefaultTime: string | null;     // 'HH:MM' 24h, e.g. '07:30' — used as default when adding meds
```

- [ ] **Step 2: Add defaults to store initializer**

Find the `useAppStore = create<AppState>((set, get) => ({` block (line ~141). After `country: 'US',` add:

```typescript
  fastingWindow: null,
  dietaryPreferences: null,
  pillDefaultTime: null,
```

- [ ] **Step 3: Add fields to `pick()` function**

Find the `pick(s: AppState): PersistedData` function (line ~94). After `country: s.country,` add:

```typescript
    fastingWindow: s.fastingWindow,
    dietaryPreferences: s.dietaryPreferences,
    pillDefaultTime: s.pillDefaultTime,
```

- [ ] **Step 4: Add setter actions to `AppState` interface and implementation**

In the `AppState` interface (line ~66), after `setCountry: (code: string) => Promise<void>;` add:

```typescript
  setFastingWindow: (window: string | null) => Promise<void>;
  setDietaryPreferences: (pref: string | null) => Promise<void>;
  setPillDefaultTime: (time: string | null) => Promise<void>;
```

In the `useAppStore` implementation block, after the `setCountry` action add:

```typescript
  setFastingWindow: async (fastingWindow) => {
    set({ fastingWindow });
    await persist(pick({ ...get(), fastingWindow }), get().userEmail);
  },

  setDietaryPreferences: async (dietaryPreferences) => {
    set({ dietaryPreferences });
    await persist(pick({ ...get(), dietaryPreferences }), get().userEmail);
  },

  setPillDefaultTime: async (pillDefaultTime) => {
    set({ pillDefaultTime });
    await persist(pick({ ...get(), pillDefaultTime }), get().userEmail);
  },
```

- [ ] **Step 5: Update `loadApp` merge logic**

In `loadApp`, inside the `if (data?.state_data)` cloud merge block, after `country: cloud.country ?? local.country ?? 'US',` add:

```typescript
            fastingWindow: cloud.fastingWindow ?? local.fastingWindow ?? null,
            dietaryPreferences: cloud.dietaryPreferences ?? local.dietaryPreferences ?? null,
            pillDefaultTime: cloud.pillDefaultTime ?? local.pillDefaultTime ?? null,
```

- [ ] **Step 6: Update `reset()` action**

In the `reset()` action, after `country: 'US',` add:

```typescript
    fastingWindow: null, dietaryPreferences: null, pillDefaultTime: null,
```

- [ ] **Step 7: Commit**

```bash
git add DagnaraApp/src/store/appStore.ts
git commit -m "feat: add fastingWindow, dietaryPreferences, pillDefaultTime to appStore"
```

---

## Task 2: Expand onboarding with Fasting Window, Pill Timing, Dietary Preferences

**Files:**
- Modify: `DagnaraApp/app/onboarding.tsx`

The current 6 steps are: Welcome(0), Goal(1), Activity(2), Country(3), BodyStats(4), Summary(5).
New order (9 steps): Welcome(0), Goal(1), Activity(2), **FastingWindow(3)**, **PillTiming(4)**, **DietPrefs(5)**, Country(6), BodyStats(7), Summary(8).

- [ ] **Step 1: Update STEPS constant and add state**

Change `const STEPS = 6;` to `const STEPS = 9;`

The existing `useAppStore()` destructure at line 44 is:
```typescript
const { setGoals, unitSystem, setUnitSystem, country: persistedCountry, setCountry } = useAppStore();
```
Add the three new setters:
```typescript
const { setGoals, unitSystem, setUnitSystem, country: persistedCountry, setCountry,
        setFastingWindow, setDietaryPreferences, setPillDefaultTime } = useAppStore();
```

Add these state declarations after `const [saving, setSaving] = useState(false);`:

```typescript
  const [fastingWindow, setFastingWindowLocal] = useState<string | null>(null);
  const [pillDefaultTime, setPillDefaultTimeLocal] = useState('07:30');
  const [dietaryPref, setDietaryPref] = useState<string | null>(null);
```

- [ ] **Step 2: Add new preference saves to the `finish()` function**

Inside `finish()`, after `await setGoals(activity, goal, calorieGoal);` add:

```typescript
      await setFastingWindow(fastingWindow);
      await setDietaryPreferences(dietaryPref);
      await setPillDefaultTime(pillDefaultTime);
```

- [ ] **Step 3: Update `canAdvance()` — body stats is now step 7**

```typescript
  const canAdvance = () => {
    if (step === 7) {
      if (!age || !weight || !height) return false;
      if (isNaN(ageNum) || ageNum < 16 || ageNum > 100) return false;
      if (!wKg || wKg < 30 || wKg > 300) return false;
      if (!hCm || hCm < 100 || hCm > 250) return false;
      return true;
    }
    return true;
  };
```

- [ ] **Step 4: Renumber existing step conditions and labels in JSX**

Update conditions:
- `{step === 3 && ...}` Country → `{step === 6 && ...}`
- `{step === 4 && ...}` Body Stats → `{step === 7 && ...}`
- `{step === 5 && ...}` Summary → `{step === 8 && ...}`

Update label strings:
- Goal: `STEP 1 OF 5` → `STEP 1 OF 8`
- Activity: `STEP 2 OF 5` → `STEP 2 OF 8`
- Country: `STEP 3 OF 5` → `STEP 6 OF 8`
- Body Stats: `STEP 4 OF 5` → `STEP 7 OF 8`
- Summary: `STEP 5 OF 5` → `STEP 8 OF 8`

- [ ] **Step 5: Insert Fasting Window step JSX (step 3)**

Add after the `{/* Step 2: Activity */}` closing `)}`:

```tsx
        {/* Step 3: Fasting Window */}
        {step === 3 && (
          <View style={s.section}>
            <Text style={s.stepLabel}>STEP 3 OF 8</Text>
            <Text style={s.heading}>Do you fast?</Text>
            <Text style={s.body}>
              Intermittent fasting can support your calorie goal. Pick your preferred window — you can change this any time.
            </Text>
            <View style={s.optionList}>
              {([
                { key: '16:8',  label: '16:8',  desc: 'Fast 16 hrs · eat within 8 hrs (most popular)' },
                { key: '18:6',  label: '18:6',  desc: 'Fast 18 hrs · eat within 6 hrs' },
                { key: '14:10', label: '14:10', desc: 'Fast 14 hrs · eat within 10 hrs (gentle start)' },
                { key: '12:12', label: '12:12', desc: 'Fast 12 hrs · balanced, great for beginners' },
              ] as const).map(opt => (
                <TouchableOpacity
                  key={opt.key}
                  style={[s.option, fastingWindow === opt.key && s.optionSelected]}
                  onPress={() => setFastingWindowLocal(fastingWindow === opt.key ? null : opt.key)}
                  activeOpacity={0.75}
                >
                  <Text style={s.optionIcon}>⏱️</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.optionLabel, fastingWindow === opt.key && s.optionLabelSelected]}>{opt.label}</Text>
                    <Text style={s.optionDesc}>{opt.desc}</Text>
                  </View>
                  <View style={[s.radio, fastingWindow === opt.key && s.radioSelected]} />
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={[s.option, fastingWindow === null && s.optionSelected]}
                onPress={() => setFastingWindowLocal(null)}
                activeOpacity={0.75}
              >
                <Text style={s.optionIcon}>🚫</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[s.optionLabel, fastingWindow === null && s.optionLabelSelected]}>Skip for now</Text>
                  <Text style={s.optionDesc}>I don't fast or will decide later</Text>
                </View>
                <View style={[s.radio, fastingWindow === null && s.radioSelected]} />
              </TouchableOpacity>
            </View>
          </View>
        )}
```

- [ ] **Step 6: Insert Pill Timing step JSX (step 4)**

Add after the Step 3 closing `)}`:

```tsx
        {/* Step 4: Pill / Medication Timing */}
        {step === 4 && (
          <View style={s.section}>
            <Text style={s.stepLabel}>STEP 4 OF 8</Text>
            <Text style={s.heading}>Do you take a daily pill or supplement?</Text>
            <Text style={s.body}>
              Set a default reminder time — we'll prompt you on the diary dashboard to mark it taken. Skip if not applicable.
            </Text>
            <View style={s.optionList}>
              {([
                { key: '07:00', label: '7:00 AM',  desc: 'Morning with breakfast' },
                { key: '08:00', label: '8:00 AM',  desc: 'After breakfast' },
                { key: '12:00', label: '12:00 PM', desc: 'Lunchtime' },
                { key: '21:00', label: '9:00 PM',  desc: 'Evening before bed' },
              ] as const).map(opt => (
                <TouchableOpacity
                  key={opt.key}
                  style={[s.option, pillDefaultTime === opt.key && s.optionSelected]}
                  onPress={() => setPillDefaultTimeLocal(opt.key)}
                  activeOpacity={0.75}
                >
                  <Text style={s.optionIcon}>💊</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.optionLabel, pillDefaultTime === opt.key && s.optionLabelSelected]}>{opt.label}</Text>
                    <Text style={s.optionDesc}>{opt.desc}</Text>
                  </View>
                  <View style={[s.radio, pillDefaultTime === opt.key && s.radioSelected]} />
                </TouchableOpacity>
              ))}
            </View>
            <Text style={[s.body, { marginTop: spacing.sm }]}>
              You can configure your exact medications in the Programs tab after onboarding.
            </Text>
          </View>
        )}
```

- [ ] **Step 7: Insert Dietary Preferences step JSX (step 5)**

Add after the Step 4 closing `)}`:

```tsx
        {/* Step 5: Dietary Preferences */}
        {step === 5 && (
          <View style={s.section}>
            <Text style={s.stepLabel}>STEP 5 OF 8</Text>
            <Text style={s.heading}>Any dietary preferences?</Text>
            <Text style={s.body}>
              We'll filter recipes to match your style by default. You can always browse everything.
            </Text>
            <View style={s.optionList}>
              {([
                { key: 'High Protein',  label: 'High Protein',  icon: '💪', desc: 'Prioritise protein at every meal' },
                { key: 'Low Carb',      label: 'Low Carb',      icon: '🥩', desc: 'Reduce carbohydrates and grains' },
                { key: 'Vegan',         label: 'Vegan',         icon: '🌱', desc: 'No animal products' },
                { key: 'Vegetarian',    label: 'Vegetarian',    icon: '🥦', desc: 'No meat — dairy and eggs OK' },
                { key: 'Keto',          label: 'Keto',          icon: '🥑', desc: 'Very low carb, high fat' },
                { key: 'Mediterranean', label: 'Mediterranean', icon: '🫒', desc: 'Olive oil, fish, legumes, whole grains' },
              ] as const).map(opt => (
                <TouchableOpacity
                  key={opt.key}
                  style={[s.option, dietaryPref === opt.key && s.optionSelected]}
                  onPress={() => setDietaryPref(dietaryPref === opt.key ? null : opt.key)}
                  activeOpacity={0.75}
                >
                  <Text style={s.optionIcon}>{opt.icon}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.optionLabel, dietaryPref === opt.key && s.optionLabelSelected]}>{opt.label}</Text>
                    <Text style={s.optionDesc}>{opt.desc}</Text>
                  </View>
                  <View style={[s.radio, dietaryPref === opt.key && s.radioSelected]} />
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={[s.option, dietaryPref === null && s.optionSelected]}
                onPress={() => setDietaryPref(null)}
                activeOpacity={0.75}
              >
                <Text style={s.optionIcon}>🍽️</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[s.optionLabel, dietaryPref === null && s.optionLabelSelected]}>No preference</Text>
                  <Text style={s.optionDesc}>Show me everything</Text>
                </View>
                <View style={[s.radio, dietaryPref === null && s.radioSelected]} />
              </TouchableOpacity>
            </View>
          </View>
        )}
```

- [ ] **Step 8: Commit**

```bash
git add DagnaraApp/app/onboarding.tsx
git commit -m "feat: expand onboarding with fasting window, pill timing, dietary pref steps"
```

---

## Task 3: Pill card on diary dashboard

**Files:**
- Modify: `DagnaraApp/app/(tabs)/diary.tsx`

The diary already loads `pillsCount` from `dagnara_pill_meds_${email}` (line ~1220). Extend it to load today's pill log, surface a pill card, and animate mark-taken.

`PillLog` shape (matches programs.tsx `DoseEntry`):
```typescript
// Key: dagnara_pill_log_YYYY-MM-DD_${email}
// Value: { [medId: string]: { takenCount: number; takenTimes: string[] } }
```

- [ ] **Step 1: Add pill card state variables**

Search for `setProgramsCardData` — state is declared nearby. Add adjacent:

```typescript
  const [pillMeds, setPillMeds] = useState<Array<{ id: string; name: string; color: string; times: string[] }>>([]);
  const [pillTakenToday, setPillTakenToday] = useState(false);
  const [pillStreak, setPillStreak] = useState(0);
  const pillFlashAnim = useRef(new Animated.Value(0)).current;
```

- [ ] **Step 2: Extend the programs card useEffect to load pill detail**

Find the `useEffect` that calls `setProgramsCardData(...)` (around line 1220). After `setProgramsCardData({ qsDays, qdDays, pillsCount, fastingActive, fastingElapsedHrs, fastingMode });` add:

```typescript
        if (pilRaw) {
          const meds: Array<{ id: string; name: string; color: string; times: string[] }> = JSON.parse(pilRaw);
          if (Array.isArray(meds) && meds.length > 0) {
            setPillMeds(meds);
            const today = dateStr(new Date());
            const logRaw = await AsyncStorage.getItem(`dagnara_pill_log_${today}_${email}`);
            const pillLog: Record<string, { takenCount: number; takenTimes: string[] }> = logRaw ? JSON.parse(logRaw) : {};
            const allTaken = meds.every(m => (pillLog[m.id]?.takenCount ?? 0) >= 1);
            setPillTakenToday(allTaken);

            // Count consecutive taken days (up to 30)
            let streak = allTaken ? 1 : 0;
            if (allTaken) {
              const d = new Date();
              for (let i = 1; i <= 30; i++) {
                d.setDate(d.getDate() - 1);
                const dayKey = dateStr(d);
                const pastRaw = await AsyncStorage.getItem(`dagnara_pill_log_${dayKey}_${email}`);
                if (!pastRaw) break;
                const pastLog: Record<string, { takenCount: number }> = JSON.parse(pastRaw);
                if (meds.every(m => (pastLog[m.id]?.takenCount ?? 0) >= 1)) streak++;
                else break;
              }
            }
            setPillStreak(streak);
          }
        }
```

- [ ] **Step 3: Add `markAllPillsTaken` function**

Add near the other handler functions (near `saveFavorite`):

```typescript
  async function markAllPillsTaken() {
    if (!email || pillMeds.length === 0 || pillTakenToday) return;
    const today = dateStr(new Date());
    const logKey = `dagnara_pill_log_${today}_${email}`;
    const now = new Date().toISOString();
    const existing = await AsyncStorage.getItem(logKey);
    const log: Record<string, { takenCount: number; takenTimes: string[] }> = existing ? JSON.parse(existing) : {};
    for (const med of pillMeds) {
      if ((log[med.id]?.takenCount ?? 0) < 1) {
        log[med.id] = { takenCount: 1, takenTimes: [now] };
      }
    }
    await AsyncStorage.setItem(logKey, JSON.stringify(log));
    setPillTakenToday(true);
    setPillStreak(s => s === 0 ? 1 : s);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Animated.sequence([
      Animated.timing(pillFlashAnim, { toValue: 1, duration: 200, useNativeDriver: false }),
      Animated.delay(600),
      Animated.timing(pillFlashAnim, { toValue: 0, duration: 400, useNativeDriver: false }),
    ]).start();
  }
```

- [ ] **Step 4: Add pill card JSX**

Find the programs card in the diary JSX (search for `programsCardData` in the JSX). Insert the pill card directly **above** it, inside the same `ScrollView`:

```tsx
            {/* Pill Card */}
            {pillMeds.length > 0 && (
              <View style={{
                backgroundColor: colors.layer1,
                borderWidth: 1, borderColor: colors.line2,
                borderRadius: radius.lg,
                padding: spacing.lg,
                marginBottom: spacing.md,
                shadowColor: colors.purple, shadowOpacity: 0.12,
                shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 6,
                overflow: 'hidden',
              }}>
                <Animated.View style={{
                  ...StyleSheet.absoluteFillObject,
                  backgroundColor: colors.green,
                  opacity: pillFlashAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 0.18] }),
                }} pointerEvents="none" />
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.xs }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                    <Text style={{ fontSize: fontSize.lg }}>💊</Text>
                    <View>
                      <Text style={{ fontSize: fontSize.base, fontWeight: '700', color: colors.ink }}>
                        {pillMeds.length === 1 ? pillMeds[0].name : `${pillMeds.length} medications`}
                      </Text>
                      {pillStreak > 0 && (
                        <Text style={{ fontSize: fontSize.xs, color: colors.green, fontWeight: '600' }}>
                          🔥 {pillStreak}-day streak
                        </Text>
                      )}
                    </View>
                  </View>
                  {pillTakenToday ? (
                    <View style={{
                      flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
                      backgroundColor: colors.green + '22',
                      borderRadius: radius.pill,
                      paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
                    }}>
                      <Ionicons name="checkmark-circle" size={16} color={colors.green} />
                      <Text style={{ fontSize: fontSize.sm, color: colors.green, fontWeight: '600' }}>Taken</Text>
                    </View>
                  ) : (
                    <TouchableOpacity onPress={markAllPillsTaken} activeOpacity={0.8}
                      style={{ borderRadius: radius.md, overflow: 'hidden' }}>
                      <ExpoLinearGradient
                        colors={[colors.green, colors.teal]}
                        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                        style={{ paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2 }}
                      >
                        <Text style={{ color: colors.white, fontSize: fontSize.sm, fontWeight: '700' }}>Mark Taken</Text>
                      </ExpoLinearGradient>
                    </TouchableOpacity>
                  )}
                </View>
                <Text style={{ fontSize: fontSize.xs, color: colors.ink3 }}>
                  {pillTakenToday
                    ? 'All medications logged for today ✓'
                    : `Due: ${pillMeds.flatMap(m => m.times).slice(0, 3).join(' · ')}`}
                </Text>
              </View>
            )}
```

- [ ] **Step 5: Commit**

```bash
git add DagnaraApp/app/(tabs)/diary.tsx
git commit -m "feat: add pill card to diary dashboard with mark-taken animation and streak"
```

---

## Task 4: Section grocery list by category

**Files:**
- Modify: `DagnaraApp/app/(tabs)/programs.tsx`

`GroceryItem` already has `category: string` set by `categorize()` in `grocery.ts`. Categories: `'produce' | 'protein' | 'dairy' | 'grains' | 'frozen' | 'drinks' | 'snacks' | 'other'`.

- [ ] **Step 1: Add section config and grouping helper at module level**

Add after the imports in programs.tsx, before the component:

```typescript
const GROCERY_SECTIONS = [
  { key: 'produce',  label: 'Produce',          emoji: '🥦' },
  { key: 'protein',  label: 'Meat & Fish',      emoji: '🥩' },
  { key: 'dairy',    label: 'Dairy',            emoji: '🥛' },
  { key: 'grains',   label: 'Pantry & Grains',  emoji: '🌾' },
  { key: 'snacks',   label: 'Snacks',           emoji: '🍿' },
  { key: 'frozen',   label: 'Frozen',           emoji: '🧊' },
  { key: 'drinks',   label: 'Drinks',           emoji: '🥤' },
  { key: 'other',    label: 'Other',            emoji: '🛒' },
] as const;

import type { GroceryItem } from '../../src/lib/grocery';

function groupGrocery(items: GroceryItem[]) {
  const map: Partial<Record<string, GroceryItem[]>> = {};
  for (const item of items) {
    const cat = item.category ?? 'other';
    if (!map[cat]) map[cat] = [];
    map[cat]!.push(item);
  }
  return GROCERY_SECTIONS.filter(s => (map[s.key]?.length ?? 0) > 0).map(s => ({ ...s, items: map[s.key]! }));
}
```

**Note:** The `import type` line must go at the top of the file with the other imports, not here — move it to the import block.

- [ ] **Step 2: Find the grocery items list render**

Search for where grocery items are mapped in the grocery modal JSX. Look for `groceryItems.map(` or similar. Read that section to understand the exact variable name and row JSX before replacing.

- [ ] **Step 3: Replace flat render with sectioned render**

Replace the flat `.map()` over grocery items with:

```tsx
{groupGrocery(groceryItems).map(section => (
  <View key={section.key}>
    <View style={{
      flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
      paddingHorizontal: spacing.md,
      paddingTop: spacing.md, paddingBottom: spacing.xs,
    }}>
      <Text style={{ fontSize: fontSize.base }}>{section.emoji}</Text>
      <Text style={{
        fontSize: fontSize.xs, fontWeight: '700',
        color: colors.ink3, letterSpacing: 1.1,
        textTransform: 'uppercase',
      }}>{section.label}</Text>
    </View>
    {section.items.map(item => (
      /* existing row JSX here — just replace the source array variable with `item` */
    ))}
  </View>
))}
```

- [ ] **Step 4: Commit**

```bash
git add DagnaraApp/app/(tabs)/programs.tsx
git commit -m "feat: section grocery list by category (Produce, Meat, Dairy, Pantry...)"
```

---

## Task 5: Pre-select recipe filter from dietary preferences

**Files:**
- Modify: `DagnaraApp/app/(tabs)/recipes.tsx`

`useAppStore` is already imported. `dietaryPreferences` is a string matching one of the `DIET_FILTERS` values, or `null`.

- [ ] **Step 1: Check if `useShallow` is already imported**

Search for `useShallow` in recipes.tsx. If absent, add to the imports:

```typescript
import { useShallow } from 'zustand/react/shallow';
```

- [ ] **Step 2: Read `dietaryPreferences` and initialize the filter**

Find `const [activeFilter, setActiveFilter] = useState('All')` and replace with:

```typescript
  const { dietaryPreferences } = useAppStore(useShallow(s => ({ dietaryPreferences: s.dietaryPreferences })));

  const defaultFilter = (dietaryPreferences && DIET_FILTERS.includes(dietaryPreferences as (typeof DIET_FILTERS)[number]))
    ? dietaryPreferences
    : 'All';

  const [activeFilter, setActiveFilter] = useState(defaultFilter);
```

- [ ] **Step 3: Commit**

```bash
git add DagnaraApp/app/(tabs)/recipes.tsx
git commit -m "feat: default recipe filter to user dietary preference from onboarding"
```

---

## Task 6: Fasting caloric log lock

**Files:**
- Modify: `DagnaraApp/app/(tabs)/diary.tsx`

`programsCardData.fastingActive` is already loaded (lines ~1220-1265). When true, disable add-food entry points and show a banner.

- [ ] **Step 1: Find all add-food entry points**

Search for `openFoodSearch(` and `setSearchVisible(true)` and `setScanning(true)` in diary.tsx. There are multiple — one per meal section + the main FAB/header button + barcode button. List all locations before editing.

- [ ] **Step 2: Wrap each press handler with fasting gate**

For every `onPress` that calls `openFoodSearch`, `setSearchVisible(true)`, or `setScanning(true)`, wrap it:

```tsx
onPress={() => {
  if (programsCardData.fastingActive) {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    Alert.alert(
      '⏱️ Fast in progress',
      `You started a ${programsCardData.fastingMode ?? '16:8'} fast. End your fast in Programs before logging food.`,
      [{ text: 'OK' }]
    );
    return;
  }
  // original handler
  openFoodSearch(meal); // or setSearchVisible(true), etc.
}}
```

Also add `opacity: programsCardData.fastingActive ? 0.45 : 1` to the button's style.

- [ ] **Step 3: Add fasting banner above meal sections**

Find the comment or View that wraps the meals section. Add the banner just before the first meal:

```tsx
            {programsCardData.fastingActive && (
              <View style={{
                flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
                backgroundColor: colors.honey + '18',
                borderWidth: 1, borderColor: colors.honey + '44',
                borderRadius: radius.md,
                padding: spacing.md,
                marginBottom: spacing.md,
              }}>
                <Text style={{ fontSize: fontSize.md }}>⏱️</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: fontSize.sm, fontWeight: '700', color: colors.honey }}>
                    {programsCardData.fastingMode ?? '16:8'} fast in progress
                  </Text>
                  <Text style={{ fontSize: fontSize.xs, color: colors.ink3 }}>
                    {programsCardData.fastingElapsedHrs != null
                      ? `${programsCardData.fastingElapsedHrs.toFixed(1)}h elapsed · caloric log locked`
                      : 'Caloric log locked during fast'}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => router.push('/(tabs)/programs')} activeOpacity={0.7}>
                  <Text style={{ fontSize: fontSize.xs, color: colors.honey, fontWeight: '600' }}>End fast →</Text>
                </TouchableOpacity>
              </View>
            )}
```

- [ ] **Step 4: Commit**

```bash
git add DagnaraApp/app/(tabs)/diary.tsx
git commit -m "feat: lock caloric log during active fast with banner and disabled add buttons"
```

---

## Self-Review

**Spec coverage:**
- [x] Phase A: Onboarding captures fasting window (Task 2 step 5), pill timing (step 6), dietary prefs (step 7)
- [x] Phase B: Pill card on diary with mark-taken green animation and streak counter (Task 3)
- [x] Phase C: Recipe filter pre-selected to dietary preference (Task 5)
- [x] Phase C: Grocery list sectioned by Produce / Meat & Fish / Dairy / Pantry (Task 4)
- [x] Phase D: Fast lock — banner + disabled add buttons + alert on tap (Task 6)

**Already built (no work needed):** Fasting timer itself (FastingModal), push notifications for pill reminders (`schedulePillReminders` in notifications.ts), macro deficit ring on diary, "Start Fast" button in FastingModal.

**Type consistency:** `dietaryPreferences: string | null` matches `DIET_FILTERS` which is `readonly string[]`. The `includes` cast in Task 5 is safe. `DoseEntry` shape used in Task 3 matches exactly what programs.tsx defines at line ~197.

**Placeholder risk:** Task 4 Step 3 instructs the implementer to read the grocery modal JSX before replacing — this is intentional, not a placeholder gap.
