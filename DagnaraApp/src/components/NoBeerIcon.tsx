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
      {/* Slim bottle: narrow neck, slight shoulder, tall body, rounded base. */}
      <Path
        d="M21 7 h6 v4 c0 1.6 1 2 1.6 3 0.8 1.3 1.4 2.6 1.4 4.6 V37 c0 1.7-1.3 3-3 3 h-7 c-1.7 0-3-1.3-3-3 V18.6 c0-2 0.6-3.3 1.4-4.6 0.6-1 1.6-1.4 1.6-3 Z"
        fill={color}
      />
      {/* Ban ring + slash over the whole glyph. */}
      <Circle cx="24" cy="24" r="20" stroke={color} strokeWidth={3} fill="none" />
      <Line x1="10" y1="10" x2="38" y2="38" stroke={color} strokeWidth={3} strokeLinecap="round" />
    </Svg>
  );
}
