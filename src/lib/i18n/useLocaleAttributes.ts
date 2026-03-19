'use client';

import { useFieldSelector } from '@/lib/state/redux';
import { settings } from '@/lib/state/settings';

/**
 * React hook that returns HTML attributes for locale (dir and lang).
 *
 * Usage:
 *   const localeAttrs = useLocaleAttributes();
 *   return <div {...localeAttrs}>...</div>;
 *
 * Returns reactive locale attributes from Redux state, automatically updating
 * when locale changes (including during replay).
 *
 * IMPORTANT: This assumes Redux has already been initialized with a locale.
 * Do NOT use this in components that render before locale is set.
 * Use RenderOLX or another component that waits for locale initialization.
 *
 * @returns Object with dir and lang attributes ready for spreading on HTML elements
 */
export function useLocaleAttributes(): { dir: 'ltr' | 'rtl'; lang: string } {
  // For system-scoped settings, props can be null since there's no ID/tag resolution needed
  const locale = useFieldSelector(null, settings.locale) as { code?: string; dir?: 'ltr' | 'rtl' } | undefined;

  return {
    dir: locale?.dir || 'ltr',
    lang: locale?.code || '',
  };
}
