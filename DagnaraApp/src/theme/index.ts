// Dagnara design tokens — mirrors the web CSS variables
export const colors = {
  // Backgrounds
  bg:     '#0c0818',
  bg2:    '#100d20',
  layer1: '#161028',
  layer2: '#1e1835',
  layer3: '#261f42',

  // Borders
  line:  'rgba(124,77,255,0.12)',
  line2: 'rgba(124,77,255,0.22)',
  line3: 'rgba(124,77,255,0.38)',

  // Text
  ink:  '#f0ecff',
  ink2: 'rgba(228,218,255,0.96)',
  ink3: 'rgba(208,193,255,0.82)',

  // Brand
  purple:   '#7c4dff',
  purple2:  '#9c6fff',
  purple3:  '#c4a8ff',
  violet:   '#a855f7',
  lavender: '#c4b5fd',
  white:    '#ffffff',

  // Functional
  green:  '#22c55e',
  green2: '#16a34a',
  honey:  '#f59e0b',
  rose:   '#f43f5e',
  sky:    '#38bdf8',
  teal:   '#14b8a6',

  // Macro colors — single source of truth for carbs/protein/fat everywhere
  // (charts, indicators, donuts, legends). Never reassign these per-screen.
  macroCarbs:   '#38bdf8', // sky
  macroProtein: '#f43f5e', // rose
  macroFat:     '#a855f7', // violet

  // Micronutrient colors — one identity hue per micro, none clashing with macros.
  // Used for the value text in micro chips. Sugar/sodium still flip to `rose`
  // when over the daily limit (warning state overrides the identity color).
  microFiber:     '#22c55e', // green
  microSugar:     '#f59e0b', // honey
  microSodium:    '#14b8a6', // teal
  microVitaminC:  '#16a34a', // green2 (deeper green, distinct from fiber)
  microCalcium:   '#c4b5fd', // lavender
  microIron:      '#9c6fff', // purple2
  microPotassium: '#c4a8ff', // purple3

  // Meal accent colors — one hue per meal, used for the per-meal section accent
  // and add-food buttons. Single source so meals stay consistent across screens.
  mealBreakfast: '#f59e0b', // honey
  mealLunch:     '#a855f7', // violet
  mealDinner:    '#38bdf8', // sky
  mealSnack:     '#f43f5e', // rose

  // Life-Score pillar colors — one hue per pillar (Nutrition/Sleep/Activity/
  // Hydration/Mindset). Used for pillar bars and scores in progress.tsx.
  pillarNutrition: '#22c55e', // green
  pillarSleep:     '#a855f7', // violet
  pillarActivity:  '#f59e0b', // honey
  pillarHydration: '#38bdf8', // sky
  pillarMindset:   '#14b8a6', // teal

  // Wellness metric colors. Water = sky (matches CLAUDE.md). Sleep is violet
  // across its real UI (Life-Score pillar + the SleepLogger sheet); the old
  // "teal = sleep" note was stale — teal is the activity/exercise accent.
  metricWater: '#38bdf8', // sky
  metricSleep: '#a855f7', // violet

  // Purple tints (use these instead of inline rgba)
  purpleGlow: '#9c27b0',               // CTA gradient endpoint
  purpleTint: 'rgba(124,77,255,0.08)', // subtle fill for selected/active cards

  // Overlay / backdrop
  dim: 'rgba(0,0,0,0.6)',              // modal backdrop / scrim

  // Nutri-Score grades (A–E)
  nutriA: '#038141', // dark green
  nutriB: '#85BB2F', // green
  nutriC: '#FECB02', // yellow
  nutriD: '#EE8100', // orange
  nutriE: '#E63312', // red
};

export const radius = {
  sm:   10,
  md:   16,
  lg:   22,
  xl:   30,
  pill: 999, // fully-rounded pills / badges
};

export const spacing = {
  xs: 6,
  sm: 10,
  sm2: 14,
  md: 16,
  lg: 24,
  xl: 36,
};

export const fontSize = {
  xs:   11,
  sm:   13,
  base: 15,
  md:   17,
  lg:   22,
  xl:   28,
  '2xl': 38,
};
