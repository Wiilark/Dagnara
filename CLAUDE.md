# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Dagnara is a nutrition tracking app. **Primary development is in `DagnaraApp/`.**

- **`DagnaraApp/`** — React Native/Expo 54 mobile app (TypeScript 5.9, RN 0.81.5, React 19.1, New Architecture enabled, portrait-only, dark mode only)
- **`server.js`** — Express backend that proxies Anthropic API calls and serves the legacy web app
- **`src/`** — Legacy vanilla JS web app (deprecated — do not edit)

## Commands

### Mobile App (`DagnaraApp/`)
```bash
npm start          # Start Expo dev server (port 8081)
npm run android    # Run on Android
npm run ios        # Run on iOS
npm run web        # Run as web
npm run lint       # ESLint (flat config, eslint-config-expo) — quality gate
eas build --profile development   # Dev build (points to localhost:3001)
eas build --profile preview       # Preview APK (points to Railway)
eas build --profile production    # Production AAB (points to Railway)
```

### Backend / Web (root)
```bash
npm run dev        # Run backend (port 3001) + Vite dev server (port 5173) concurrently
npm run build      # Build web app with Vite
npm start          # Start Express server (production, port 3000)
```

No test suite is configured. `npm run lint` (ESLint flat config) is the static-analysis gate — an `eslint_check.py` PostToolUse hook lints each edited file automatically and reports errors. Run the full `npm run lint` to see warnings (dead code, exhaustive-deps).

## Architecture

### Data Flow
The mobile app communicates with two backends:
1. **Supabase** — Auth, user profiles, diary, app state. Credentials read from `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_KEY` env vars (baked into build).
2. **Express server** (`server.js`) — Proxies AI calls only. Anthropic API key stays server-side. `/api/config` is used by the legacy web app only, not the mobile app.

### Mobile App Structure (`DagnaraApp/`)

**Routing** — Expo Router with file-based routing:
- `app/_layout.tsx` — Root layout; auth guard logic:
  - No email → `/(auth)/login`
  - Email + not onboarded → `/onboarding`
  - Email + onboarded → `/(tabs)/diary`
  - Onboarding flag stored in AsyncStorage as `dagnara_onboarded_${email}`
- `app/(auth)/` — Login and register screens
- `app/onboarding.tsx` — 5-step wizard (goals, body metrics, activity level)
- `app/(tabs)/` — Main tab screens: diary, progress, programs, profile, recipes, log

**Core Types** (`DagnaraApp/src/store/diaryStore.ts`):
- **`FoodItem`**: `id`, `icon`, `name`, `kcal`, `carbs`, `protein`, `fat`, `unit`, `meal` (`'breakfast'|'lunch'|'dinner'|'snack'`). Optional micros: `fiber`, `sugar`, `sodium`, `vitaminC`, `calcium`, `iron`, `potassium`.
- **`DiaryEntry`**: `date`, `foods[]`, `water`, `calories_burned`, `sleep?`, `mood?`, `steps?`, `veggies?`, `fruits?`.
- **`LocalFood`**: Per-100g data found in `src/lib/foodDatabase.ts` (`FOOD_DATABASE` and `RECIPE_DATABASE`).

**State Management** — Three Zustand stores in `DagnaraApp/src/store/` (Zustand v5 — `useShallow` imported from `zustand/react/shallow`):
- `authStore.ts` — Session, user profile (name, age, weight, height, goal). Persisted to AsyncStorage + `dagnara_profiles` table.
- `appStore.ts` — XP/leveling, streaks, weight history, calorie goals, programs. Exports: `calcTDEE(age, weightKg, heightCm, sex, activityLevel, weightGoal)`, `getXpLevel(xp)`, `XP_LEVELS`. Persisted to AsyncStorage + `dagnara_app_state`.
- `diaryStore.ts` — Daily food entries and activity. Persisted to AsyncStorage + `dagnara_diary`.

**Life Score Logic** (`app/(tabs)/progress.tsx`):
- **Scale**: 0–150.
- **Formula**: Weighted sum of 15 survey answers (0–6). Positive Qs: `(v/6 * unit * 1.2)`, Negative Qs: `((6-v)/6 * unit * 0.9)`, Neutral: `unit * 0.4`.
- **Pillars**: Nutrition (40), Sleep (30), Activity (30), Hydration (25), Mindset (25).

**Theme** — All design tokens live in `DagnaraApp/src/theme/index.ts`. Never hardcode values — always import from theme.
- **Backgrounds:** `colors.bg` `colors.bg2` `colors.layer1` `colors.layer2` `colors.layer3`
- **Text:** `colors.ink` `colors.ink2` `colors.ink3`
- **Brand:** `colors.purple` `colors.purple2` `colors.purple3` `colors.violet` `colors.lavender`
- **Functional:** `colors.green` `colors.honey` `colors.rose` `colors.sky` `colors.teal`
- **Borders:** `colors.line` `colors.line2` `colors.line3`
- **Spacing:** `spacing.xs/sm/md/lg/xl` (6/10/16/24/36) — **Radius:** `radius.sm/md/lg/xl` (10/16/22/30) — **FontSize:** `fontSize.xs/sm/base/md/lg/xl/2xl`

**Key packages available** (already installed — do not suggest alternatives):
`expo-linear-gradient` `expo-haptics` `expo-camera` `expo-image-picker` `expo-notifications` `expo-sensors` `react-native-svg` `react-native-safe-area-context`

**API utilities** (`DagnaraApp/src/lib/`):
- `api.ts` — `analyzeFood(base64, mediaType)` and `importRecipe(url)`. Both return raw Anthropic API response — callers must extract `data?.content?.[0]?.text` then `JSON.parse()` it.
- `supabase.ts` — Supabase client (fetches URL/key from backend `/api/config`)
- `restaurants.ts` — Static `RESTAURANT_ITEMS` fallback dataset (McDonald's, Starbucks, Subway, Chipotle etc.) + `RestaurantItem` type
- `notifications.ts` — Push notification helpers

### Backend (`server.js`)

Express server with three API routes:
- `GET /api/config` — Returns Supabase credentials (rate-limited: 30/min)
- `POST /api/analyze-food` — Accepts base64 image, returns nutrition list.
- `POST /api/estimate-nutrition` — Natural language text to nutrition.
- `POST /api/import-recipe` — URL to structured recipe.

**AI JSON Schemas**:
- **Food/Estimation**: `[{"icon":"emoji","name":"food name","kcal":number,"carbs":number,"protein":number,"fat":number,"unit":"serving description","weight_g":number,"per100":{"kcal":number,"carbs":number,"protein":number,"fat":number}}]`
- **Recipe Import**: `{"name":"recipe name","servings":number,"items":[FoodItem]}`
- **Note**: `kcal` must always equal `(carbs*4 + protein*4 + fat*9) * weight_g/100`.

Falls back to serving the legacy web app from `dist/` or `dagnara.html`.

### Database Schema
Three Supabase tables (all keyed by `email`, RLS via `auth.jwt() ->> 'email'`):
- `dagnara_profiles` — `email` (PK), `profile_data` (jsonb), `updated_at`
- `dagnara_app_state` — `email` (PK), `state_data` (jsonb), `updated_at`
- `dagnara_diary` — `email` + `date` (composite PK), `entry_data` (jsonb), `updated_at`

## Environment Variables

```
# Server (server.js)
SUPABASE_URL
SUPABASE_KEY
ANTHROPIC_API_KEY          # Server-side only, never sent to client
PORT                       # Default 3000
NODE_ENV

# Mobile app (DagnaraApp — must be EXPO_PUBLIC_ prefixed)
EXPO_PUBLIC_SUPABASE_URL   # Supabase project URL
EXPO_PUBLIC_SUPABASE_KEY   # Supabase anon key
EXPO_PUBLIC_API_URL        # Backend URL (e.g. https://9ysummpd.up.railway.app)
```

Copy `.env.example` to `.env` to get started.

## Development Conventions

- **No test suite** — don't generate test files
- **Styles** — always use theme tokens from `DagnaraApp/src/theme/index.ts`, never hardcode colors or spacing
- **State** — all persistent state goes through Zustand stores, never local component state for data that survives navigation
- **TypeScript** — strict, no `any`
- **Commits** — fix: / feat: / improve: prefixes, concise messages
- **No backwards-compat shims** — if something is unused, delete it

## Deployment

- Backend deployed to Railway: `https://9ysummpd.up.railway.app`
- Mobile app builds via EAS (`DagnaraApp/eas.json`): development uses local API, preview/production use the Railway URL
- Bundle ID: `com.dagnara.app`

## Plugin & Tool Usage Rules

### Mandatory: AI-Generated Code Must Be Audited
Any code written by Gemini, Copilot, or another external AI **must be audited before committing**:
1. `/production-audit` — correctness and readiness sweep
2. Use `context7` MCP to verify any new Expo/RN/Supabase API calls against live docs
3. TypeScript hook confirms no type errors automatically

### dx Plugin Skills (ykdojo marketplace)

| Skill | Purpose |
|---|---|
| `/dx:handoff` | Rich pre-compact context dump — run before long sessions end |
| `/dx:reddit-fetch` | Bypass blocked Reddit URLs via Gemini relay |
| `/dx:review-claudemd` | Audit CLAUDE.md for stale or conflicting rules |
| `/dx:clone` | Clone a repo and set up the dev environment |
| `/dx:half-clone` | Shallow clone (fast, no history) |
| `/dx:gha` | GitHub Actions workflow helper |

**Blocked URL workaround**: paste the page content directly into the chat, or use `/dx:reddit-fetch` for Reddit links.

### When to Use Which Tool

| Situation | Tool |
|---|---|
| Starting any non-trivial feature | `/brainstorming` first |
| Multi-step implementation | `/writing-plans` → `/executing-plans` |
| Touching Expo / RN / Supabase / Zustand APIs | `context7` MCP for live docs |
| After Gemini modifies code | `/production-audit` before committing |
| Screen feels flat or unpolished | `/make-interfaces-feel-better` |
| About to claim work is done | `/verification-before-completion` |
| Any bug or unexpected behavior | `/systematic-debugging` |
| Security change (auth, API keys, RLS) | `/security-review` |
| AI output feels over-engineered | `/karpathy-guidelines` then re-prompt |
| Test UI in a real browser | `playwright` MCP *(disabled — re-enable in settings before use)* |
| Query/inspect Supabase DB | `Supabase` MCP |
| Create PRs, read CI | `gh` CLI via Bash *(github MCP disabled to save tokens)* |
| Research competitors / nutrition APIs | `/dagnara-kit:search-first` (exa MCP disabled to save tokens) |
| Session about to compact | `/dx:handoff` for richer recovery context |
| Stale rules in CLAUDE.md | `/dx:review-claudemd` |

## Self-Evaluation Protocol

After completing any non-trivial task, I must explicitly state:

```
Confidence: X/10
Uncertain about: [specific things that could be wrong]
Verify: [what the user should manually check]
```

Only skip this for trivial changes (typo fixes, simple renames). If confidence < 8/10, I must explain *why* and propose how to validate before shipping.

Do not silently be wrong. Flag uncertainty instead of presenting guesses as facts.

## Pre-Task Methodology

Before writing or modifying any Dagnara code:

**New screen/component:**
1. Read 1-2 existing similar screens for established patterns
2. Confirm which store(s) supply the data needed
3. Verify all theme tokens available for the design

**Store modification:**
1. `grep` for all current consumers of the changed field
2. Check both AsyncStorage key and Supabase table column — both need to stay in sync
3. Confirm the Zustand v5 `useShallow` import pattern is used where needed

**Bug fix:**
1. Read the full function/component before touching anything
2. State the root cause explicitly before writing the fix
3. Check if the same bug exists in sibling code

**Any Supabase query:**
1. Confirm RLS policy allows it (`auth.jwt() ->> 'email'` keyed)
2. Handle both online and offline (AsyncStorage fallback) states

## UI/UX Design Reference

### Color Semantics
| Token | Use |
|---|---|
| `purple/purple2/purple3` | Brand CTAs, active states, progress fills |
| `violet/lavender` | Wordmarks, decorative text, secondary brand |
| `green` | Goals met, positive delta, nutrition success |
| `honey` | Warnings, near-limit, moderate states |
| `rose` | Errors, critical alerts, over-budget |
| `sky` | Hydration, water tracking |
| `teal` | Sleep, wellness, recovery |
| `ink/ink2/ink3` | Primary / secondary / hint text (never hardcode rgba whites) |
| `line/line2/line3` | Borders at 12%/22%/38% purple alpha (also use `line` as subtle fill) |
| `purpleTint` | Subtle background for selected/active cards (`rgba(124,77,255,0.08)`) |
| `purpleGlow` | Gradient endpoint for CTA buttons (`#9c27b0`) |

### Depth Layers
```
bg (page root) → bg2 → layer1 (cards) → layer2 (inputs/cells) → layer3 (modals/overlays)
```
Modal content always goes deeper than page content.

### Typography Hierarchy
| Usage | Token |
|---|---|
| Section labels (UPPERCASE) | `fontSize.xs`, `fontWeight:'700'`, `color:colors.ink3`, `letterSpacing:1.1` |
| Data numbers (large metric) | `fontSize.xl` or `fontSize['2xl']`, `fontWeight:'800'`, `color:colors.ink` |
| Body text | `fontSize.base`, `color:colors.ink` |
| Secondary / captions | `fontSize.sm`, `color:colors.ink2` |
| Hints / placeholders | `fontSize.xs`, `color:colors.ink3` |

### Standard Patterns (copy-paste templates)

**Card**
```tsx
{
  backgroundColor: colors.layer1,
  borderWidth: 1, borderColor: colors.line2,
  borderRadius: radius.lg,
  padding: spacing.lg,
  shadowColor: colors.purple, shadowOpacity: 0.18,
  shadowRadius: 24, shadowOffset: { width: 0, height: 8 }, elevation: 8,
}
```

**Primary CTA Button** (always gradient, never flat)
```tsx
<View style={{ borderRadius: radius.md, overflow: 'hidden' }}>
  <LinearGradient colors={[colors.purple, colors.purpleGlow]}
    start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={btnStyle}>
    <Text>Action</Text>
  </LinearGradient>
</View>
```

**Pill / Badge**
```tsx
{
  backgroundColor: colors.line,         // rgba purple 12%
  borderWidth: 1, borderColor: colors.line2,
  borderRadius: radius.pill,            // 999
  paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
}
```

**Input Field**
```tsx
{
  backgroundColor: colors.layer2,
  borderWidth: 1, borderColor: colors.line2,
  borderRadius: radius.md,
  paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
  color: colors.ink, fontSize: fontSize.base,
}
```

**Top Glow (atmospheric background)**
```tsx
<LinearGradient colors={['rgba(124,77,255,0.22)', 'transparent']}
  style={StyleSheet.absoluteFillObject}
  start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 0.55 }}
  pointerEvents="none" />
```

**Selected / Active Card**
```tsx
{ backgroundColor: colors.purpleTint, borderWidth: 1, borderColor: colors.line3, borderRadius: radius.md }
```

**List Row**
```tsx
{
  flexDirection: 'row', alignItems: 'center', gap: spacing.md,
  paddingVertical: spacing.md, paddingHorizontal: spacing.md,
  borderBottomWidth: 1, borderBottomColor: colors.line,
}
```

### Modal Style Rules
- Full-screen editors (food log, camera, exercise): `presentationStyle="fullScreen"`
- Quick pickers / sheets: `presentationStyle="pageSheet"` (default)
- Header pattern: `[close btn left] | [centered title] | [action btn right]`
- Always `<SafeAreaView>` as root inside modal

### Haptic Conventions
```tsx
Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)       // tap / select
Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success) // save / complete
Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)   // error / warning
```

### Hardcoded Values — Replace With Token
| Hardcoded | Replace with |
|---|---|
| `'#9c27b0'` | `colors.purpleGlow` |
| `'rgba(124,77,255,0.08)'` | `colors.purpleTint` |
| `'rgba(255,255,255,0.4)'` | `colors.ink2` |
| `'rgba(255,255,255,0.35)'` | `colors.ink3` |
| `borderRadius: 20` | `borderRadius: radius.pill` |
| `borderRadius: 999` | `borderRadius: radius.pill` |
