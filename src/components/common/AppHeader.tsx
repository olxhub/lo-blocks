// src/components/common/AppHeader.tsx
'use client';

import Link from 'next/link';
import { Home, UserCircle } from 'lucide-react';
import { useReduxCheckbox, settingsFields } from '@/lib/state';

interface AppHeaderProps {
  home?: boolean;
  debug?: boolean;
  user?: boolean;
}

// Individual header item components
function HomeLink() {
  return (
    <Link href="/" className="flex items-center space-x-1 text-lg font-bold">
      <Home className="w-5 h-5" />
      <span className="hidden sm:inline">Home</span>
    </Link>
  );
}

function DebugSwitch() {
  const [, debugProps] = useReduxCheckbox({}, settingsFields.fieldInfoByField.debug, false,
    { id: 'AppHeader', tag: 'AppHeader' }); // HACK.
  return (
    <label className="flex items-center space-x-1 text-sm cursor-pointer">
      <input type="checkbox" className="h-4 w-4" {...debugProps} />
      <span>Debug</span>
    </label>
  );
}

function UserIcon() {
  return <UserCircle className="w-6 h-6" />;
}

export default function AppHeader({ home = true, debug = true, user = true }: AppHeaderProps) {
  return (
    <header className="flex items-center justify-between px-4 py-2 border-b bg-white sticky top-0 z-10">
      <div className="flex items-center space-x-4">
        {home && <HomeLink />}
      </div>
      <div className="flex items-center space-x-4">
        {debug && <DebugSwitch />}
        {user && <UserIcon />}
      </div>
    </header>
  );
}
