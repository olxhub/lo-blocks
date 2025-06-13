// src/components/common/AppHeader.tsx
'use client';

import Link from 'next/link';
import { Home, UserCircle } from 'lucide-react';

export default function AppHeader() {
  return (
    <header className="flex items-center justify-between px-4 py-2 border-b bg-white sticky top-0 z-10">
      <Link href="/" className="flex items-center space-x-1 text-lg font-bold">
        <Home className="w-5 h-5" />
        <span className="hidden sm:inline">Home</span>
      </Link>
      <div className="flex items-center space-x-4">
        <label className="flex items-center space-x-1 text-sm cursor-pointer">
          <input type="checkbox" disabled className="h-4 w-4" />
          <span>Debug</span>
        </label>
        <UserCircle className="w-6 h-6" />
      </div>
    </header>
  );
}
