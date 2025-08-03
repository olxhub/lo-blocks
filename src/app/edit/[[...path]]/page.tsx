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
import { markdown } from '@codemirror/lang-markdown';
import { useParams } from 'next/navigation';

import { FourPaneLayout } from './FourPaneLayout';

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
import { NetworkStorageProvider } from '@/lib/storage/network';
import { fileTypes } from '@/lib/storage/fileTypes';
import { ComponentError } from '@/lib/types';

// This causes CoadMirror not to load on all pages (it gets its own
// chunk for pages that need it).
//
// We use it enough that if this causes problems outside of next.js, it's
// fine to switch to:
// import CodeMirror from '@uiw/react-codemirror';
const CodeMirror = dynamic(() => import('@uiw/react-codemirror').then(mod => mod.default), { ssr: false });

// TODO: This should be a new scope
// We HACK this into useReduxState since it's there
// We also need a redux filesystem overlay
function useEditComponentState(field, provenance, defaultState) {
  return useReduxState(
    {}, // HACK
    field,
    defaultState,
    { id: provenance }  // HACK
  );
}


// We should probably pull this out into its own component file
function EditControl({ content, setContent, handleSave, path }) {
  // This is status text
  // However, we would like this to have a programmatic meaning too:
  // Everything good? Failed to load? Parse error?
  const [status, setStatus] = useState('');

  const onChange = useCallback((val) => {
    setContent(val);
  }, [setContent]);

  const cmExt = useMemo(() => {
    if (!path) return xml();
    // TODO: We should not assume paths. This should handle provenances.
    // Specifically, the provider should be able to take us provenance -> type.
    const ext = path.split('.').pop() ?? '';
    if (ext === fileTypes.xml || ext === fileTypes.olx) return xml();
    if (ext === fileTypes.md) return markdown();
    return undefined;
  }, [path]);

  if (!path) return <div className="p-4">No path provided</div>;

  return (
    <div className="p-4 flex flex-col h-full space-y-4">
      <div className="font-mono text-sm">Editing: {path}</div>
      <div className="flex-1">
        <CodeMirror value={content} height="100%" extensions={cmExt ? [cmExt] : []} onChange={onChange} />
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

// TODO: This needs to be more robust to internal errors.
//
// * Bad OLX can lead to render-time problems which aren't caught by
//   exceptions
// * Nominally, React Error Boundaries are part of what we want, but
//   next.js surfaces even handled errors as issues in the UX
// * We probably want an FSM for the loading / testing / last valid
//   state regardless.
function PreviewPane({ path, content, idMap }) {
  const [parsed, setParsed] = useReduxState(
    {},
    editorFields.fieldInfoByField.parsed,
    null,
    { id: path }
  );
  const [error, setError] = useState<ComponentError>(null);

  // Parse content when it changes
  useEffect(() => {
    let cancelled = false;
    async function doParse() {
      let candidate;
      try {
	// HACK: We should not be manipulating paths directly
        const prov = path ? [`file://${path}`] : [];
        const provider = new NetworkStorageProvider();
        candidate = await parseOLX(content, prov, provider);
      } catch (err) {
        console.log('Preview parse error:', err);
        if (!cancelled) setError('Parse error: ' + (err.message || String(err)));
        return;
      }
      try {
        const merged = { ...idMap, ...candidate.idMap };
        render({
          key: candidate.root,
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
    // setParsed intentionally omitted (stable, but changes); path is too, and we should analyze path later. In either case, we need
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, idMap]);

  const rendered = useMemo(() => {
    if (!idMap || !parsed) return null;
    try {
      const merged = { ...idMap, ...parsed.idMap };
      return render({
        key: parsed.root,
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

  console.log(rendered);
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
    (searchParams.get('nav') as 'files' | 'components' | 'search') ?? 'files'
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
  // Provenance we're editing
  const rawPath = useParams().path;
  const path = Array.isArray(rawPath) ? rawPath.join('/') : rawPath ?? '';
  // Text of file
  const [content, setContent] = useEditComponentState(
    editorFields.fieldInfoByField.content,
    path,
    null,
  );
  const [idMap, setIdMap] = useState(null);
  // TODO: {status: , msg}
  // status: [ LOADING, SAVE_ERROR, SAVED, READY, SYNTAX_ERROR, ... ]
  // msg: Human-friendly message
  const [error, setError] = useState<ComponentError>(null);

  // TODO: Overlay ReduxStorageProvider()
  const provider = new NetworkStorageProvider();
  useEffect(() => {
    if (!path) return;
    provider
      .read(path)
      .then(cnt => {
        setContent(cnt);
      })
      .catch(err => setError(`Error: ${err.message}`));
    // provider and setContent intentionally omitted: provider is stable instance, setContent is stable setState function, so we need
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  // Load base idMap from the server
  useEffect(() => {
    fetch('/api/content/all')
      .then(res => res.json())
      .then(data => {
        if (!data.ok) setError(data.error);
        else setIdMap(data.idMap);
      })
      .catch(err => setError(err.message)); // TODO
  }, []);

  // TODO: Keep track of whether we have unsaved changes
  const handleSave = async () => {
    try {
      await provider.write(path, content);
      // TODO: Show "Saved"
      // TODO: Set dirty bit to false
      // TODO: Reload network / ID Map
    } catch (err) {
      setError(`Error: ${err.message}`);
    }
  };

  const ready = content && idMap;

  return (
    <div className="flex flex-col h-screen">
      <AppHeader />
      <div className="flex-1 overflow-hidden">
        <FourPaneLayout
          TopLeft={<NavigationPane />}
          TopRight={ready ? <EditControl path={path} content={content} setContent={setContent} handleSave={handleSave} /> : "Loading..."}
          BottomLeft={<EditorLLMChat />}
          BottomRight={ready? <PreviewPane path={path} content={content} idMap={idMap}/> : "Loading"}
        />
      </div>
    </div>
  );
}
