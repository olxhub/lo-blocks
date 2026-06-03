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
import * as lo_event from 'lo_event';
import { useLoaded } from 'lo_event/hooks';

import { useUser } from './redux';

export function ReduxStoreLoader() {
  const loaded = useLoaded();
  const currentUser = useUser();
  const pendingRequestRef = useRef(false);

  useEffect(() => {
    if (!currentUser) return;
    if (loaded) {
      pendingRequestRef.current = false;
      return;
    }
    if (pendingRequestRef.current) return;

    pendingRequestRef.current = true;
    lo_event.logEvent('fetch_blob', {});
  }, [loaded, currentUser]);

  return null;
}
