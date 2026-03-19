// src/components/common/debug/GlobalDebugPanel.tsx
//
// Global debug panel wrapper - handles keyboard shortcut and renders panel.
// Add to root layout for system-wide availability.
//
// Toggle with Ctrl+` (backtick) or ⌘`
//
'use client';

import { useEffect, useCallback } from 'react';
import { useDebugSettings } from '@/lib/state/debugSettings';
import DebugPanel from './DebugPanel';

export default function GlobalDebugPanel() {
  const { panelOpen, setPanelOpen } = useDebugSettings();

  const handleClose = useCallback(() => {
    setPanelOpen(false);
  }, [setPanelOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;

      // Toggle debug panel (Ctrl+` or ⌘`)
      if (mod && e.key === '`') {
        e.preventDefault();
        setPanelOpen(!panelOpen);
      }

      // Escape closes
      if (e.key === 'Escape' && panelOpen) {
        setPanelOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [panelOpen, setPanelOpen]);

  if (!panelOpen) return null;

  return <DebugPanel onClose={handleClose} />;
}
