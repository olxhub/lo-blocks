// src/app/storeWrapper.js
'use client';
import React from 'react';
import { useEffect, useRef } from 'react';

import { Provider, useSelector } from 'react-redux';

import * as lo_event from 'lo_event';

import { store, settingsFields } from '@/lib/state';
import { editorFields } from './edit/editorFields';

const reduxStore = store.init({
  extraFields: settingsFields.extend(editorFields)
});

const DEFAULT_REDUX_STORE_ID = 'default';

function ReduxStoreLoader({ id = DEFAULT_REDUX_STORE_ID }) {
  const reduxStoreLoaded = useSelector((state) => state?.settings?.reduxStoreStatus ?? false);
  const lastFetchedIdRef = useRef(null);
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
  </Provider>
);

export default StoreWrapper;
