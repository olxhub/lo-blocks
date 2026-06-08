// apps/client/src/pages/PreviewPage.tsx
//
// Preview page — renders a single block by ID, fetching content dynamically
// from /api/olxjson/. Adapted from apps/web/app/preview/[id]/PreviewPage.tsx
// with Next.js useParams replaced by a prop from the router.
//
import RenderOLX from '@/components/common/RenderOLX';
import Spinner from '@/components/common/Spinner';
import Notice from '@/components/common/Notice';
import StatusBar from '@/components/common/StatusBar';
import { DisplayError } from '@/lib/util/debug';
import { useFieldState, system, useLoaded } from '@/lib/state';
import { useContentLoader } from '@/lib/content/useContentLoader';
import { useLocaleAttributes } from '@/lib/i18n/useLocaleAttributes';
import { leafDefinitionKeyFromStateKey } from '@/lib/types/id-grammar';
import type { StateKey } from '@/lib/types';

// TODO: Audit disconnect/reconnect behavior before trusting offline operation.
// Concerns: reconnect may fetch a stale blob (e.g. saved 5 minutes ago) and
// overwrite in-progress work; debounced saves may silently fail if the socket
// drops mid-flight; redux-state-sync cross-tab interactions during reconnect
// are untested. Until audited, we gray out the page on disconnect.

export default function PreviewPage({ id }: { id: StateKey }) {
  const storeLoaded = useLoaded();
  const [debug] = useFieldState(
    null,
    system.debug,
    false,
    { tag: 'preview' }
  );

  // TODO: useContentLoader should accept StateKey and load ALL definition keys
  // via allDefinitionKeysFromStateKey (e.g. "foo:#7:bar" needs both foo and bar).
  // Currently only loads the leaf — works for top-level renders but breaks for
  // scoped state keys.
  const { idMap, error, loading } = useContentLoader(leafDefinitionKeyFromStateKey(id));
  // Render errors are owned by RenderOLX's ErrorBoundary (displayed there and
  // recorded as a derived-key ErrorNode event) — no gate/field needed here.
  const localeAttrs = useLocaleAttributes();

  if (error) {
    return (
      <div {...localeAttrs} className="flex flex-col h-screen">
        <div className="p-6 flex-1">
          <DisplayError
            props={{ id, tag: 'preview' }}
            title="Content Loading Error"
            message={`Failed to load content: ${id}`}
            technical={error}
            id={`${id}_load_error`}
          />
        </div>
      </div>
    );
  }

  if (!storeLoaded) {
    return (
      <div {...localeAttrs} className="flex flex-col h-screen">
        <Spinner>Loading user state...</Spinner>
      </div>
    );
  }

  if (loading) {
    return (
      <div {...localeAttrs} className="flex flex-col h-screen">
        <Spinner>Loading content...</Spinner>
      </div>
    );
  }

  // After loading=false and error=null, idMap should always be populated.
  // If not, it's a bug in useContentLoader (e.g. unhandled replay/locale edge case).

  return (
    <div {...localeAttrs} className="flex flex-col min-h-screen">
      <StatusBar />
      <div className="p-6 flex-1 overflow-auto">
        <div className="space-y-4">
          <RenderOLX
            id={id}
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
      <footer className="border-t border-gray-200 px-6 py-4 text-xs leading-relaxed space-y-2">
        <Notice />
      </footer>
    </div>
  );
}
