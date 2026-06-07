'use client';
import type { RuntimeProps, FieldInfo } from '@/lib/types';

import { DisplayError } from '@/lib/util/debug';
import { useComponentState } from '@/lib/state';
import { decodeState } from '@/lib/state/stateDisplay';
import { scopedStateKeyForBlock, stateKeyForGlobalRef, parseAnyStateRef } from '@/lib/types/id-grammar';
import { useOlxJson } from '@/lib/blocks/useOlxJson';
import { BLOCK_REGISTRY } from '@/components/blockRegistry';

export default function _StateViewer(props: RuntimeProps) {
  const { target, scope, kids = '' } = props;

  // Target can come from attribute or children text (like Ref)
  const targetId = target || (typeof kids === 'string' ? kids : String(kids)).trim();
  const targetRef = targetId ? parseAnyStateRef(targetId) : null;
  const targetStateKey = targetRef ? stateKeyForGlobalRef(targetRef, props.runtime.ns) : scopedStateKeyForBlock(props);

  // Hooks must be called unconditionally, so call before any early returns
  const { olxJson: targetBlock } = useOlxJson(props, targetId || null);
  const componentState = useComponentState(props, targetStateKey, { scope });

  if (!targetId) {
    return <DisplayError title="StateViewer" message="No target specified. Use target attribute or provide component ID as content." />;
  }

  if (!targetBlock) {
    return <DisplayError title="StateViewer" message={`Target block "${targetId}" not found`} />;
  }

  // Look up field definitions from the block registry
  const blockTag = targetBlock.tag;
  const registryEntry = blockTag ? BLOCK_REGISTRY[blockTag] : undefined;
  const fields = registryEntry?.fields as Record<string, FieldInfo> | undefined;

  // Decode state through field display functions
  const { decoded, meta } = componentState
    ? decodeState(componentState, fields)
    : { decoded: {}, meta: {} };
  const hasDecoded = Object.keys(decoded).length > 0;
  const hasMeta = Object.keys(meta).length > 0;

  return (
    <div style={{ fontFamily: 'monospace', fontSize: '12px', border: '1px solid #ddd', borderRadius: '4px', overflow: 'hidden' }}>
      <div style={{ background: '#f5f5f5', padding: '4px 8px', borderBottom: '1px solid #ddd' }}>
        <code style={{ fontWeight: 'bold' }}>{targetId}</code>
        {blockTag && <span style={{ color: '#888', marginLeft: '8px' }}>{blockTag}</span>}
      </div>
      {componentState === null ? (
        <pre style={{ margin: 0, padding: '8px', background: '#fafafa' }}>
          <span style={{ color: '#999', fontStyle: 'italic' }}>(no state)</span>
        </pre>
      ) : (
        <div style={{ padding: '8px', background: '#fafafa' }}>
          {hasDecoded && (
            <div>
              {Object.entries(decoded).map(([name, display]) => (
                <div key={name} style={{ marginBottom: '2px' }}>
                  <span style={{ color: '#555' }}>{name}: </span>
                  <span>{display || <span style={{ color: '#999', fontStyle: 'italic' }}>(empty)</span>}</span>
                </div>
              ))}
            </div>
          )}
          {hasMeta && (
            <details style={{ marginTop: hasDecoded ? '4px' : 0 }}>
              <summary style={{ cursor: 'pointer', color: '#888', fontSize: '11px' }}>
                raw ({Object.keys(meta).length} metadata keys)
              </summary>
              <pre style={{ margin: '4px 0 0', fontSize: '11px', color: '#666', overflowX: 'auto' }}>
                {JSON.stringify(meta, null, 2)}
              </pre>
            </details>
          )}
          {!hasDecoded && !hasMeta && (
            <pre style={{ margin: 0, overflowX: 'auto' }}>
              {JSON.stringify(componentState, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
