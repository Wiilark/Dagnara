/**
 * BackChevron — thick rounded stroke-based back chevron.
 *
 * Used as the universal "go back" affordance in every detail-view header.
 * Renders a custom SVG instead of Ionicons so the stroke weight and rounded
 * line caps stay consistent across screens regardless of font rendering.
 */
import React from 'react';
import Svg, { Path } from 'react-native-svg';
import { colors } from '../theme';

type Props = {
  size?: number;
  color?: string;
};

export function BackChevron({ size = 24, color = colors.ink }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M15 5 L8 12 L15 19"
        stroke={color}
        strokeWidth={2.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}
