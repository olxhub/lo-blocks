// apps/web/app/studio/StudioPage.tsx
// Prototype editor - exploring layout and interaction patterns
'use client';

import { useState, useEffect, useCallback, useMemo, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Spinner from '@/components/common/Spinner';
import ResizableSidebar from '@/components/common/ResizableSidebar';
import { DataPanel, DocsPanel, FilesPanel, SearchPanel } from './panels';
import EditorLLMChat from './EditorLLMChat';
import SourceSelector, { type SourceOption } from './SourceSelector';
import NewFileDialog from './NewFileDialog';
import FileEditor, { type FileCache } from './FileEditor';
import { getStudioContent, setStudioContent } from './editorState';
import { useDocsData } from '@/lib/docs';
import { NetworkStorageProvider, VersionConflictError } from '@/lib/lofs';
import { fetchAllOlxJson } from '@/lib/content/fetchOlxJson';
import { toOlxRelativePath } from '@/lib/types/storage';
import type { UriNode } from '@/lib/types/storage';
import { toLofsOrigin, makeAddress, toLofsContentPath } from '@/lib/types/address';
import type { IdMap, LofsOrigin, LofsRef } from '@/lib/types';
import { useNotifications, ToastNotifications } from '@/lib/util/debug';
import { useFieldState, settings } from '@/lib/state';
import Notice from '@/components/common/Notice';
import './studio.css';

// Handle type for the editor ref (insert/scroll actions reach into FileEditor).
import type { CodeEditorHandle } from '@/components/common/CodeEditor';

type SidebarTab = 'chat' | 'docs' | 'search' | 'files' | 'data';
type PreviewLayout = 'horizontal' | 'vertical';

// The storage provider is created per selected source inside the component
// (origin-scoped): every read/write targets the repo the user is editing, not
// a union-routed guess. See the `storage` useMemo below.

// A file's identity is its LofsRef in the selected source — the same
// {source}://{path} grammar used everywhere, not a bespoke cache key. Built
// only where a source is selected (the editing state always has one); the
// no-source picker state has no open file and so needs no ref.
const fileRef = (origin: LofsOrigin, path: string): LofsRef =>
  makeAddress(origin, toLofsContentPath(path));

// Decode a ?source= URL param into an origin. The URL is an untrusted boundary,
// so a malformed value (empty, stray "#") fails CLOSED to "no source selected"
// rather than throwing from render — the picker then shows. (This is the
// sanctioned boundary exception to fail-fast: decode-and-reject, don't crash.)
function sourceFromParam(raw: string | null): LofsOrigin | undefined {
  if (!raw) return undefined;
  try {
    return toLofsOrigin(raw);
  } catch {
    console.warn(`Ignoring malformed ?source=: ${raw}`);
    return undefined;
  }
}

// Decode a ?file= URL param into a repo-relative path. Same untrusted boundary
// as sourceFromParam: a structurally-invalid value (notably a "#", which would
// throw when fileId = makeAddress(source, toLofsContentPath(file)) is derived
// during render) fails CLOSED to "no file open" — the placeholder shows, which
// offers New file. (Tree selection and create produce trusted paths.)
// TODO: a crafted/typo'd link should show a real "file not found" with an offer
// to create — see tasklist; this only prevents the render crash.
function fileFromParam(raw: string | null): string {
  if (!raw) return '';
  try {
    toOlxRelativePath(raw);
    return raw;
  } catch {
    console.warn(`Ignoring malformed ?file=: ${raw}`);
    return '';
  }
}

function StudioPageContent() {
  // Read initial file + source from URL query params
  const searchParams = useSearchParams();

  // The source (origin) being edited. Undefined until picked (bare /studio
  // shows the picker); otherwise it comes from the entry link's ?source=.
  // Lazy initializers so the boundary decode runs once, not every render.
  const [source, setSource] = useState<LofsOrigin | undefined>(
    () => sourceFromParam(searchParams.get('source'))
  );

  // The sources this deployment offers, for the working-repo picker. The
  // /api/sources JSON drops the LofsOrigin brand, so re-brand on receipt.
  const [sources, setSources] = useState<SourceOption[]>([]);
  useEffect(() => {
    fetch('/api/sources')
      .then(r => r.json())
      .then(j => {
        if (!j.ok) return;
        setSources(j.sources.map((s: { origin: string; label: string; writable: boolean }) => ({
          ...s,
          origin: toLofsOrigin(s.origin),
        })));
      })
      .catch(console.error);
  }, []);

  // Studio is a client-only app: its render depends on the URL (?source=/?file=
  // via useSearchParams) and on client-fetched `sources` — data the server
  // doesn't have at SSR time, so an SSR'd shell can't match the hydrated client
  // (e.g. the Save button's `disabled`). Gate on mount: server + first client
  // render show the loading shell; the real UI renders after hydration. (This
  // is what the page's <Suspense fallback> was reaching for — made reliable.)
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // The selected source's metadata. Undefined when nothing's picked yet or the
  // URL named one we don't offer — both legitimate "can't write" states.
  const currentSource = sources.find(s => s.origin === source);
  const canWrite = currentSource ? currentSource.writable : false;

  // Origin-scoped provider: all file ops target this one source. A ref mirrors
  // it so the callbacks below don't each need it in their dependency lists.
  const storage = useMemo(() => new NetworkStorageProvider(source), [source]);
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
  // File path synced with URL via ?file= param (validated at the boundary).
  const [filePath, setFilePath] = useState(() => fileFromParam(searchParams.get('file')));

  // The open file's identity: its LofsRef in the selected source. Undefined
  // when no file is open in a source (the picker/placeholder state) — the redux
  // and cache keys then fall back to the scratch buffer. This is why content,
  // metadata, and dirty-state never bleed across sources: the same path in two
  // repos is two different refs.
  const fileId: LofsRef | undefined =
    source && filePath ? fileRef(source, filePath) : undefined;

  // TODO: Consider moving layout preferences to redux (persist across sessions)
  const [showPreview, setShowPreview] = useState(true);
  const [previewLayout, setPreviewLayout] = useState<PreviewLayout>('horizontal');
  // TODO: Move fileTree to redux (shared across components)
  const [fileTree, setFileTree] = useState<UriNode | null>(null);
  const [saving, setSaving] = useState(false);
  // Live content of the open file, mirrored up from FileEditor (which owns the
  // reactive hook). Lets the parent re-render as you type — so dirty state and
  // content-derived sidebars (search IDs, docs) stay in sync — without the
  // parent holding a content hook (which would need a key when no file is open).
  const [openContent, setOpenContent] = useState('');
  // TODO: Move idMap to redux (shared content index)
  const [idMap, setIdMap] = useState<IdMap | null>(null);

  // Editor handle for insert/scroll actions; FileEditor forwards it to CodeEditor.
  const editorRef = useRef<CodeEditorHandle>(null);

  // Per-source cache of loaded files (provenance metadata + namespace), keyed by
  // LofsRef. FileEditor populates it on load; the parent reads it for save
  // (conflict metadata) and the file tree (dirty dots).
  const fileStateRef = useRef<FileCache>(new Map());

  // Dirty = open file's live content diverges from its last-saved snapshot.
  const savedContent = fileId ? fileStateRef.current.get(fileId)?.content : undefined;
  const isDirty = savedContent !== undefined && openContent !== savedContent;

  // Dirty files for the CURRENT source (tree indicators + beforeunload). Cache
  // keys are the file's LofsRef ({source}://{path}); keep this source's, return
  // the repo-relative paths. Recomputed each render (the parent re-renders as the
  // open file's content changes, via openContent).
  const getDirtyFiles = useCallback((): Set<string> => {
    const dirty = new Set<string>();
    if (!source) return dirty;
    const prefix = `${source}://`;
    for (const [key, saved] of fileStateRef.current.entries()) {
      if (!key.startsWith(prefix)) continue;
      if (getStudioContent(key) !== saved.content) {
        dirty.add(key.slice(prefix.length));  // → repo-relative path
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

  // (File content loading lives in FileEditor — it owns the reactive content.)

  // Update URL without page reload using History API. Keeps ?source= in sync
  // with the edited source, so a deep link reopens the same repo + file. The
  // `source` override lets a caller write a source it just set (state hasn't
  // committed yet, so the closure's `source` would be stale).
  const updateUrl = useCallback(
    (path: string, { replace = false, source: src = source }: { replace?: boolean; source?: LofsOrigin } = {}) => {
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
  const handleSourceChange = useCallback((origin: LofsOrigin) => {
    if (origin === source) return;
    setSource(origin);
    setFilePath('');
    updateUrl('', { source: origin });
  }, [source, updateUrl]);

  const handleSave = useCallback(async (force = false) => {
    // Saving needs a writable source AND an open file. The Save button is
    // disabled otherwise; this guards the ⌘S path (and narrows both to defined).
    if (!canWrite || !source || !filePath) {
      notify('error', source ? 'Open a file to save' : 'Pick a repo to edit first');
      return;
    }
    setSaving(true);
    try {
      const id = fileRef(source, filePath);
      const content = getStudioContent(id);  // current edited content (synchronous)
      const previousMetadata = fileStateRef.current.get(id)?.metadata;
      const olxPath = toOlxRelativePath(filePath);
      await storageRef.current.save(olxPath, content, { previousMetadata, force });
      // Re-read to refresh conflict metadata; mark clean.
      const result = await storageRef.current.read(olxPath);
      fileStateRef.current.set(id, { content, metadata: result.metadata, ns: result.ns });
      notify('success', `Saved ${filePath}`);  // isDirty derives false (saved === live)
    } catch (err) {
      console.error('Failed to save:', err);
      // Version conflict — offer a force overwrite (once).
      if (!force && (err instanceof VersionConflictError || (err as any)?.name === 'VersionConflictError')) {
        const shouldOverwrite = window.confirm(
          'This file has been modified externally since you opened it.\n\n' +
          'Do you want to overwrite the external changes with your version?'
        );
        if (shouldOverwrite) {
          setSaving(false);
          handleSave(true); // Retry with force
          return;
        }
        notify('info', 'Save cancelled - file was modified externally');
      } else {
        notify('error', `Failed to save ${filePath}`, err instanceof Error ? err.message : String(err));
      }
    } finally {
      setSaving(false);
    }
  }, [filePath, canWrite, source, notify]);

  // TODO: handleFileCreate can silently overwrite an existing file with the same name.
  // Should check existence first and confirm, similar to save-as above.
  const handleFileCreate = useCallback(async (path: string, fileContent: string) => {
    try {
      const olxPath = toOlxRelativePath(path);
      // create: must not clobber an existing file (route returns 409 if it exists).
      await storageRef.current.save(olxPath, fileContent, { create: true });
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
    if (!source) return;  // delete targets a specific source (UI gates on canWrite)
    try {
      await storageRef.current.remove(toOlxRelativePath(path));
      refreshFiles();
      // Remove from cache (keyed by the file's ref)
      fileStateRef.current.delete(fileRef(source, path));
      // If we deleted the current file, close the editor (FileEditor unmounts;
      // fileId becomes undefined so isDirty derives false).
      if (path === filePath) {
        setFilePath('');
        updateUrl('');
      }
      notify('success', `Deleted ${path}`);
    } catch (err) {
      console.error('Failed to delete:', err);
      notify('error', `Failed to delete ${path}`, err instanceof Error ? err.message : String(err));
      throw err;
    }
  }, [filePath, source, refreshFiles, notify, updateUrl]);

  const handleFileRename = useCallback(async (oldPath: string, newPath: string) => {
    if (!source) return;  // rename targets a specific source (UI gates on canWrite)
    try {
      await storageRef.current.move(toOlxRelativePath(oldPath), toOlxRelativePath(newPath));
      refreshFiles();
      // Move cache entry to the new ref
      const cachedState = fileStateRef.current.get(fileRef(source, oldPath));
      if (cachedState) {
        fileStateRef.current.delete(fileRef(source, oldPath));
        fileStateRef.current.set(fileRef(source, newPath), cachedState);
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
      const fileParam = fileFromParam(url.searchParams.get('file'));
      if (fileParam !== filePath) {
        setFilePath(fileParam);
      }
      const sourceParam = sourceFromParam(url.searchParams.get('source'));
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

  // Client-only: until mounted, render the same shell the server does, so there's
  // no hydration mismatch from URL/`sources`-dependent UI. (All hooks above run
  // every render — this guard is after them, so hook order stays stable.)
  if (!mounted) return <Spinner>Loading Studio...</Spinner>;

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
            disabled={saving || !canWrite || !filePath}
            title={
              !source ? 'Pick a repo to edit first'
                : !canWrite ? 'This source is read-only'
                : !filePath ? 'Open a file to save'
                : 'Save'
            }
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
                  getContent={() => (fileId ? getStudioContent(fileId) : '')}
                  onApplyEdit={(v: string) => { if (fileId) setStudioContent(fileId, v); }}
                  onOpenFile={handleFileSelect}
                  storage={storage}
                />
              </div>
            )}
            {sidebarTab === 'search' && (
              <SearchPanel
                idMap={idMap}
                content={fileId ? openContent : ''}
                currentPath={filePath}
                currentSource={source}
                onFileSelect={handleFileSelect}
                onScrollToId={(id) => editorRef.current?.scrollToId(id)}
              />
            )}
            {sidebarTab === 'data' && <DataPanel />}
            {sidebarTab === 'docs' && (
              <DocsPanel
                filePath={filePath}
                content={fileId ? openContent : ''}
                docsData={docsData}
                onInsert={(olx) => editorRef.current?.insertAtCursor(olx)}
              />
            )}
          </div>
        </ResizableSidebar>

        {/* Main Editor Area — FileEditor mounts only with a definite (source,
            file); otherwise the no-file placeholder shows. */}
        {source && filePath ? (
          <FileEditor
            source={source}
            path={filePath}
            storage={storage}
            idMap={idMap}
            cache={fileStateRef.current}
            editorRef={editorRef}
            showPreview={showPreview}
            previewLayout={previewLayout}
            onContentChange={setOpenContent}
            onError={(title, message) => notify('error', title, message)}
          />
        ) : (
          <main className="studio-main">
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
          </main>
        )}
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
          onNewFile={() => setNewFileOpen(true)}
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
  onNewFile: () => void;
}

interface Command {
  id: string;
  label: string;
  shortcut?: string;
  action: () => void;
  /**
   * A PREVIEW command: shown so the palette's roadmap is visible, but not yet
   * wired. Rendered greyed with a "soon" tag (so the user never clicks a thing
   * that silently no-ops) and inert. The per-item comment says what to wire.
   */
  soon?: boolean;
}

function CommandPalette({ onClose, onSave, onTogglePreview, onInsert, onNewFile }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const commands: Command[] = [
    { id: 'save', label: 'Save', shortcut: '⌘S', action: () => { onSave(); onClose(); } },
    { id: 'new-file', label: 'New File', shortcut: '⌘N', action: () => { onNewFile(); onClose(); } },
    { id: 'toggle-preview', label: 'Toggle Preview', shortcut: '⌘P', action: () => { onTogglePreview(); onClose(); } },
    // TODO(studio-as-blocks): "Insert" should open a block palette (Insert → pick
    // a block, driven by the block registry), not this flat list of hardcoded
    // templates. These three are the interim stand-in.
    { id: 'insert-mcq', label: 'Insert: Multiple Choice Question', action: () => { onInsert(TEMPLATES.mcq); onClose(); } },
    { id: 'insert-hint', label: 'Insert: Hint', action: () => { onInsert(TEMPLATES.hint); onClose(); } },
    { id: 'insert-markdown', label: 'Insert: Markdown Block', action: () => { onInsert(TEMPLATES.markdown); onClose(); } },
    { id: 'docs', label: 'Open documentation', shortcut: 'F1', action: () => { window.open('/docs/', '_blank'); onClose(); } },
    // --- Previews (roadmap; wired later, see TODOs) ---
    // TODO: wire to the Search panel — open it, focus search, jump to the id.
    { id: 'goto-id', label: 'Go to ID…', soon: true, action: () => {} },
    // TODO: fork the current file to a new name in the same (or a new) source.
    { id: 'fork', label: 'Fork to new file…', soon: true, action: () => {} },
    // TODO(content-in-git): show the file's git history — or link to the forge's
    // history — and (now within reach) load the content at a chosen commit.
    { id: 'history', label: 'Show version history', soon: true, action: () => {} },
  ];

  const filtered = commands.filter(c =>
    c.label.toLowerCase().includes(query.toLowerCase())
  );

  // Run a command — previews ("soon") are inert.
  const run = (cmd: Command) => { if (!cmd.soon) cmd.action(); };

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
          run(filtered[selectedIndex]);
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
              className={`command-palette-item ${idx === selectedIndex ? 'selected' : ''} ${cmd.soon ? 'soon' : ''}`}
              onClick={() => run(cmd)}
              onMouseEnter={() => setSelectedIndex(idx)}
            >
              <span>{cmd.label}</span>
              {cmd.soon
                ? <span className="command-palette-soon">soon</span>
                : cmd.shortcut && <kbd>{cmd.shortcut}</kbd>}
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
