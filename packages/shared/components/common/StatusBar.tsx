// packages/shared/components/common/StatusBar.tsx
//
// Sticky top bar showing persistence status: connection state, save
// status, and the current user. Shared by the routed preview app
// (apps/client) and the static export app (apps/static).
//
// Reads lo_event's persistence hooks (useConnected/useSaved) and the
// current user. When no WebSocket is configured, useConnected() returns
// null and there's nothing meaningful to show — callers should only
// render this when persistence is active.
//
import { useEffect } from 'react';
import { WifiOff } from 'lucide-react';
import { useConnected, useSaved, useUser } from '@/lib/state';

export default function StatusBar() {
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
      <div className="sticky top-0 z-50 print:hidden">
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

  // In print we keep only the username (for attribution) and drop the
  // interactive chrome. print:static stops the sticky bar from landing on
  // its own page, and we strip the screen-only background/border/blur so it
  // reads as a plain header line at the top of the first page.
  return (
    <div className="sticky top-0 z-10 bg-surface/80 backdrop-blur-sm border-b border-subtle px-4 py-1.5 flex items-center justify-between text-xs text-dimmed print:static print:bg-transparent print:backdrop-blur-none print:border-0 print:px-0">
      <div className="flex items-center gap-2 print:hidden">
        <span className={`w-1.5 h-1.5 rounded-full ${saveDot}`} title={saveLabel} />
        <span>{saveLabel}</span>
      </div>
      <span>{user?.user_id || '(no user)'}</span>
    </div>
  );
}
