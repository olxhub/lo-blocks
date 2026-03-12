// Golden ratio color wheel — deterministic, visually-spaced hue assignment.
//
// Used by SentenceVarietyPlot, WordUsage, and any component needing
// a sequence of perceptually distinct colors.

const PHI = 1.618033988749895;

/**
 * Compute a hue (0-360) for a given group index using golden ratio spacing.
 *
 * @param index - Group index (0-based)
 * @param factor - Scaling factor for the step size.
 *   Default (1/φ): ~222.5° steps, maximally spaced.
 *   0.5: 180° steps, alternates between two colors.
 *   Smaller values: subtler rotation between adjacent groups.
 */
export function groupHue(index: number, factor: number = 1 / PHI): number {
  return (index * factor * 360) % 360;
}

/**
 * Generate an HSL color string.
 */
export function hslColor(
  hue: number,
  saturation: number = 0.5,
  lightness: number = 0.85,
): string {
  return `hsl(${hue}, ${Math.round(saturation * 100)}%, ${Math.round(lightness * 100)}%)`;
}
