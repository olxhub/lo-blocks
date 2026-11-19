'use client';
import type { RuntimeProps } from '@/lib/types';

// _Ref.tsx
// Future: make this the single source of truth for rendering and the Zod enum.
// const formatRenderers = {
//   code: value => <code style={{ whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>{value}</code>,
//   text: value => <span style={{ whiteSpace: 'pre-wrap' }}>{value}</span>,
// };
import React from 'react';
import { useValue } from '@/lib/state';
import { DisplayError } from '@/lib/util/debug';
import Spinner from '@/components/common/Spinner';
import { useBlockTranslation } from '@/lib/i18n/blockI18n';

export default function Ref(props: RuntimeProps) {
  const { visible = true, fallback = '', format } = props;
  const { t } = useBlockTranslation(props);

  // Call Ref's own selectors.value via useValue - this is the single source of truth
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

  if (format === 'code') {
    return <code style={{ whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>{value}</code>;
  }

  // Prose a student typed, shown as they typed it: line and paragraph breaks
  // kept, no Markdown parsing, ordinary font. The value is plain DOM text, so
  // it is selectable and copyable and never editable.
  if (format === 'text') {
    return <span style={{ whiteSpace: 'pre-wrap' }}>{value}</span>;
  }

  return <span>{value}</span>;
}
