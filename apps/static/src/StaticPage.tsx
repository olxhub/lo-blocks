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
import { parseDefinitionKey, addScope, splitNs } from '@/lib/types/id-grammar';
import { variantMapLocaleEntries } from '@/lib/types/i18n';
import type { Locale } from '@/lib/types';

/**
 * Blocks that lay themselves out against the viewport: a fixed-height shell
 * with their own internal scroll pane (see Course's `.course-container` /
 * `.course-content` in course.css).
 *
 * When one of these is the ROOT of a route, the page shell must not add a
 * scroll region of its own — otherwise the block's viewport-sized box plus the
 * status bar and footer exceed the viewport and the page grows a SECOND
 * scrollbar that scrolls only the chrome. In that case the shell hands its
 * content region to the block (see `.lo-viewport-lock` in course.css) instead
 * of scrolling it.
 *
 * Only the root matters. A Course nested inside a page is not the page.
 */
const VIEWPORT_LOCK_TAGS = new Set(['course', 'studio']);

export default function StaticPage({ definitionKey, title, contentNotice }: { definitionKey: string; title?: string; contentNotice?: string }) {
  const { idMap } = useStaticContent();
  // Manifest routes are namespace-qualified DefinitionKeys ("psych/psych_course").
  const key = parseDefinitionKey(definitionKey);

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
  const entries = variantMapLocaleEntries(variantMap);
  entries.forEach(([variant, olxJson]) => {
    (olxJson.generated ? bestEffort : curated).push(localeFromVariant(variant));
  });

  // All variants of an activity are translations of one block, so they share a
  // tag; the first is representative.
  const rootTag = String(entries[0]?.[1]?.tag ?? '').toLowerCase();
  const viewportLocked = VIEWPORT_LOCK_TAGS.has(rootTag);

  const content = (
    <RenderOLX
      id={addScope(key)}
      ns={splitNs(key).ns}
      baseIdMap={idMap}
      eventContext="static"
    />
  );

  const footer = (
    <footer className="border-t border-gray-200 px-6 py-4 text-xs leading-relaxed space-y-2">
      {contentNotice && <Notice content={contentNotice} />}
      <Notice />
    </footer>
  );

  // The shell is pinned to the viewport and never scrolls; exactly one region
  // inside it does. `min-h-0` is load-bearing: a flex child's default
  // `min-height: auto` refuses to shrink below its content, which would push
  // the column past the viewport and put the scrollbar back on the body.
  return (
    <div className="lo-static-shell flex flex-col h-screen overflow-hidden">
      <StatusBar availableLocales={curated} bestEffortLocales={bestEffort} />
      {viewportLocked ? (
        // The root block scrolls its own panes. Give it the region (positioned,
        // so it can fill it without a percentage-height chain through the
        // block wrappers) and keep the footer below, outside it.
        <>
          <div className="lo-viewport-lock flex-1 min-h-0 relative overflow-hidden">
            {content}
          </div>
          {footer}
        </>
      ) : (
        // Ordinary content flows at its natural height: the region scrolls, and
        // the footer scrolls with it exactly as it did when the body scrolled.
        <div className="lo-static-scroll flex-1 min-h-0 overflow-auto">
          <div className="p-6">{content}</div>
          {footer}
        </div>
      )}
    </div>
  );
}
