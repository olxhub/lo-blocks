// src/app/dynamic-blocks-test/page.tsx
//
// POC test page for dynamic block loading.
// Demonstrates compiling and loading a block at runtime.
//
'use client';

import { useState, useEffect } from 'react';
import { initBlockRuntime, compileAndLoadBlock, getLoadedBlocks } from '@/lib/blocks/dynamicLoader';
import { BLOCK_REGISTRY } from '@/components/blockRegistry';
import PreviewPane from '@/components/common/PreviewPane';

// Example block source - a simple "Hello World" block
const HELLO_BLOCK_SOURCE = {
  'HelloBlock.tsx': `
// HelloBlock.tsx - A simple dynamic block
import { core } from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';
import _HelloBlock from './_HelloBlock';

const HelloBlock = core({
  ...parsers.text(),
  name: 'HelloBlock',
  description: 'A dynamically loaded hello world block',
  component: _HelloBlock,
  requiresUniqueId: false,
});

export default HelloBlock;
`,

  '_HelloBlock.tsx': `
// _HelloBlock.tsx - React component
'use client';

function _HelloBlock(props) {
  const { kids } = props;
  return (
    <div style={{
      padding: '1rem',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      borderRadius: '8px',
      color: 'white',
      fontWeight: 'bold',
    }}>
      Hello from a dynamic block! Content: {kids || '(no content)'}
    </div>
  );
}

export default _HelloBlock;
`,
};

// Example block with state - a toggle/done block
const DONE_BLOCK_SOURCE = {
  'DoneBlock.tsx': `
// DoneBlock.tsx - A completion toggle block
import { core } from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';
import * as state from '@/lib/state';
import { commonFields, fieldSelector } from '@/lib/state';
import _DoneBlock from './_DoneBlock';

export const fields = state.fields([commonFields.value]);

const DoneBlock = core({
  ...parsers.text(),
  name: 'DoneBlock',
  description: 'Simple completion toggle',
  component: _DoneBlock,
  fields,
  getValue: (props, reduxState, id) => fieldSelector(reduxState, { ...props, id }, fields.value, { fallback: false }),
});

export default DoneBlock;
`,

  '_DoneBlock.tsx': `
// _DoneBlock.tsx - React component with state
'use client';
import { useReduxState } from '@/lib/state';

function _DoneBlock({ id, fields, kids }) {
  const [done, setDone] = useReduxState({ id }, fields.value, false);

  return (
    <div style={{ padding: '1rem', border: '2px solid #ccc', borderRadius: '8px' }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={done}
          onChange={(e) => setDone(e.target.checked)}
          style={{ width: '1.2rem', height: '1.2rem' }}
        />
        <span style={{ fontSize: '1.1rem' }}>
          {done ? '✓ Completed' : 'Mark as done'}
        </span>
      </label>
      {kids && <div style={{ marginTop: '0.5rem', color: '#666' }}>{kids}</div>}
    </div>
  );
}

export default _DoneBlock;
`,
};

export default function DynamicBlocksTestPage() {
  const [status, setStatus] = useState<string>('Not started');
  const [error, setError] = useState<string | null>(null);
  const [loadedBlocks, setLoadedBlocks] = useState<string[]>([]);
  const [showPreview, setShowPreview] = useState(false);

  // Initialize runtime on mount
  useEffect(() => {
    initBlockRuntime();
    setStatus('Runtime initialized');
  }, []);

  const handleLoadHelloBlock = async () => {
    setStatus('Compiling HelloBlock...');
    setError(null);
    try {
      const block = await compileAndLoadBlock('HelloBlock', HELLO_BLOCK_SOURCE);
      setStatus(`HelloBlock loaded! Name: ${block.name}`);
      setLoadedBlocks(Array.from(getLoadedBlocks().keys()));
    } catch (e: any) {
      setError(e.message);
      setStatus('Failed');
    }
  };

  const handleLoadDoneBlock = async () => {
    setStatus('Compiling DoneBlock...');
    setError(null);
    try {
      const block = await compileAndLoadBlock('DoneBlock', DONE_BLOCK_SOURCE);
      setStatus(`DoneBlock loaded! Name: ${block.name}`);
      setLoadedBlocks(Array.from(getLoadedBlocks().keys()));
    } catch (e: any) {
      setError(e.message);
      setStatus('Failed');
    }
  };

  const handleLoadBoth = async () => {
    await handleLoadHelloBlock();
    await handleLoadDoneBlock();
  };

  // OLX content using the dynamic blocks
  const testContent = `
<Vertical>
  <HelloBlock id="hello1">
    This content is inside the dynamic block!
  </HelloBlock>

  <DoneBlock id="done1">
    Check this off when you're finished reading.
  </DoneBlock>

  <TextBlock id="static">
    This is a static TextBlock for comparison.
  </TextBlock>
</Vertical>
`;

  return (
    <div style={{ padding: '2rem', maxWidth: '900px', margin: '0 auto' }}>
      <h1 style={{ marginBottom: '1rem' }}>Dynamic Block Loading POC</h1>

      <div style={{ marginBottom: '2rem', padding: '1rem', background: '#f5f5f5', borderRadius: '8px' }}>
        <h2 style={{ marginBottom: '0.5rem' }}>Status</h2>
        <p><strong>Status:</strong> {status}</p>
        {error && <p style={{ color: 'red' }}><strong>Error:</strong> {error}</p>}
        <p><strong>Loaded blocks:</strong> {loadedBlocks.length > 0 ? loadedBlocks.join(', ') : '(none)'}</p>
        <p><strong>Registry has HelloBlock:</strong> {BLOCK_REGISTRY['HelloBlock'] ? 'Yes' : 'No'}</p>
        <p><strong>Registry has DoneBlock:</strong> {BLOCK_REGISTRY['DoneBlock'] ? 'Yes' : 'No'}</p>
      </div>

      <div style={{ marginBottom: '2rem', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
        <button
          onClick={handleLoadHelloBlock}
          style={{ padding: '0.75rem 1.5rem', fontSize: '1rem', cursor: 'pointer' }}
        >
          Load HelloBlock
        </button>
        <button
          onClick={handleLoadDoneBlock}
          style={{ padding: '0.75rem 1.5rem', fontSize: '1rem', cursor: 'pointer' }}
        >
          Load DoneBlock
        </button>
        <button
          onClick={handleLoadBoth}
          style={{ padding: '0.75rem 1.5rem', fontSize: '1rem', cursor: 'pointer' }}
        >
          Load Both
        </button>
        <button
          onClick={() => setShowPreview(!showPreview)}
          style={{ padding: '0.75rem 1.5rem', fontSize: '1rem', cursor: 'pointer' }}
          disabled={loadedBlocks.length === 0}
        >
          {showPreview ? 'Hide Preview' : 'Show Preview'}
        </button>
      </div>

      {showPreview && (
        <div style={{ marginBottom: '2rem' }}>
          <h2 style={{ marginBottom: '1rem' }}>Live Preview</h2>
          <div style={{ border: '1px solid #ccc', borderRadius: '8px', overflow: 'hidden' }}>
            <PreviewPane path="test.olx" content={testContent} />
          </div>
        </div>
      )}

      <div style={{ marginBottom: '2rem' }}>
        <h2 style={{ marginBottom: '1rem' }}>Test Content (OLX)</h2>
        <pre style={{
          background: '#1e1e1e',
          color: '#d4d4d4',
          padding: '1rem',
          borderRadius: '8px',
          overflow: 'auto',
          fontSize: '0.9rem',
        }}>
          {testContent}
        </pre>
      </div>

      <div>
        <h2 style={{ marginBottom: '1rem' }}>Block Source Code</h2>

        <details style={{ marginBottom: '1rem' }}>
          <summary style={{ cursor: 'pointer', fontWeight: 'bold' }}>HelloBlock.tsx</summary>
          <pre style={{
            background: '#1e1e1e',
            color: '#d4d4d4',
            padding: '1rem',
            borderRadius: '8px',
            overflow: 'auto',
            fontSize: '0.85rem',
            marginTop: '0.5rem',
          }}>
            {HELLO_BLOCK_SOURCE['HelloBlock.tsx']}
          </pre>
        </details>

        <details style={{ marginBottom: '1rem' }}>
          <summary style={{ cursor: 'pointer', fontWeight: 'bold' }}>_HelloBlock.tsx</summary>
          <pre style={{
            background: '#1e1e1e',
            color: '#d4d4d4',
            padding: '1rem',
            borderRadius: '8px',
            overflow: 'auto',
            fontSize: '0.85rem',
            marginTop: '0.5rem',
          }}>
            {HELLO_BLOCK_SOURCE['_HelloBlock.tsx']}
          </pre>
        </details>

        <details style={{ marginBottom: '1rem' }}>
          <summary style={{ cursor: 'pointer', fontWeight: 'bold' }}>DoneBlock.tsx</summary>
          <pre style={{
            background: '#1e1e1e',
            color: '#d4d4d4',
            padding: '1rem',
            borderRadius: '8px',
            overflow: 'auto',
            fontSize: '0.85rem',
            marginTop: '0.5rem',
          }}>
            {DONE_BLOCK_SOURCE['DoneBlock.tsx']}
          </pre>
        </details>

        <details>
          <summary style={{ cursor: 'pointer', fontWeight: 'bold' }}>_DoneBlock.tsx</summary>
          <pre style={{
            background: '#1e1e1e',
            color: '#d4d4d4',
            padding: '1rem',
            borderRadius: '8px',
            overflow: 'auto',
            fontSize: '0.85rem',
            marginTop: '0.5rem',
          }}>
            {DONE_BLOCK_SOURCE['_DoneBlock.tsx']}
          </pre>
        </details>
      </div>
    </div>
  );
}
