// src/lib/state/debugSettings.tsx
//
// Debug settings context and hook.
//
// Provides access to debug panel state (visibility, replay mode, etc.)
// without triggering store initialization when imported.
//
'use client';

import { createContext, useContext } from 'react';
import type { LoggedEvent } from '@/lib/replay';

// =============================================================================
// Types
// =============================================================================

export interface DebugSettings {
  panelOpen: boolean;
  setPanelOpen: (open: boolean) => void;
  replayMode: boolean;
  replayEventIndex: number;
  setReplayMode: (mode: boolean) => void;
  setReplayEventIndex: (index: number | ((prev: number) => number)) => void;
  getEvents: () => LoggedEvent[];
}

// =============================================================================
// Context
// =============================================================================

export const DebugSettingsContext = createContext<DebugSettings | null>(null);

/**
 * Default settings used when not in StoreWrapper context.
 * In this case, we're definitely not in replay mode.
 */
const DEFAULT_DEBUG_SETTINGS: DebugSettings = {
  panelOpen: false,
  setPanelOpen: () => {},
  replayMode: false,
  replayEventIndex: -1,
  setReplayMode: () => {},
  setReplayEventIndex: () => {},
  getEvents: () => [],
};

/**
 * Hook to access debug settings (panel visibility, replay mode, etc.)
 *
 * When used outside StoreWrapper (e.g., in tests), returns safe defaults
 * that indicate "not replaying" so components behave normally.
 */
export function useDebugSettings(): DebugSettings {
  const ctx = useContext(DebugSettingsContext);
  // Return defaults when not in context (tests, standalone rendering)
  // This means replay is inactive, so normal behavior applies
  return ctx ?? DEFAULT_DEBUG_SETTINGS;
}
