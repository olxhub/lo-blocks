// src/lib/state/settings.ts
//
// Application settings - system-level configuration state.
//
// Defines global settings fields that apply across the entire Learning Observer
// application, using system scope for shared access.
//
// Debug settings (settings.debug*):
//   - debugPanel: whether debug panel is visible
//   - debugOverlay: whether block overlays are shown
//   - debugReplayMode: whether replay mode is active
//   - debugReplayEventIndex: which event to replay (-1 = live)
//
// Locale settings (settings.locale):
//   - locale: { code, dir } - full locale context (null = use browser default)
//
// We might move to PMSS in the future.
import { fields } from './fields';
import { scopes } from './scopes';

const settingsFields = fields([
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
]);

// Fields are now directly { fieldName: FieldInfo }
export const settings = settingsFields;

// TODO: The whole pattern of extending settings fields and combining them in storeWrapper
// is convoluted. Settings should be settings. Editor state should be editor state. Those
// should be registered cleanly, perhaps in the settings scope, but not "extended" into each
// other via spaghetti code.
//
// This function is a temporary bridge to avoid breaking existing code.
export const extendSettings = (additionalFields) => settingsFields.extend(additionalFields);
