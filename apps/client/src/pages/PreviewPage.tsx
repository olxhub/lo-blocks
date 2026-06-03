// apps/client/src/pages/PreviewPage.tsx
//
// Preview page — renders a single block by ID, fetching content dynamically
// from /api/olxjson/. Adapted from apps/web/app/preview/[id]/PreviewPage.tsx
// with Next.js useParams replaced by a prop from the router.
//
import { useEffect } from 'react';
import { WifiOff } from 'lucide-react';
import RenderOLX from '@/components/common/RenderOLX';
import Spinner from '@/components/common/Spinner';
import Notice from '@/components/common/Notice';
import { DisplayError } from '@/lib/util/debug';
import { useFieldState, system, commonFields, useLoaded, useConnected, useSaved, useUser } from '@/lib/state';
import { useContentLoader } from '@/lib/content/useContentLoader';
import { useLocaleAttributes } from '@/lib/i18n/useLocaleAttributes';
import { leafDefinitionKeyFromStateKey } from '@/lib/types/id-grammar';
import type { StateKey } from '@/lib/types';

// TODO: Audit disconnect/reconnect behavior before trusting offline operation.
// Concerns: reconnect may fetch a stale blob (e.g. saved 5 minutes ago) and
// overwrite in-progress work; debounced saves may silently fail if the socket
// drops mid-flight; redux-state-sync cross-tab interactions during reconnect
// are untested. Until audited, we gray out the page on disconnect.

function StatusBar() {
  const connected = useConnected();
  const saveStatus = useSaved();
  const user = useUser();

  // Warn before leaving with unsaved changes. lo_event flushes pending saves
  // on unload, but the WebSocket send is async and the in-memory queue doesn't
  // survive page close, so an unconfirmed save means work could be lost. The
  // browser shows its generic "Leave site?" prompt when we preventDefault.
  useEffect(() => {
    // Prompt for any unsaved state — pending changes ('modified') or a failed
    // save ('error'); only 'saved' is safe to leave silently.
    if (saveStatus === 'saved') return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [saveStatus]);

  if (connected === false) {
    return (
      <div className="sticky top-0 z-50">
        <div className="bg-error text-inverse px-4 py-2 text-sm font-medium flex items-center justify-center gap-2">
          <WifiOff className="w-4 h-4" />
          Connection lost — please check your network
        </div>
        <div className="fixed inset-0 bg-black/20 z-40 pointer-events-none" />
      </div>
    );
  }

  const saveLabel =
    saveStatus === 'error' ? 'Save failed'
      : saveStatus === 'modified' ? 'Unsaved changes'
        : 'Saved';
  const saveDot =
    saveStatus === 'error' ? 'bg-error'
      : saveStatus === 'modified' ? 'bg-warning'
        : 'bg-success';

  return (
    <div className="sticky top-0 z-10 bg-surface/80 backdrop-blur-sm border-b border-subtle px-4 py-1.5 flex items-center justify-between text-xs text-dimmed">
      <div className="flex items-center gap-2">
        <span className={`w-1.5 h-1.5 rounded-full ${saveDot}`} title={saveLabel} />
        <span>{saveLabel}</span>
      </div>
      <span>{user?.user_id || '(no user)'}</span>
    </div>
  );
}

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
  const [renderError, setRenderError] = useFieldState(
    null,
    commonFields.renderError,
    null,
    { stateKey: id }
  );
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
          {renderError ? (
            <DisplayError
              props={{ id, tag: 'preview' }}
              title="Render Error"
              message={`Failed to render content: ${id}`}
              technical={renderError}
              id={`${id}_render_error`}
            />
          ) : (
            <RenderOLX
              id={id}
              baseIdMap={idMap ?? undefined /* TS workaround; always defined by the time we're here */}
              eventContext="preview"
              onError={(err) => setRenderError(err.message)}
            />
          )}
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
