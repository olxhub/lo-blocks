// Shared test utilities for the lo-blocks test suite.
//
// Import in test files:
//   import { getOlxJson } from '@/lib/test-utils';

import type { IdMap, OlxJson, OlxKey, ContentVariant } from './types';

/**
 * Extract the first available variant from idMap for a given block ID.
 * Accepts string for convenience in tests (cast to OlxKey internally).
 */
export const getOlxJson = (idMap: IdMap, id: string): OlxJson | undefined => {
  const variantMap = idMap[id as OlxKey];
  if (!variantMap) return undefined;
  const variants = Object.keys(variantMap) as ContentVariant[];
  return variants.length > 0 ? variantMap[variants[0]] : undefined;
};
