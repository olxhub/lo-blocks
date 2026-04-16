// lib/attribution.ts
//
// Attribution helpers for licensed content (images, activities, etc.).
//
// Currently provides data-attribute metadata for embedding in HTML elements.
// Future direction: a visible <LicenseDetails> component showing CC-style
// license boxes with full terms, credits list, and source links.
// See https://creativecommons.org/licenses/by-sa/4.0/ for the kind of
// summary we'd want to render.
//
// This is shared infrastructure — any block or page-level component that
// needs attribution should use these helpers rather than rolling its own.

import type { LicensedAttrs } from '@/lib/blocks/attributeSchemas';

/**
 * Build data-* attributes for attribution metadata.
 * Spread into an HTML element: <img {...licenseDataAttrs(props)} />
 * Returns an empty object if no attribution fields are set.
 */
export function licenseDataAttrs(attrs: LicensedAttrs): Record<string, string> {
  const result: Record<string, string> = {};
  if (attrs.authors?.length) result['data-authors'] = attrs.authors.join(', ');
  if (attrs.license) result['data-license'] = attrs.license;
  if (attrs.hyperlink?.length) result['data-hyperlink'] = attrs.hyperlink.join(', ');
  return result;
}
