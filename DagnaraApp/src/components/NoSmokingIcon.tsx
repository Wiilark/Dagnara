/**
 * NoSmokingIcon — a cigarette inside a circle-slash "no" ring.
 *
 * Drawn as SVG (not the Ionicons `logo-no-smoking` glyph) so the ban ring and
 * diagonal slash match NoBeerIcon exactly — the two Programs tiles share an
 * identical crossed line.
 */
import React from 'react';
import Svg, { Rect, Circle, Line } from 'react-native-svg';
import { colors } from '../theme';

type Props = {
  size?: number;
  color?: string;
};

export function NoSmokingIcon({ size = 37, color = colors.ink }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      {/* Cigarette: a slim horizontal stick with a filled tip on the right. */}
      <Rect x="11" y="21" width="20" height="6" rx="1.5" stroke={color} strokeWidth={2} fill="none" />
      <Rect x="28" y="21" width="6" height="6" rx="1.5" fill={color} />
      {/* Ban ring + slash over the whole glyph — identical to NoBeerIcon. */}
      <Circle cx="24" cy="24" r="20" stroke={color} strokeWidth={3} fill="none" />
      <Line x1="10" y1="10" x2="38" y2="38" stroke={color} strokeWidth={3} strokeLinecap="round" />
    </Svg>
  );
}
