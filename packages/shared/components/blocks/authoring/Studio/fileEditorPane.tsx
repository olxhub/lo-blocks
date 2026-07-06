'use client';
// packages/shared/components/blocks/authoring/Studio/fileEditorPane.tsx
//
// The editing surface for ONE open file in a selected source — ported from
// apps/web/app/studio/FileEditor.tsx. Mounted only when both a source and a
// file are chosen, so its identity — the file's LofsRef — is always defined.
//
// It owns only the *reactive* content (the CodeEditor + PreviewPane re-render
// as you type). Save, the LLM chat, and dirty indicators live in the parent
// and reach content through the synchronous get/set helpers (editorContent.ts),
// so this boundary needs no imperative save handle.
//
// Vite-native: CodeEditor imports directly (the Studio component itself loads
// lazily via componentLoader, so codemirror stays out of the eager graph).

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { EditorView } from '@codemirror/view';
import PreviewPane from '@/components/common/PreviewPane';
import Resizer from '@/components/common/Resizer';
import CodeEditor, { type CodeEditorHandle } from '@/components/common/CodeEditor';
import { DisplayError } from '@/lib/util/debug';
import { toOlxRelativePath } from '@/lib/types/storage';
import { makeAddress, toLofsContentPath } from '@/lib/types/address';
import type { ContentNamespace, LofsOrigin, LofsRef } from '@/lib/types';
import type { NetworkStorageProvider } from '@/lib/lofs';
import { STUDIO_NS } from './studioNs';
import { useStudioContent } from './editorContent';

/** Per-source cache of loaded files, keyed by LofsRef (owned by the parent,
 *  shared here). Holds the saved snapshot: content for dirty derivation,
 *  metadata for conflict-detecting saves, ns for the preview namespace. */
export type FileCache = Map<LofsRef, { content: string; metadata: unknown; ns?: ContentNamespace }>;

/** The innermost open block tag enclosing `pos` — a stack scan over the
 *  tags before the cursor. Only PascalCase (block) tags count; lowercase
 *  HTML-ish tags are skipped. Null at the top level. */
export function enclosingBlockTag(text: string, pos: number): string | null {
  const stack: string[] = [];
  const tagRe = /<(\/?)([A-Za-z]\w*)((?:[^"'>]|"[^"]*"|'[^']*')*?)(\/?)>/g;
  const before = text.slice(0, pos);
  let m;
  while ((m = tagRe.exec(before)) !== null) {
    const [, closing, tag, , selfClosing] = m;
    if (selfClosing) continue;
    if (closing) {
      // Pop to the matching open tag (tolerates malformed nesting).
      const at = stack.lastIndexOf(tag);
      if (at !== -1) stack.length = at;
    } else {
      stack.push(tag);
    }
  }
  for (let i = stack.length - 1; i >= 0; i--) {
    if (/^[A-Z]/.test(stack[i])) return stack[i];
  }
  return null;
}

interface FileEditorPaneProps {
  source: LofsOrigin;
  path: string;
  storage: NetworkStorageProvider;
  cache: FileCache;
  /** CodeEditor handle for the parent's insert/scroll actions. */
  editorRef: React.Ref<CodeEditorHandle>;
  showPreview: boolean;
  previewLayout: 'horizontal' | 'vertical';
  /** Fires when the block tag enclosing the cursor changes (null at top
   *  level) — drives the docs panel's context-sensitive reference. */
  onCursorTag?: (tag: string | null) => void;
  /** Surface a load error through the parent's notifications. */
  onError: (title: string, message: string) => void;
}

export default function FileEditorPane({
  source, path, storage, cache, editorRef,
  showPreview, previewLayout, onCursorTag, onError,
}: FileEditorPaneProps) {
  // The file's identity — always defined here (component only mounts with both).
  const fileId = makeAddress(source, toLofsContentPath(path));
  const [content, setContent] = useStudioContent(fileId);
  // useState-ok: in-flight fetch status — replay-correct home is the
  // event-logged file slice (with the file-ops MCP-ization, backlog).
  const [loading, setLoading] = useState(false);

  const mainRef = useRef<HTMLElement>(null);
  // useState-ok: drag-resize ratio, updates continuously during mouse drag.
  const [editorRatio, setEditorRatio] = useState(50);

  // Cursor-context reporting: selection changes are per-keystroke, so the
  // listener computes the enclosing tag and reports only when it CHANGES —
  // the field write (parent) stays change-frequency, not cursor-frequency.
  const lastTagRef = useRef<string | null>(null);
  const onCursorTagRef = useRef(onCursorTag);
  onCursorTagRef.current = onCursorTag;
  const cursorExtension = useMemo(() => [
    EditorView.updateListener.of((update) => {
      if (!update.selectionSet && !update.docChanged) return;
      const tag = enclosingBlockTag(
        update.state.doc.toString(), update.state.selection.main.head);
      if (tag !== lastTagRef.current) {
        lastTagRef.current = tag;
        onCursorTagRef.current?.(tag);
      }
    }),
  ], []);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fileId is the identity; path/storage changes arrive through it
  }, [fileId]);

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
          onChange={(value: string) => setContent(value)}
          path={path}
          height="100%"
          extensions={cursorExtension}
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
            onResize={(totalDelta: number) => {
              const deltaPct = (totalDelta / startContainerSizeRef.current) * 100;
              setEditorRatio(Math.max(20, Math.min(80, startEditorRatioRef.current + deltaPct)));
            }}
            className={`studio-pane-resizer ${previewLayout}`}
          />
          <div className="studio-preview-pane">
            <div className="studio-preview-header">Preview</div>
            <div className="studio-preview-content">
              {/* TODO/BUG (inherited, backlog): translanguaging auto-translates
                  the preview back to the user's locale — editing file.pl.olx
                  shows an English preview. Pin preview locale to the file's
                  language once RenderOLX threads a translanguaging switch. */}
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
                // No idMap prop: refs the edited file points at resolve from
                // the olxjson slice through the render pipeline (the shell
                // dispatched the compiled index there).
                <PreviewPane
                  path={path}
                  content={content}
                  ns={previewNs}
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
