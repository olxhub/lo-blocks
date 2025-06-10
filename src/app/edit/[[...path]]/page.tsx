'use client';

import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { xml } from '@codemirror/lang-xml';
import { useParams } from 'next/navigation';

// This causes CoadMirror not to load on all pages (it gets its own
// chunk for pages that need it).
//
// We use it enough that if this causes problems outside of next.js, it's
// fine to switch to:
// import CodeMirror from '@uiw/react-codemirror';
const CodeMirror = dynamic(() => import('@uiw/react-codemirror').then(mod => mod.default), { ssr: false });

export default function EditPage() {
  const path = (useParams().path || []).join('/');

  // These should move to redux
  const [content, setContent] = useState('');
  const [status, setStatus] = useState('');

  const onChange = useCallback((val, viewUpdate) => {
    setContent(val);
  }, []);

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
    <div className="p-4 space-y-4">
      <div className="font-mono text-sm">Editing: {path}</div>
      <div>
        <CodeMirror value={content} height="400px" extensions={[xml()]} onChange={onChange} />
      </div>
      <button
        onClick={handleSave} className="px-4 py-2 bg-blue-600 text-white rounded"
        disabled={status === 'Saving...'}
      >Save</button>
      {status && <div className="text-sm">{status}</div>}
    </div>
  );
}
