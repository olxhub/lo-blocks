// src/components/common/AppHeader.tsx
'use client';

import Link from 'next/link';
import { Home, UserCircle } from 'lucide-react';

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
        {user && <UserIcon />}
      </div>
    </header>
  );
}
