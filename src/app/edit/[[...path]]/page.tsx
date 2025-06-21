// src/app/edit/[[...path]]/page.tsx
'use client';

// TODO: This is should be disected into individual, compact, general
// components, such as:
//
// <RenderOLXString data={}/> // Which implements all robustness
//
// And similar.
//
// This is very close to being possible to write in OLX itself, which
// would allow us to have students authoring content!


import { useState, useEffect, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { xml } from '@codemirror/lang-xml';
import { useParams } from 'next/navigation';

import Split from "react-split";
import EditorLLMChat from '@/components/chat/EditorLLMChat';
import FileNav from '@/components/navigation/FileNav';
import ComponentNav from '@/components/navigation/ComponentNav';
import SearchNav from '@/components/navigation/SearchNav';
import AppHeader from '@/components/common/AppHeader';
import ErrorBoundary from '@/components/common/ErrorBoundary';
import { useRouter, useSearchParams } from 'next/navigation';
import { useReduxState } from '@/lib/state';
import { editorFields } from '../editorFields';
import { parseOLX } from '@/lib/content/parseOLX';
import { render, makeRootNode } from '@/lib/render';
import { COMPONENT_MAP } from '@/components/componentMap';

// This causes CoadMirror not to load on all pages (it gets its own
// chunk for pages that need it).
//
// We use it enough that if this causes problems outside of next.js, it's
// fine to switch to:
// import CodeMirror from '@uiw/react-codemirror';
const CodeMirror = dynamic(() => import('@uiw/react-codemirror').then(mod => mod.default), { ssr: false });


// We should probably pull this out into its own component file
function EditControl({ path }) {
  const [content, setContent] = useReduxState(
    {},
    editorFields.fieldInfoByField.content,
    '',
    { id: path }
  );
  const [status, setStatus] = useState('');

  const onChange = useCallback((val) => {
    setContent(val);
  }, [setContent]);

  useEffect(() => {
    if (!path) return;
    setStatus('Loading...');

    fetch(`/api/file?path=${encodeURIComponent(path)}`)
      .then(res => res.json())
      .then(data => {
        if (data.ok) {
          setContent(data.content);
          setStatus('');
        } else {
          setStatus(`Error: ${data.error}`);
        }
      })
      .catch(err => setStatus(`Error: ${err.message}`));
  }, [path]);

  const handleSave = async () => {
    setStatus('Saving...');
    try {
      const res = await fetch('/api/file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, content })
      });
      const json = await res.json();
      if (json.ok) setStatus('Saved');
      else setStatus(`Error: ${json.error}`);
    } catch (err) {
      setStatus(`Error: ${err.message}`);
    }
  };

  if (!path) return <div className="p-4">No path provided</div>;

  return (
    <div className="p-4 flex flex-col h-full space-y-4">
      <div className="font-mono text-sm">Editing: {path}</div>
      <div className="flex-1">
        <CodeMirror value={content} height="100%" extensions={[xml()]} onChange={onChange} />
      </div>
      <div>
        <button
          onClick={handleSave} className="px-4 py-2 bg-blue-600 text-white rounded"
          disabled={status === 'Saving...'}
        >Save</button>
        {status && <div className="text-sm">{status}</div>}
      </div>
    </div>
  );
}

// We should probably pull this out into its own component file
function FourPaneLayout({
  Navigation,
  Chat,
  Editor,
  Preview,
}) {
  // You can replace the placeholders with your actual controls/components
  return (
    <div className="h-full w-full">
      {/* Vertical split: Left and Right */}
      <Split
        className="flex h-full"
        sizes={[25, 75]}
        minSize={200}
        gutterSize={6}
        direction="horizontal"
        style={{ display: "flex" }}
      >
        {/* LEFT: Navigation (top), Chat (bottom) */}
        <Split
          className="flex flex-col h-full"
          sizes={[60, 40]}
          minSize={100}
          gutterSize={6}
          direction="vertical"
        >
          <div className="p-2 overflow-auto border-b border-gray-200">
            {Navigation || <div>Navigation</div>}
          </div>
          <div className="p-2 overflow-auto h-full flex flex-col">
            {Chat || <div>Chat</div>}
          </div>
        </Split>
        {/* RIGHT: Editor (top), Preview (bottom) */}
        <Split
          className="flex flex-col h-full"
          sizes={[70, 30]}
          minSize={100}
          gutterSize={6}
          direction="vertical"
        >
          <div className="p-2 overflow-auto border-b border-gray-200 h-full flex flex-col">
            {Editor || <div>Editor</div>}
          </div>
          <div className="p-2 overflow-auto">{Preview || <div>Preview</div>}</div>
        </Split>
      </Split>
    </div>
  );
}

// TODO: This needs to be more robust to internal errors.
//
// Nominally, React Error Boundaries are part of what we want, but
// when we tried, they didn't immediately work as intended, so we cut our
// loses after a timeboxed effort, but it's worth trying again.
//
// We also really should:
// * Save last valid state
// * If errors come up during the real render, revert to it.
//
// We probably want an FSM.
//
// Good way to test this is to remove the tag in render which omits invalid
// HTML tags. An invalid HTML tag triggers errors deep in react.
function PreviewPane({ path }) {
  const [content] = useReduxState(
    {},
    editorFields.fieldInfoByField.content,
    '',
    { id: path }
  );
  const [parsed, setParsed] = useReduxState(
    {},
    editorFields.fieldInfoByField.parsed,
    null,
    { id: path }
  );
  const [idMap, setIdMap] = useState(null);
  const [error, setError] = useState(null);

  // Load base idMap from the server
  useEffect(() => {
    fetch('/api/content/all')
      .then(res => res.json())
      .then(data => {
        if (!data.ok) setError(data.error);
        else setIdMap(data.idMap);
      })
      .catch(err => setError(err.message));
  }, []);

  // Parse content when it changes
  useEffect(() => {
    if (!idMap) return;
    let cancelled = false;
    async function doParse() {
      let candidate;
      try {
        const prov = path ? [`file://${path}`] : [];
        candidate = await parseOLX(content, prov);
      } catch (err) {
        console.log('Preview parse error:', err);
        if (!cancelled) setError('Parse error: ' + (err.message || String(err)));
        return;
      }
      try {
        const merged = { ...idMap, ...candidate.idMap };
        render({
          node: candidate.root,
          idMap: merged,
          nodeInfo: makeRootNode(),
          componentMap: COMPONENT_MAP,
        });
        if (!cancelled) {
          setParsed(candidate);
          setError(null);
        }
      } catch (err) {
        console.log('Preview render error:', err);
        if (!cancelled) setError('Render error: ' + (err.message || String(err)));
      }
    }
    doParse();
    return () => {
      cancelled = true;
    };
  }, [content, idMap]);

  const rendered = useMemo(() => {
    if (!idMap || !parsed) return null;
    try {
      const merged = { ...idMap, ...parsed.idMap };
      return render({
        node: parsed.root,
        idMap: merged,
        nodeInfo: makeRootNode(),
        componentMap: COMPONENT_MAP,
      });
    } catch (err) {
      console.log('Preview render error:', err);
      return null;
    }
  }, [parsed, idMap]);

  try {
    return (
      <ErrorBoundary
        resetKey={parsed}
        handler={(err) => setError('Render error: ' + err.message)}
      >
        <div>
          {error && (
            <pre className="text-red-600 mb-2">Error: {error}</pre>
          )}
          {rendered || (!idMap ? 'Loading...' : 'No valid preview')}
        </div>
      </ErrorBoundary>
    );
  } catch (err) {
    return (<pre className="text-red-600 mb-2">Error: {err.message}</pre>);
  }
}

function NavigationPane() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [mode, setMode] = useState<'files' | 'components' | 'search'>(
    (searchParams.get('nav') as 'files' | 'components' | 'search') || 'files'
  );

  const updateMode = (m: 'files' | 'components' | 'search') => {
    const params = new URLSearchParams(searchParams.toString());
    if (m === 'files') params.delete('nav');
    else params.set('nav', m);
    router.push('?' + params.toString());
    setMode(m);
  };

  return (
    <div className="text-sm space-y-2">
      <div className="flex space-x-2 mb-2">
        <button
          onClick={() => updateMode('files')}
          className={mode === 'files' ? 'font-bold underline' : ''}
        >Files</button>
        <button
          onClick={() => updateMode('components')}
          className={mode === 'components' ? 'font-bold underline' : ''}
        >Components</button>
        <button
          onClick={() => updateMode('search')}
          className={mode === 'search' ? 'font-bold underline' : ''}
        >Search</button>
      </div>
      {mode === 'files' && <FileNav />}
      {mode === 'components' && <ComponentNav />}
      {mode === 'search' && <SearchNav />}
    </div>
  );
}


export default function EditPage() {
  const path = (useParams().path || []).join('/');

  return (
    <div className="flex flex-col h-screen">
      <AppHeader />
      <div className="flex-1 overflow-hidden">
        <FourPaneLayout
          Navigation={<NavigationPane />}
          Editor={<EditControl path={path} />}
          Chat={<EditorLLMChat />}
          Preview={<PreviewPane path={path} />}
        />
      </div>
    </div>
  );
}
