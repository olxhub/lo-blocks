// apps/static/src/StaticContentProvider.tsx
//
// Loads baked content JSON once and provides it via React context.
// This is the static app's equivalent of useContentLoader -- instead of
// fetching from /api/content/[id], it loads a single pre-built JSON file.
//
import React, { createContext, useContext, useState, useEffect } from 'react';
import { dispatchOlxJson } from '@/lib/state/olxjson';
import { useBaselineProps } from '@/lib/blocks/baselineRuntime';
import Spinner from '@/components/common/Spinner';
import type { IdMap } from '@/lib/types';

interface StaticContentContextValue {
  idMap: IdMap;
}

const StaticContentContext = createContext<StaticContentContextValue | null>(null);

/**
 * Hook to access the pre-loaded static content idMap.
 */
export function useStaticContent(): StaticContentContextValue {
  const ctx = useContext(StaticContentContext);
  if (!ctx) {
    throw new Error('useStaticContent must be used within a StaticContentProvider');
  }
  return ctx;
}

/**
 * Loads static-content/all.json (respecting basePath) once and dispatches to Redux.
 * Children render only after content is loaded.
 */
export default function StaticContentProvider({ children }: { children: React.ReactNode }) {
  const [idMap, setIdMap] = useState<IdMap | null>(null);
  const [error, setError] = useState<string | null>(null);
  const baselineProps = useBaselineProps();

  useEffect(() => {
    const basePath = process.env.LO_BASE_PATH || '';
    globalThis.fetch(`${basePath}/static-content/all.json`)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(data => {
        // Dispatch to Redux so blocks can access content reactively
        dispatchOlxJson(baselineProps, 'content', data.idMap);
        setIdMap(data.idMap);
      })
      .catch(err => {
        setError(err.message);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps -- baselineProps creates new object each render but logEvent/store are stable
  }, []);

  if (error) {
    return (
      <div style={{ padding: '2rem', color: 'red' }}>
        Failed to load content: {error}
      </div>
    );
  }

  if (!idMap) {
    return <Spinner>Loading content...</Spinner>;
  }

  return (
    <StaticContentContext.Provider value={{ idMap }}>
      {children}
    </StaticContentContext.Provider>
  );
}
