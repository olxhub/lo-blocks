// src/lib/state/settings.ts
//
// Application settings - system-level configuration state.
//
// Defines global settings fields that apply across the entire Learning Observer
// application, using system scope for shared access. Currently includes debug
// mode configuration, but can be extended for other system-wide preferences.
//
// We might move to PMSS in the future.
import { fields } from './fields';
import { scopes } from './scopes';

const settingsFields = fields([
  { name: 'debug', event: 'SET_DEBUG', scope: scopes.system }
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
