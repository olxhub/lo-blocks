// packages/shared/components/blocks/specialized/LiquidTemplate/liquidFilters.ts
//
// Custom Liquid filters for LiquidTemplate blocks.

import type { Liquid } from 'liquidjs';

/**
 * Register custom filters on a LiquidJS engine instance.
 *
 * Filters:
 *   - slugify:   lowercase, replace spaces/slashes/non-alphanumeric with underscores
 *   - padStart:  zero-pad (or custom-pad) a value to a given width
 *   - titleCase: capitalize the first letter of each word
 */
export function registerFilters(engine: Liquid): void {
  engine.registerFilter('slugify', (value: unknown) => {
    return String(value ?? '')
      .toLowerCase()
      .replace(/[\s/]+/g, '_')
      .replace(/[^a-z0-9_]/g, '');
  });

  engine.registerFilter('padStart', (value: unknown, width: number, fill?: string) => {
    return String(value ?? '').padStart(width ?? 2, fill ?? '0');
  });

  engine.registerFilter('titleCase', (value: unknown) => {
    return String(value ?? '').replace(
      /\b\w/g,
      char => char.toUpperCase()
    );
  });
}
