'use client';
import type { RuntimeProps } from '@/lib/types';

// src/components/blocks/_Ref.tsx
import React from 'react';
import { useValue } from '@/lib/state';
import { DisplayError } from '@/lib/util/debug';
import Spinner from '@/components/common/Spinner';
import { useBlockTranslation } from '@/lib/i18n/blockI18n';

const VALID_FORMATS = ['code'];

export default function _Ref(props: RuntimeProps) {
  const { visible = true, fallback = '', format } = props;
  const { t } = useBlockTranslation(props);

  // Call Ref's own selectValue via useValue - this is the single source of truth
  // for value formatting, field access, and validation
  const { value, loading, error } = useValue(props, { fallback });

  if (String(visible) === 'false') {
    // Still subscribe to value but render nothing
    return <></>;
  }

  if (loading) {
    return <Spinner>{t('loadingReference')}</Spinner>;
  }

  if (error) {
    return <DisplayError props={props} title="Ref" message={error} />;
  }

  // Validate format attribute if provided
  if (format && !VALID_FORMATS.includes(format)) {
    return <DisplayError props={props} title="Ref" message={`Unknown format "${format}". Valid options: ${VALID_FORMATS.join(', ')}`} />;
  }

  if (format === 'code') {
    return <code style={{ whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>{value}</code>;
  }

  return <span>{value}</span>;
}
