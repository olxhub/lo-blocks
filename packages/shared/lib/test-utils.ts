// Shared test utilities for the lo-blocks test suite.
//
// Import in test files:
//   import { getOlxJson, TEST_NS } from '@/lib/test-utils';

import { variantMapKeys } from './types/i18n';
import type { IdMap, OlxJson, DefinitionKey } from './types';
import { PLACEHOLDER_NS, qualifyDefinitionRef, parseDefinitionRef } from './types/id-grammar';

// Re-export the placeholder namespace for use in test assertions.
export { PLACEHOLDER_NS as TEST_NS } from './types/id-grammar';

/**
 * Build a namespace-qualified DefinitionKey from a bare leaf ID.
 *
 *   testKey('answer')  →  "CONTENT/answer"  (as DefinitionKey)
 *
 * Uses the canonical id-grammar functions so tests never hand-assemble
 * delimiter strings.
 */
export const testKey = (leafId: string): DefinitionKey =>
  qualifyDefinitionRef(parseDefinitionRef(leafId), PLACEHOLDER_NS);

/**
 * Extract the first available variant from idMap for a given block ID.
 * Accepts bare ("answer") or qualified ("CONTENT/answer") — qualified
 * refs pass through, bare refs get the placeholder namespace.
 */
export const getOlxJson = (idMap: IdMap, id: string): OlxJson | undefined => {
  const key = qualifyDefinitionRef(parseDefinitionRef(id), PLACEHOLDER_NS);
  const variantMap = idMap[key];
  if (!variantMap) return undefined;
  const variants = variantMapKeys(variantMap);
  return variants.length > 0 ? variantMap[variants[0]] : undefined;
};
