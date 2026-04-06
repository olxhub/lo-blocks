// src/components/common/AppHeader.tsx
'use client';

import Link from 'next/link';
import { Home, UserCircle } from 'lucide-react';
import LanguageSwitcher from '@/components/common/LanguageSwitcher';

interface AppHeaderProps {
  home?: boolean;
  user?: boolean;
}

// Header styling - uses semantic tokens for theme-awareness
const HEADER_STYLE = 'bg-surface shadow-sm';

// Individual header item components
function HomeLink() {
  return (
    <Link href="/" className="flex items-center space-x-1 text-lg font-semibold text-secondary hover:text-foreground">
      <Home className="w-4 h-4" />
      <span className="hidden sm:inline">Home</span>
    </Link>
  );
}

function UserIcon() {
  return <UserCircle className="w-4 h-4 text-secondary" />;
}

export default function AppHeader({ home = true, user = true }: AppHeaderProps) {
  return (
    <header className={`lo-app-header flex items-center justify-between px-4 py-2 sticky top-0 z-10 ${HEADER_STYLE}`}>
      <div className="flex items-center space-x-4">
        {home && <HomeLink />}
      </div>
      <div className="flex items-center space-x-4">
        <LanguageSwitcher />
        {user && <UserIcon />}
      </div>
    </header>
  );
}
