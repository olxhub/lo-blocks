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
// The PMSS source of truth is config/system.pmss. A build step
// (scripts/generate-config.ts) reads it and produces config.generated.ts
// so this module works in 'use client' contexts without file I/O.
//
// Future layers: course overrides.pmss, env rulesets, runtime resolution.
// See configuration.md for the full design.

import { PMSSParserAdapter, resolve } from 'pmss';
import type { SelectorMatchContext } from 'pmss';
import { SYSTEM_PMSS } from './config.generated';

// Parse once at module load time
const rules = PMSSParserAdapter.parse(SYSTEM_PMSS);

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
