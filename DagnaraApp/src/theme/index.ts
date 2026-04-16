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
