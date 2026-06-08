// apps/web/app/storeWrapper.tsx
//
// Root wrapper that provides Redux store and debug infrastructure.
//
// Receives raw PMSS text from layout.tsx (server component) and calls
// initConfig() on the client before rendering any config-dependent
// components (e.g. DebugWrapper).
//
'use client';
import React from 'react';

import { initConfig } from '@/lib/config';
import { store, extendSettings } from '@/lib/state';
import { editorFields } from '@/lib/state/editorFields';
import { BLOCK_REGISTRY } from '@/components/blockRegistry';
import StoreShell from '@/components/common/StoreShell';

// Re-export for backward compatibility
export { useDebugSettings } from '@/lib/state/debugSettings';
export type { DebugSettings } from '@/lib/state/debugSettings';

const reduxStore = store.init({
  extraFields: extendSettings(editorFields),
  blockRegistry: BLOCK_REGISTRY,
  websocket: true,
});

// Track whether initConfig has been called in this client session.
let configInitialized = false;

const StoreWrapper = ({ children, pmss }: { children: React.ReactNode; pmss: string }) => {
  if (!configInitialized) {
    const env = process.env.NODE_ENV === 'production' ? 'production' : 'development';
    initConfig(pmss, ['web', env]);
    configInitialized = true;
  }

  return (
    <StoreShell store={reduxStore}>
      {children}
    </StoreShell>
  );
};

export default StoreWrapper;
