'use client';
// packages/shared/components/blocks/authoring/Studio/Studio.tsx
//
// The studio shell: header (source selector, file path, preview/save),
// resizable tabbed sidebar, editor+preview main pane, footer. Rebuilt from
// apps/web/app/studio/StudioPage.tsx against its behavior inventory; the
// nuance-dense handlers (save with optimistic concurrency, create-no-clobber,
// rename-as-move with cache migration) port verbatim in logic.
//
// Page-level location (?source=&file=&tab=) lives in system-scoped URL
// fields (locals.ts). Reads and back/forward resync go through the url-field
// machinery; writes go through setStudioLocation so correlated params land
// in a single history entry.

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { McpStorageProvider } from '@/lib/lofs';
import { useSources } from '@/lib/state/sources';
import { toOlxRelativePath, VersionConflictError } from '@/lib/types/storage';
import { toLofsOrigin, makeAddress, toLofsContentPath } from '@/lib/types/address';
import { fetchAllOlxJson } from '@/lib/content/fetchOlxJson';
import { useFieldState, updateField, settings } from '@/lib/state';
import { dispatchOlxJson } from '@/lib/state/olxjson';
import { setParams } from '@/lib/state/urlFields';
import { useNotifications, ToastNotifications } from '@/lib/util/debug';
import Spinner from '@/components/common/Spinner';
import Notice from '@/components/common/Notice';
import ResizableSidebar from '@/components/common/ResizableSidebar';
import type { CodeEditorHandle } from '@/components/common/CodeEditor';
import type { RuntimeProps, LofsOrigin, LofsRef, SourceOption } from '@/lib/types';
import FileEditorPane, { type FileCache } from './fileEditorPane';
import { getStudioContent, setStudioContent, useStudioContent } from './editorContent';
import { FilesPanel } from './filesPanel';
import { SearchPanel } from './searchPanel';
import { DocsPanel } from './docsPanel';
import RenderOLX from '@/components/common/RenderOLX';
import { bindStudioEditorTools } from './llmTools';
import { STUDIO_NS } from './studioNs';
import NewFileDialog from './newFileDialog';
import { CommandPalette } from './commandPalette';
import { studioFields, editorMirrorFields } from './locals';
import { asStateKey } from '@/lib/types/id-grammar';

/** Buffer key when no file is open — subscribes to an always-empty scratch
 *  buffer so the content hook stays unconditional (rules of hooks). */
const SCRATCH_REF = 'memory://studio-scratch' as LofsRef;

/** The editor buffer's addressable identity (see editorMirrorFields). */
const EDITOR_MIRROR_KEY = asStateKey('studio/editor');

/**
 * The Studio assistant IS a Chat block instance: a one-entry chatpeg script
 * that opens an LLM interlude and never closes it (until="false"). Context
 * arrives through ordinary state-language interpolation against the editor
 * mirror fields; tools are toolsets on the browser tool plane — the same
 * MCP tools external agents use, plus the editor-local 'studio-editor' set.
 */
const STUDIO_CHAT_OLX = `<Chat id="studio_chat" height="flex-1">
cast:
  assistant:
    seed: studio_assistant
~~~~

>>> llm assistant [until="false" exit=none upload=true tools="studio-editor,content-read,content-write,docs"]
  You are an educational content authoring assistant for the lo-blocks
  platform (OLX blocks; chatpeg and other PEG content formats).

  Current file: {{@editor.file}} (content source: {{@editor.source}})
  Current file contents:
  {{@editor.value}}

  Tool notes:
  - Edit changes the OPEN buffer (applied immediately; the author saves).
  - Read/Glob/Grep explore the content library. Use get_blocks and
    get_formats for block/format documentation before authoring
    unfamiliar blocks.
  - Write/Delete/Move change saved files and need source="{{@editor.source}}".
  - If no file is open, help the author find or create one.
  - Only modify content when asked.
</Chat>`;

// ---------------------------------------------------------------------------
// URL boundary validation (ported: fail closed, never throw)
// ---------------------------------------------------------------------------

/** Decode ?source= — malformed values (empty, stray '#') fail closed to
 *  "no source selected" with a console.warn. */
function sourceFromParam(raw: string | undefined): LofsOrigin | undefined {
  if (!raw) return undefined;
  try {
    return toLofsOrigin(raw);
  } catch (err) {
    console.warn(`Ignoring malformed ?source=: ${raw}`, err);
    return undefined;
  }
}

/** Decode ?file= — invalid paths fall to '' (no file open, placeholder). */
function fileFromParam(raw: string | undefined): string {
  if (!raw) return '';
  try {
    toOlxRelativePath(raw);
    return raw;
  } catch {
    // TODO (inherited): a typo'd link should show "file not found + offer
    // to create"; for now it falls to the placeholder.
    return '';
  }
}

const fileRef = (source: LofsOrigin, path: string): LofsRef =>
  makeAddress(source, toLofsContentPath(path));

export type SidebarTab = 'chat' | 'docs' | 'search' | 'files';
const SIDEBAR_TABS: SidebarTab[] = ['chat', 'docs', 'search', 'files'];


// ---------------------------------------------------------------------------
// Source selector (ported from SourceSelector.tsx: writable sources first,
// read-only after a divider; closes on outside mousedown and Escape)
// ---------------------------------------------------------------------------

function SourceSelector({ props, sources, current, onChange }: {
  props: RuntimeProps;
  sources: SourceOption[];
  current: SourceOption | undefined;
  onChange: (origin: LofsOrigin) => void;
}) {
  const [open, setOpen] = useFieldState(props, studioFields.studioSourceMenuOpen, false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, setOpen]);

  const writable = sources.filter(s => s.writable);
  const readOnly = sources.filter(s => !s.writable);

  return (
    <div className="studio-source-selector" ref={rootRef}>
      {/* No functional updates: useFieldState setters take values, not reducers. */}
      <button className="studio-btn" onClick={() => setOpen(!open)}>
        {current ? current.label : 'Select a repo…'}
      </button>
      {open && (
        <div className="studio-source-menu">
          {writable.map(s => (
            <button key={s.origin} className="studio-source-item" title={s.origin}
              onClick={() => { onChange(s.origin); setOpen(false); }}>
              {s.label}
            </button>
          ))}
          {readOnly.length > 0 && <div className="studio-source-divider">read-only</div>}
          {readOnly.map(s => (
            <button key={s.origin} className="studio-source-item" title={s.origin}
              onClick={() => { onChange(s.origin); setOpen(false); }}>
              {s.label} <span className="ro-tag">ro</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shell
// ---------------------------------------------------------------------------

export default function Studio(props: RuntimeProps) {
  // --- Location: system-scoped URL fields ---------------------------------
  const [rawSource] = useFieldState(props, studioFields.source, '');
  const [rawFile] = useFieldState(props, studioFields.file, '');
  const [rawTab, setTab] = useFieldState(props, studioFields.tab, 'chat');

  const source = sourceFromParam(rawSource || undefined);
  const filePath = fileFromParam(rawFile || undefined);
  const sidebarTab: SidebarTab =
    SIDEBAR_TABS.includes(rawTab as SidebarTab) ? (rawTab as SidebarTab) : 'chat';

  /** Move to a (source, file) location: both fields update, ONE history
   *  entry. push for navigation (openable via back), replace for renames. */
  const setLocation = useCallback((nextSource: LofsOrigin | undefined, nextFile: string,
    { push = true }: { push?: boolean } = {}) => {
    updateField(props, studioFields.source, nextSource ?? '');
    updateField(props, studioFields.file, nextFile);
    setParams([['source', nextSource ?? null], ['file', nextFile || null]], { push });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Sources / provider ---------------------------------------------------
  // get_sources MCP tool → redux cache → hook (lib/state/sources.ts).
  const { sources } = useSources();

  // Undefined when nothing's picked or the URL named an unoffered source —
  // both legitimate "can't write" states.
  const currentSource = sources.find(s => s.origin === source);
  const canWrite = currentSource ? currentSource.writable : false;

  // Origin-scoped provider: all file ops target this one source. Ref-mirrored
  // so callbacks skip dependency churn.
  const storage = useMemo(() => new McpStorageProvider(source), [source]);
  const storageRef = useRef(storage);
  storageRef.current = storage;

  const fileId: LofsRef | undefined =
    source && filePath ? fileRef(source, filePath) : undefined;

  // --- UI state --------------------------------------------------------------
  const [sidebarCollapsed, setSidebarCollapsed] = useFieldState(
    props, studioFields.studioSidebarCollapsed, false);
  const [showPreview, setShowPreview] = useFieldState(
    props, studioFields.studioShowPreview, true);
  const [previewLayout, setPreviewLayout] = useFieldState(
    props, studioFields.studioPreviewLayout, 'horizontal' as 'horizontal' | 'vertical');
  const [debug, setDebug] = useFieldState(null, settings.debug, false, { tag: 'studio' });

  // Server data caches. useState-ok: their replay-correct home is an
  // event-logged slice (the docs-slice pattern — results arrive as events),
  // which lands with the file/sources MCP-ization (backlog). Fields would
  // be the wrong shape: this is derived server data, not user state.
  const [fileTree, setFileTree] = useState<any>(null);              // useState-ok: see above
  const [saving, setSaving] = useFieldState(props, studioFields.studioSaving, false);
  const [newFileOpen, setNewFileOpen] = useFieldState(props, studioFields.studioNewFileOpen, false);
  // Live content of the open file: subscribe to the redux buffer directly
  // (the same field FileEditorPane's editor writes) — drives dirty state
  // and content-derived sidebars with no mirror state.
  const openContent = useStudioContent(fileId ?? SCRATCH_REF)[0];

  // Mirror the open buffer into its addressable identity ('studio/editor')
  // so the chat assistant's prompt interpolations ({{@editor.value}} etc.)
  // see current state. Debounced: 'value' is a full-content event today
  // (see editorMirrorFields TODO).
  useEffect(() => {
    const t = setTimeout(() => {
      updateField(null, editorMirrorFields.file, filePath ?? '', { stateKey: EDITOR_MIRROR_KEY });
      updateField(null, editorMirrorFields.source, source ?? '', { stateKey: EDITOR_MIRROR_KEY });
      updateField(null, editorMirrorFields.value, openContent ?? '', { stateKey: EDITOR_MIRROR_KEY });
    }, 400);
    return () => clearTimeout(t);
  }, [filePath, source, openContent]);
  // Block tag enclosing the editor cursor (change-frequency writes — see
  // FileEditorPane's listener) — drives the docs panel's context reference.
  const [cursorTag, setCursorTag] = useFieldState(props, studioFields.studioCursorTag, '');

  const editorRef = useRef<CodeEditorHandle>(null);
  // Per-source cache of loaded files (saved snapshot + conflict metadata +
  // namespace), keyed by LofsRef.
  const fileStateRef = useRef<FileCache>(new Map());

  // Dirty = open file's live content diverges from its last-saved snapshot.
  // A file still loading (no cache entry) is never dirty.
  const savedContent = fileId ? fileStateRef.current.get(fileId)?.content : undefined;
  const isDirty = savedContent !== undefined && openContent !== savedContent;

  /** Dirty files for the CURRENT source (tree markers + beforeunload). */
  const getDirtyFiles = useCallback((): Set<string> => {
    const dirty = new Set<string>();
    if (!source) return dirty;
    const prefix = `${source}://`;
    for (const [key, saved] of fileStateRef.current.entries()) {
      if (!key.startsWith(prefix)) continue;
      if (getStudioContent(key) !== saved.content) dirty.add(key.slice(prefix.length));
    }
    return dirty;
  }, [source]);

  const { notifications, notify, dismiss: dismissNotification } = useNotifications();

  // --- Data loads -------------------------------------------------------------
  const refreshFiles = useCallback(() => {
    storageRef.current.listFiles().then(setFileTree).catch(console.error);
  }, []);
  useEffect(() => { refreshFiles(); }, [source, refreshFiles]);

  // The compiled index spans all sources — load once on mount, INTO the
  // olxjson slice (its canonical home): search reads it via selector, and
  // the preview resolves refs from the store through the normal render
  // pipeline. Arriving as a LOAD_OLXJSON event also makes it replayable.
  useEffect(() => {
    fetchAllOlxJson()
      .then(data => dispatchOlxJson(props, 'content', data.idMap))
      .catch(console.error);
    // props identity is stable enough for a mount-only fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- File operations (ported verbatim in logic) ------------------------------
  const handleFileSelect = useCallback((path: string) => {
    setLocation(source, path);
  }, [setLocation, source]);

  // Keep the 'studio-editor' toolset's live context current (buffer access,
  // OpenFile navigation, buffer-edit validation) — the chat block pulls the
  // toolset from the tool plane by name.
  useEffect(() => {
    bindStudioEditorTools({
      getCurrentContent: () => (fileId ? getStudioContent(fileId) : ''),
      getFileType: () => (filePath ? (filePath.split('.').pop()?.toLowerCase() ?? 'olx') : 'olx'),
      onApplyEdit: (v) => { if (fileId) setStudioContent(fileId, v); },
      onOpenFile: handleFileSelect,
      source,
    });
  }, [fileId, filePath, source, handleFileSelect]);

  // Switching repos closes the open file (it belonged to the old source).
  const handleSourceChange = useCallback((origin: LofsOrigin) => {
    if (origin === source) return;
    setLocation(origin, '');
  }, [setLocation, source]);

  const handleSave = useCallback(async (force = false) => {
    if (!canWrite || !source || !filePath) {
      notify('error', source ? 'Open a file to save' : 'Pick a repo to edit first');
      return;
    }
    setSaving(true);
    try {
      const id = fileRef(source, filePath);
      const content = getStudioContent(id);
      const previousMetadata = fileStateRef.current.get(id)?.metadata;
      const olxPath = toOlxRelativePath(filePath);
      await storageRef.current.commit([{ path: olxPath, content }], {
        base: previousMetadata !== undefined ? [{ path: olxPath, version: previousMetadata }] : undefined,
        force,
      });
      // Re-read to refresh conflict metadata; mark clean.
      const result = await storageRef.current.read(olxPath);
      fileStateRef.current.set(id, { content, metadata: result.metadata, ns: result.ns });
      notify('success', `Saved ${filePath}`);
    } catch (err) {
      console.error('Failed to save:', err);
      if (!force && (err instanceof VersionConflictError || (err as any)?.name === 'VersionConflictError')) {
        const shouldOverwrite = window.confirm(
          'This file has been modified externally since you opened it.\n\n' +
          'Do you want to overwrite the external changes with your version?'
        );
        if (shouldOverwrite) {
          setSaving(false);
          handleSave(true);  // one-time force retry
          return;
        }
        notify('info', 'Save cancelled - file was modified externally');
      } else {
        notify('error', `Failed to save ${filePath}`, err instanceof Error ? err.message : String(err));
      }
    } finally {
      setSaving(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filePath, canWrite, source, notify]);

  const handleFileCreate = useCallback(async (path: string, fileContent: string) => {
    try {
      // create: must not clobber an existing file (server 409s if it exists).
      await storageRef.current.commit([{ path: toOlxRelativePath(path), content: fileContent }], { create: true });
      refreshFiles();
      // Switch to the new file — FileEditorPane's load effect populates
      // content under the correct Redux key.
      setLocation(source, path);
      notify('success', `Created ${path}`);
    } catch (err) {
      console.error('Failed to create file:', err);
      notify('error', `Failed to create ${path}`, err instanceof Error ? err.message : String(err));
      throw err;  // dialog stays open
    }
  }, [refreshFiles, notify, setLocation, source]);

  const handleFileDelete = useCallback(async (path: string) => {
    if (!source) return;
    try {
      await storageRef.current.commit([{ path: toOlxRelativePath(path), delete: true }]);
      refreshFiles();
      fileStateRef.current.delete(fileRef(source, path));
      if (path === filePath) setLocation(source, '');
      notify('success', `Deleted ${path}`);
    } catch (err) {
      console.error('Failed to delete:', err);
      notify('error', `Failed to delete ${path}`, err instanceof Error ? err.message : String(err));
      throw err;
    }
  }, [filePath, source, refreshFiles, notify, setLocation]);

  const handleFileRename = useCallback(async (oldPath: string, newPath: string) => {
    if (!source) return;
    try {
      // Full repo-relative paths: rename doubles as move-to-directory.
      await storageRef.current.commit([{ path: toOlxRelativePath(oldPath), renameTo: toOlxRelativePath(newPath) }]);
      refreshFiles();
      const cached = fileStateRef.current.get(fileRef(source, oldPath));
      if (cached) {
        fileStateRef.current.delete(fileRef(source, oldPath));
        fileStateRef.current.set(fileRef(source, newPath), cached);
        // Move the LIVE redux buffer too — the cache move alone makes
        // FileEditorPane skip its storage read for the new ref, so without
        // this the renamed file opens on the empty fallback buffer and a
        // save would blank it.
        setStudioContent(fileRef(source, newPath), getStudioContent(fileRef(source, oldPath)));
      }
      // Renames replace (not push): back shouldn't step through old names.
      if (oldPath === filePath) setLocation(source, newPath, { push: false });
      notify('success', `Renamed to ${newPath}`);
    } catch (err) {
      console.error('Failed to rename:', err);
      notify('error', `Failed to rename ${oldPath}`, err instanceof Error ? err.message : String(err));
      throw err;
    }
  }, [filePath, source, refreshFiles, notify, setLocation]);

  // --- Command palette + keyboard shortcuts ------------------------------------
  const [paletteOpen, setPaletteOpen] = useFieldState(props, studioFields.studioPaletteOpen, false);
  const [, setPaletteQuery] = useFieldState(props, studioFields.studioPaletteQuery, '');
  const [, setPaletteIndex] = useFieldState(props, studioFields.studioPaletteIndex, 0);

  const openPalette = useCallback(() => {
    // Fresh on open, matching the legacy remount-reset behavior.
    setPaletteQuery('');
    setPaletteIndex(0);
    setPaletteOpen(true);
    // Field setters are stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key === 's') { e.preventDefault(); handleSave(); }
      else if (mod && !e.shiftKey && e.key === 'p') { e.preventDefault(); setShowPreview(!showPreview); }
      else if (mod && e.key === 'n') { e.preventDefault(); if (canWrite) setNewFileOpen(true); }
      else if (mod && e.key === 'k') { e.preventDefault(); paletteOpen ? setPaletteOpen(false) : openPalette(); }
      else if (e.key === 'F1') { e.preventDefault(); window.open('/docs', '_blank'); }
      else if (e.key === 'Escape' && paletteOpen) { setPaletteOpen(false); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleSave, setShowPreview, showPreview, canWrite, setNewFileOpen, paletteOpen, setPaletteOpen, openPalette]);

  // beforeunload: warn when ANY file in the source is dirty, not just the open one.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (getDirtyFiles().size > 0) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [getDirtyFiles]);

  // --- Render -------------------------------------------------------------------
  const saveTitle = !source ? 'Pick a repo to edit first'
    : !canWrite ? 'This source is read-only'
    : !filePath ? 'Open a file to save'
    : 'Save (⌘S)';

  return (
    <div className="studio">
      <header className="studio-header">
        <div className="studio-header-left">
          <button className="studio-btn icon" aria-label="Toggle sidebar"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}>≡</button>
          <a href="/" className="studio-title" title="Go to home">studio</a>
          <SourceSelector props={props} sources={sources} current={currentSource} onChange={handleSourceChange} />
        </div>
        <div className="studio-header-center">
          <span className="studio-filepath">
            {filePath || 'untitled'}{isDirty && <span className="studio-dirty-indicator" title="Unsaved changes"> •</span>}
          </span>
        </div>
        <div className="studio-header-right">
          <button className={`studio-btn icon ${showPreview ? 'active' : ''}`}
            title="Toggle preview (⌘P)"
            onClick={() => setShowPreview(!showPreview)}>Preview</button>
          {showPreview && (
            <button className="studio-btn icon" title="Flip preview layout"
              onClick={() => setPreviewLayout(previewLayout === 'horizontal' ? 'vertical' : 'horizontal')}>
              {previewLayout === 'horizontal' ? '⬌' : '⬍'}
            </button>
          )}
          <button className="studio-btn primary"
            disabled={!canWrite || !filePath || saving}
            title={saveTitle}
            onClick={() => handleSave()}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </header>

      <div className="studio-body">
        <ResizableSidebar
          collapsed={sidebarCollapsed}
          onCollapsedChange={setSidebarCollapsed}
          minWidth={200} maxWidth={600}
          chrome label="Studio sidebar"
          className="studio-sidebar"
        >
          <nav className="studio-sidebar-tabs">
            {SIDEBAR_TABS.map(tab => (
              <button key={tab}
                className={`studio-sidebar-tab ${tab === sidebarTab ? 'active' : ''}`}
                onClick={() => setTab(tab)}>
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </nav>
          <div className="studio-sidebar-content">
            {sidebarTab === 'chat' && (
              <div className="sidebar-panel chat-panel">
                <RenderOLX
                  id={asStateKey('studio/studio_chat_root')}
                  ns={STUDIO_NS}
                  inline={STUDIO_CHAT_OLX}
                />
              </div>
            )}
            {sidebarTab === 'docs' && (
              <DocsPanel
                filePath={filePath}
                content={openContent}
                cursorTag={cursorTag || null}
                onInsert={(t) => editorRef.current?.insertAtCursor(t)}
              />
            )}
            {sidebarTab === 'search' && (
              <SearchPanel
                content={openContent}
                currentPath={filePath}
                currentSource={source}
                onFileSelect={handleFileSelect}
                onScrollToId={(id) => editorRef.current?.scrollToId(id)}
              />
            )}
            {sidebarTab === 'files' && (
              <FilesPanel
                fileTree={fileTree}
                currentPath={filePath}
                dirtyFiles={getDirtyFiles()}
                canWrite={canWrite}
                onFileSelect={handleFileSelect}
                onNewFile={() => setNewFileOpen(true)}
                onFileDelete={handleFileDelete}
                onFileRename={handleFileRename}
              />
            )}
          </div>
        </ResizableSidebar>

        {source && filePath ? (
          <FileEditorPane
            source={source}
            path={filePath}
            storage={storage}
            cache={fileStateRef.current}
            editorRef={editorRef}
            showPreview={showPreview}
            previewLayout={previewLayout}
            onCursorTag={(tag) => setCursorTag(tag ?? '')}
            onError={(title, message) => notify('error', title, message)}
          />
        ) : (
          <main className="studio-main">
            <div className="studio-empty-state">
              {!source ? (
                <p>Choose a repository to start editing.</p>
              ) : canWrite ? (
                <p>
                  Pick a file from the Files panel — or{' '}
                  <button className="studio-btn primary" onClick={() => setNewFileOpen(true)}>
                    create one
                  </button>.
                </p>
              ) : (
                <p>This source is read-only — pick a file to view it.</p>
              )}
            </div>
          </main>
        )}
      </div>

      <footer className="studio-footer">
        <kbd>⌘K</kbd> Command palette
        <kbd>⌘S</kbd> Save
        <kbd>⌘P</kbd> Preview
        <kbd>⌘N</kbd> New file
        <Notice />
        <span role="button" tabIndex={0} className="studio-debug-toggle"
          title="Toggle debug mode"
          onClick={() => setDebug(!debug)}
          onKeyDown={e => { if (e.key === 'Enter') setDebug(!debug); }}>
          [{debug ? 'debug on' : 'debug'}]
        </span>
      </footer>

      <NewFileDialog
        open={newFileOpen}
        currentDir={filePath.includes('/') ? filePath.slice(0, filePath.lastIndexOf('/')) : ''}
        onCreate={handleFileCreate}
        onClose={() => setNewFileOpen(false)}
      />

      {paletteOpen && (
        <CommandPalette
          props={props}
          onClose={() => setPaletteOpen(false)}
          onSave={() => handleSave()}
          onTogglePreview={() => setShowPreview(!showPreview)}
          onInsert={(t) => editorRef.current?.insertAtCursor(t)}
          onNewFile={() => setNewFileOpen(true)}
        />
      )}

      <ToastNotifications notifications={notifications} onDismiss={dismissNotification} />
    </div>
  );
}
