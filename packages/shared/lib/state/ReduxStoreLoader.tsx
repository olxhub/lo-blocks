// packages/shared/lib/state/ReduxStoreLoader.tsx
//
// Headless component that bridges Redux state with server-side blob
// persistence via lo_event's save_blob / fetch_blob protocol.
//
// On mount (once auth has landed), it sends:
//   1. save_setting { reduxID } — tells the server which blob key to use
//   2. fetch_blob   { reduxID } — requests the stored state snapshot
//
// The server responds with { status: 'fetch_blob', data: ... }, which
// lo_event's websocketLogger dispatches as a CustomEvent. reduxLogger's
// handleLoadState picks it up, merges the blob into Redux, and sets
// IS_LOADED = true — which unblocks the debounced save_blob writes.
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

const DEFAULT_REDUX_STORE_ID = 'default';

export function ReduxStoreLoader({ id = DEFAULT_REDUX_STORE_ID }) {
  const reduxStoreLoaded = useSelector((state: any) => state?.settings?.reduxStoreStatus ?? false);
  const currentUser = useUser();
  const lastFetchedIdRef = useRef<string | null>(null);
  const pendingRequestRef = useRef(false);

  useEffect(() => {
    if (!currentUser) return;

    const idChanged = lastFetchedIdRef.current !== id;
    const shouldFetch = (!reduxStoreLoaded && !pendingRequestRef.current) || idChanged;

    if (shouldFetch) {
      lo_event.logEvent('save_setting', { reduxID: id });
      lo_event.logEvent('fetch_blob', { reduxID: id });
      lastFetchedIdRef.current = id;
      pendingRequestRef.current = !reduxStoreLoaded;
    }

    if (reduxStoreLoaded) {
      pendingRequestRef.current = false;
    }
  }, [id, reduxStoreLoaded, currentUser]);

  return null;
}
