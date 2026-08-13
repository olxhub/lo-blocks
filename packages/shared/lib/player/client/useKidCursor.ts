'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useFieldState } from '@/lib/state';
import {
  canonicalKidCursorValue,
  kidCursorIds,
  resolveKidCursor,
} from '@/lib/player/kidCursor';
import type { DefinitionKey, DefinitionRef, FieldInfo, RuntimeProps } from '@/lib/types';

export interface KidCursor<Kid> {
  kid: Kid | null;
  id: DefinitionKey | null;
  index: number;
  count: number;
  ids: DefinitionKey[];
  next: (amount?: number) => void;
  previous: (amount?: number) => void;
  goto: (target: DefinitionRef) => void;
}

/** Shared active-child state for one-at-a-time containers. */
export function useKidCursor<Kid>(
  props: RuntimeProps,
  kids: readonly Kid[],
  field: FieldInfo,
): KidCursor<Kid> {
  const [rawStored, setStored] = useFieldState(props, field, null);
  const ids = useMemo(
    () => kidCursorIds(kids, props.runtime.ns, props.id),
    [kids, props.id, props.runtime.ns],
  );
  const stored = canonicalKidCursorValue(rawStored, props.runtime.ns);

  const lastIndex = useRef(0);
  const resolution = resolveKidCursor(stored, ids, lastIndex.current);
  useEffect(() => {
    if (resolution.index >= 0) lastIndex.current = resolution.index;
  }, [resolution.index]);

  // Heal a missing identity after render. Unset state already means the first
  // child, so opening untouched content emits no event.
  const shouldHeal = resolution.healed && stored !== null;
  useEffect(() => {
    if (shouldHeal && resolution.id) setStored(resolution.id);
  }, [resolution.id, setStored, shouldHeal]);

  const gotoIndex = useCallback((requested: number) => {
    if (ids.length === 0) return;
    const index = Math.min(Math.max(requested, 0), ids.length - 1);
    setStored(ids[index]);
  }, [ids, setStored]);

  const goto = useCallback((target: DefinitionRef) => {
    const id = canonicalKidCursorValue(target, props.runtime.ns);
    const index = id ? ids.indexOf(id) : -1;
    if (index < 0) {
      throw new Error(`Kid cursor "${props.id}" has no child "${target}".`);
    }
    gotoIndex(index);
  }, [gotoIndex, ids, props.id, props.runtime.ns]);

  const next = useCallback(
    (amount = 1) => gotoIndex(resolution.index + amount),
    [gotoIndex, resolution.index],
  );
  const previous = useCallback(
    (amount = 1) => gotoIndex(resolution.index - amount),
    [gotoIndex, resolution.index],
  );

  return {
    kid: resolution.index < 0 ? null : kids[resolution.index],
    id: resolution.id,
    index: resolution.index,
    count: ids.length,
    ids,
    next,
    previous,
    goto,
  };
}
