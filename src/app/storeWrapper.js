// src/app/storeWrapper.js
'use client';
import React from 'react';

import { Provider } from 'react-redux';

import { store } from '@/lib/state/store';
import { settingsFields } from '@/lib/state/settings';

const reduxStore = store.init({
  extraFields: settingsFields
});

const StoreWrapper = ({ children }) => (
  <Provider store={reduxStore}>
    {children}
  </Provider>
);

export default StoreWrapper;
