// lib/config.ts
//
// Application configuration via PMSS (Preference Management Style Sheets).
//
// Call initConfig(pmssSource, classes) before using getConfig/getConfigBool.
// Each app initializes from the appropriate source:
//   - Server: reads config/system.pmss directly
//   - Client: fetches from /api/config at startup
//   - Static: injected at build time via Vite define
//
// Settings resolve via CSS-like specificity rules:
// .client selectors override * defaults, etc.
//
// Usage:
//   import { initConfig, getConfig, getConfigBool } from '@/lib/config';
//   initConfig(pmssString, ['client']);
//   const useWs = getConfigBool('websocket');  // true for client, false for static
//
// Future layers: course overrides.pmss, env rulesets, runtime resolution.
// See configuration.md for the full design.

import { PMSSParserAdapter, resolve } from 'pmss';
import type { SelectorMatchContext } from 'pmss';

type Rules = ReturnType<typeof PMSSParserAdapter.parse>;

let rules: Rules | null = null;
let defaultContext: SelectorMatchContext = { classes: [] };

/**
 * Initialize the config system with a PMSS source string and class context.
 *
 * Must be called before getConfig/getConfigBool. Can be called again to
 * reinitialize (e.g. in tests).
 *
 * @param pmssSource - Raw PMSS text (e.g. contents of system.pmss)
 * @param classes - Class context for resolution (e.g. ['client'], ['static', 'production'])
 */
export function initConfig(pmssSource: string, classes: string[]) {
  rules = PMSSParserAdapter.parse(pmssSource);
  defaultContext = { classes };
}

/**
 * Resolve a PMSS config value as a string.
 *
 * @param key - The config property name (e.g. 'websocket')
 * @param context - Optional override context; defaults to classes from initConfig
 * @returns The resolved value, or null if no matching rule
 */
export function getConfig(key: string, context?: SelectorMatchContext): string | null {
  if (!rules) throw new Error('Config not initialized. Call initConfig() first.');
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

// --- React hooks -------------------------------------------------------------
// Thin wrappers today. When config moves into Redux, these become selectors
// that trigger re-renders on config changes (e.g. toggling debug-panel).

/** React hook: resolve a PMSS config value as a string. */
export function useConfig(key: string, context?: SelectorMatchContext): string | null {
  return getConfig(key, context);
}

/** React hook: resolve a PMSS config value as a boolean. */
export function useConfigBool(key: string, context?: SelectorMatchContext): boolean {
  return getConfigBool(key, context);
}
