// src/components/blocks/PEGDevBlock/_PEGDevBlock.jsx
import React from 'react';
import type { RuntimeProps } from '@/lib/types';
import { assertNamedObject } from '@/lib/util/kids';

export function _PEGDevBlock({ kids }: RuntimeProps) {
  assertNamedObject(kids, ['parsed']);
  const parsed = kids.parsed;

  return (
    <div className="border p-4 bg-background text-sm rounded shadow-sm">
      <h3 className="font-semibold mb-2">[Parse Tree]</h3>
      <pre className="text-xs text-secondary bg-muted p-2 rounded overflow-x-auto">
        {JSON.stringify(parsed, null, 2)}
      </pre>
    </div>
  );
}
