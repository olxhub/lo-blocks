// src/app/storeWrapper.js
'use client';
import React from 'react';

import { Provider } from 'react-redux';

import { store } from '@/lib/state/store';

const reduxStore = store.init();

const StoreWrapper = ({ children }) => (
  <Provider store={reduxStore}>
    {children}
  </Provider>
);

export default StoreWrapper;
