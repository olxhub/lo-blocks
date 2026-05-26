// src/lib/state/settings.ts
//
// System-scope fields — global application state shared across the entire
// Learning Observer application.
//
// This includes both user preferences (debug flags, locale, theme) and
// runtime state (currentUser). All use scopes.system.
//
// Debug fields (system.debug*):
//   - debugPanel: whether debug panel is visible
//   - debugOverlay: whether block overlays are shown
//   - debugReplayMode: whether replay mode is active
//   - debugReplayEventIndex: which event to replay (-1 = live)
//
// Locale fields (system.locale):
//   - locale: { code, dir } - full locale context (null = use browser default)
//
// We might move to PMSS in the future.
import { fields } from './fields';
import { scopes } from './scopes';

const systemFields = fields([
  // Legacy debug toggle (kept for compatibility)
  { name: 'debug', event: 'SET_DEBUG', scope: scopes.system },
  // Debug panel visibility
  { name: 'debugPanel', event: 'SET_DEBUG_PANEL', scope: scopes.system },
  // Block overlay visibility
  { name: 'debugOverlay', event: 'SET_DEBUG_OVERLAY', scope: scopes.system },
  // Replay mode: true when viewing historical state
  { name: 'debugReplayMode', event: 'SET_DEBUG_REPLAY_MODE', scope: scopes.system },
  // Replay event index: -1 = live, 0+ = viewing state after that event
  { name: 'debugReplayEventIndex', event: 'SET_DEBUG_REPLAY_EVENT_INDEX', scope: scopes.system },
  // Locale: { code: 'en-Latn-US', dir: 'ltr' } - null means use browser default
  { name: 'locale', event: 'SET_LOCALE', scope: scopes.system },
  // Theme settings: color mode, theme pack, and brand
  // These control data attributes on <html> and <body> for CSS theming.
  { name: 'themeColorMode', event: 'SET_THEME_COLOR_MODE', scope: scopes.system },
  { name: 'themeTheme', event: 'SET_THEME_THEME', scope: scopes.system },
  { name: 'themeBrand', event: 'SET_THEME_BRAND', scope: scopes.system },
  // Instructor mode: show instructor toolbars on blocks (skip waits, autoadvance, etc.)
  { name: 'instructorMode', event: 'SET_INSTRUCTOR_MODE', scope: scopes.system },
  // Current user identity, resolved by the server and pushed over the WS as
  // `{status:'auth', ...}`. See CurrentUser in types.ts for the full schema.
  // Written by reduxLogger.handleAuth; read by anything needing user identity
  // (persistence keying, display, per-user content selection, etc.).
  { name: 'currentUser', event: 'SET_CURRENT_USER', scope: scopes.system },
]);

export const system = systemFields;

/** @deprecated Use `system` instead — this alias exists for migration. */
export const settings = system;

// TODO: The whole pattern of extending settings fields and combining them in storeWrapper
// is convoluted. Settings should be settings. Editor state should be editor state. Those
// should be registered cleanly, perhaps in the settings scope, but not "extended" into each
// other via spaghetti code.
//
// This function is a temporary bridge to avoid breaking existing code.
export const extendSettings = (additionalFields) => systemFields.extend(additionalFields);
