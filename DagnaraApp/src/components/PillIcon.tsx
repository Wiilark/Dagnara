/**
 * PillIcon — a classic two-tone capsule pill, drawn diagonally.
 *
 * Ionicons has no pill/capsule glyph (only medkit and tablet-device icons), so
 * this renders the recognisable split-capsule shape as SVG. The top-left half is
 * filled solid and the bottom-right half is outlined, giving the two-tone look
 * without needing a second colour.
 */
import React from 'react';
import Svg, { G, Rect, Line } from 'react-native-svg';
import { colors } from '../theme';

type Props = {
  size?: number;
  color?: string;
};

export function PillIcon({ size = 37, color = colors.ink }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      {/* Capsule rotated 45°: a rounded "stadium" rect spanning corner to corner. */}
      <G rotation={-45} origin="24, 24">
        {/* Outline of the whole capsule. */}
        <Rect x={6} y={17} width={36} height={14} rx={7} stroke={color} strokeWidth={3} fill="none" />
        {/* Solid top half (left of the seam). */}
        <Rect x={6} y={17} width={18} height={14} rx={7} fill={color} />
        {/* Square off the seam edge so the filled half meets flush at the divider. */}
        <Rect x={17} y={17} width={7} height={14} fill={color} />
        {/* Centre seam line. */}
        <Line x1={24} y1={17} x2={24} y2={31} stroke={color} strokeWidth={3} />
      </G>
    </Svg>
  );
}
