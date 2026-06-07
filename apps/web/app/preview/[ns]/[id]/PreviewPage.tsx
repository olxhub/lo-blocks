// src/app/preview/[ns]/[id]/PreviewPage.tsx
'use client';

import { useParams } from 'next/navigation';
import StatusBar from '@/components/common/StatusBar';
import RenderOLX from '@/components/common/RenderOLX';
import Spinner from '@/components/common/Spinner';
import { DisplayError } from '@/lib/util/debug';
import { useFieldState, system, useLoaded } from '@/lib/state';
import { useContentLoader } from '@/lib/content/useContentLoader';
import { parseStateKey, leafDefinitionKeyFromStateKey } from '@/lib/types/id-grammar';
import { useLocaleAttributes } from '@/lib/i18n/useLocaleAttributes';

export default function PreviewPage() {
  const storeLoaded = useLoaded();
  const params = useParams();
  // Route is /preview/[ns]/[id] — reconstruct StateKey as "ns/id"
  // (a bare "ns/id" is a valid StateKey — no scope markers means top-level instance)
  const stateKey = parseStateKey(`${params.ns}/${params.id}`);
  // TODO: Pass baselineProps from useBaselineProps() instead of null
  const [debug] = useFieldState(
    null,
    system.debug,
    false,
    { tag: 'preview' } // HACK: This works around not having proper props. Should be fixed. See below
  );

  // TODO: useContentLoader should accept StateKey and load ALL definition keys
  // via allDefinitionKeysFromStateKey (e.g. "foo:#7:bar" needs both foo and bar).
  // Currently only loads the leaf — works for top-level renders but breaks for
  // scoped state keys.
  const { idMap, error, loading } = useContentLoader(leafDefinitionKeyFromStateKey(stateKey));
  // Render errors are owned by RenderOLX's ErrorBoundary (displayed there and
  // recorded as a derived-key ErrorNode event) — no gate/field needed here.
  const localeAttrs = useLocaleAttributes();

  if (error) {
    return (
      <div {...localeAttrs} suppressHydrationWarning className="flex flex-col h-screen">
        <StatusBar />
        <div className="p-6 flex-1">
          <DisplayError
            props={{ id: stateKey, tag: 'preview' }}
            title="Content Loading Error"
            message={`Failed to load content: ${stateKey}`}
            technical={error}
            id={`${stateKey}_load_error`}
          />
        </div>
      </div>
    );
  }

  if (!storeLoaded) {
    return (
      <div {...localeAttrs} suppressHydrationWarning className="flex flex-col h-screen">
        <StatusBar />
        <Spinner>Loading user state...</Spinner>
      </div>
    );
  }

  if (loading) {
    return (
      <div {...localeAttrs} suppressHydrationWarning className="flex flex-col h-screen">
        <StatusBar />
        <Spinner>Loading content...</Spinner>
      </div>
    );
  }

  // After loading=false and error=null, idMap should always be populated.
  // If not, it's a bug in useContentLoader (e.g. unhandled replay/locale edge case).

  return (
    <div {...localeAttrs} className="flex flex-col h-screen">
      <StatusBar />
      <div className="p-6 flex-1 overflow-auto">
        <div className="space-y-4">
          <RenderOLX
            id={stateKey}
            baseIdMap={idMap ?? undefined /* TS workaround; always defined by the time we're here */}
            eventContext="preview"
          />
        </div>

        {debug && (
          <pre className="mt-4 bg-gray-100 p-4 text-xs rounded overflow-auto">
            {JSON.stringify({ idMap }, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}

// TODO for hack above
// We have a hack where useFieldState requires props. We should do several things:
// * Make a 'global' or 'common' props object to use outside of render. Use a sentinel tag and ID
//   - Consider a shared props constructor or factory, so things don't go out of sync?
//   - 2 might places might not be enough to merit that.
// * Remove need for tag and ID in contexts we don't need it (e.g. system-wide state)
//
// This hack is present in debug.js (twice) and here
