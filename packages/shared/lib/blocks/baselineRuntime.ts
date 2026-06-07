// packages/shared/lib/blocks/baselineRuntime.ts
//
// Single source of truth for LoBlockRuntimeContext defaults.
//
// Both the React hook (useBaselineRuntime) and test factory (mockRuntime)
// spread DEFAULT_RUNTIME and override the parts they need. Adding a new
// required field to LoBlockRuntimeContext means adding it here — the
// compiler guides you to the one spot.

'use client';

import React, { useEffect } from 'react';
import { useStore } from 'react-redux';
import * as lo_event from 'lo_event';
import { BLOCK_REGISTRY } from '@/components/blockRegistry';
import { useDebugSettings } from '@/lib/state/debugSettings';
import { settings } from '@/lib/state/settings';
import { useSetting } from '@/lib/state/settingsAccess';
import { getTextDirection, getBrowserLocale } from '@/lib/i18n/getTextDirection';
import { PLACEHOLDER_NS } from '@/lib/types/id-grammar';
import type { BaselineProps, IdPrefix, LoBlockRuntimeContext, UserLocale } from '@/lib/types';

const noopLogEvent = () => {};

/**
 * Default shape for LoBlockRuntimeContext.
 *
 * `store` is null — callers MUST override it. Everything else has a
 * sensible default. Spread this and replace what you need:
 *
 *   // React hook:
 *   { ...DEFAULT_RUNTIME, store, logEvent, locale }
 *
 *   // Test factory:
 *   { ...DEFAULT_RUNTIME, sideEffectFree: true, ...overrides }
 */
export const DEFAULT_RUNTIME: LoBlockRuntimeContext = {
  blockRegistry: {},
  store: null as any,
  logEvent: noopLogEvent,
  sideEffectFree: false,
  ns: PLACEHOLDER_NS,
  idPrefix: '' as IdPrefix,
  locale: { code: '' as UserLocale, dir: 'ltr' },
  cast: {},
};

/**
 * Build baseline runtime context: logEvent, locale, store, blockRegistry.
 *
 * Returns the core runtime bundle that's available everywhere in the system.
 * Most consumers should use useBaselineProps() which wraps this in BaselineProps.
 */
export function useBaselineRuntime(): LoBlockRuntimeContext {
  const store = useStore();
  const { replayMode } = useDebugSettings();
  const logEvent = replayMode ? noopLogEvent : lo_event.logEvent;
  const sideEffectFree = replayMode;

  // Minimal runtime for the useSetting call below — locale gets overwritten.
  const runtimeForSettings: LoBlockRuntimeContext = {
    ...DEFAULT_RUNTIME,
    blockRegistry: BLOCK_REGISTRY,
    store,
    logEvent,
    sideEffectFree,
    locale: { code: 'eo' as UserLocale, dir: 'ltr' },
  };

  const baselineProps: BaselineProps = { runtime: runtimeForSettings };
  const [reduxLocale, setReduxLocale] = useSetting(baselineProps, settings.locale);

  useEffect(() => {
    if (!reduxLocale) {
      const code = getBrowserLocale();
      const dir = getTextDirection(code);
      setReduxLocale({ code, dir });
    }
  }, [reduxLocale, setReduxLocale]);

  const locale = reduxLocale || { code: '' as UserLocale, dir: 'ltr' as const };

  return {
    ...DEFAULT_RUNTIME,
    blockRegistry: BLOCK_REGISTRY,
    store,
    logEvent,
    sideEffectFree,
    locale,
  };
}

/**
 * Get baseline props for global/system context.
 *
 * Returns BaselineProps which wraps LoBlockRuntimeContext in the standard prop
 * structure. This is what most system-level functions expect (useSetting,
 * LanguageSwitcher, etc.).
 *
 * Prefer this over useBaselineRuntime() unless you specifically need the
 * bare runtime context.
 */
export function useBaselineProps(): BaselineProps {
  const runtime = useBaselineRuntime();
  return { runtime };
}
