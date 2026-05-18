// Shared test utilities for the lo-blocks test suite.
//
// Import in test files:
//   import { getOlxJson } from '@/lib/test-utils';

import { variantMapKeys } from './types/i18n';
import type { IdMap, OlxJson, DefinitionKey } from './types';

/**
 * Extract the first available variant from idMap for a given block ID.
 * Accepts string for convenience in tests (cast to DefinitionKey internally).
 */
export const getOlxJson = (idMap: IdMap, id: string): OlxJson | undefined => {
  const variantMap = idMap[id as DefinitionKey];
  if (!variantMap) return undefined;
  const variants = variantMapKeys(variantMap);
  return variants.length > 0 ? variantMap[variants[0]] : undefined;
};
