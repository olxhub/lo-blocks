'use client';
// packages/shared/components/blocks/authoring/DocAttributes/_DocAttributes.tsx

import React from 'react';
import type { RuntimeProps } from '@/lib/types';
import type { AttributeDoc } from '@/lib/docs/schemaUtils';
import { useDocs } from '@/lib/docs/useDocs';
import Spinner from '@/components/common/Spinner';
import { AttributesSection } from '../BlockDoc/docPanels';

export default function _DocAttributes(props: RuntimeProps) {
  const name = typeof props.block === 'string' ? props.block : '';
  const { blocks, loading, error } = useDocs([name], ['attributes']);

  if (error) return <div className="text-error text-sm p-2">Failed to load attributes: {error}</div>;
  if (loading) return <Spinner>Loading attributes…</Spinner>;

  const block = blocks.find(b => b.name === name);
  if (!block?.attributes?.length) {
    return <p className="text-dimmed py-2">No attribute documentation for {name}.</p>;
  }
  return <AttributesSection attributes={block.attributes as AttributeDoc[]} />;
}
