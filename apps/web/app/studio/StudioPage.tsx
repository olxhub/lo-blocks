// apps/web/app/studio/StudioPage.tsx
// Prototype editor - exploring layout and interaction patterns
'use client';

import { useState, useEffect, useCallback, useMemo, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import PreviewPane from '@/components/common/PreviewPane';
import Spinner from '@/components/common/Spinner';
import Resizer from '@/components/common/Resizer';
import ResizableSidebar from '@/components/common/ResizableSidebar';
import { DataPanel, DocsPanel, FilesPanel, SearchPanel } from './panels';
import EditorLLMChat from './EditorLLMChat';
import SourceSelector, { type SourceOption } from './SourceSelector';
import NewFileDialog from './NewFileDialog';
import { useDocsData } from '@/lib/docs';
import { NetworkStorageProvider, VersionConflictError } from '@/lib/lofs';
import { fetchAllOlxJson } from '@/lib/content/fetchOlxJson';
import { toOlxRelativePath } from '@/lib/types/storage';
import type { UriNode } from '@/lib/types/storage';
import type { IdMap, ContentNamespace } from '@/lib/types';
import { STUDIO_NS } from './studioNs';
import { useNotifications, ToastNotifications, DisplayError } from '@/lib/util/debug';
import { useFieldState, getReduxState, settings } from '@/lib/state';
import Notice from '@/components/common/Notice';

import { editorFields } from '@/lib/state/editorFields';
import './studio.css';

// Dynamic import CodeMirror to avoid SSR issues
const CodeEditor = dynamic(
  () => import('@/components/common/CodeEditor'),
  { ssr: false }
);

// Import the handle type for the editor ref
import type { CodeEditorHandle } from '@/components/common/CodeEditor';

type SidebarTab = 'chat' | 'docs' | 'search' | 'files' | 'data';
type PreviewLayout = 'horizontal' | 'vertical';

const DEMO_CONTENT = `<Vertical>
  <Markdown>
# Welcome to Studio

This is a **live preview** of your content. Edit on the left, see changes on the right.
  </Markdown>

  <CapaProblem id="demo_mcq" title="Example Question">
    <KeyGrader>
      <p>What makes a good content editor?</p>
      <ChoiceInput>
        <Key id="correct">Live preview of changes</Key>
        <Distractor id="d1">No preview at all</Distractor>
        <Distractor id="d2">Confusing UI with too many options</Distractor>
        <Distractor id="d3">Slow and unresponsive interface</Distractor>
      </ChoiceInput>
    </KeyGrader>
  </CapaProblem>
</Vertical>`;

// The storage provider is created per selected source inside the component
// (origin-scoped): every read/write targets the repo the user is editing, not
// a union-routed guess. See the `storage` useMemo below.

// Redux state wrapper - matches /edit/ pattern for content persistence
// TODO: Pass baselineProps from useBaselineProps() instead of null
function useEditComponentState(field, provenance, defaultState) {
  return useFieldState(
    null,
    field,
    defaultState,
    { stateKey: provenance }
  );
}

// Synchronous getter for edit component state - parallel to useEditComponentState
// TODO: Pass baselineProps instead of null
function getEditComponentState(field, provenance, defaultState) {
  return getReduxState(
    null,
    field,
    defaultState,
    { stateKey: provenance }
  );
}

function StudioPageContent() {
  // Read initial file + source from URL query params
  const searchParams = useSearchParams();
  const initialFile = searchParams.get('file') || '';
  const initialSource = searchParams.get('source') || '';

  // The source (origin) being edited. Empty until picked (bare /studio shows
  // the picker); otherwise it comes from the entry link's ?source=.
  const [source, setSource] = useState(initialSource);

  // The sources this deployment offers, for the working-repo picker.
  const [sources, setSources] = useState<SourceOption[]>([]);
  useEffect(() => {
    fetch('/api/sources')
      .then(r => r.json())
      .then(j => { if (j.ok) setSources(j.sources); })
      .catch(console.error);
  }, []);

  // The selected source's metadata. Undefined when nothing's picked yet or the
  // URL named one we don't offer — both legitimate "can't write" states.
  const currentSource = sources.find(s => s.origin === source);
  const canWrite = currentSource ? currentSource.writable : false;

  // Origin-scoped provider: all file ops target this one source. A ref mirrors
  // it so the callbacks below don't each need it in their dependency lists.
  const storage = useMemo(() => new NetworkStorageProvider(source || undefined), [source]);
  const storageRef = useRef(storage);
  storageRef.current = storage;

  // Debug mode toggle (system-wide setting)
  // TODO: Pass baselineProps from useBaselineProps() instead of null
  const [debug, setDebug] = useFieldState(null, settings.debug, false, { tag: 'studio' });

  // TODO: Consider moving UI state to redux for analytics
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('chat');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  // The single new-file dialog, opened from the Files panel "+" and the no-file
  // placeholder (DRY: one creation flow).
  const [newFileOpen, setNewFileOpen] = useState(false);
  // File path synced with URL via ?file= param
  const [filePath, setFilePath] = useState(initialFile);

  // A file's identity is (source, path), not path alone — the same path in two
  // repos is two different files. Used as the redux/content and cache key so
  // content, metadata, and dirty-state never bleed across sources.
  const fileId = `${source}\n${filePath}`;

  // Content stored in Redux - enables analytics and persistence
  const [content, setContent] = useEditComponentState(
    editorFields.content,
    fileId,
    DEMO_CONTENT,
  );
  // TODO: Consider moving layout preferences to redux (persist across sessions)
  const [showPreview, setShowPreview] = useState(true);
  const [previewLayout, setPreviewLayout] = useState<PreviewLayout>('horizontal');
  const [editorRatio, setEditorRatio] = useState(50); // percentage for editor pane
  // TODO: Move fileTree to redux (shared across components)
  const [fileTree, setFileTree] = useState<UriNode | null>(null);
  // TODO: Move loading/saving to redux for global status tracking
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  // TODO: Move idMap to redux (shared content index)
  const [idMap, setIdMap] = useState<IdMap | null>(null);

  // Editor ref for insert operations (DOM ref - keep as useRef)
  const editorRef = useRef<CodeEditorHandle>(null);
  // Main area ref for pane resize percentage calculation
  const mainRef = useRef<HTMLElement>(null);
  const startEditorRatioRef = useRef(50);
  const startContainerSizeRef = useRef(1000);

  // Track per-file saved state for dirty detection and conflict detection
  // Maps filePath -> { content, metadata, ns } for files we've loaded
  // TODO: Move file metadata tracking to redux (enables cross-component dirty detection)
  const fileStateRef = useRef<Map<string, { content: string; metadata: unknown; ns?: ContentNamespace }>>(new Map());

  // Get current file's saved state (for dirty detection), keyed by (source, path)
  const savedState = fileStateRef.current.get(fileId);
  const isDirty = savedState ? content !== savedState.content : false;

  // Namespace the preview renders in. undefined means the loaded file has
  // no content namespace — that's an author-facing problem (the content
  // sync will reject the file), so the preview shows an explanation
  // instead of silently rendering under a wrong namespace.
  let previewNs: ContentNamespace | undefined;
  if (!filePath) {
    // No file open — previewing the built-in demo content.
    previewNs = STUDIO_NS;
  } else if (!savedState) {
    // File selected but the read hasn't returned yet.
    previewNs = STUDIO_NS;
  } else {
    // File loaded — the server resolved its namespace during read
    // (manifest-aware; see FileStorageProvider.read). undefined when the
    // file is outside any namespace (see NamespaceResolutionError).
    previewNs = savedState.ns;
  }

  // Dirty files for the CURRENT source (tree indicators + beforeunload). Cache
  // keys are `${source}\n${path}`; filter to this source and return the paths.
  const getDirtyFiles = useCallback((): Set<string> => {
    const dirty = new Set<string>();
    const prefix = `${source}\n`;
    for (const [key, saved] of fileStateRef.current.entries()) {
      if (!key.startsWith(prefix)) continue;
      const current = getEditComponentState(editorFields.content, key, DEMO_CONTENT);
      if (current !== undefined && current !== saved.content) {
        dirty.add(key.slice(prefix.length));
      }
    }
    return dirty;
  }, [source]);

  // Toast notifications
  const { notifications, notify, dismiss: dismissNotification } = useNotifications();

  // Shared docs data hook
  const docsData = useDocsData();

  // Load file tree (scoped to the current source via storageRef)
  const refreshFiles = useCallback(() => {
    storageRef.current.listFiles().then(setFileTree).catch(console.error);
  }, []);

  // Reload the tree whenever the working source changes (and on mount).
  useEffect(() => {
    refreshFiles();
  }, [source, refreshFiles]);

  // The compiled index (idMap) spans all sources — load once on mount.
  useEffect(() => {
    fetchAllOlxJson()
      .then(data => setIdMap(data.idMap))
      .catch(console.error);
  }, []);

  // Load file content when the (source, path) identity changes.
  // Only load from storage if we haven't loaded this file before -
  // otherwise Redux has the (possibly edited) content cached
  //
  // TODO: This cache-skip logic means externally modified files won't refresh
  // when re-selected. Need a staleness check (compare metadata) to detect
  // external changes and offer reload. Related: collaborative editing roadmap.
  useEffect(() => {
    if (!filePath) return;

    // If we've already loaded this (source, path), use Redux cache (preserves edits)
    if (fileStateRef.current.has(fileId)) {
      return;
    }

    // First time loading this file - fetch from the source's provider
    setLoading(true);
    let olxPath;
    try {
      olxPath = toOlxRelativePath(filePath);
    } catch (err) {
      notify('error', `Invalid file path: ${filePath}`, err instanceof Error ? err.message : String(err));
      setLoading(false);
      return;
    }
    storageRef.current.read(olxPath)
      .then(result => {
        setContent(result.content);
        fileStateRef.current.set(fileId, {
          content: result.content,
          metadata: result.metadata,
          ns: result.ns,
        });
      })
      .catch(err => {
        console.error('Failed to load file:', err);
        notify('error', `Failed to load ${filePath}`, err instanceof Error ? err.message : String(err));
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileId]); // Reload when the (source, path) identity changes

  // Update URL without page reload using History API. Keeps ?source= in sync
  // with the edited source, so a deep link reopens the same repo + file. The
  // `source` override lets a caller write a source it just set (state hasn't
  // committed yet, so the closure's `source` would be stale).
  const updateUrl = useCallback(
    (path: string, { replace = false, source: src = source }: { replace?: boolean; source?: string } = {}) => {
      const url = new URL(window.location.href);
      if (path) {
        url.searchParams.set('file', path);
      } else {
        url.searchParams.delete('file');
      }
      if (src) {
        url.searchParams.set('source', src);
      } else {
        url.searchParams.delete('source');
      }
      // pushState for file changes (enables back/forward), replaceState for renames
      window.history[replace ? 'replaceState' : 'pushState']({}, '', url.toString());
    },
    [source],
  );

  // File selection updates path and URL - content loading handled by effect above
  const handleFileSelect = useCallback((path: string) => {
    setFilePath(path);
    updateUrl(path);
  }, [updateUrl]);

  // Switching the working repo: the open file belonged to the old source, so
  // close it (a file in another repo makes no sense to carry). Lands on the
  // no-file placeholder; the tree reloads via the source effect.
  const handleSourceChange = useCallback((origin: string) => {
    if (origin === source) return;
    setSource(origin);
    setFilePath('');
    updateUrl('', { source: origin });
  }, [source, updateUrl]);

  const handleSave = useCallback(async (force = false) => {
    // Saving needs a writable source picked. The Save button is disabled in
    // this state; this guards the ⌘S path.
    if (!canWrite) {
      notify('error', source ? 'This source is read-only' : 'Pick a repo to edit first');
      return;
    }
    // Untitled file: prompt for a name and save-as
    // TODO: Replace window.prompt with a proper save-as dialog — directory picker,
    // file type selector, overwrite warning, validation feedback. Reuse FilesPanel's
    // file-creation UI or factor out a shared SaveDialog component.
    if (!filePath) {
      const name = window.prompt('Save as:', 'document.olx');
      if (!name) return;
      let olxPath;
      try {
        olxPath = toOlxRelativePath(name);
      } catch (err) {
        notify('error', `Invalid filename: ${name}`, err instanceof Error ? err.message : String(err));
        return;
      }
      setSaving(true);
      try {
        // Check if file already exists — don't silently overwrite
        // TODO: Replace confirm() with a proper modal
        // TODO: Race condition. Read then write. LOFS needs a rewrite.
        try {
          await storageRef.current.read(olxPath);
          // File exists — confirm overwrite
          if (!window.confirm(`${name} already exists. Overwrite?`)) {
            setSaving(false);
            return;
          }
        } catch {
          // File doesn't exist — safe to create
        }
        await storageRef.current.write(olxPath, content);
        // Re-read to get metadata for conflict detection on subsequent saves
        const result = await storageRef.current.read(olxPath);
        refreshFiles();
        // Update cache so the file-loading effect doesn't show stale content
        // (it skips files already in fileStateRef), keyed by (source, path)
        fileStateRef.current.set(`${source}\n${name}`, {
          content,
          metadata: result.metadata,
          ns: result.ns,
        });
        setFilePath(name);
        updateUrl(name);
        notify('success', `Saved ${name}`);
      } catch (err) {
        console.error('Failed to save:', err);
        notify('error', `Failed to save ${name}`, err instanceof Error ? err.message : String(err));
      } finally {
        setSaving(false);
      }
      return;
    }
    setSaving(true);
    try {
      const previousMetadata = fileStateRef.current.get(fileId)?.metadata;
      const olxPath = toOlxRelativePath(filePath);
      await storageRef.current.write(olxPath, content, {
        previousMetadata,
        force,
      });
      // Re-read to get updated metadata
      const result = await storageRef.current.read(olxPath);
      // Update saved state (marks file as clean, updates metadata for conflict detection)
      fileStateRef.current.set(fileId, {
        content,
        metadata: result.metadata,
        ns: result.ns,
      });
      notify('success', `Saved ${filePath}`);
    } catch (err) {
      console.error('Failed to save:', err);
      // Handle version conflict (only offer retry if not already forcing)
      if (!force && (err instanceof VersionConflictError || (err as any)?.name === 'VersionConflictError')) {
        const shouldOverwrite = window.confirm(
          'This file has been modified externally since you opened it.\n\n' +
          'Do you want to overwrite the external changes with your version?'
        );
        if (shouldOverwrite) {
          setSaving(false);
          handleSave(true); // Retry with force
          return;
        } else {
          notify('info', 'Save cancelled - file was modified externally');
        }
      } else {
        notify('error', `Failed to save ${filePath}`, err instanceof Error ? err.message : String(err));
      }
    } finally {
      setSaving(false);
    }
  }, [filePath, fileId, content, canWrite, source, notify, refreshFiles, updateUrl]);

  // TODO: handleFileCreate can silently overwrite an existing file with the same name.
  // Should check existence first and confirm, similar to save-as above.
  const handleFileCreate = useCallback(async (path: string, fileContent: string) => {
    try {
      const olxPath = toOlxRelativePath(path);
      await storageRef.current.write(olxPath, fileContent);
      refreshFiles();
      // Switch to the new file — the file-loading effect will read from storage
      // and set content with the correct Redux key (don't call setContent here;
      // useFieldState's ref is stale until the next render).
      setFilePath(path);
      updateUrl(path);
      notify('success', `Created ${path}`);
    } catch (err) {
      console.error('Failed to create file:', err);
      notify('error', `Failed to create ${path}`, err instanceof Error ? err.message : String(err));
      throw err; // Re-throw so FilesPanel can handle it
    }
  }, [refreshFiles, notify, updateUrl]);

  const handleFileDelete = useCallback(async (path: string) => {
    try {
      await storageRef.current.delete(toOlxRelativePath(path));
      refreshFiles();
      // Remove from cache (keyed by (source, path))
      fileStateRef.current.delete(`${source}\n${path}`);
      // If we deleted the current file, clear the editor
      if (path === filePath) {
        setFilePath('');
        updateUrl('');
        setContent(DEMO_CONTENT);
      }
      notify('success', `Deleted ${path}`);
    } catch (err) {
      console.error('Failed to delete:', err);
      notify('error', `Failed to delete ${path}`, err instanceof Error ? err.message : String(err));
      throw err;
    }
  }, [filePath, source, refreshFiles, notify, updateUrl, setContent]);

  const handleFileRename = useCallback(async (oldPath: string, newPath: string) => {
    try {
      await storageRef.current.rename(toOlxRelativePath(oldPath), toOlxRelativePath(newPath));
      refreshFiles();
      // Move cache entry to the new (source, path) key
      const cachedState = fileStateRef.current.get(`${source}\n${oldPath}`);
      if (cachedState) {
        fileStateRef.current.delete(`${source}\n${oldPath}`);
        fileStateRef.current.set(`${source}\n${newPath}`, cachedState);
      }
      // If we renamed the current file, update the path and URL (replace, not push)
      if (oldPath === filePath) {
        setFilePath(newPath);
        updateUrl(newPath, { replace: true });
      }
      notify('success', `Renamed to ${newPath}`);
    } catch (err) {
      console.error('Failed to rename:', err);
      notify('error', `Failed to rename ${oldPath}`, err instanceof Error ? err.message : String(err));
      throw err;
    }
  }, [filePath, source, refreshFiles, notify, updateUrl]);

  // Handle browser back/forward navigation
  useEffect(() => {
    const handlePopState = () => {
      const url = new URL(window.location.href);
      const fileParam = url.searchParams.get('file') || '';
      if (fileParam !== filePath) {
        setFilePath(fileParam);
      }
      const sourceParam = url.searchParams.get('source') || '';
      if (sourceParam !== source) {
        setSource(sourceParam);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [filePath, source]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;

      // Command palette
      if (mod && e.key === 'k') {
        e.preventDefault();
        setCommandPaletteOpen(open => !open);
      }
      // Save
      if (mod && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
      // Toggle preview
      if (mod && e.key === 'p' && !e.shiftKey) {
        e.preventDefault();
        setShowPreview(p => !p);
      }
      // Escape closes overlays
      if (e.key === 'Escape') {
        setCommandPaletteOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleSave]);

  // Warn before closing with unsaved changes (any file)
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      const dirtyFiles = getDirtyFiles();
      if (dirtyFiles.size > 0) {
        e.preventDefault();
        // Modern browsers ignore custom messages, but we need to set returnValue
        e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
        return e.returnValue;
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [getDirtyFiles]);

  return (
    <div className="studio">
      {/* Sticky Header */}
      <header className="studio-header">
        <div className="studio-header-left">
          <button
            className="studio-btn icon"
            onClick={() => setSidebarOpen(o => !o)}
            title="Toggle sidebar"
          >
            ≡
          </button>
          <Link href="/" className="studio-title" title="Go to home">studio</Link>
          <SourceSelector sources={sources} value={source} onChange={handleSourceChange} />
        </div>
        <div className="studio-header-center">
          <span className="studio-filepath">
            {filePath || 'untitled'}{isDirty && <span className="studio-dirty-indicator" title="Unsaved changes"> •</span>}
          </span>
        </div>
        <div className="studio-header-right">
          <button
            className={`studio-btn ${showPreview ? 'active' : ''}`}
            onClick={() => setShowPreview(p => !p)}
            title="Toggle preview"
          >
            Preview
          </button>
          {showPreview && (
            <button
              className="studio-btn icon"
              onClick={() => setPreviewLayout(l => l === 'horizontal' ? 'vertical' : 'horizontal')}
              title={`Layout: ${previewLayout}`}
            >
              {previewLayout === 'horizontal' ? '⬌' : '⬍'}
            </button>
          )}
          <button
            className="studio-btn primary"
            onClick={() => handleSave()}
            disabled={saving || !canWrite}
            title={canWrite ? 'Save' : source ? 'This source is read-only' : 'Pick a repo to edit first'}
          >
            {saving && <span className="btn-spinner" />}
            {saving ? 'Saving...' : 'Save'}
          </button>
          <button className="studio-btn icon" title="More actions">
            ⋮
          </button>
        </div>
      </header>

      <div className="studio-body">
        {/* Sidebar */}
        <ResizableSidebar
          collapsed={!sidebarOpen}
          onCollapsedChange={c => setSidebarOpen(!c)}
          minWidth={200}
          maxWidth={600}
          chrome
          label="Studio sidebar"
          className="studio-sidebar"
        >
          <nav className="studio-sidebar-tabs">
            {(['chat', 'docs', 'search', 'files', 'data'] as SidebarTab[]).map(tab => (
              <button
                key={tab}
                className={`studio-sidebar-tab ${sidebarTab === tab ? 'active' : ''}`}
                onClick={() => setSidebarTab(tab)}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </nav>
          <div className="studio-sidebar-content">
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
            {sidebarTab === 'chat' && (
              <div className="sidebar-panel chat-panel">
                <EditorLLMChat
                  path={filePath}
                  getContent={() => getEditComponentState(editorFields.content, fileId, DEMO_CONTENT)}
                  onApplyEdit={setContent}
                  onOpenFile={handleFileSelect}
                  storage={storage}
                />
              </div>
            )}
            {sidebarTab === 'search' && (
              <SearchPanel
                idMap={idMap}
                content={content}
                currentPath={filePath}
                onFileSelect={handleFileSelect}
                onScrollToId={(id) => editorRef.current?.scrollToId(id)}
                onNotify={(type, msg) => notify(type, msg)}
              />
            )}
            {sidebarTab === 'data' && <DataPanel />}
            {sidebarTab === 'docs' && (
              <DocsPanel
                filePath={filePath}
                content={content}
                docsData={docsData}
                onInsert={(olx) => editorRef.current?.insertAtCursor(olx)}
              />
            )}
          </div>
        </ResizableSidebar>

        {/* Main Editor Area */}
        <main ref={mainRef} className={`studio-main ${filePath && showPreview ? `split ${previewLayout}` : ''}`}>
          {!filePath ? (
            <div className="studio-empty-state">
              <h2>No file open</h2>
              {!source ? (
                <p>Choose a repository from the menu in the header to start.</p>
              ) : canWrite ? (
                <>
                  <p>Pick a file from the Files panel, or create one.</p>
                  <button className="studio-btn primary" onClick={() => setNewFileOpen(true)}>
                    New file
                  </button>
                </>
              ) : (
                <p>This source is read-only. Pick a file from the Files panel to view it.</p>
              )}
            </div>
          ) : (
          <>
          <div
            className="studio-editor-pane"
            style={showPreview ? {
              [previewLayout === 'horizontal' ? 'width' : 'height']: `${editorRatio}%`,
              flex: 'none'
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
              path={filePath}
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
                        `"${filePath}" is outside any content namespace, so the ` +
                        `content sync will reject it and it cannot be previewed. ` +
                        `Move it into a namespace directory (content/<namespace>/...) ` +
                        `or add a manifest.yaml with a "namespace:" field.`
                      }
                    />
                  ) : (
                    <PreviewPane path={filePath} content={content} ns={previewNs} idMap={idMap} />
                  )}
                </div>
              </div>
            </>
          )}
          </>
          )}
        </main>
      </div>

      {/* New file dialog — single creation flow, opened from the Files panel
          "+" and the no-file placeholder. Directory = the open file's folder. */}
      <NewFileDialog
        open={newFileOpen}
        currentDir={filePath.includes('/') ? filePath.slice(0, filePath.lastIndexOf('/')) : ''}
        onCreate={handleFileCreate}
        onClose={() => setNewFileOpen(false)}
      />

      {/* Command Palette */}
      {commandPaletteOpen && (
        <CommandPalette
          onClose={() => setCommandPaletteOpen(false)}
          onSave={handleSave}
          onTogglePreview={() => setShowPreview(p => !p)}
          onInsert={(template) => editorRef.current?.insertAtCursor(template)}
        />
      )}

      {/* Toast Notifications */}
      <ToastNotifications
        notifications={notifications}
        onDismiss={dismissNotification}
        position="bottom-right"
        className="studio-notifications"
      />

      {/* Footer hint */}
      <footer className="studio-footer">
        <kbd>⌘K</kbd> Command palette
        <kbd>⌘`</kbd> Debug panel
        <Notice />
        <span
          role="button"
          tabIndex={0}
          onClick={() => setDebug(!debug)}
          onKeyDown={(e) => e.key === 'Enter' && setDebug(!debug)}
          className="studio-debug-toggle"
          title="Toggle debug mode"
        >
          {debug ? '[debug on]' : '[debug]'}
        </span>
      </footer>
    </div>
  );
}

// Template snippets for insertion
const TEMPLATES = {
  mcq: `<CapaProblem id="new_mcq" title="New Question">
  <KeyGrader>
    <p>Question text here</p>
    <ChoiceInput>
      <Key id="correct">Correct answer</Key>
      <Distractor id="d1">Wrong answer 1</Distractor>
      <Distractor id="d2">Wrong answer 2</Distractor>
    </ChoiceInput>
  </KeyGrader>
</CapaProblem>`,
  hint: `<Hint title="Hint">
  <Markdown>
Hint content here.
  </Markdown>
</Hint>`,
  markdown: `<Markdown>
Content here. Use **bold**, *italic*, and other markdown formatting.
</Markdown>`,
};

interface CommandPaletteProps {
  onClose: () => void;
  onSave: () => void;
  onTogglePreview: () => void;
  onInsert: (template: string) => void;
}

function CommandPalette({ onClose, onSave, onTogglePreview, onInsert }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const commands = [
    { id: 'save', label: 'Save', shortcut: '⌘S', action: () => { onSave(); onClose(); } },
    { id: 'toggle-preview', label: 'Toggle Preview', shortcut: '⌘P', action: () => { onTogglePreview(); onClose(); } },
    { id: 'insert-mcq', label: 'Insert: Multiple Choice Question', shortcut: '', action: () => { onInsert(TEMPLATES.mcq); onClose(); } },
    { id: 'insert-hint', label: 'Insert: Hint', shortcut: '', action: () => { onInsert(TEMPLATES.hint); onClose(); } },
    { id: 'insert-markdown', label: 'Insert: Markdown Block', shortcut: '', action: () => { onInsert(TEMPLATES.markdown); onClose(); } },
    { id: 'docs', label: 'Open documentation', shortcut: 'F1', action: () => { window.open('/docs/', '_blank'); onClose(); } },
    { id: 'goto-id', label: 'Go to ID...', shortcut: '⌘G', action: () => { /* TODO: implement ID search */ onClose(); } },
    { id: 'new-file', label: 'New File', shortcut: '⌘N', action: () => { /* TODO: implement new file */ onClose(); } },
    { id: 'fork', label: 'Fork to new file...', shortcut: '', action: () => { /* TODO: implement fork */ onClose(); } },
    { id: 'history', label: 'Show version history', shortcut: '', action: () => { /* TODO: implement history */ onClose(); } },
  ];

  const filtered = commands.filter(c =>
    c.label.toLowerCase().includes(query.toLowerCase())
  );

  // Reset selection when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(i => Math.min(i + 1, filtered.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(i => Math.max(i - 1, 0));
        break;
      case 'Enter':
        if (filtered.length > 0 && filtered[selectedIndex]) {
          filtered[selectedIndex].action();
        }
        break;
    }
  };

  return (
    <div className="command-palette-overlay" onClick={onClose}>
      <div className="command-palette" onClick={e => e.stopPropagation()}>
        <input
          type="text"
          className="command-palette-input"
          placeholder="Type a command..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          autoFocus
        />
        <div className="command-palette-results">
          {filtered.map((cmd, idx) => (
            <div
              key={cmd.id}
              className={`command-palette-item ${idx === selectedIndex ? 'selected' : ''}`}
              onClick={cmd.action}
              onMouseEnter={() => setSelectedIndex(idx)}
            >
              <span>{cmd.label}</span>
              {cmd.shortcut && <kbd>{cmd.shortcut}</kbd>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Wrap in Suspense to allow useSearchParams during static generation
// See: https://nextjs.org/docs/messages/missing-suspense-with-csr-bailout
export default function StudioPage() {
  return (
    <Suspense fallback={<Spinner>Loading Studio...</Spinner>}>
      <StudioPageContent />
    </Suspense>
  );
}
