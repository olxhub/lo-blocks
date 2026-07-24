'use client';
// packages/shared/lib/blocks/loader/lazyBlockComponent.tsx
//
// Render-side half of the blueprint/component split: resolve a block to a
// stable ComponentType, lazily loading its component on first render.
// Uses React hooks, so it must only be imported from render paths (client
// components / jsdom tests) — never from the registry chain that Next.js
// server routes import. The registry-side half is componentLoader.ts.
//
// A block reaches render time in one of three shapes:
//
//   component set        → eager: blueprint declared it, or a preload
//                          already resolved the loader
//   componentLoader set  → lazy: load on first render, spinner meanwhile
//   neither              → headless: actions/graders render nothing
//
// resolveBlockComponent() collapses those into one stable ComponentType per
// block, cached on the block (_resolvedComponent) so React never sees the
// element type change across renders — swapping the lazy wrapper for the
// raw component mid-session would unmount the subtree and drop local UI
// state.
//
// We deliberately do not use React.lazy/Suspense: any block might suspend,
// and Suspense has serious performance problems for that shape (see
// docs/README.md, "Incremental loading").

import React, { useEffect, useState } from 'react';
import Spinner from '@/components/common/Spinner';
import type { LoBlock } from '@/lib/types';
import { NullComponent } from './componentLoader';

/**
 * The stable ComponentType for a block. Render code calls this instead of
 * reading block.component. First call decides (eager / lazy wrapper /
 * headless); subsequent calls return the same identity.
 */
export function resolveBlockComponent(block: LoBlock): React.ComponentType<any> {
  if (!block._resolvedComponent) {
    block._resolvedComponent =
      block.component ??
      (block.componentLoader ? makeLazyBlockComponent(block) : NullComponent);
  }
  return block._resolvedComponent;
}

function makeLazyBlockComponent(block: LoBlock): React.ComponentType<any> {
  function LazyBlock(props: any) {
    // block.component may have been filled by a preload between mounts —
    // seed from it so the spinner only shows for a genuinely unloaded chunk.
    const [Component, setComponent] = useState<React.ComponentType<any> | null>(
      () => block.component ?? null
    );
    const [error, setError] = useState<Error | null>(null);

    useEffect(() => {
      if (Component) return;
      let alive = true;
      block.componentLoader!().then(
        (loaded) => {
          if (!loaded) {
            // A conventional loader on a module without a default export.
            if (alive) setError(new Error('component module has no default export'));
            return;
          }
          block.component = loaded;  // future resolutions and preload checks see it
          // A successful load re-arms the stale-chunk heal (see error path).
          if (typeof window !== 'undefined') sessionStorage.removeItem('lo-stale-chunk-reload');
          if (alive) setComponent(() => loaded);
        },
        (err) => { if (alive) setError(err instanceof Error ? err : new Error(String(err))); },
      );
      return () => { alive = false; };
    }, [Component]);

    if (error) {
      // Stale-chunk failures (vite re-optimized mid-session, invalidating
      // every loaded dep URL — "Outdated Optimize Dep" 504s) are fixed by
      // exactly one reload. Heal automatically, once per page view, so the
      // cascade never reaches the user as a dead-end error band.
      if (/dynamically imported module|Outdated Optimize Dep|Failed to fetch/i.test(error.message)
          && typeof window !== 'undefined'
          && !sessionStorage.getItem('lo-stale-chunk-reload')) {
        sessionStorage.setItem('lo-stale-chunk-reload', '1');
        window.location.reload();
        return <Spinner />;
      }
      // Other chunk failures are environmental (offline, stale deploy) —
      // show an in-place message rather than taking down the page.
      return (
        <div className="text-error text-sm p-2">
          Failed to load the “{block.name}” block: {error.message}
        </div>
      );
    }
    if (!Component) return <Spinner />;
    return <Component {...props} />;
  }
  LazyBlock.displayName = `Lazy(${block.name})`;
  return LazyBlock;
}
