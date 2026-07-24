// Shared test utilities for the lo-blocks test suite.
//
// Import in test files:
//   import { getOlxJson, TEST_NS, mockRuntime } from '@/lib/test-utils';

import { variantMapKeys } from './types/i18n';
import type { IdMap, OlxJson, DefinitionKey, LoBlockRuntimeContext } from './types';
import { asContentNamespace, qualifyDefinitionRef, parseDefinitionRef } from './types/id-grammar';
import { DEFAULT_RUNTIME } from './player/client/baselineRuntime';

/** The namespace tests qualify against. Historic value "CONTENT" — kept so
 *  existing fixtures and assertions don't churn. Purely a test convention;
 *  production namespaces come from storage providers. */
export const TEST_NS = asContentNamespace('CONTENT');

/**
 * Build a namespace-qualified DefinitionKey from a bare leaf ID.
 *
 *   testKey('answer')  →  "CONTENT/answer"  (as DefinitionKey)
 *
 * Uses the canonical id-grammar functions so tests never hand-assemble
 * delimiter strings.
 */
export const testKey = (leafId: string): DefinitionKey =>
  qualifyDefinitionRef(parseDefinitionRef(leafId), TEST_NS);

/**
 * Extract the first available variant from idMap for a given block ID.
 * Accepts bare ("answer") or qualified ("CONTENT/answer") — qualified
 * refs pass through, bare refs get the placeholder namespace.
 */
export const getOlxJson = (idMap: IdMap, id: string): OlxJson | undefined => {
  const key = qualifyDefinitionRef(parseDefinitionRef(id), TEST_NS);
  const variantMap = idMap[key];
  if (!variantMap) return undefined;
  const variants = variantMapKeys(variantMap);
  return variants.length > 0 ? variantMap[variants[0]] : undefined;
};

/**
 * Build a LoBlockRuntimeContext for tests.
 *
 * Spreads DEFAULT_RUNTIME (the single source of truth for shape defaults)
 * with sideEffectFree: true, then applies any overrides.
 *
 *   mockRuntime()                          // sensible defaults
 *   mockRuntime({ ns: myTestNamespace })   // override namespace
 */
export function mockRuntime(overrides?: Partial<LoBlockRuntimeContext>): LoBlockRuntimeContext {
  return { ...DEFAULT_RUNTIME, sideEffectFree: true, ns: TEST_NS, ...overrides };
}
