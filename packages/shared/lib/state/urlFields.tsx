// packages/shared/lib/state/urlFields.tsx
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
// Reads directly from window.location, writes via history.replaceState
// (or pushState for urlPush fields). No React context or provider needed.
//
// TODO:
// - URL normalization (e.g. foo=bar&foo=bar). We do a little bit of this already
//   with default fields
// - Global fields / settings (e.g. search)
// - Fields which don't sync (initial values)
// - Include in documentation
// - zod / readers / writers
// (Popstate reactivity for back/forward is handled in useFieldState —
// see redux.ts — so mounted url fields re-sync on browser navigation.)
// ...

import { scopes } from './scopes';
import type { FieldInfo } from '../types';

// =============================================================================
// URL param access — reads from window.location, writes via history API
// =============================================================================

function getParam(key: string): string | undefined {
  if (typeof window === 'undefined') return undefined;
  const params = new URLSearchParams(window.location.search);
  return params.get(key) ?? undefined;
}

function setParam(key: string, value: string | null, options?: { push?: boolean }): void {
  setParams([[key, value]], options);
}

/** Write several params in ONE history entry. Callers changing correlated
 *  params (studio's ?source= and ?file=) must batch them — separate writes
 *  would leave intermediate entries whose param combinations never existed,
 *  and back/forward would step through them. */
export function setParams(
  entries: Array<[key: string, value: string | null | undefined]>,
  options?: { push?: boolean },
): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  for (const [key, value] of entries) {
    if (value === null || value === undefined) {
      url.searchParams.delete(key);
    } else {
      url.searchParams.set(key, value);
    }
  }
  if (options?.push) {
    window.history.pushState({}, '', url.toString());
  } else {
    window.history.replaceState({}, '', url.toString());
  }
}

// =============================================================================
// Field ↔ URL key mapping
// =============================================================================

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

// =============================================================================
// Read / Write
// =============================================================================

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
  propsId: string | undefined | null,
  field: FieldInfo
): string | undefined {
  if (!field.url) return undefined;

  const { defaultKey, explicitKey } = urlKeyForField(propsId, field);

  // System-scoped fields have one key form (defaultKey === explicitKey) —
  // no duplicate to reconcile; the cleanup below would read the single
  // param twice and delete it.
  if (defaultKey && defaultKey === explicitKey) {
    return getParam(defaultKey);
  }

  const canonicalValue = defaultKey ? getParam(defaultKey) : undefined;
  const explicitValue = explicitKey ? getParam(explicitKey) : undefined;

  if (canonicalValue !== undefined && explicitValue !== undefined) {
    // Both present: canonical wins, remove explicit
    setParam(explicitKey!, null);
    return canonicalValue;
  }

  if (canonicalValue !== undefined) return canonicalValue;

  if (explicitValue !== undefined) {
    if (defaultKey) {
      // Rewrite non-canonical to canonical form
      setParam(defaultKey, explicitValue);
      setParam(explicitKey!, null);
    }
    return explicitValue;
  }

  return undefined;
}

/**
 * Write a field value to the URL.
 *
 * Writes to the canonical key (defaultKey for urlDefault fields, else
 * explicitKey) and clears the other form to prevent stale params.
 */
export function setUrlValue(
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

  setParam(key, strValue, pushOpts);

  // Clear the other key form so stale values can't shadow on reload
  const otherKey = key === defaultKey ? explicitKey : defaultKey;
  if (otherKey && otherKey !== key) {
    setParam(otherKey, null, pushOpts);
  }
}
