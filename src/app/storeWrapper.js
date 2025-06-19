// src/app/storeWrapper.js
'use client';
import React from 'react';

import { Provider } from 'react-redux';

import { store, settingsFields } from '@/lib/state';
import { editorFields } from './edit/editorFields';

const reduxStore = store.init({
  extraFields: settingsFields.extend(editorFields)
});

const StoreWrapper = ({ children }) => (
  <Provider store={reduxStore}>
    {children}
  </Provider>
);

export default StoreWrapper;
