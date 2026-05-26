// lib/state/urlFields.tsx
//
// URL field sync — bidirectional sync between URL search params and block fields.
//
// Fields opt in via `url: true` in their FieldInfo. The URL acts as both an
// initialization source (deep links) and a live mirror (shareable URLs).
//
// URL key convention:
//   Component-scoped:  ?blockId.fieldName=value   (explicit)
//   Component-scoped:  ?blockId=value             (urlDefault field)
//   System-scoped:     ?fieldName=value            (global, e.g. search)
//
// Security: only fields with url:true are readable/writable from the URL.
// Fields like score, correct, etc. cannot be URL-overridden.
//
// Values are stored and retrieved as-is. This layer does not interpret,
// transform, or validate values — it's a dumb pipe between URL params
// and useFieldState. State keys, definition keys, etc. are passed through
// verbatim (URL-encoded by the browser automatically).
//
// Architecture note: this context lives in packages/shared (framework-agnostic).
// The page-level component (e.g., Next.js PreviewPage) provides the concrete
// provider, initialized from the framework's URL param API.
//
// TODO:
// - URL normalization (e.g. foo=bar&foo=bar). We do a little bit of this already
//   with default fields
// - Global fields / settings (e.g. search)
// - Fields which don't sync (initial values)
// ...

'use client';

import React, { createContext, useContext, useCallback, useRef, useMemo } from 'react';

import { scopes } from './scopes';
import type { FieldInfo } from '../types';

// =============================================================================
// Context
// =============================================================================

interface UrlFieldApi {
  /** Get a URL search param value. Returns undefined if not present. */
  getParam: (key: string) => string | undefined;
  /** Set a URL search param. Pass null to remove. */
  setParam: (key: string, value: string | null, options?: { push?: boolean }) => void;
}

const defaultApi: UrlFieldApi = {
  getParam: () => undefined,
  setParam: () => { },
};

const UrlFieldContext = createContext<UrlFieldApi>(defaultApi);

// =============================================================================
// Provider
// =============================================================================

/**
 * Provides URL field sync to the component tree.
 *
 * Accepts initial search params (from the page's URL) and exposes
 * getParam/setParam for useFieldState to read and write URL params.
 *
 * Usage (in a Next.js page):
 *   const searchParams = useSearchParams();
 *   <UrlFieldProvider searchParams={searchParams}>
 *     <RenderOLX ... />
 *   </UrlFieldProvider>
 */
export function UrlFieldProvider({
  searchParams,
  children,
}: {
  searchParams: URLSearchParams;
  children: React.ReactNode;
}) {
  const initialParams = useRef<URLSearchParams>(searchParams);
  initialParams.current = searchParams;

  const getParam = useCallback((key: string): string | undefined => {
    return initialParams.current.get(key) ?? undefined;
  }, []);

  const setParam = useCallback((key: string, value: string | null, options?: { push?: boolean }) => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (value === null || value === undefined) {
      url.searchParams.delete(key);
    } else {
      url.searchParams.set(key, value);
    }
    if (options?.push) {
      window.history.pushState({}, '', url.toString());
    } else {
      window.history.replaceState({}, '', url.toString());
    }
  }, []);

  const api = useMemo(() => ({ getParam, setParam }), [getParam, setParam]);

  return (
    <UrlFieldContext.Provider value={api}>
      {children}
    </UrlFieldContext.Provider>
  );
}

// =============================================================================
// Hooks for useFieldState integration
// =============================================================================

/**
 * Access the URL field API from context.
 * Returns the default (no-op) API if no provider is present.
 */
export function useUrlFieldApi(): UrlFieldApi {
  return useContext(UrlFieldContext);
}

/**
 * Compute the URL key for a field given the block's props and FieldInfo.
 *
 * Returns the key to use in URL search params, or null if the field
 * isn't URL-synced.
 */
export function urlKeyForField(
  propsId: string | undefined | null,
  field: FieldInfo
): { defaultKey: string | null; explicitKey: string | null } {
  if (!field.url) return { defaultKey: null, explicitKey: null };

  if (field.scope === scopes.system) {
    // System-scoped: just the field name (e.g., ?search=mitosis)
    return { defaultKey: field.name, explicitKey: field.name };
  }

  // Component-scoped: need the block's ID from props
  const blockId = propsId ? String(propsId) : null;
  if (!blockId) return { defaultKey: null, explicitKey: null };

  const explicitKey = `${blockId}.${field.name}`;
  const defaultKey = field.urlDefault ? blockId : null;

  return { defaultKey, explicitKey };
}

/**
 * Read the URL override value for a field.
 *
 * Checks both key forms and returns the value if present. When a urlDefault
 * field has a canonical form (?blockId=value), any non-canonical form
 * (?blockId.fieldName=value) is rewritten to canonical on read.
 *
 * Priority when both keys are present: the canonical (default) key wins,
 * and the explicit key is removed.
 *
 * Returns undefined if no override exists.
 */
export function getUrlOverride(
  api: UrlFieldApi,
  propsId: string | undefined | null,
  field: FieldInfo
): string | undefined {
  if (!field.url) return undefined;

  const { defaultKey, explicitKey } = urlKeyForField(propsId, field);

  const canonicalValue = defaultKey ? api.getParam(defaultKey) : undefined;
  const explicitValue = explicitKey ? api.getParam(explicitKey) : undefined;

  if (canonicalValue !== undefined && explicitValue !== undefined) {
    // Both present: canonical wins, remove explicit
    api.setParam(explicitKey!, null);
    return canonicalValue;
  }

  if (canonicalValue !== undefined) return canonicalValue;

  if (explicitValue !== undefined) {
    if (defaultKey) {
      // Rewrite non-canonical to canonical form
      api.setParam(defaultKey, explicitValue);
      api.setParam(explicitKey!, null);
    }
    return explicitValue;
  }

  return undefined;
}

/**
 * Write a field value to the URL.
 *
 * Writes to the default key (if urlDefault) or explicit key, and clears
 * the other form to prevent stale params from winning on reload.
 * (getUrlOverride checks explicit first, so a leftover explicit key
 * would shadow a newer default key.)
 */
export function setUrlValue(
  api: UrlFieldApi,
  propsId: string | undefined | null,
  field: FieldInfo,
  value: any
): void {
  if (!field.url) return;

  const { defaultKey, explicitKey } = urlKeyForField(propsId, field);
  const key = defaultKey || explicitKey;
  if (!key) return;

  const strValue = value != null ? String(value) : null;
  const pushOpts = { push: field.urlPush };

  api.setParam(key, strValue, pushOpts);

  // Clear the other key form so stale values can't shadow on reload
  const otherKey = key === defaultKey ? explicitKey : defaultKey;
  if (otherKey && otherKey !== key) {
    api.setParam(otherKey, null, pushOpts);
  }
}
