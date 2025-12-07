// src/lib/content/useContentLoader.ts
import { useState, useEffect } from 'react';
import { IdMap, ComponentError } from '@/lib/types';

/**
 * Hook to load content from the API by ID
 *
 * Usage:
 * const { idMap, error, loading } = useContentLoader('my_content_id');
 */
export function useContentLoader(id: string) {
  const [idMap, setIdMap] = useState<IdMap | null>(null);
  const [error, setError] = useState<ComponentError>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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
          setIdMap(data.idMap);
        }
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, [id]);

  return { idMap, error, loading };
}
