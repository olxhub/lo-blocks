// src/app/storeWrapper.js
'use client';
import React from 'react';
import { useEffect, useRef } from 'react';

import { Provider, useSelector } from 'react-redux';

import * as lo_event from 'lo_event';

import { store, extendSettings } from '@/lib/state';
import { editorFields } from '@/lib/state/editorFields';
import GlobalDebugPanel from '@/components/common/debug/GlobalDebugPanel';

const reduxStore = store.init({
  extraFields: extendSettings(editorFields)
});

const DEFAULT_REDUX_STORE_ID = 'default';

function ReduxStoreLoader({ id = DEFAULT_REDUX_STORE_ID }) {
  const reduxStoreLoaded = useSelector((state: any) => state?.settings?.reduxStoreStatus ?? false);
  const lastFetchedIdRef = useRef<string | null>(null);
  const pendingRequestRef = useRef(false);

  useEffect(() => {
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
  }, [id, reduxStoreLoaded]);

  return null;
}

const StoreWrapper = ({ children, reduxID = DEFAULT_REDUX_STORE_ID }) => (
  <Provider store={reduxStore}>
    <ReduxStoreLoader id={reduxID} />
    {children}
    <GlobalDebugPanel />
  </Provider>
);

export default StoreWrapper;
