'use client';

// src/components/blocks/reference/StateViewer/_StateViewer.jsx
import React from 'react';
import { DisplayError } from '@/lib/util/debug';
import { useComponentState } from '@/lib/state';

export default function _StateViewer(props) {
  const { target, scope, kids = '' } = props;

  // Target can come from attribute or children text (like Ref)
  const targetId = target || (typeof kids === 'string' ? kids : String(kids)).trim();

  if (!targetId) {
    return <DisplayError name="StateViewer" message="No target specified. Use target attribute or provide component ID as content." />;
  }

  // Check if target block exists in idMap
  if (!props.idMap || !props.idMap[targetId]) {
    return <DisplayError name="StateViewer" message={`Target block "${targetId}" not found`} />;
  }

  const componentState = useComponentState(props, targetId, { scope });

  return (
    <div className="state-viewer">
      <div className="state-viewer-header">
        <code>{targetId}</code>
      </div>
      <pre className="state-viewer-content">
        {componentState === null
          ? <span className="state-empty">(no state)</span>
          : JSON.stringify(componentState, null, 2)
        }
      </pre>
      <style jsx>{`
        .state-viewer {
          font-family: monospace;
          font-size: 12px;
          border: 1px solid #ddd;
          border-radius: 4px;
          overflow: hidden;
        }
        .state-viewer-header {
          background: #f5f5f5;
          padding: 4px 8px;
          border-bottom: 1px solid #ddd;
        }
        .state-viewer-header code {
          font-weight: bold;
        }
        .state-viewer-content {
          margin: 0;
          padding: 8px;
          background: #fafafa;
          overflow-x: auto;
        }
        .state-empty {
          color: #999;
          font-style: italic;
        }
      `}</style>
    </div>
  );
}
