// src/components/common/AppHeader.tsx
'use client';

import Link from 'next/link';
import { Home, UserCircle } from 'lucide-react';
import { useSetting } from '@/lib/state/settingsAccess';
import { settings } from '@/lib/state/settings';
import { getTextDirection } from '@/lib/i18n/getTextDirection';
// TODO: Import useBaselineProps from lib/blocks/baselineProps once it's extracted
import { useBaselineProps } from '@/components/common/RenderOLX';

interface AppHeaderProps {
  home?: boolean;
  user?: boolean;
}

// Header styling - subtle gray with shadow for minimal visual separation
// Alternatives that looked good:
//   - bg-gray-50 (solid gray, no shadow)
//   - bg-gradient-to-b from-gray-100 to-white (gradient fade)
const HEADER_STYLE = 'bg-gray-50 shadow-sm';

// Individual header item components
function HomeLink() {
  return (
    <Link href="/" className="flex items-center space-x-1 text-lg font-semibold text-gray-600 hover:text-gray-800">
      <Home className="w-4 h-4" />
      <span className="hidden sm:inline">Home</span>
    </Link>
  );
}

function LocaleSelector() {
  const props = useBaselineProps();
  // HACK: Coerce props to RuntimeProps. System-scoped settings don't actually use props,
  // but useSetting's signature requires it. Future changes to store/logEvent will
  // force us to revisit this. See useBaselineProps comment about prop hierarchy.
  const [locale, setLocale] = useSetting(props as any, settings.locale);

  const localeOptions = [
    { code: 'ar-SA', label: 'Arabic' },
    { code: 'en-KE', label: 'English (Kenya)' },
    { code: 'pl-PL', label: 'Polish' },
    { code: 'es-ES', label: 'Spanish' },
  ];

  return (
    <select
      value={locale?.code || 'en-KE'}
      onChange={(e) => {
        const code = e.target.value;
        setLocale({ code, dir: getTextDirection(code) });
      }}
      className="px-2 py-1 text-sm bg-white border border-gray-300 rounded hover:border-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
    >
      {localeOptions.map((opt) => (
        <option key={opt.code} value={opt.code}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

function UserIcon() {
  return <UserCircle className="w-4 h-4 text-gray-600" />;
}

export default function AppHeader({ home = true, user = true }: AppHeaderProps) {
  return (
    <header className={`flex items-center justify-between px-4 py-2 sticky top-0 z-10 ${HEADER_STYLE}`}>
      <div className="flex items-center space-x-4">
        {home && <HomeLink />}
      </div>
      <div className="flex items-center space-x-4">
        <LocaleSelector />
        {user && <UserIcon />}
      </div>
    </header>
  );
}
