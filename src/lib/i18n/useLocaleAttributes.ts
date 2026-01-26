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
 * @returns Object with dir and lang attributes ready for spreading on HTML elements
 */
export function useLocaleAttributes() {
  // For system-scoped settings, props can be null since there's no ID/tag resolution needed
  const locale = useFieldSelector(null, settings.locale, {
    fallback: { code: 'en-KE', dir: 'ltr' }
  });

  return {
    dir: locale?.dir || 'ltr',
    lang: locale?.code || 'en-KE',
  };
}
