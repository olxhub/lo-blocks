// src/app/studio/page.tsx
// Prototype editor - exploring layout and interaction patterns
'use client';

import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import PreviewPane from '@/components/common/PreviewPane';
import Spinner from '@/components/common/Spinner';
import { DataPanel, DocsPanel, FilesPanel, SearchPanel } from './panels';
import EditorLLMChat from './EditorLLMChat';
import { useDocsData } from '@/lib/docs';
import { NetworkStorageProvider, VersionConflictError } from '@/lib/lofs';
import { toOlxRelativePath } from '@/lib/lofs/types';
import type { UriNode } from '@/lib/lofs/types';
import type { IdMap } from '@/lib/types';
import { useNotifications, ToastNotifications } from '@/lib/util/debug';
import { useFieldState, getReduxState, settings } from '@/lib/state';
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

  <CapaProblem id="demo-mcq" title="Example Question">
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

// Create a single storage provider instance for content files
// Paths are relative to this namespace (OlxRelativePath), automatically converted to LofsPath
const storage = new NetworkStorageProvider('content');

// Redux state wrapper - matches /edit/ pattern for content persistence
// TODO: Pass baselineProps from useBaselineProps() instead of null
function useEditComponentState(field, provenance, defaultState) {
  return useFieldState(
    null,
    field,
    defaultState,
    { id: provenance }
  );
}

// Synchronous getter for edit component state - parallel to useEditComponentState
// TODO: Pass baselineProps instead of null
function getEditComponentState(field, provenance, defaultState) {
  return getReduxState(
    null,
    field,
    defaultState,
    { id: provenance }
  );
}

function StudioPageContent() {
  // Read initial file from URL query param
  const searchParams = useSearchParams();
  const initialFile = searchParams.get('file') || 'untitled.olx';

  // Debug mode toggle (system-wide setting)
  // TODO: Pass baselineProps from useBaselineProps() instead of null
  const [debug, setDebug] = useFieldState(null, settings.debug, false, { tag: 'studio', id: 'studio' });

  // TODO: Consider moving UI state to redux for analytics
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('chat');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  // File path synced with URL via ?file= param
  const [filePath, setFilePath] = useState(initialFile);

  // Content stored in Redux - enables analytics and persistence
  const [content, setContent] = useEditComponentState(
    editorFields.content,
    filePath,
    DEMO_CONTENT,
  );
  // TODO: Consider moving layout preferences to redux (persist across sessions)
  const [showPreview, setShowPreview] = useState(true);
  const [previewLayout, setPreviewLayout] = useState<PreviewLayout>('horizontal');
  const [sidebarWidth, setSidebarWidth] = useState(320);
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

  // Track per-file saved state for dirty detection and conflict detection
  // Maps filePath -> { content, metadata } for files we've loaded
  // TODO: Move file metadata tracking to redux (enables cross-component dirty detection)
  const fileStateRef = useRef<Map<string, { content: string; metadata: unknown }>>(new Map());

  // Get current file's saved state (for dirty detection)
  const savedState = fileStateRef.current.get(filePath);
  const isDirty = savedState ? content !== savedState.content : false;

  // Compute all dirty files (for beforeunload and file tree indicators)
  const getDirtyFiles = useCallback((): Set<string> => {
    const dirty = new Set<string>();
    for (const [path, saved] of fileStateRef.current.entries()) {
      const current = getEditComponentState(editorFields.content, path, DEMO_CONTENT);
      if (current !== undefined && current !== saved.content) {
        dirty.add(path);
      }
    }
    return dirty;
  }, []);

  // Toast notifications
  const { notifications, notify, dismiss: dismissNotification } = useNotifications();

  // Shared docs data hook
  const docsData = useDocsData();

  // Load file tree
  const refreshFiles = useCallback(() => {
    storage.listFiles().then(setFileTree).catch(console.error);
  }, []);

  // Load file tree and idMap on mount
  useEffect(() => {
    refreshFiles();
    // Use 'all' to get all IDs, not just launchable ones
    fetch('/api/content/all')
      .then(res => res.json())
      .then(data => setIdMap(data.idMap))
      .catch(console.error);
  }, [refreshFiles]);

  // Load file content when filePath changes
  // Only load from storage if we haven't loaded this file before -
  // otherwise Redux has the (possibly edited) content cached
  useEffect(() => {
    if (!filePath || filePath === 'untitled.olx') return;

    // If we've already loaded this file, use Redux cache (preserves edits)
    if (fileStateRef.current.has(filePath)) {
      return;
    }

    // First time loading this file - fetch from storage
    setLoading(true);
    let brandedPath;
    try {
      brandedPath = toOlxRelativePath(filePath, 'studio file load');
    } catch (err) {
      notify('error', `Invalid file path: ${filePath}`, err instanceof Error ? err.message : String(err));
      setLoading(false);
      return;
    }
    storage.read(brandedPath)
      .then(result => {
        setContent(result.content);
        fileStateRef.current.set(filePath, {
          content: result.content,
          metadata: result.metadata,
        });
      })
      .catch(err => {
        console.error('Failed to load file:', err);
        notify('error', `Failed to load ${filePath}`, err instanceof Error ? err.message : String(err));
      })
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filePath]); // Only reload when filePath changes

  // Update URL without page reload using History API
  const updateUrl = useCallback((path: string, replace = false) => {
    const url = new URL(window.location.href);
    if (path === 'untitled.olx') {
      url.searchParams.delete('file');
    } else {
      url.searchParams.set('file', path);
    }
    // Use pushState for file changes (enables back/forward), replaceState for renames
    if (replace) {
      window.history.replaceState({}, '', url.toString());
    } else {
      window.history.pushState({}, '', url.toString());
    }
  }, []);

  // File selection updates path and URL - content loading handled by effect above
  const handleFileSelect = useCallback((path: string) => {
    setFilePath(path);
    updateUrl(path);
  }, [updateUrl]);

  const handleSave = useCallback(async (force = false) => {
    setSaving(true);
    try {
      const previousMetadata = fileStateRef.current.get(filePath)?.metadata;
      const brandedPath = toOlxRelativePath(filePath, 'studio save');
      await storage.write(brandedPath, content, {
        previousMetadata,
        force,
      });
      // Re-read to get updated metadata
      const result = await storage.read(brandedPath);
      // Update saved state (marks file as clean, updates metadata for conflict detection)
      fileStateRef.current.set(filePath, {
        content,
        metadata: result.metadata,
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
  }, [filePath, content, notify]);

  const handleFileCreate = useCallback(async (path: string, fileContent: string) => {
    try {
      const brandedPath = toOlxRelativePath(path, 'studio create');
      await storage.write(brandedPath, fileContent);
      refreshFiles();
      // Open the new file and get its metadata
      const result = await storage.read(brandedPath);
      setFilePath(path);
      updateUrl(path);
      setContent(result.content);
      fileStateRef.current.set(path, {
        content: result.content,
        metadata: result.metadata,
      });
      notify('success', `Created ${path}`);
    } catch (err) {
      console.error('Failed to create file:', err);
      notify('error', `Failed to create ${path}`, err instanceof Error ? err.message : String(err));
      throw err; // Re-throw so FilesPanel can handle it
    }
  }, [refreshFiles, notify, updateUrl, setContent]);

  const handleFileDelete = useCallback(async (path: string) => {
    try {
      await storage.delete(toOlxRelativePath(path, 'studio delete'));
      refreshFiles();
      // Remove from cache
      fileStateRef.current.delete(path);
      // If we deleted the current file, clear the editor
      if (path === filePath) {
        setFilePath('untitled.olx');
        updateUrl('untitled.olx');
        setContent(DEMO_CONTENT);
      }
      notify('success', `Deleted ${path}`);
    } catch (err) {
      console.error('Failed to delete:', err);
      notify('error', `Failed to delete ${path}`, err instanceof Error ? err.message : String(err));
      throw err;
    }
  }, [filePath, refreshFiles, notify, updateUrl, setContent]);

  const handleFileRename = useCallback(async (oldPath: string, newPath: string) => {
    try {
      await storage.rename(toOlxRelativePath(oldPath, 'studio rename old'), toOlxRelativePath(newPath, 'studio rename new'));
      refreshFiles();
      // Move cache entry to new path
      const cachedState = fileStateRef.current.get(oldPath);
      if (cachedState) {
        fileStateRef.current.delete(oldPath);
        fileStateRef.current.set(newPath, cachedState);
      }
      // If we renamed the current file, update the path and URL (replace, not push)
      if (oldPath === filePath) {
        setFilePath(newPath);
        updateUrl(newPath, true);
      }
      notify('success', `Renamed to ${newPath}`);
    } catch (err) {
      console.error('Failed to rename:', err);
      notify('error', `Failed to rename ${oldPath}`, err instanceof Error ? err.message : String(err));
      throw err;
    }
  }, [filePath, refreshFiles, notify, updateUrl]);

  // Handle browser back/forward navigation
  useEffect(() => {
    const handlePopState = () => {
      const url = new URL(window.location.href);
      const fileParam = url.searchParams.get('file') || 'untitled.olx';
      if (fileParam !== filePath) {
        setFilePath(fileParam);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [filePath]);

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
        </div>
        <div className="studio-header-center">
          <span className="studio-filepath">
            {filePath}{isDirty && <span className="studio-dirty-indicator" title="Unsaved changes"> •</span>}
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
          <button className="studio-btn primary" onClick={() => handleSave()} disabled={saving}>
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
        {sidebarOpen && (
          <>
            <aside className="studio-sidebar" style={{ width: sidebarWidth }}>
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
                    onFileSelect={handleFileSelect}
                    onFileCreate={handleFileCreate}
                    onFileDelete={handleFileDelete}
                    onFileRename={handleFileRename}
                  />
                )}
                {sidebarTab === 'chat' && (
                  <div className="sidebar-panel chat-panel">
                    <EditorLLMChat
                      path={filePath}
                      getContent={() => getEditComponentState(editorFields.content, filePath, DEMO_CONTENT)}
                      onApplyEdit={setContent}
                      onOpenFile={handleFileSelect}
                      theme="dark"
                    />
                  </div>
                )}
                {sidebarTab === 'search' && (
                  <SearchPanel
                    idMap={idMap}
                    content={content}
                    onFileSelect={handleFileSelect}
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
            </aside>
            <Resizer onResize={(delta) => setSidebarWidth(w => Math.max(200, Math.min(600, w + delta)))} />
          </>
        )}

        {/* Main Editor Area */}
        <main className={`studio-main ${showPreview ? `split ${previewLayout}` : ''}`}>
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
              onChange={setContent}
              path={filePath}
              height="100%"
              theme="light"
            />
          </div>
          {showPreview && (
            <>
              <PaneResizer
                direction={previewLayout === 'horizontal' ? 'horizontal' : 'vertical'}
                onResize={(delta, containerSize) => {
                  const deltaPct = (delta / containerSize) * 100;
                  setEditorRatio(r => Math.max(20, Math.min(80, r + deltaPct)));
                }}
              />
              <div className="studio-preview-pane">
                <div className="studio-preview-header">Preview</div>
                <div className="studio-preview-content">
                  <PreviewPane path={filePath} content={content} idMap={idMap} />
                </div>
              </div>
            </>
          )}
        </main>
      </div>

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

// Draggable resizer for sidebar
function Resizer({ onResize }: { onResize: (delta: number) => void }) {
  const startX = useRef(0);
  const cleanupRef = useRef<(() => void) | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (cleanupRef.current) {
        cleanupRef.current();
      }
    };
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    startX.current = e.clientX;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const handleMouseMove = (e: MouseEvent) => {
      const delta = e.clientX - startX.current;
      startX.current = e.clientX;
      onResize(delta);
    };

    const cleanup = () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      cleanupRef.current = null;
    };

    const handleMouseUp = () => cleanup();

    cleanupRef.current = cleanup;
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  return <div className="studio-resizer" onMouseDown={handleMouseDown} />;
}

// Draggable resizer for editor/preview panes (supports both directions)
function PaneResizer({
  direction,
  onResize
}: {
  direction: 'horizontal' | 'vertical';
  onResize: (delta: number, containerSize: number) => void;
}) {
  const startPos = useRef(0);
  const resizerRef = useRef<HTMLDivElement>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (cleanupRef.current) {
        cleanupRef.current();
      }
    };
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    startPos.current = direction === 'horizontal' ? e.clientX : e.clientY;
    document.body.style.cursor = direction === 'horizontal' ? 'col-resize' : 'row-resize';
    document.body.style.userSelect = 'none';

    // Get container size for percentage calculation
    const container = resizerRef.current?.parentElement;
    const containerSize = container
      ? (direction === 'horizontal' ? container.clientWidth : container.clientHeight)
      : 1000;

    const handleMouseMove = (e: MouseEvent) => {
      const currentPos = direction === 'horizontal' ? e.clientX : e.clientY;
      const delta = currentPos - startPos.current;
      startPos.current = currentPos;
      onResize(delta, containerSize);
    };

    const cleanup = () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      cleanupRef.current = null;
    };

    const handleMouseUp = () => cleanup();

    cleanupRef.current = cleanup;
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  return (
    <div
      ref={resizerRef}
      className={`studio-pane-resizer ${direction}`}
      onMouseDown={handleMouseDown}
    />
  );
}

// Template snippets for insertion
const TEMPLATES = {
  mcq: `<CapaProblem id="new-mcq" title="New Question">
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
