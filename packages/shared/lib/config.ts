// lib/config.ts
//
// Application configuration via PMSS (Preference Management Style Sheets).
//
// Each app declares its profile via NEXT_PUBLIC_APP_PROFILE in next.config.mjs
// (e.g. 'static' or 'web'). Settings resolve via CSS-like specificity rules:
// .web selectors override * defaults, etc.
//
// Usage:
//   import { getConfig, getConfigBool } from '@/lib/config';
//   const useWs = getConfigBool('websocket');  // true for web, false for static
//
// Path forward:
//   - Now: inline config string, build-time profile via NEXT_PUBLIC_APP_PROFILE.
//   - Near-term: build step generates this from a .pmss file as config grows.
//   - Longer-term: multiple ruleset layers (system, local, env, runtime) —
//     the Python PMSS already has this pattern (ArgsRuleset, SimpleEnvsRuleset,
//     PMSSFileRuleset). JS side would add equivalent ruleset layering.
//   - Static builds: always build-time resolution (Turbopack inlines NEXT_PUBLIC_*).
//   - Web/server: can do runtime resolution for server-only settings (LLM, storage).
//   - Tests: set NEXT_PUBLIC_APP_PROFILE or pass explicit context to getConfig().

import { PMSSParserAdapter, resolve } from 'pmss';
import type { SelectorMatchContext } from 'pmss';

// Config is inline for now — no file I/O, works in 'use client' modules,
// no loader/bundler config needed. As config grows, a build step can
// generate this from a .pmss source file.
const PMSS_CONFIG = `
/* Defaults: conservative — no server features */
* {
    websocket: false;
}

/* Server-backed apps: websocket enabled */
.web {
    websocket: true;
}

.client {
    websocket: true;
}
`;

// Parse once at module load time
const rules = PMSSParserAdapter.parse(PMSS_CONFIG);

// App profile from env var (set in each app's next.config.mjs).
//
// IMPORTANT: Use process.env.NEXT_PUBLIC_* with direct access (no optional chaining).
// Next.js/Turbopack replaces this exact pattern with a literal string at compile time.
//
// No fallback — if the env var is unset, the profile is empty and only * defaults
// apply. This is fail-safe: unset profile → conservative defaults (no websocket).
// The comma split supports future multi-class profiles (e.g. 'web,production').
const appProfile = process.env.NEXT_PUBLIC_APP_PROFILE || '';
const appClasses = appProfile ? appProfile.split(',') : [];

const defaultContext: SelectorMatchContext = { classes: appClasses };

/**
 * Resolve a PMSS config value as a string.
 *
 * @param key - The config property name (e.g. 'websocket')
 * @param context - Optional override context; defaults to app profile classes
 * @returns The resolved value, or null if no matching rule
 */
export function getConfig(key: string, context?: SelectorMatchContext): string | null {
  return resolve(rules, key, context ?? defaultContext);
}

/**
 * Resolve a PMSS config value as a boolean.
 *
 * Returns true only if the resolved value is exactly "true".
 *
 * @param key - The config property name
 * @param context - Optional override context
 */
export function getConfigBool(key: string, context?: SelectorMatchContext): boolean {
  return getConfig(key, context) === 'true';
}
