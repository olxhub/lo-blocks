// Pure policy for containers that display one child at a time.

import type { ContentNamespace, DefinitionKey } from '@/lib/types';
import { parseAnyDefinitionRef, qualifyDefinitionRef } from '@/lib/types/id-grammar';

export interface KidCursorResolution {
  index: number;
  id: DefinitionKey | null;
  healed: boolean;
}

/** Canonicalize one authored/stored child ref without adding runtime scope. */
export function canonicalKidId(id: string, ns: ContentNamespace): DefinitionKey {
  return qualifyDefinitionRef(parseAnyDefinitionRef(id), ns);
}

/**
 * Read and validate navigable child identities.
 *
 * A cursor identifies definitions, not rendered StateKeys: the cursor field is
 * already scoped with its container, while a StateKey would bake one rendered
 * instance's scope into persisted state. Repeated refs are rejected because a
 * definition identity cannot distinguish them; a future slot-key API can add
 * that capability deliberately.
 */
export function kidCursorIds(
  kids: readonly unknown[],
  ns: ContentNamespace,
  owner: unknown,
): DefinitionKey[] {
  const ids = kids.map((kid, index) => {
    const id = typeof kid === 'object' && kid !== null && 'id' in kid
      ? (kid as { id?: unknown }).id
      : undefined;
    if (typeof id !== 'string' || id === '') {
      throw new Error(
        `Kid cursor "${String(owner)}" child ${index + 1} has no id. ` +
        'Every navigable child must be a block with an id.',
      );
    }
    return canonicalKidId(id, ns);
  });

  const duplicate = ids.find((id, index) => ids.indexOf(id) !== index);
  if (duplicate) {
    throw new Error(
      `Kid cursor "${String(owner)}" contains child "${duplicate}" more than once. ` +
      'Repeated child refs need distinct slot identities, which this cursor does not guess.',
    );
  }
  return ids;
}

/** Canonicalize a persisted child identity. */
export function canonicalKidCursorValue(
  value: unknown,
  ns: ContentNamespace,
): DefinitionKey | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return canonicalKidId(value, ns);
  throw new Error(`Kid cursor value must be a child id, got ${typeof value}`);
}

/**
 * Resolve canonical persisted state against the currently visible child ids.
 * Missing identities fall back near the last rendered position. The caller
 * persists the returned id when `healed` is true.
 */
export function resolveKidCursor(
  stored: DefinitionKey | null,
  ids: readonly DefinitionKey[],
  hintIndex = 0,
): KidCursorResolution {
  if (ids.length === 0) return { index: -1, id: null, healed: false };

  const clamp = (index: number) => Math.min(Math.max(index, 0), ids.length - 1);
  const at = (index: number): KidCursorResolution => {
    const id = ids[index];
    return { index, id, healed: id !== stored };
  };

  if (stored) {
    const exact = ids.indexOf(stored);
    if (exact >= 0) return at(exact);
  }
  return at(clamp(hintIndex));
}
