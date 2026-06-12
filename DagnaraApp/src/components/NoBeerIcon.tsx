/**
 * NoBeerIcon — a slim beer bottle inside a circle-slash "no" ring.
 *
 * Mirrors the Ionicons `logo-no-smoking` style (object inside a ban circle) but
 * for alcohol, since Ionicons has no bottle or no-drinking glyph. Drawn as SVG
 * so the bottle stays a slender bottle (not a mug) at any size.
 */
import React from 'react';
import Svg, { Path, Circle, Line } from 'react-native-svg';
import { colors } from '../theme';

type Props = {
  size?: number;
  color?: string;
};

export function NoBeerIcon({ size = 37, color = colors.ink }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      {/* Very slim bottle: thin neck, gentle shoulder, narrow body, rounded base. */}
      <Path
        d="M22.2 6 h3.6 v4.4 c0 1.4 0.7 1.8 1.2 2.7 0.6 1.1 1 2.2 1 3.9 V37 c0 1.5-1.1 2.6-2.6 2.6 h-4.8 c-1.5 0-2.6-1.1-2.6-2.6 V17 c0-1.7 0.4-2.8 1-3.9 0.5-0.9 1.2-1.3 1.2-2.7 Z"
        fill={color}
      />
      {/* Ban ring + slash over the whole glyph. */}
      <Circle cx="24" cy="24" r="20" stroke={color} strokeWidth={3} fill="none" />
      <Line x1="10" y1="10" x2="38" y2="38" stroke={color} strokeWidth={3} strokeLinecap="round" />
    </Svg>
  );
}
