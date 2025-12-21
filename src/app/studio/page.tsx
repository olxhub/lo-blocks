// src/app/studio/page.tsx
// Prototype editor - exploring layout and interaction patterns
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import RenderOLX from '@/components/common/RenderOLX';
import EditorLLMChat from '@/components/chat/EditorLLMChat';
import { NetworkStorageProvider } from '@/lib/storage';
import type { UriNode } from '@/lib/storage/types';
import './studio.css';

// Dynamic import CodeMirror to avoid SSR issues
const CodeEditor = dynamic(
  () => import('@/components/common/CodeEditor'),
  { ssr: false }
);

type SidebarTab = 'chat' | 'docs' | 'search' | 'files' | 'data';
type PreviewLayout = 'horizontal' | 'vertical';

// IdMap entry from /api/content/root
interface IdMapEntry {
  tag: string;
  attributes?: Record<string, unknown>;
  provenance?: string[];
}

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

// Create a single storage provider instance
const storage = new NetworkStorageProvider();

export default function StudioPage() {
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('chat');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [content, setContent] = useState(DEMO_CONTENT);
  const [filePath, setFilePath] = useState('untitled.olx');
  const [showPreview, setShowPreview] = useState(true);
  const [previewLayout, setPreviewLayout] = useState<PreviewLayout>('horizontal');
  const [sidebarWidth, setSidebarWidth] = useState(320);
  const [editorRatio, setEditorRatio] = useState(50); // percentage for editor pane
  const [fileTree, setFileTree] = useState<UriNode | null>(null);
  const [loading, setLoading] = useState(false);
  const [idMap, setIdMap] = useState<Record<string, IdMapEntry> | null>(null);

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

  // Load file content when path changes
  const handleFileSelect = useCallback(async (path: string) => {
    setLoading(true);
    try {
      const fileContent = await storage.read(path);
      setContent(fileContent);
      setFilePath(path);
    } catch (err) {
      console.error('Failed to load file:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSave = useCallback(async () => {
    setLoading(true);
    try {
      await storage.write(filePath, content);
      console.log('Saved:', filePath);
    } catch (err) {
      console.error('Failed to save:', err);
    } finally {
      setLoading(false);
    }
  }, [filePath, content]);

  const handleFileCreate = useCallback(async (path: string, fileContent: string) => {
    await storage.write(path, fileContent);
    refreshFiles();
    // Open the new file
    setContent(fileContent);
    setFilePath(path);
  }, [refreshFiles]);

  const handleFileDelete = useCallback(async (path: string) => {
    await storage.delete(path);
    refreshFiles();
    // If we deleted the current file, clear the editor
    if (path === filePath) {
      setContent(DEMO_CONTENT);
      setFilePath('untitled.olx');
    }
  }, [filePath, refreshFiles]);

  const handleFileRename = useCallback(async (oldPath: string, newPath: string) => {
    await storage.rename(oldPath, newPath);
    refreshFiles();
    // If we renamed the current file, update the path
    if (oldPath === filePath) {
      setFilePath(newPath);
    }
  }, [filePath, refreshFiles]);

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
          <span className="studio-title">studio</span>
        </div>
        <div className="studio-header-center">
          <span className="studio-filepath">{filePath}</span>
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
          <button className="studio-btn primary" onClick={handleSave}>
            Save
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
                <SidebarPanel
                  tab={sidebarTab}
                  filePath={filePath}
                  content={content}
                  onApplyEdit={setContent}
                  onFileSelect={handleFileSelect}
                  onFileCreate={handleFileCreate}
                  onFileDelete={handleFileDelete}
                  onFileRename={handleFileRename}
                  onRefreshFiles={refreshFiles}
                  fileTree={fileTree}
                  idMap={idMap}
                />
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
            <CodeEditor
              value={content}
              onChange={setContent}
              path={filePath}
              height="100%"
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
                  <RenderOLX id="studio-preview" inline={content} />
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
          onInsert={(template) => setContent(c => c + '\n\n' + template)}
        />
      )}

      {/* Footer hint */}
      <footer className="studio-footer">
        <kbd>⌘K</kbd> Command palette
      </footer>
    </div>
  );
}

// Draggable resizer for sidebar
function Resizer({ onResize }: { onResize: (delta: number) => void }) {
  const startX = useRef(0);
  const dragging = useRef(false);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    startX.current = e.clientX;
    dragging.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      const delta = e.clientX - startX.current;
      startX.current = e.clientX;
      onResize(delta);
    };

    const handleMouseUp = () => {
      dragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

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
  const dragging = useRef(false);
  const resizerRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    startPos.current = direction === 'horizontal' ? e.clientX : e.clientY;
    dragging.current = true;
    document.body.style.cursor = direction === 'horizontal' ? 'col-resize' : 'row-resize';
    document.body.style.userSelect = 'none';

    // Get container size for percentage calculation
    const container = resizerRef.current?.parentElement;
    const containerSize = container
      ? (direction === 'horizontal' ? container.clientWidth : container.clientHeight)
      : 1000;

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      const currentPos = direction === 'horizontal' ? e.clientX : e.clientY;
      const delta = currentPos - startPos.current;
      startPos.current = currentPos;
      onResize(delta, containerSize);
    };

    const handleMouseUp = () => {
      dragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

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

interface SidebarPanelProps {
  tab: SidebarTab;
  filePath: string;
  content: string;
  onApplyEdit: (newContent: string) => void;
  onFileSelect: (path: string) => void;
  onFileCreate: (path: string, content: string) => Promise<void>;
  onFileDelete: (path: string) => Promise<void>;
  onFileRename: (oldPath: string, newPath: string) => Promise<void>;
  onRefreshFiles: () => void;
  fileTree: UriNode | null;
  idMap: Record<string, IdMapEntry> | null;
}

// Extract IDs and their tag names from OLX content
function extractIds(content: string): Array<{ id: string; tag: string }> {
  const results: Array<{ id: string; tag: string }> = [];
  // Match <TagName ... id="value" ...>
  const regex = /<(\w+)[^>]*\bid=["']([^"']+)["'][^>]*>/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    results.push({ tag: match[1], id: match[2] });
  }
  return results;
}

// Extract unique element tags used in content
function extractElements(content: string): string[] {
  const tags = new Set<string>();
  // Match opening tags <TagName ...>
  const regex = /<([A-Z]\w*)/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    tags.add(match[1]);
  }
  return Array.from(tags).sort();
}

// Inline docs for elements - description + example
const ELEMENT_DOCS: Record<string, { desc: string; example: string }> = {
  Markdown: {
    desc: 'Rich text content using Markdown syntax',
    example: `<Markdown>
# Heading
**Bold** and *italic* text.
</Markdown>`,
  },
  CapaProblem: {
    desc: 'Container for a graded problem with inputs and graders',
    example: `<CapaProblem id="q1" title="Question">
  <KeyGrader>
    <p>Question text</p>
    <ChoiceInput>...</ChoiceInput>
  </KeyGrader>
</CapaProblem>`,
  },
  KeyGrader: {
    desc: 'Grades based on Key/Distractor answer keys',
    example: `<KeyGrader>
  <p>Which is correct?</p>
  <ChoiceInput>
    <Key id="a">Correct</Key>
    <Distractor id="b">Wrong</Distractor>
  </ChoiceInput>
</KeyGrader>`,
  },
  ChoiceInput: {
    desc: 'Multiple choice input with Key and Distractor options',
    example: `<ChoiceInput>
  <Key id="correct">Right answer</Key>
  <Distractor id="d1">Wrong 1</Distractor>
  <Distractor id="d2">Wrong 2</Distractor>
</ChoiceInput>`,
  },
  Key: {
    desc: 'Correct answer option in a ChoiceInput',
    example: `<Key id="correct">The right answer</Key>`,
  },
  Distractor: {
    desc: 'Incorrect answer option in a ChoiceInput',
    example: `<Distractor id="wrong1">A wrong answer</Distractor>`,
  },
  Vertical: {
    desc: 'Stack children vertically',
    example: `<Vertical>
  <Markdown>First</Markdown>
  <Markdown>Second</Markdown>
</Vertical>`,
  },
  Horizontal: {
    desc: 'Arrange children horizontally',
    example: `<Horizontal>
  <Markdown>Left</Markdown>
  <Markdown>Right</Markdown>
</Horizontal>`,
  },
  Hint: {
    desc: 'Collapsible hint that students can reveal',
    example: `<Hint title="Need help?">
  <Markdown>Here's a hint...</Markdown>
</Hint>`,
  },
  Image: {
    desc: 'Display an image',
    example: `<Image src="/path/to/image.png" alt="Description" />`,
  },
  Video: {
    desc: 'Embed a video player',
    example: `<Video src="https://youtube.com/watch?v=..." />`,
  },
  TextInput: {
    desc: 'Free-text input field',
    example: `<TextInput id="answer" placeholder="Type here..." />`,
  },
  NumberInput: {
    desc: 'Numeric input field',
    example: `<NumberInput id="num" min="0" max="100" />`,
  },
};

// Detect file type for context-aware docs
function getFileDocType(path: string): 'olx' | 'peg' | 'markdown' | 'unknown' {
  const ext = path.split('.').pop()?.toLowerCase();
  if (ext === 'olx' || ext === 'xml') return 'olx';
  if (ext === 'chatpeg' || ext === 'sortpeg' || ext === 'matchpeg') return 'peg';
  if (ext === 'md' || ext === 'markdown') return 'markdown';
  return 'unknown';
}

interface FileTreeNodeProps {
  node: UriNode;
  depth: number;
  onSelect: (path: string) => void;
  currentPath: string;
  onShowActions: (path: string) => void;
  actionPath: string | null;
  onDelete: (path: string) => void;
  onRename: (path: string) => void;
  renameValue: string;
  onRenameChange: (value: string) => void;
}

function FileTreeNode({
  node, depth, onSelect, currentPath,
  onShowActions, actionPath, onDelete, onRename, renameValue, onRenameChange
}: FileTreeNodeProps) {
  const [expanded, setExpanded] = useState(depth < 2);
  const isDir = node.children && node.children.length > 0;
  const name = node.uri.split('/').pop() || node.uri;
  const isActive = node.uri === currentPath;
  const showingActions = actionPath === node.uri;

  return (
    <div>
      <div
        className={`file-item ${isActive ? 'active' : ''}`}
        style={{ paddingLeft: depth * 12 + 8 }}
        onClick={() => isDir ? setExpanded(!expanded) : onSelect(node.uri)}
      >
        {isDir && <span className="file-icon">{expanded ? '▼' : '▶'}</span>}
        {!isDir && <span className="file-icon">📄</span>}
        <span className="file-name">{name}</span>
        {!isDir && (
          <button
            className="file-menu-btn"
            onClick={(e) => {
              e.stopPropagation();
              onShowActions(showingActions ? '' : node.uri);
            }}
          >
            ⋮
          </button>
        )}
      </div>

      {/* Action menu for this file */}
      {showingActions && !isDir && (
        <div className="file-actions" style={{ paddingLeft: depth * 12 + 20 }}>
          <input
            type="text"
            className="file-rename-input"
            value={renameValue}
            onChange={(e) => onRenameChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onRename(node.uri);
              if (e.key === 'Escape') onShowActions('');
            }}
            onClick={(e) => e.stopPropagation()}
          />
          <div className="file-action-buttons">
            <button onClick={() => onRename(node.uri)}>Rename</button>
            <button className="danger" onClick={() => onDelete(node.uri)}>Delete</button>
          </div>
        </div>
      )}

      {isDir && expanded && node.children?.map((child, i) => (
        <FileTreeNode
          key={child.uri || i}
          node={child}
          depth={depth + 1}
          onSelect={onSelect}
          currentPath={currentPath}
          onShowActions={onShowActions}
          actionPath={actionPath}
          onDelete={onDelete}
          onRename={onRename}
          renameValue={renameValue}
          onRenameChange={onRenameChange}
        />
      ))}
    </div>
  );
}

function SidebarPanel({
  tab, filePath, content, onApplyEdit, onFileSelect,
  onFileCreate, onFileDelete, onFileRename, onRefreshFiles,
  fileTree, idMap
}: SidebarPanelProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [showNewFileDialog, setShowNewFileDialog] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  const [fileActionPath, setFileActionPath] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const localIds = tab === 'search' ? extractIds(content) : [];

  const handleCreateFile = async () => {
    if (!newFileName.trim()) return;
    const path = newFileName.endsWith('.olx') ? newFileName : `${newFileName}.olx`;
    const template = `<Vertical>
  <Markdown>
# New Content

Start writing here.
  </Markdown>
</Vertical>`;
    try {
      await onFileCreate(path, template);
      setShowNewFileDialog(false);
      setNewFileName('');
    } catch (err) {
      console.error('Failed to create file:', err);
    }
  };

  const handleDeleteFile = async (path: string) => {
    if (!confirm(`Delete ${path}?`)) return;
    try {
      await onFileDelete(path);
      setFileActionPath(null);
    } catch (err) {
      console.error('Failed to delete:', err);
    }
  };

  const handleRenameFile = async (oldPath: string) => {
    if (!renameValue.trim() || renameValue === oldPath) {
      setFileActionPath(null);
      return;
    }
    try {
      await onFileRename(oldPath, renameValue);
      setFileActionPath(null);
      setRenameValue('');
    } catch (err) {
      console.error('Failed to rename:', err);
    }
  };

  switch (tab) {
    case 'files':
      return (
        <div className="sidebar-panel">
          <div className="sidebar-panel-header">
            Files
            <button
              className="file-action-btn"
              onClick={() => setShowNewFileDialog(true)}
              title="New file"
            >
              +
            </button>
          </div>

          {/* New file dialog */}
          {showNewFileDialog && (
            <div className="file-dialog">
              <input
                type="text"
                className="search-input"
                placeholder="filename.olx"
                value={newFileName}
                onChange={(e) => setNewFileName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateFile()}
                autoFocus
              />
              <div className="file-dialog-actions">
                <button className="file-dialog-btn" onClick={handleCreateFile}>Create</button>
                <button className="file-dialog-btn cancel" onClick={() => setShowNewFileDialog(false)}>Cancel</button>
              </div>
            </div>
          )}

          <div className="file-tree">
            {fileTree ? (
              fileTree.children?.map((node, i) => (
                <FileTreeNode
                  key={node.uri || i}
                  node={node}
                  depth={0}
                  onSelect={onFileSelect}
                  currentPath={filePath}
                  onShowActions={(path) => {
                    setFileActionPath(path);
                    setRenameValue(path);
                  }}
                  actionPath={fileActionPath}
                  onDelete={handleDeleteFile}
                  onRename={handleRenameFile}
                  renameValue={renameValue}
                  onRenameChange={setRenameValue}
                />
              ))
            ) : (
              <div className="file-tree-loading">Loading...</div>
            )}
          </div>
        </div>
      );
    case 'chat':
      return (
        <div className="sidebar-panel chat-panel">
          <EditorLLMChat
            path={filePath}
            content={content}
            onApplyEdit={onApplyEdit}
            theme="dark"
          />
        </div>
      );
    case 'search': {
      // Extract relative path from provenance
      const getRelPath = (prov?: string[]): string | null => {
        if (!prov || prov.length === 0) return null;
        const idx = prov[0].indexOf('/content/');
        return idx >= 0 ? prov[0].slice(idx + '/content/'.length) : prov[0];
      };

      // Filter idMap by search query
      const searchResults = idMap && searchQuery.trim()
        ? Object.entries(idMap)
            .filter(([id, entry]) => {
              const q = searchQuery.toLowerCase();
              const title = (entry.attributes?.title as string) || '';
              return id.toLowerCase().includes(q) || title.toLowerCase().includes(q);
            })
            .slice(0, 20) // Limit results
        : [];

      return (
        <div className="sidebar-panel">
          <div className="sidebar-panel-header">Search</div>
          <input
            type="text"
            className="search-input"
            placeholder="Search by ID or title..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />

          {/* Search results from idMap */}
          {searchQuery.trim() && (
            <>
              <div className="search-section">
                Results ({searchResults.length}{searchResults.length === 20 ? '+' : ''})
              </div>
              <div className="search-results">
                {searchResults.length === 0 ? (
                  <div className="search-hint">No matching IDs found</div>
                ) : (
                  searchResults.map(([id, entry]) => {
                    const relPath = getRelPath(entry.provenance);
                    const title = (entry.attributes?.title as string) || id;
                    return (
                      <div
                        key={id}
                        className="search-result-item clickable"
                        onClick={() => relPath && onFileSelect(relPath)}
                      >
                        <div className="search-result-main">
                          <span className="search-id">{id}</span>
                          <span className="search-type">{entry.tag}</span>
                        </div>
                        {title !== id && (
                          <div className="search-result-title">{title}</div>
                        )}
                        {relPath && (
                          <div className="search-result-file">{relPath}</div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </>
          )}

          {/* IDs in current file */}
          <div className="search-section">IDs in current file ({localIds.length})</div>
          <div className="search-results">
            {localIds.length === 0 ? (
              <div className="search-hint">No IDs found in content</div>
            ) : (
              localIds.map(({ id, tag }) => (
                <div key={id} className="search-result-item">
                  <span className="search-id">{id}</span>
                  <span className="search-type">{tag}</span>
                </div>
              ))
            )}
          </div>
        </div>
      );
    }
    case 'data':
      return (
        <div className="sidebar-panel">
          <div className="sidebar-panel-header">Data</div>
          <div className="data-placeholder">
            Item statistics and psychometrics.
            <br /><br />
            <strong>Avg time:</strong> 45s<br />
            <strong>% correct:</strong> 72%<br />
            <strong>Discrimination:</strong> 0.45
          </div>
        </div>
      );
    case 'docs': {
      const docType = getFileDocType(filePath);
      const elements = extractElements(content);

      return (
        <div className="sidebar-panel">
          <div className="sidebar-panel-header">Documentation</div>
          <div className="docs-list">
            <a href="/docs/" target="_blank" className="docs-link">Full Documentation</a>

            {/* File-type specific docs */}
            {docType === 'peg' && (
              <DocsSection title="PEG Format" defaultOpen>
                <a href="/docs#peg-format" target="_blank" className="docs-item">PEG Syntax Guide</a>
                <a href="/docs#chatpeg" target="_blank" className="docs-item">ChatPEG Format</a>
                <a href="/docs#sortpeg" target="_blank" className="docs-item">SortPEG Format</a>
              </DocsSection>
            )}

            {docType === 'markdown' && (
              <DocsSection title="Markdown" defaultOpen>
                <a href="/docs#markdown-syntax" target="_blank" className="docs-item">Markdown Syntax</a>
                <a href="/docs#Markdown" target="_blank" className="docs-item">Markdown Block</a>
              </DocsSection>
            )}

            {/* Elements used in current file - each is expandable */}
            {elements.length > 0 && (
              <>
                <div className="docs-section-label">Elements in file</div>
                {elements.map(tag => (
                  <ElementDocItem key={tag} tag={tag} />
                ))}
              </>
            )}

            {/* Quick reference sections */}
            <DocsSection title="Layout">
              <a href="/docs#Vertical" target="_blank" className="docs-item">Vertical</a>
              <a href="/docs#Horizontal" target="_blank" className="docs-item">Horizontal</a>
              <a href="/docs#Tabs" target="_blank" className="docs-item">Tabs</a>
            </DocsSection>

            <DocsSection title="Problems">
              <a href="/docs#CapaProblem" target="_blank" className="docs-item">CapaProblem</a>
              <a href="/docs#KeyGrader" target="_blank" className="docs-item">KeyGrader</a>
              <a href="/docs#ChoiceInput" target="_blank" className="docs-item">ChoiceInput</a>
              <a href="/docs#TextInput" target="_blank" className="docs-item">TextInput</a>
            </DocsSection>

            <DocsSection title="Display">
              <a href="/docs#Markdown" target="_blank" className="docs-item">Markdown</a>
              <a href="/docs#Image" target="_blank" className="docs-item">Image</a>
              <a href="/docs#Video" target="_blank" className="docs-item">Video</a>
              <a href="/docs#Hint" target="_blank" className="docs-item">Hint</a>
            </DocsSection>
          </div>
        </div>
      );
    }
  }
}

// Expandable element doc item
function ElementDocItem({ tag }: { tag: string }) {
  const [expanded, setExpanded] = useState(false);
  const doc = ELEMENT_DOCS[tag];

  return (
    <div className="element-doc-item">
      <div className="element-doc-header" onClick={() => setExpanded(!expanded)}>
        <span className="element-doc-tag">{tag}</span>
        {doc && <span className="element-doc-desc">{doc.desc}</span>}
        <span className="element-doc-toggle">{expanded ? '▼' : '▶'}</span>
      </div>
      {expanded && doc && (
        <div className="element-doc-content">
          <pre className="element-doc-example">{doc.example}</pre>
          <a href={`/docs#${tag}`} target="_blank" className="element-doc-link">
            Full docs →
          </a>
        </div>
      )}
    </div>
  );
}

// Expandable section header (for quick reference)
function DocsSection({ title, children, defaultOpen = false }: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="docs-section-container">
      <div className="docs-section-header" onClick={() => setOpen(!open)}>
        <span className="docs-section-icon">{open ? '▼' : '▶'}</span>
        <span>{title}</span>
      </div>
      {open && <div className="docs-section-content">{children}</div>}
    </div>
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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && filtered.length > 0) {
      filtered[0].action();
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
              className={`command-palette-item ${idx === 0 ? 'selected' : ''}`}
              onClick={cmd.action}
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
