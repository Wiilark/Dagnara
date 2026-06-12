/**
 * NoBeerIcon — a slim beer bottle inside a circle-slash "no" ring.
 *
 * Mirrors NoSmokingIcon: same ban ring + diagonal slash, and an outlined
 * (not solid) bottle of similar visual weight to the cigarette so the two
 * Programs tiles read as a matched pair.
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
      {/* Slim outlined bottle: short neck, gentle shoulder, narrow body. */}
      <Path
        d="M22.6 12 v3.2 c0 1-0.5 1.4-0.9 2.1 -0.4 0.8-0.7 1.6-0.7 2.9 V32 c0 1.1 0.8 1.9 1.9 1.9 h2.2 c1.1 0 1.9-0.8 1.9-1.9 V20.2 c0-1.3-0.3-2.1-0.7-2.9 -0.4-0.7-0.9-1.1-0.9-2.1 V12 Z"
        stroke={color}
        strokeWidth={2}
        strokeLinejoin="round"
        fill="none"
      />
      {/* Ban ring + slash over the whole glyph — identical to NoSmokingIcon. */}
      <Circle cx="24" cy="24" r="20" stroke={color} strokeWidth={3} fill="none" />
      <Line x1="10" y1="10" x2="38" y2="38" stroke={color} strokeWidth={3} strokeLinecap="round" />
    </Svg>
  );
}
