// src/components/common/AppHeader.tsx
'use client';

import Link from 'next/link';
import { Home, UserCircle, WifiOff } from 'lucide-react';
import LanguageSwitcher from '@/components/common/LanguageSwitcher';
import { useConnected, useSaved, useUser } from '@/lib/state';

interface AppHeaderProps {
  home?: boolean;
  user?: boolean;
}

function HomeLink() {
  return (
    <Link href="/" className="flex items-center space-x-1 text-lg font-semibold text-secondary hover:text-foreground">
      <Home className="w-4 h-4" />
      <span className="hidden sm:inline">Home</span>
    </Link>
  );
}

function StatusIndicators() {
  const connected = useConnected();
  const saveStatus = useSaved();

  if (connected === null) return null;

  return (
    <div className="flex items-center gap-2">
      {connected && saveStatus === 'modified' && (
        <span className="flex items-center gap-1 text-warning" title="Unsaved changes">
          <span className="w-1.5 h-1.5 rounded-full bg-warning" />
        </span>
      )}
      {connected && (
        <span className="w-1.5 h-1.5 rounded-full bg-success" title="Connected" />
      )}
    </div>
  );
}

function UserDisplay() {
  const currentUser = useUser();
  if (!currentUser) return <UserCircle className="w-4 h-4 text-secondary" />;
  return (
    <span className="flex items-center gap-1 text-secondary text-sm">
      <UserCircle className="w-4 h-4" />
      {currentUser.user_id}
    </span>
  );
}

export default function AppHeader({ home = true, user = true }: AppHeaderProps) {
  const connected = useConnected();
  const offline = connected === false;

  if (offline) {
    return (
      <header className="lo-app-header flex items-center justify-between px-4 py-2 sticky top-0 z-10 bg-error text-inverse shadow-sm">
        <div className="flex items-center space-x-4">
          {home && <HomeLink />}
        </div>
        <div className="flex items-center gap-2 text-sm font-medium">
          <WifiOff className="w-4 h-4" />
          Offline — changes may not be saved
        </div>
      </header>
    );
  }

  return (
    <header className="lo-app-header flex items-center justify-between px-4 py-2 sticky top-0 z-10 bg-surface shadow-sm">
      <div className="flex items-center space-x-4">
        {home && <HomeLink />}
      </div>
      <div className="flex items-center gap-3">
        <StatusIndicators />
        <LanguageSwitcher />
        {user && <UserDisplay />}
      </div>
    </header>
  );
}
