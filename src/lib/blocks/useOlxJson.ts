// src/lib/blocks/useOlxJson.ts
//
// Hook for accessing OlxJson from Redux with automatic fetch-on-demand.
//
// All content lives in Redux. Hooks read from Redux, triggering fetch
// for missing blocks if needed.
//
'use client';

import { useSelector } from 'react-redux';
import { useEffect, useRef } from 'react';
import {
  selectBlockState,
  dispatchOlxJsonLoading,
  dispatchOlxJson,
  dispatchOlxJsonError
} from '@/lib/state/olxjson';
import { refToOlxKey } from '@/lib/blocks/idResolver';
import type { OlxJson, OlxKey, OlxReference } from '@/lib/types';
import type { LogEventFn } from '@/lib/render';

export interface OlxJsonResult {
  olxJson: OlxJson | null;
  loading: boolean;
  error: string | null;
}

// Props type for useOlxJson - requires logEvent and sideEffectFree
interface UseOlxJsonProps {
  runtime: { logEvent: LogEventFn; sideEffectFree: boolean };
}

/**
 * Hook to access OlxJson by ID from Redux.
 *
 * - Reads from Redux state
 * - If not found and not sideEffectFree, triggers a fetch
 * - Returns { olxJson, loading, error }
 *
 * @param props - Component props (must include logEvent, sideEffectFree)
 * @param id - The OLX ID to look up
 * @param source - Content source (default: 'content')
 */
export function useOlxJson(
  props: UseOlxJsonProps,
  id: OlxReference | string | null,
  source: string = 'content'
): OlxJsonResult {
  // Compute olxKey outside hooks - use empty string for null id (won't match anything)
  const olxKey = id ? refToOlxKey(id) : '';

  // Read from Redux - always call hook (Rules of Hooks)
  const blockState = useSelector((state: any) =>
    id ? selectBlockState(state, [source], olxKey) : undefined
  );

  // Track fetch attempts to prevent infinite loops - always call hook
  const fetchAttempted = useRef<Set<string>>(new Set());

  // Trigger fetch for missing blocks (skip if sideEffectFree) - always call hook
  useEffect(() => {
    // Skip if no id
    if (!id) return;

    // Skip side effects during replay/analytics
    if (props.runtime.sideEffectFree) return;

    // Already in Redux or already attempted
    if (blockState || fetchAttempted.current.has(olxKey)) return;
    fetchAttempted.current.add(olxKey);

    // Mark as loading
    dispatchOlxJsonLoading(props, source, olxKey);

    fetch(`/api/content/${olxKey}`)
      .then(res => res.json())
      .then(data => {
        if (!data.ok) {
          dispatchOlxJsonError(props, source, olxKey, data.error || `Failed to load ${olxKey}`);
        } else {
          dispatchOlxJson(props, source, data.idMap);
        }
      })
      .catch(err => {
        dispatchOlxJsonError(props, source, olxKey, err.message || `Failed to load ${olxKey}`);
      });
  }, [id, blockState, olxKey, source, props.runtime.sideEffectFree, props.runtime.logEvent]);

  // Handle null/undefined id - return after hooks are called
  if (!id) {
    return { olxJson: null, loading: false, error: null };
  }

  // Return based on Redux state
  if (!blockState) {
    return { olxJson: null, loading: true, error: null };
  }

  const isLoading = blockState.loadingState?.status === 'loading';
  const hasError = blockState.loadingState?.status === 'error';

  if (isLoading) {
    return { olxJson: null, loading: true, error: null };
  }

  if (hasError) {
    return {
      olxJson: null,
      loading: false,
      error: blockState.error?.message || `Error loading "${olxKey}"`
    };
  }

  // Extract the language variant from nested structure
  const stored = blockState.olxJson as any;
  if (!stored) {
    return { olxJson: null, loading: false, error: null };
  }

  const locale = (props as any).runtime?.locale?.code;
  if (!locale) {
    throw new Error('useOlxJson: runtime.locale.code is required for language-aware rendering');
  }

  // Nested structure: { 'en-Latn-US': OlxJson, 'ar-Arab-SA': OlxJson, ... }
  const langVariant = stored[locale];
  if (!langVariant || typeof langVariant !== 'object' || !(langVariant as any).tag) {
    throw new Error(
      `useOlxJson: Block "${olxKey}" does not have a variant for locale "${locale}". ` +
      `Available: ${Object.keys(stored).join(', ')}`
    );
  }

  return { olxJson: langVariant, loading: false, error: null };
}

/**
 * Hook to access multiple OlxJson blocks by IDs.
 *
 * @param props - Component props (must include logEvent, sideEffectFree)
 * @param ids - Array of OLX IDs to look up
 * @param source - Content source (default: 'content')
 */
export function useOlxJsonMultiple(
  props: UseOlxJsonProps,
  ids: (OlxReference | string)[],
  source: string = 'content'
): {
  olxJsons: (OlxJson | null)[];
  anyLoading: boolean;
  firstError: string | null;
  allReady: boolean;
} {
  // Call useOlxJson for each ID
  // Note: Array length must be stable across renders (React rules of hooks)
  const results = ids.map(id => useOlxJson(props, id, source));

  const olxJsons = results.map(r => r.olxJson);
  const anyLoading = results.some(r => r.loading);
  const firstError = results.find(r => r.error)?.error || null;
  const allReady = results.every(r => !r.loading && !r.error && r.olxJson !== null);

  return { olxJsons, anyLoading, firstError, allReady };
}
