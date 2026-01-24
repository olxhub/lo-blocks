// src/lib/content/useContentLoader.ts
import { useState, useEffect } from 'react';
import * as lo_event from 'lo_event';
import { IdMap, ComponentError } from '@/lib/types';
import { dispatchOlxJson } from '@/lib/state/olxjson';
import { useDebugSettings } from '@/lib/state/debugSettings';

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
  const noopLogEvent = () => {};
  const logEvent = replayMode ? noopLogEvent : lo_event.logEvent;

  useEffect(() => {
    // Skip side effects during replay
    if (replayMode) {
      setLoading(false);
      return;
    }

    if (!id) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    fetch(`/api/content/${id}`)
      .then(res => res.json())
      .then(data => {
        if (!data.ok) {
          setError(data.error);
        } else {
          // Dispatch to Redux for reactive block access
          dispatchOlxJson({ runtime: { logEvent } }, source, data.idMap);
          setIdMap(data.idMap);
        }
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, [id, source, replayMode, logEvent]);

  return { idMap, error, loading };
}
