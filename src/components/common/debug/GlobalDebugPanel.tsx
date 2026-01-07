// src/components/common/debug/GlobalDebugPanel.tsx
//
// Global debug panel wrapper - handles keyboard shortcut and renders panel.
// Add to root layout for system-wide availability.
//
// Toggle with Ctrl+` (backtick) or ⌘`
//
'use client';

import { useState, useEffect } from 'react';
import DebugPanel from './DebugPanel';

export default function GlobalDebugPanel() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;

      // Toggle debug panel (Ctrl+` or ⌘`)
      if (mod && e.key === '`') {
        e.preventDefault();
        setOpen(p => !p);
      }

      // Escape closes
      if (e.key === 'Escape' && open) {
        setOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  if (!open) return null;

  return <DebugPanel onClose={() => setOpen(false)} />;
}
