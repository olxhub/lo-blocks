'use client';

// src/components/blocks/reference/StateViewer/_StateViewer.jsx
import React from 'react';
import { DisplayError } from '@/lib/util/debug';
import { useComponentState } from '@/lib/state';
import { useOlxJson } from '@/lib/blocks/useOlxJson';

export default function _StateViewer(props) {
  const { target, scope, kids = '' } = props;

  // Target can come from attribute or children text (like Ref)
  const targetId = target || (typeof kids === 'string' ? kids : String(kids)).trim();

  // Hooks must be called unconditionally, so call before any early returns
  const { olxJson: targetBlock } = useOlxJson(props, targetId || '_invalid_');
  const componentState = useComponentState(props, targetId, { scope });

  if (!targetId) {
    return <DisplayError name="StateViewer" message="No target specified. Use target attribute or provide component ID as content." />;
  }

  if (!targetBlock) {
    return <DisplayError name="StateViewer" message={`Target block "${targetId}" not found`} />;
  }

  return (
    <div style={{ fontFamily: 'monospace', fontSize: '12px', border: '1px solid #ddd', borderRadius: '4px', overflow: 'hidden' }}>
      <div style={{ background: '#f5f5f5', padding: '4px 8px', borderBottom: '1px solid #ddd' }}>
        <code style={{ fontWeight: 'bold' }}>{targetId}</code>
      </div>
      <pre style={{ margin: 0, padding: '8px', background: '#fafafa', overflowX: 'auto' }}>
        {componentState === null
          ? <span style={{ color: '#999', fontStyle: 'italic' }}>(no state)</span>
          : JSON.stringify(componentState, null, 2)
        }
      </pre>
    </div>
  );
}
