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


import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';

import { FourPaneLayout } from './FourPaneLayout';

import EditorLLMChat from '@/components/chat/EditorLLMChat';
import FileNav from '@/components/navigation/FileNav';
import ComponentNav from '@/components/navigation/ComponentNav';
import SearchNav from '@/components/navigation/SearchNav';
import AppHeader from '@/components/common/AppHeader';
import PreviewPane from '@/components/common/PreviewPane';
import CodeEditor from '@/components/common/CodeEditor';
import Spinner from '@/components/common/Spinner';
import { useRouter, useSearchParams } from 'next/navigation';
import { useReduxState } from '@/lib/state';
import { editorFields } from '../editorFields';
import { NetworkStorageProvider } from '@/lib/storage';
import { ComponentError } from '@/lib/types';
import { DisplayError } from '@/lib/util/debug';

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

  if (!path) return <div className="p-4">No path provided</div>;

  return (
    <div className="p-4 flex flex-col h-full space-y-4">
      <div className="font-mono text-sm">Editing: {path}</div>
      <div className="flex-1">
        <CodeEditor value={content} onChange={onChange} path={path} />
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
      .then(result => {
        setContent(result.content);
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

  // Error display for the right panes
  const errorPane = error ? (
    <div className="p-4">
      <DisplayError
        props={{ id: path || 'editor', tag: 'EditPage' }}
        name="Failed to Load"
        message={error || 'Unknown error'}
        technical={error}
        id="edit_page_error"
      />
    </div>
  ) : null;

  // Preview pane - PreviewPane handles file type detection internally
  const renderPreview = () => {
    if (error) return errorPane;
    if (!content) return <Spinner>Loading preview...</Spinner>;
    return <PreviewPane path={path} content={content} idMap={idMap} />;
  };

  return (
    <div className="flex flex-col h-screen">
      <AppHeader />
      <div className="flex-1 overflow-hidden">
        <FourPaneLayout
          TopLeft={<NavigationPane />}
          TopRight={error ? errorPane : (ready ? <EditControl path={path} content={content} setContent={setContent} handleSave={handleSave} /> : <Spinner>Loading editor...</Spinner>)}
          BottomLeft={<EditorLLMChat path={path} content={content} onApplyEdit={setContent} />}
          BottomRight={renderPreview()}
        />
      </div>
    </div>
  );
}
