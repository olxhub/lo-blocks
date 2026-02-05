// src/components/common/LanguageSwitcher.tsx
//
// Language selector with three-tier UI:
// 1. Supported - curated languages available for current content + browser language
// 2. Best-Effort - autotranslated languages available for current content
// 3. Translanguaging - search all BCP 47 languages + custom code input
//
'use client';

import { useState, useMemo } from 'react';
import { useSelector, shallowEqual } from 'react-redux';
import { useSetting } from '@/lib/state/settingsAccess';
import { settings } from '@/lib/state/settings';
import { getTextDirection, getBrowserLocale } from '@/lib/i18n/getTextDirection';
import { selectVariantTiers } from '@/lib/state/olxjson';
import { useLocaleAttributes } from '@/lib/i18n/useLocaleAttributes';
import { useBaselineProps } from '@/components/common/RenderOLX';
import { ALL_LANGUAGES, getLanguageLabel, filterLanguages } from '@/lib/i18n/languages';

interface LanguageSwitcherProps {
  className?: string;
  sources?: string[];  // Which sources to scan for available variants (defaults to all)
  availableLocales?: string[];  // Optional: explicit list of available variants (e.g., from activities)
}

/**
 * TODO:
 *
 * Current design: LanguageSwitcher is self-contained - calls useBaselineProps()
 * internally to initialize Redux locale. This works well but prevents detecting
 * available language variants from currently-rendered content.
 *
 * Future enhancement (when implementing variant discovery):
 * - Call baselineProps in the top-level page
 * - Accept baselineProps and availableVariants as props from parent
 * - Parent (e.g., RenderOLX) can detect variants from rendered content
 * - This enables LanguageSwitcher to show variants available on current page
 * - See: docs/architecture/identify-ids-on-page.md (Option B approach)
 *
 * This would allow all OLX on a page to interact via the dynamic OLX DOM!
 */

export default function LanguageSwitcher({ className = '', sources, availableLocales }: LanguageSwitcherProps) {
  const [showDropdown, setShowDropdown] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Initialize Redux locale (ensures Redux has locale before any locale-dependent code runs)
  const baselineProps = useBaselineProps();

  // Read current locale from Redux
  const localeAttrs = useLocaleAttributes();
  const localeCode = localeAttrs.lang;

  // Get setter for locale changes - properly typed, no type cast needed
  const [, setLocale] = useSetting(baselineProps, settings.locale);

  // Get available variants from either explicit prop or Redux selector
  // Note: selectVariantTiers scans all sources; sources prop is ignored when using Redux
  // Memoize the selector result to prevent infinite re-renders (selector returns new object reference)
  const olxjson = useSelector((state: any) => state.application_state?.olxjson);
  const reduxTiers = useMemo(() => {
    if (!olxjson) return { curated: [], bestEffort: [], all: [] };
    return selectVariantTiers({ application_state: { olxjson } } as any);
  }, [olxjson]);

  const tiers = availableLocales
    ? { curated: availableLocales, bestEffort: [], all: availableLocales }
    : reduxTiers;

  const browserLanguage = getBrowserLocale();

  // Filter translanguaging options
  const filteredTransLanguages = filterLanguages(searchTerm);

  /**
   * Parse code and display name from language option label
   * Label format: "code - Display Name" or just display name if from search
   */
  function parseLanguageLabel(option: any): { code: string; displayName: string } {
    // If this is a LanguageOption from our list, use code directly
    if (option.code && typeof option === 'object') {
      // Extract display name from label (format: "code - display name")
      const parts = option.label.split(' - ');
      return {
        code: option.code,
        displayName: parts[1] || option.label
      };
    }
    // Fallback for other cases
    return { code: option, displayName: getLanguageLabel(option) };
  }

  const handleSelectLocale = (code: string) => {
    setLocale({ code, dir: getTextDirection(code) });
    setShowDropdown(false);
    setSearchTerm('');
  };

  const handleCustomInput = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && searchTerm.trim()) {
      handleSelectLocale(searchTerm.trim());
    }
  };

  return (
    <div className={`relative inline-block ${className}`}>
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        className="px-2 py-1 text-sm bg-white border border-gray-300 rounded hover:border-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
      >
        {getLanguageLabel(localeCode, 'en', 'short')}
      </button>

      {showDropdown && (
        <div className="absolute top-full end-0 mt-1 w-96 bg-white border border-gray-300 rounded shadow-lg z-50">
          <div className="max-h-96 overflow-y-auto font-mono text-sm">
            {/* Browser Language - Always show */}
            {browserLanguage && (
              <div className="border-b">
                <div className="px-3 py-2 text-xs font-semibold text-blue-600 uppercase bg-blue-50">
                  🌐 Browser Language
                </div>
                {(() => {
                  const label = getLanguageLabel(browserLanguage);
                  const parts = label.split(' - ');
                  const displayName = parts[1] || label;
                  return (
                    <button
                      onClick={() => handleSelectLocale(browserLanguage)}
                      className={`w-full text-left px-3 py-1.5 hover:bg-blue-50 flex justify-between items-center ${localeCode === browserLanguage ? 'bg-blue-100 font-semibold' : ''
                        }`}
                    >
                      <span className="font-sans">{displayName}</span>
                      <span className="text-xs text-gray-500 font-mono ms-4 flex-shrink-0">({browserLanguage})</span>
                    </button>
                  );
                })()}
              </div>
            )}

            {/* Supported Languages (Curated) */}
            {tiers.curated.length > 0 && (
              <div className={browserLanguage ? 'border-t' : ''}>
                <div className="px-3 py-2 text-xs font-semibold text-green-700 uppercase bg-green-50">
                  ✓ Available for This Content
                </div>
                {tiers.curated.map((code) => {
                  if (code === browserLanguage) return null;
                  const label = getLanguageLabel(code);
                  const parts = label.split(' - ');
                  const displayName = parts[1] || label;
                  return (
                    <button
                      key={code}
                      onClick={() => handleSelectLocale(code)}
                      className={`w-full text-left px-3 py-1.5 hover:bg-green-50 flex justify-between items-center ${localeCode === code ? 'bg-green-100 font-semibold' : ''
                        }`}
                    >
                      <span className="font-sans">{displayName}</span>
                      <span className="text-xs text-gray-500 font-mono ms-4 flex-shrink-0">({code})</span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Best-Effort Languages (Autotranslated) */}
            {tiers.bestEffort.length > 0 && (
              <div className={tiers.curated.length > 0 || browserLanguage ? 'border-t' : ''}>
                <div className="px-3 py-2 text-xs font-semibold text-amber-700 uppercase bg-amber-50">
                  ⚠ Auto-translated
                </div>
                {tiers.bestEffort.map((code) => {
                  const label = getLanguageLabel(code);
                  const parts = label.split(' - ');
                  const displayName = parts[1] || label;
                  return (
                    <button
                      key={code}
                      onClick={() => handleSelectLocale(code)}
                      className={`w-full text-left px-3 py-1.5 hover:bg-amber-50 flex justify-between items-center ${localeCode === code ? 'bg-amber-100 font-semibold' : ''
                        }`}
                    >
                      <span className="font-sans">{displayName}</span>
                      <span className="text-xs text-gray-500 font-mono ms-4 flex-shrink-0">({code})</span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Translanguaging - Search All Languages */}
            <div className={`border-t`}>
              <div className="px-3 py-2 text-xs font-semibold text-gray-700 uppercase">
                🌍 Translanguaging
              </div>
              <div className="px-3 py-2">
                <input
                  type="text"
                  placeholder="Search or enter code..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onKeyDown={handleCustomInput}
                  className="w-full px-2 py-1 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
                  autoFocus
                />
              </div>
              <div className="max-h-40 overflow-y-auto px-3">
                {filteredTransLanguages.slice(0, 15).map((lang) => {
                  const parts = lang.label.split(' - ');
                  const displayName = parts[1] || lang.label;
                  return (
                    <button
                      key={lang.code}
                      onClick={() => handleSelectLocale(lang.code)}
                      className={`w-full text-left px-2 py-1.5 rounded hover:bg-gray-50 flex justify-between items-center ${localeCode === lang.code ? 'bg-gray-100 font-semibold' : ''
                        }`}
                    >
                      <span className="font-sans">{displayName}</span>
                      <span className="text-xs text-gray-500 font-mono ms-4 flex-shrink-0">({lang.code})</span>
                    </button>
                  );
                })}
              </div>
              <div className="text-xs text-gray-500 px-3 py-2 border-t">
                Type language code or name, press Enter
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
