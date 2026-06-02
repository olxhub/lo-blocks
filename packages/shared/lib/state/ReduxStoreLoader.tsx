// packages/shared/lib/state/ReduxStoreLoader.tsx
//
// Headless component that bridges Redux state with server-side blob
// persistence via lo_event's save_blob / fetch_blob protocol.
//
// On mount (once auth has landed), it sends fetch_blob to request the
// stored state snapshot. The server responds with
// { status: 'fetch_blob', data: ... }, which lo_event's websocketLogger
// dispatches as a CustomEvent. reduxLogger's handleLoadState picks it
// up, merges the blob into Redux, and sets IS_LOADED = true — which
// unblocks the debounced save_blob writes.
//
// Gate: we wait for currentUser before sending fetch_blob because the
// blob is keyed server-side by safe_user_id. Without identity, the
// server can't route the request.
//
'use client';
import { useEffect, useRef } from 'react';
import { useSelector } from 'react-redux';
import * as lo_event from 'lo_event';

import { useUser } from './redux';

/**
 * True once the server's blob snapshot has been merged into Redux
 * (lo_event's handleLoadState sets settings.reduxStoreStatus). Until
 * then, persisted state has not yet hydrated.
 */
export function useReduxStoreLoaded(): boolean {
  return useSelector((state: any) => state?.settings?.reduxStoreStatus ?? false);
}

export function ReduxStoreLoader() {
  const reduxStoreLoaded = useReduxStoreLoaded();
  const currentUser = useUser();
  const pendingRequestRef = useRef(false);

  useEffect(() => {
    if (!currentUser) return;
    if (reduxStoreLoaded) {
      pendingRequestRef.current = false;
      return;
    }
    if (pendingRequestRef.current) return;

    pendingRequestRef.current = true;
    lo_event.logEvent('fetch_blob', {});
  }, [reduxStoreLoaded, currentUser]);

  return null;
}
