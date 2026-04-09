// lib/avatar/render.ts
//
// Pure avatar rendering helpers — DiceBear data URI generation,
// option categories derived from Zod schemas, and color presets.
//
// No React, no state hooks — just data and functions.
// React components that USE these live in components/common/.

import { createAvatar } from '@dicebear/core';
import * as openPeepsStyle from '@dicebear/open-peeps';
import { Face, Head, Accessories, FacialHair, Mask, type OpenPeeps } from '@/lib/avatar/types';

// =============================================================================
// Option categories — derived from the Zod enum schemas in types.ts
// =============================================================================

export const CATEGORIES = {
  face:        { label: 'Face',        options: Face.options },
  head:        { label: 'Head',        options: Head.options },
  accessories: { label: 'Accessories', options: Accessories.options },
  facialHair:  { label: 'Facial Hair', options: FacialHair.options },
  mask:        { label: 'Mask',        options: Mask.options },
} as const;

export type CategoryKey = keyof typeof CATEGORIES;

export const TABS = [
  ...Object.entries(CATEGORIES).map(([key, { label }]) => ({ key, label })),
  { key: 'colors', label: 'Colors' },
];

// =============================================================================
// Color presets — curated palettes for skin, clothing, and hair
// =============================================================================

/** Skin tone presets — broad range across ethnicities. */
export const SKIN_COLORS = [
  'ffe0bd', 'ffd5b2', 'f8d5c2', 'e8b697', 'deb08a',  // light
  'd4a574', 'c99a6b', 'b8865a', 'ae7242', 'a0602e',   // medium
  '8d5524', '7a4b2e', '6a3d1f', '523020', '3b1f13',   // dark
];

/** Clothing color palette. */
export const CLOTHING_COLORS = [
  '264653', '2a9d8f', '457b9d', '1d3557', '023047',   // cool
  'e9c46a', 'f4a261', 'e76f51', 'ff006e', 'e63946',   // warm
  '606c38', '8338ec', 'bc6c25', 'ffb703', '6c757d',   // accent
];

/** Hair/hat color presets (from DiceBear defaults + extras). */
export const HAIR_COLORS = [
  '2c1b18', '4a312c', '724133', 'a55728', 'b58143',   // browns
  'd6b370', 'ecdcbf', 'e8e1e1', 'f59797', 'c93305',   // blond/red/gray
  '1a1a1a', '4b4b4b', '808080',                        // black/gray
];

// =============================================================================
// DiceBear rendering
// =============================================================================

/**
 * Coerce single-value option fields to arrays (DiceBear wants arrays)
 * and set probability flags so optional features actually appear.
 */
export function toDiceBear(opts: OpenPeeps): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(opts)) {
    if (!value) continue;
    result[key] = Array.isArray(value) ? value : [value];
  }
  if (result.accessories) result.accessoriesProbability = 100;
  if (result.facialHair) result.facialHairProbability = 100;
  if (result.mask) result.maskProbability = 100;
  return result;
}

/**
 * Generate a data URI for an Open Peeps avatar.
 *
 * Used for preview images and thumbnail grids in avatar pickers.
 * For inline rendering in content, use the Avatar component instead.
 *
 * Picker UI values come from CATEGORIES.*.options (valid enum members),
 * so the cast to OpenPeeps is safe here even though TS only sees strings.
 */
export function renderAvatar(seed: string, opts: Record<string, string>, size: number): string {
  return createAvatar(openPeepsStyle, {
    seed,
    size,
    ...toDiceBear(opts as OpenPeeps),
  }).toDataUri();
}
