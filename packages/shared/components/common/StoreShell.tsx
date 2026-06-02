// packages/shared/components/common/StoreShell.tsx
//
// Shared root wrapper: Redux Provider + DebugWrapper.
//
// Every entry point (client, static, web) needs this same wrapping.
// Config init and store creation differ per entry point, but the
// Provider + DebugWrapper layer is identical.
//
import React from 'react';
import { Provider } from 'react-redux';
import DebugWrapper from './debug/DebugWrapper';

export default function StoreShell({
  store,
  children,
}: {
  store: any;
  children: React.ReactNode;
}) {
  return (
    <Provider store={store}>
      <DebugWrapper store={store}>
        {children}
      </DebugWrapper>
    </Provider>
  );
}
