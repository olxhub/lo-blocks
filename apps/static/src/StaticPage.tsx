// apps/static/src/StaticPage.tsx
//
// Client component: renders OLX content for a given key.
// Gets the idMap from StaticContentProvider context (loaded once for the whole app).
//
// Language support:
// - Browser language is auto-detected (via useBaselineRuntime -> navigator.language)
// - Best variant is selected automatically (via selectBestVariant BCP 47 matching)
// - LanguageSwitcher shown when 2+ language variants exist in the content
// - <html> lang/dir synced for accessibility and RTL support
//
import { useEffect } from 'react';
import RenderOLX from '@/components/common/RenderOLX';
import Notice from '@/components/common/Notice';
import StatusBar from '@/components/common/StatusBar';
import { useStaticContent } from './StaticContentProvider';
import { useLocaleAttributes } from '@/lib/i18n/useLocaleAttributes';
import { localeFromVariant } from '@/lib/i18n/localeUtils';
import { definitionKeyForRef, parseDefinitionRef, addScope, PLACEHOLDER_NS } from '@/lib/types/id-grammar';
import { variantMapLocaleEntries } from '@/lib/types/i18n';
import type { Locale } from '@/lib/types';

export default function StaticPage({ definitionKey, title, contentNotice }: { definitionKey: string; title?: string; contentNotice?: string }) {
  const { idMap } = useStaticContent();
  const key = definitionKeyForRef(parseDefinitionRef(definitionKey), PLACEHOLDER_NS);

  // Sync <html> lang and dir for accessibility and RTL
  const localeAttrs = useLocaleAttributes();
  useEffect(() => {
    if (localeAttrs.lang) {
      document.documentElement.lang = localeAttrs.lang;
      document.documentElement.dir = localeAttrs.dir;
    }
  }, [localeAttrs.lang, localeAttrs.dir]);

  // Split this activity's variants into curated (human-authored) vs auto-translated.
  // Passed to the header so its language switcher can offer them.
  const variantMap = idMap[key] || {};
  const curated: Locale[] = [];
  const bestEffort: Locale[] = [];
  variantMapLocaleEntries(variantMap)
    .forEach(([variant, olxJson]) => {
      (olxJson.generated ? bestEffort : curated).push(localeFromVariant(variant));
    });

  return (
    <div className="flex flex-col min-h-screen">
      <StatusBar availableLocales={curated} bestEffortLocales={bestEffort} />
      <div className="p-6 flex-1 overflow-auto">
        <RenderOLX
          id={addScope(key)}
          baseIdMap={idMap}
          eventContext="static"
        />
      </div>
      <footer className="border-t border-gray-200 px-6 py-4 text-xs leading-relaxed space-y-2">
        {contentNotice && <Notice content={contentNotice} />}
        <Notice />
      </footer>
    </div>
  );
}
