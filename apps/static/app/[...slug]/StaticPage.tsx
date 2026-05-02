// apps/static/app/[...slug]/StaticPage.tsx
//
// Client component: renders OLX content for a given key.
// Gets the idMap from StaticContentProvider context (loaded once for the whole app).
//
// Language support:
// - Browser language is auto-detected (via useBaselineRuntime → navigator.language)
// - Best variant is selected automatically (via selectBestVariant BCP 47 matching)
// - LanguageSwitcher shown when 2+ language variants exist in the content
// - <html> lang/dir synced for accessibility and RTL support
//
'use client';

import { useEffect } from 'react';
import RenderOLX from '@/components/common/RenderOLX';
import LanguageSwitcher from '@/components/common/LanguageSwitcher';
import { useStaticContent } from '../../lib/StaticContentProvider';
import { useLocaleAttributes } from '@/lib/i18n/useLocaleAttributes';
import { toOlxKey } from '@/lib/types/id';
import type { Locale } from '@/lib/types';

export default function StaticPage({ olxKey, title }: { olxKey: string; title?: string }) {
  const { idMap } = useStaticContent();
  const key = toOlxKey(olxKey);

  // Sync <html> lang and dir for accessibility and RTL
  const localeAttrs = useLocaleAttributes();
  useEffect(() => {
    if (localeAttrs.lang) {
      document.documentElement.lang = localeAttrs.lang;
      document.documentElement.dir = localeAttrs.dir;
    }
  }, [localeAttrs.lang, localeAttrs.dir]);

  // Split this activity's variants into curated (human-authored) vs auto-translated
  const variantMap = idMap[key] || {};
  const curated: Locale[] = [];
  const bestEffort: Locale[] = [];
  for (const [variant, olxJson] of Object.entries(variantMap)) {
    (olxJson.generated ? bestEffort : curated).push(variant as Locale);
  }
  const allLocales = [...curated, ...bestEffort];

  return (
    <div className="flex flex-col min-h-screen">
      {allLocales.length > 1 && (
        <header className="flex items-center justify-end px-4 py-2 sticky top-0 z-10 bg-gray-50 shadow-sm">
          <LanguageSwitcher availableLocales={curated} bestEffortLocales={bestEffort} translanguaging={false} />
        </header>
      )}
      <div className="p-6 flex-1 overflow-auto">
        <RenderOLX
          id={key}
          baseIdMap={idMap}
          eventContext="static"
        />
      </div>
    </div>
  );
}
