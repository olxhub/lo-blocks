// packages/shared/components/common/StatusBar.tsx
//
// The app header — one subtle bar, used by every entry point (apps/web,
// apps/client, apps/static). It deliberately stays out of the way and keeps
// focus on the content: save status on the left, language switcher + user on
// the right. No home link or placeholder chrome.
//
// Connection/save semantics live in ./ConnectionStatus. When nothing persists
// AND there's no language to switch, the bar renders nothing.
//
'use client';
import { useEffect } from 'react';
import { useUser } from '@/lib/state';
import { resolveConfig } from '@/lib/config';
import type { Locale } from '@/lib/types';
import { useConnectionStatus, SaveIndicator, OfflineNotice, FatalNotice, fatalMessage } from './ConnectionStatus';
import LanguageSwitcher, { useVariantTiers, hasLanguageChoices } from './LanguageSwitcher';

interface StatusBarProps {
  // Static builds derive available variants from the idMap and pass them in;
  // web/client leave these undefined and the switcher reads Redux.
  availableLocales?: Locale[];
  bestEffortLocales?: Locale[];
}

export default function StatusBar({ availableLocales, bestEffortLocales }: StatusBarProps = {}) {
  const { saveStatus, persists, offline, fatal } = useConnectionStatus();
  const user = useUser();

  const translanguaging = resolveConfig({}, 'translanguaging') === 'true';
  const tiers = useVariantTiers(availableLocales, bestEffortLocales);
  const showLanguage = hasLanguageChoices(tiers, translanguaging);

  // Warn before leaving with unsaved changes — only meaningful when we persist.
  useEffect(() => {
    if (!persists || saveStatus === 'saved') return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [persists, saveStatus]);

  // Fatal delivery failure (e.g. the server doesn't speak the save protocol —
  // a misdeploy): the client holds its queue but nothing reaches the server.
  // Strongest signal, checked ahead of the transient offline case — banner +
  // dim. Delivery stays best-effort (lo_event keeps the durable queue); the UX
  // just refuses to look saved. See docs/README.md, section "State, Events, and
  // Synchronization" (the requireAck/ack contract).
  //
  // Render user-facing copy (fatalMessage), NOT lo_event's raw fatal.message —
  // that developer diagnostic is already console.error'd inside lo_event and
  // must not reach a student.
  if (fatal) {
    return (
      <div className="sticky top-0 z-50 print:hidden">
        <div className="bg-error text-inverse px-4 py-2 text-sm font-medium flex justify-center">
          <FatalNotice message={fatalMessage(fatal.code)} />
        </div>
        <div className="fixed inset-0 bg-black/20 z-40 pointer-events-none" />
      </div>
    );
  }

  // Persistence dropped: red banner + dim the page to discourage working while
  // changes can't be saved. (offline implies persistence is configured.)
  if (offline) {
    return (
      <div className="sticky top-0 z-50 print:hidden">
        <div className="bg-error text-inverse px-4 py-2 text-sm font-medium flex justify-center">
          <OfflineNotice />
        </div>
        <div className="fixed inset-0 bg-black/20 z-40 pointer-events-none" />
      </div>
    );
  }

  // Nothing to report and nothing to switch → no bar at all.
  if (!persists && !showLanguage) return null;

  // In print we keep only the username (attribution) and drop the chrome.
  // print:static stops the sticky bar from taking its own page.
  return (
    <div className="sticky top-0 z-10 bg-surface/80 backdrop-blur-sm border-b border-subtle px-4 py-1.5 flex items-center justify-between text-xs text-dimmed print:static print:bg-transparent print:backdrop-blur-none print:border-0 print:px-0">
      <span className="print:hidden">
        {persists && <SaveIndicator saveStatus={saveStatus} showLabel />}
      </span>
      <div className="flex items-center gap-3">
        {showLanguage && (
          <span className="print:hidden">
            <LanguageSwitcher
              translanguaging={translanguaging}
              availableLocales={availableLocales}
              bestEffortLocales={bestEffortLocales}
            />
          </span>
        )}
        {persists && <span>{user?.user_id || '(no user)'}</span>}
      </div>
    </div>
  );
}
