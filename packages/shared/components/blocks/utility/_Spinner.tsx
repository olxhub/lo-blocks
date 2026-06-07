// packages/shared/components/blocks/utility/_Spinner.tsx
'use client';
import type { RuntimeProps } from '@/lib/types';
import React from 'react';
import { CssSpinner } from '@/components/common/Spinner';

/**
 * Block wrapper around CssSpinner for use as a fallback while blocks load.
 */
function _Spinner(_props?: Partial<RuntimeProps>) {
  return <CssSpinner />;
}

export default _Spinner;
