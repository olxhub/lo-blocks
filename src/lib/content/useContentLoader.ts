// src/lib/content/useContentLoader.ts
import { useState, useEffect } from 'react';
import { IdMap, ComponentError } from '@/lib/types';
import { dispatchOlxJson } from '@/lib/state/olxjson';
import { useDebugSettings } from '@/lib/state/debugSettings';
import { useLocaleAttributes } from '@/lib/i18n/useLocaleAttributes';
import { useBaselineProps } from '@/components/common/RenderOLX';

/**
 * Hook to load content from the API by ID
 *
 * Fetches content from the server and dispatches it to Redux for reactive access.
 * Skips fetch and dispatch during replay mode (sideEffectFree).
 *
 * @param id - Content ID to load
 * @param source - Source name for Redux state namespacing (defaults to 'content')
 *
 * Usage:
 * const { idMap, error, loading } = useContentLoader('my_content_id');
 */
export function useContentLoader(id: string, source = 'content') {
  const [idMap, setIdMap] = useState<IdMap | null>(null);
  const [error, setError] = useState<ComponentError>(null);
  const [loading, setLoading] = useState(true);

  // Check if we're in replay mode - if so, skip side effects
  const { replayMode } = useDebugSettings();

  // Get locale from Redux
  const localeAttrs = useLocaleAttributes();
  const locale = localeAttrs.lang;

  const baselineProps = useBaselineProps();

  useEffect(() => {
    // Skip side effects during replay
    if (replayMode) {
      setLoading(false);
      return;
    }

    if (!id || !locale) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    // Use globalThis.fetch with Accept-Language header
    globalThis.fetch(`/api/content/${id}`, {
      headers: {
        'Accept-Language': locale,
      },
    })
      .then(res => res.json())
      .then(data => {
        if (!data.ok) {
          setError(data.error);
        } else {
          // Dispatch to Redux for reactive block access
          dispatchOlxJson(baselineProps, source, data.idMap);
          setIdMap(data.idMap);
        }
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps -- baselineProps is stable (same logEvent/store), but creates new object each render
  }, [id, source, replayMode, locale]);

  return { idMap, error, loading };
}
