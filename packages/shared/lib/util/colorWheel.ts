// Golden ratio color wheel — deterministic, visually-spaced hue assignment.
//
// Used by WritingRhythmPlot, WordUsage, and any component needing
// a sequence of perceptually distinct colors.

const PHI = 1.618033988749895;

/** Stable unsigned index for assigning colors to opaque string IDs. */
export function stringColorIndex(value: string): number {
  let index = 0;
  for (const char of value) {
    index = (Math.imul(index, 31) + char.codePointAt(0)!) >>> 0;
  }
  return index;
}

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

/**
 * Generate a single theme-adaptive background tint via CSS color-mix().
 *
 * Returns a CSS string that blends a vivid hue into --lo-bg at the given
 * percentage. Light bg → light tint, dark bg → dark tint, warm bg → warm tint.
 *
 * Uses sRGB mixing (not OKLCH) to preserve hue identity — see themeColors().
 */
export function themeColorMix(hue: number, amount: number = 20): string {
  const base = `hsl(${hue} 80% 60%)`;
  return `color-mix(in srgb, ${base} ${amount}%, var(--lo-bg))`;
}

/**
 * Generate a full set of theme-adaptive CSS color values for a given hue.
 *
 * Uses color-mix(in srgb) to blend the hue into semantic tokens
 * (--lo-bg, --lo-bg-surface, --lo-border). Automatically adapts:
 * light bg → light tint, dark bg → dark tint, warm bg → warm tint.
 *
 * sRGB mixing is used because OKLCH perceptual blending rotates hues
 * when mixing small amounts into tinted backgrounds, making different
 * colors look the same.
 *
 * Returns CSS strings — must be used where custom properties resolve
 * (inline styles, CSS rules).
 */
export function themeColors(hue: number) {
  const base = `hsl(${hue} 80% 60%)`;
  return {
    /** Background tint — 25% hue into page background */
    tint:       `color-mix(in srgb, ${base} 25%, var(--lo-bg))`,
    /** Stronger background tint — 40% for active/selected states */
    tintStrong: `color-mix(in srgb, ${base} 40%, var(--lo-bg))`,
    /** Solid accent color — for borders, icons, text accents */
    accent:     hslColor(hue, 0.55, 0.50),
    /** Surface-level tint — 12% hue into elevated surface */
    surface:    `color-mix(in srgb, ${base} 12%, var(--lo-bg-surface))`,
    /** Border tint — 30% hue into border color */
    border:     `color-mix(in srgb, ${base} 30%, var(--lo-border))`,
    /** Translucent shadow */
    shadow:     `hsl(${hue} 15% 50% / 0.15)`,
  };
}
