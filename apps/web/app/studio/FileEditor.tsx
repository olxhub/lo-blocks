// apps/web/app/studio/FileEditor.tsx
//
// The editing surface for ONE open file in a selected source. Mounted only when
// both a source and a file are chosen, so its identity — the file's LofsRef —
// is always defined (no "no file open" sentinel, no scratch key). This is the
// precursor to the studio-as-blocks <CodeInput file repo>: a component bound to
// a definite (repo, file).
//
// It owns only the *reactive* content (the CodeEditor + PreviewPane re-render as
// you type). Save, the LLM chat, and dirty indicators live in the parent and
// reach content through the synchronous get/set helpers — so this boundary
// needs no imperative save handle.
//
'use client';

import { useState, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import PreviewPane from '@/components/common/PreviewPane';
import Resizer from '@/components/common/Resizer';
import { DisplayError } from '@/lib/util/debug';
import { toOlxRelativePath } from '@/lib/types/storage';
import { makeAddress, toLofsContentPath } from '@/lib/types/address';
import type { IdMap, ContentNamespace, LofsOrigin, LofsRef } from '@/lib/types';
import type { NetworkStorageProvider } from '@/lib/lofs';
import { STUDIO_NS } from './studioNs';
import { useStudioContent } from './editorState';

const CodeEditor = dynamic(() => import('@/components/common/CodeEditor'), { ssr: false });
import type { CodeEditorHandle } from '@/components/common/CodeEditor';

/** Per-source cache of loaded files, keyed by LofsRef (owned by the parent, shared here). */
export type FileCache = Map<LofsRef, { content: string; metadata: unknown; ns?: ContentNamespace }>;

interface FileEditorProps {
  source: LofsOrigin;
  path: string;
  storage: NetworkStorageProvider;
  idMap: IdMap | null;
  /** Source-scoped loaded-file cache (provenance metadata + namespace). */
  cache: FileCache;
  /** CodeEditor handle for the parent's insert/scroll actions. */
  editorRef: React.Ref<CodeEditorHandle>;
  showPreview: boolean;
  previewLayout: 'horizontal' | 'vertical';
  /** Mirror the live editor content up so the parent can derive dirty and keep
   *  content-derived sidebars (search IDs, docs) in sync. Fires on every change
   *  and on mount/file-switch — the parent owns the reactive content only here. */
  onContentChange: (content: string) => void;
  /** Surface a load error through the parent's notifications. */
  onError: (title: string, message: string) => void;
}

export default function FileEditor({
  source, path, storage, idMap, cache, editorRef,
  showPreview, previewLayout, onContentChange, onError,
}: FileEditorProps) {
  // The file's identity — always defined here (component only mounts with both).
  const fileId = makeAddress(source, toLofsContentPath(path));
  const [content, setContent] = useStudioContent(fileId);
  const [loading, setLoading] = useState(false);

  const mainRef = useRef<HTMLElement>(null);
  const [editorRatio, setEditorRatio] = useState(50);
  const startEditorRatioRef = useRef(50);
  const startContainerSizeRef = useRef(1000);

  // Load content the first time we see this ref. If it's already cached, Redux
  // holds the (possibly edited) content — keep it. (Staleness refresh: TODO.)
  useEffect(() => {
    if (cache.has(fileId)) return;
    setLoading(true);
    let olxPath;
    try {
      olxPath = toOlxRelativePath(path);
    } catch (err) {
      onError(`Invalid file path: ${path}`, err instanceof Error ? err.message : String(err));
      setLoading(false);
      return;
    }
    storage.read(olxPath)
      .then(result => {
        setContent(result.content);
        cache.set(fileId, { content: result.content, metadata: result.metadata, ns: result.ns });
      })
      .catch(err => {
        console.error('Failed to load file:', err);
        onError(`Failed to load ${path}`, err instanceof Error ? err.message : String(err));
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileId]);

  // Mirror content up on every change and on mount/file-switch, so the parent
  // re-renders with the live buffer (dirty state + content-derived sidebars).
  useEffect(() => {
    onContentChange(content);
  }, [content, onContentChange]);

  // Namespace the preview renders in. Until the read returns we don't know it,
  // so fall back to the studio namespace; undefined means the loaded file is
  // outside any namespace (an author-facing problem — show an explanation).
  const saved = cache.get(fileId);
  const previewNs: ContentNamespace | undefined = saved ? saved.ns : STUDIO_NS;

  return (
    <main ref={mainRef} className={`studio-main ${showPreview ? `split ${previewLayout}` : ''}`}>
      <div
        className="studio-editor-pane"
        style={showPreview ? {
          [previewLayout === 'horizontal' ? 'width' : 'height']: `${editorRatio}%`,
          flex: 'none',
        } : undefined}
      >
        {loading && (
          <div className="studio-editor-loading">
            <div className="studio-editor-loading-spinner" />
          </div>
        )}
        <CodeEditor
          ref={editorRef}
          value={content}
          onChange={(value) => setContent(value)}
          path={path}
          height="100%"
        />
      </div>
      {showPreview && (
        <>
          <Resizer
            direction={previewLayout === 'horizontal' ? 'horizontal' : 'vertical'}
            onResizeStart={() => {
              startEditorRatioRef.current = editorRatio;
              const el = mainRef.current;
              startContainerSizeRef.current = el
                ? (previewLayout === 'horizontal' ? el.clientWidth : el.clientHeight)
                : 1000;
            }}
            onResize={(totalDelta) => {
              const deltaPct = (totalDelta / startContainerSizeRef.current) * 100;
              setEditorRatio(Math.max(20, Math.min(80, startEditorRatioRef.current + deltaPct)));
            }}
            className={`studio-pane-resizer ${previewLayout}`}
          />
          <div className="studio-preview-pane">
            <div className="studio-preview-header">Preview</div>
            <div className="studio-preview-content">
              {/* TODO/BUG: Translanguaging auto-translates the preview back to the
                  user's locale. Editing file.pl.olx shows an English preview, defeating
                  the purpose. Studio preview should disable translanguaging or pin locale
                  to the file's language. LanguageSwitcher already has a translanguaging
                  prop — need to thread it through RenderOLX/PreviewPane. */}
              {previewNs === undefined ? (
                <DisplayError
                  title="File has no content namespace"
                  message={
                    `"${path}" is outside any content namespace, so the ` +
                    `content sync will reject it and it cannot be previewed. ` +
                    `Move it into a namespace directory (content/<namespace>/...) ` +
                    `or add a manifest.yaml with a "namespace:" field.`
                  }
                />
              ) : (
                <PreviewPane
                  path={path}
                  content={content}
                  ns={previewNs}
                  idMap={idMap}
                  resolveProvider={storage}
                  provenance={fileId}
                />
              )}
            </div>
          </div>
        </>
      )}
    </main>
  );
}
