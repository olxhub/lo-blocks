// src/components/common/debug/ThemeSync.tsx
//
// Keeps DOM data attributes in sync with Redux theme settings.
// Rendered in StoreWrapperInner so it's always mounted.
//
'use client';

import { useEffect } from 'react';
import { useFieldState, settings } from '@/lib/state';

export default function ThemeSync() {
  const [colorMode] = useFieldState(null, settings.themeColorMode, null, { tag: 'theme_sync' });
  const [theme] = useFieldState(null, settings.themeTheme, null, { tag: 'theme_sync' });
  const [brand] = useFieldState(null, settings.themeBrand, null, { tag: 'theme_sync' });

  useEffect(() => {
    if (colorMode) {
      document.documentElement.setAttribute('data-color-mode', colorMode);
    }
  }, [colorMode]);

  useEffect(() => {
    if (theme) {
      document.documentElement.setAttribute('data-theme', theme);
    }
  }, [theme]);

  useEffect(() => {
    if (brand) {
      document.documentElement.setAttribute('data-brand', brand);
    }
  }, [brand]);

  return null;
}
