/**
 * Settings access layer - forward-compatible with PMSS-style cascading configuration.
 *
 * Currently: Simple Redux KVS backend.
 * Future: Cascading rule resolution with attributes (school, user, context, etc.)
 *
 * The call signature is designed to support context-aware resolution:
 * - useSetting(props, 'localeCode', { school: 'kaust' }) → resolves with attributes
 * - Later can match against rules: if school='kaust' then locale='ar-Arab-SA'
 *
 * Access patterns:
 * - selectSetting(state, key, attrs?) - Redux selector (pure, takes state directly)
 * - useSetting(props: BaselineProps, key, attrs?) - React hook for components
 * - getSetting(props: SettingsProps, key, attrs?) - Direct access for non-React code
 */

import { useSelector } from 'react-redux';
import type { Store } from 'redux';
import type { RuntimeProps, BaselineProps, FieldInfo } from '@/lib/types';
import { useFieldState } from './redux';

/**
 * Context attributes for cascading setting resolution.
 *
 * These represent conditions that can match against configuration rules.
 * Examples:
 *   { school: 'mit', user: '123', mode: 'replay' }
 *   { region: 'middle-east', locale: 'ar-Arab-SA' }
 *
 * In PMSS: rules match against these attributes via CSS-like selectors.
 */
export interface SettingAttributes {
  [key: string]: string | number | boolean | null;
}

/**
 * Minimal interface for settings access outside React components.
 *
 * TODO: Deprecated by BaselineProps. getSetting should accept BaselineProps
 * and access props.runtime.store instead of props.store. Remove SettingsProps
 * once getSetting is updated (currently has no callers, so low urgency).
 */
export interface SettingsProps {
  store: Store;
}

/**
 * Redux selector: extract a setting value from state.
 *
 * @param state - Redux application state
 * @param field - Field definition with name property (from settings object)
 * @param attributes - Optional context for cascading resolution (currently unused, for future PMSS integration)
 * @returns Setting value or undefined if not set
 */
export function selectSetting(state: any, field: { name: string }, attributes?: SettingAttributes): any {
  // TODO: Once PMSS-style resolver is available, use attributes to match against rules
  // For now: simple KVS lookup, attributes are ignored
  return state?.settings?.[field.name];
}

/**
 * React hook: read/write a setting value from Redux state.
 *
 * Thin wrapper around useFieldState for system-scoped settings fields.
 * Settings are registered as regular fields with scope: scopes.system.
 *
 * Usage:
 *   const [locale, setLocale] = useSetting(props, settings.locale)
 *   const [locale, setLocale] = useSetting(props, settings.locale, { school: 'kaust' })
 *   const [locale, setLocale] = useSetting(null, settings.locale)  // HACK: props optional until PMSS integration
 *
 * @param props - BaselineProps (contains runtime.logEvent, runtime.store). Also accepts RuntimeProps which extends BaselineProps.
 * @param field - FieldInfo for the setting (e.g., settings.locale)
 * @param attributes - Optional context for cascade matching (reserved for future PMSS integration, currently unused)
 * @returns Tuple of [value, setter] where setter updates Redux state
 */
export function useSetting(props: BaselineProps | null | undefined, field: FieldInfo, attributes?: SettingAttributes): [any, (value: any) => void] {
  // TODO: When PMSS-style cascading is implemented, use attributes to select among matching rules
  // For now: attributes parameter is reserved but unused
  return useFieldState(props ?? null, field, undefined, {}) as [any, (value: any) => void];
}

/**
 * Direct access: read a setting from a props-like object with store.
 *
 * Usage:
 *   const locale = getSetting(props, settings.locale)
 *   const locale = getSetting(props, settings.locale, { school: 'kaust' })
 *
 * Used in non-React contexts or when you already have a props-like object.
 *
 * TODO: Migrate to accept BaselineProps and use props.runtime.store.
 * The `SettingsProps | any` type is meaningless (collapses to any).
 * No callers exist yet, so this can be fixed when first used.
 *
 * @param props - SettingsProps (contains store), BaselineProps, or RuntimeProps
 * @param field - Field definition with name property (from settings object)
 * @param attributes - Optional context for cascade matching
 * @returns Setting value or undefined if not set
 */
export function getSetting(props: SettingsProps | any, field: { name: string }, attributes?: SettingAttributes): any {
  return selectSetting(props.store.getState(), field, attributes);
}
