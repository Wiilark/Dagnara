import sharp from 'sharp';

// ── Dagnara brand icon SVG ────────────────────────────────────────────────────
// Dark purple background + lavender crosshair/compass logo
// Matches the DagnaraLogo component used throughout the app

const makeSvg = (size) => {
  const cx = size / 2;
  const s = size / 28; // scale factor from 28×28 viewBox

  const R = 11 * s;           // main circle radius
  const dotR = 2.5 * s;       // center dot radius
  const csw = 1.4 * s;        // circle stroke width
  const tickSw = 2 * s;       // tick stroke width
  const gridSw = 0.8 * s;     // crosshair line width

  // tick endpoints (original: short lines at compass points)
  const tickOuter = 2 * s;    // distance from center to outer tick end
  const tickInner = 6.5 * s;  // distance from center to inner tick end
  const t = (v) => cx + (v - 14) * s; // translate from 28×28 coords

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <radialGradient id="bg" cx="50%" cy="50%" r="60%">
      <stop offset="0%" stop-color="#16102a"/>
      <stop offset="100%" stop-color="#0c0818"/>
    </radialGradient>
    <radialGradient id="glow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#7c4dff" stop-opacity="0.18"/>
      <stop offset="100%" stop-color="#7c4dff" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <!-- Background -->
  <rect width="${size}" height="${size}" fill="url(#bg)"/>

  <!-- Subtle grid -->
  ${Array.from({ length: Math.ceil(size / (s * 4)) + 1 }, (_, i) => {
    const pos = Math.round(i * s * 4);
    return `<line x1="${pos}" y1="0" x2="${pos}" y2="${size}" stroke="#7c4dff" stroke-width="${Math.max(0.5, s * 0.18)}" opacity="0.06"/>
  <line x1="0" y1="${pos}" x2="${size}" y2="${pos}" stroke="#7c4dff" stroke-width="${Math.max(0.5, s * 0.18)}" opacity="0.06"/>`;
  }).join('')}

  <!-- Purple glow behind logo -->
  <circle cx="${cx}" cy="${cx}" r="${R * 1.6}" fill="url(#glow)"/>

  <!-- Crosshair lines (faint) -->
  <line x1="${cx}" y1="0" x2="${cx}" y2="${size}" stroke="#c4b5fd" stroke-width="${gridSw}" opacity="0.2"/>
  <line x1="0" y1="${cx}" x2="${size}" y2="${cx}" stroke="#c4b5fd" stroke-width="${gridSw}" opacity="0.2"/>

  <!-- Main orbit circle -->
  <circle cx="${cx}" cy="${cx}" r="${R}" stroke="#c4b5fd" stroke-width="${csw}" fill="none" opacity="0.9"/>

  <!-- Inner ring (subtle) -->
  <circle cx="${cx}" cy="${cx}" r="${R * 0.55}" stroke="#c4b5fd" stroke-width="${csw * 0.5}" fill="none" opacity="0.22"/>

  <!-- Tick marks at compass points -->
  <!-- Top -->
  <line x1="${cx}" y1="${cx - R - tickSw}" x2="${cx}" y2="${cx - R - tickSw * 5}" stroke="#c4b5fd" stroke-width="${tickSw}" stroke-linecap="round"/>
  <!-- Bottom -->
  <line x1="${cx}" y1="${cx + R + tickSw}" x2="${cx}" y2="${cx + R + tickSw * 5}" stroke="#c4b5fd" stroke-width="${tickSw}" stroke-linecap="round"/>
  <!-- Left -->
  <line x1="${cx - R - tickSw}" y1="${cx}" x2="${cx - R - tickSw * 5}" y2="${cx}" stroke="#c4b5fd" stroke-width="${tickSw}" stroke-linecap="round"/>
  <!-- Right -->
  <line x1="${cx + R + tickSw}" y1="${cx}" x2="${cx + R + tickSw * 5}" y2="${cx}" stroke="#c4b5fd" stroke-width="${tickSw}" stroke-linecap="round"/>

  <!-- Center dot with glow -->
  <circle cx="${cx}" cy="${cx}" r="${dotR * 2.2}" fill="#7c4dff" opacity="0.35"/>
  <circle cx="${cx}" cy="${cx}" r="${dotR}" fill="#c4b5fd"/>
</svg>`;
};

// ── Generate all three assets ────────────────────────────────────────────────

async function generate() {
  console.log('Generating Dagnara icons...');

  // icon.png — 1024×1024
  await sharp(Buffer.from(makeSvg(1024)))
    .resize(1024, 1024)
    .png()
    .toFile('./assets/icon.png');
  console.log('✓ assets/icon.png (1024×1024)');

  // adaptive-icon.png — 1024×1024 (Android foreground, centered with padding)
  const adaptiveSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024">
    <rect width="1024" height="1024" fill="#0c0818"/>
    ${makeSvg(720).replace(/<svg[^>]*>/, '').replace('</svg>', '')}
  </svg>`;

  // For adaptive icon: logo centered in 1024, logo itself is 720px centered → offset 152px
  const logoBuffer = await sharp(Buffer.from(makeSvg(720))).resize(720, 720).png().toBuffer();
  await sharp({
    create: { width: 1024, height: 1024, channels: 4, background: { r: 12, g: 8, b: 24, alpha: 1 } }
  })
    .composite([{ input: logoBuffer, top: 152, left: 152 }])
    .png()
    .toFile('./assets/adaptive-icon.png');
  console.log('✓ assets/adaptive-icon.png (1024×1024)');

  // splash-icon.png — 512×512 (centered on dark bg shown full-screen)
  await sharp(Buffer.from(makeSvg(512)))
    .resize(512, 512)
    .png()
    .toFile('./assets/splash-icon.png');
  console.log('✓ assets/splash-icon.png (512×512)');

  console.log('\nDone! Restart Expo to see the new icons.');
}

generate().catch(console.error);
