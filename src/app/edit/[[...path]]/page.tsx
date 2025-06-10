'use client';

import { useSearchParams } from 'next/navigation';
import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { xml } from '@codemirror/lang-xml';
import { useParams } from 'next/navigation';

const CodeMirror = dynamic(() => import('@uiw/react-codemirror').then(mod => mod.default), { ssr: false });

export default function EditPage() {
  const path = (useParams().path || []).join('/');


  const [content, setContent] = useState('');
  const [status, setStatus] = useState('');

  useEffect(() => {
    if (!path) return;
    fetch(`/api/file?path=${encodeURIComponent(path)}`)
      .then(res => res.json())
      .then(data => {
        if (data.ok) {
          setContent(data.content);
        } else {
          setStatus(`Error: ${data.error}`);
        }
      })
      .catch(err => setStatus(`Error: ${err.message}`));
  }, [path]);

  const handleSave = async () => {
    setStatus('Saving...');
    const res = await fetch('/api/file', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, content })
    });
    const json = await res.json();
    if (json.ok) setStatus('Saved');
    else setStatus(`Error: ${json.error}`);
  };

  if (!path) return <div className="p-4">No path provided</div>;

  return (
    <div className="p-4 space-y-4">
      <div className="font-mono text-sm">Editing: {path}</div>
      <div>
        <CodeMirror value={content} height="400px" extensions={[xml()]} onChange={setContent} />
      </div>
      <button onClick={handleSave} className="px-4 py-2 bg-blue-600 text-white rounded">Save</button>
      {status && <div className="text-sm">{status}</div>}
    </div>
  );
}
