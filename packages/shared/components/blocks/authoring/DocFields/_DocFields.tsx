'use client';
// packages/shared/components/blocks/authoring/DocFields/_DocFields.tsx

import React from 'react';
import type { RuntimeProps } from '@/lib/types';
import { useDocs } from '@/lib/docs/useDocs';
import Spinner from '@/components/common/Spinner';
import { FieldsSection } from '../BlockDoc/docPanels';

export default function _DocFields(props: RuntimeProps) {
  const name = typeof props.block === 'string' ? props.block : '';
  const { blocks, loading, error } = useDocs([name], ['fields']);

  if (error) return <div className="text-error text-sm p-2">Failed to load fields: {error}</div>;
  if (loading) return <Spinner>Loading fields…</Spinner>;

  const block = blocks.find(b => b.name === name);
  if (!block?.fields?.length) {
    return <p className="text-dimmed py-2">No field documentation for {name}.</p>;
  }
  return <FieldsSection fields={block.fields} />;
}
