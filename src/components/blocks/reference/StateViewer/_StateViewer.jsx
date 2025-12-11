'use client';

// src/components/blocks/reference/StateViewer/_StateViewer.jsx
import React from 'react';
import { useSelector, shallowEqual } from 'react-redux';
import { DisplayError } from '@/lib/util/debug';
import * as idResolver from '@/lib/blocks/idResolver';
import { scopes } from '@/lib/state';

export default function _StateViewer(props) {
  const { target, scope: scopeOverride, kids = '' } = props;

  // Target can come from attribute or children text (like Ref)
  const targetId = target || (typeof kids === 'string' ? kids : String(kids)).trim();

  if (!targetId) {
    return <DisplayError name="StateViewer" message="No target specified. Use target attribute or provide component ID as content." data={{props}} />;
  }

  // Check if target block exists in idMap
  if (!props.idMap || !props.idMap[targetId]) {
    return <DisplayError name="StateViewer" message={`Target block "${targetId}" not found`} data={{targetId, availableIds: Object.keys(props.idMap || {})}} />;
  }

  // Resolve the Redux ID (handles idPrefix for scoped contexts)
  const resolvedId = idResolver.reduxId({ ...props, id: targetId });

  // Determine which scope to look in (default to component)
  const scope = scopeOverride || scopes.component;

  // Select the entire state object for this component
  const componentState = useSelector(
    (state) => state?.application_state?.[scope]?.[resolvedId] || null,
    shallowEqual
  );

  return (
    <div className="state-viewer">
      <div className="state-viewer-header">
        <code>{targetId}</code>
        {resolvedId !== targetId && <span className="resolved-id"> ({resolvedId})</span>}
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
        .resolved-id {
          color: #666;
          font-size: 11px;
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
