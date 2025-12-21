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

  // Load file tree on mount
  useEffect(() => {
    storage.listFiles().then(setFileTree).catch(console.error);
  }, []);

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
                  fileTree={fileTree}
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
  fileTree: UriNode | null;
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

// Doc links for common elements
const ELEMENT_DOCS: Record<string, { path: string; desc: string }> = {
  Markdown: { path: '/docs/blocks/display/Markdown', desc: 'Rich text content' },
  CapaProblem: { path: '/docs/blocks/problems/', desc: 'Problem container' },
  KeyGrader: { path: '/docs/blocks/graders/KeyGrader', desc: 'Answer key grading' },
  ChoiceInput: { path: '/docs/blocks/inputs/ChoiceInput', desc: 'Multiple choice' },
  Vertical: { path: '/docs/blocks/layout/Vertical', desc: 'Vertical layout' },
  Horizontal: { path: '/docs/blocks/layout/Horizontal', desc: 'Horizontal layout' },
  Hint: { path: '/docs/blocks/display/Hint', desc: 'Collapsible hint' },
  Image: { path: '/docs/blocks/display/Image', desc: 'Image display' },
  Video: { path: '/docs/blocks/display/Video', desc: 'Video player' },
  TextInput: { path: '/docs/blocks/inputs/TextInput', desc: 'Text response' },
  NumberInput: { path: '/docs/blocks/inputs/NumberInput', desc: 'Numeric response' },
};

function FileTreeNode({ node, depth, onSelect, currentPath }: {
  node: UriNode;
  depth: number;
  onSelect: (path: string) => void;
  currentPath: string;
}) {
  const [expanded, setExpanded] = useState(depth < 2);
  const isDir = node.children && node.children.length > 0;
  const name = node.uri.split('/').pop() || node.uri;
  const isActive = node.uri === currentPath;

  return (
    <div>
      <div
        className={`file-item ${isActive ? 'active' : ''}`}
        style={{ paddingLeft: depth * 12 + 8 }}
        onClick={() => isDir ? setExpanded(!expanded) : onSelect(node.uri)}
      >
        {isDir && <span className="file-icon">{expanded ? '▼' : '▶'}</span>}
        {!isDir && <span className="file-icon">📄</span>}
        {name}
      </div>
      {isDir && expanded && node.children?.map((child, i) => (
        <FileTreeNode
          key={child.uri || i}
          node={child}
          depth={depth + 1}
          onSelect={onSelect}
          currentPath={currentPath}
        />
      ))}
    </div>
  );
}

function SidebarPanel({ tab, filePath, content, onApplyEdit, onFileSelect, fileTree }: SidebarPanelProps) {
  const ids = tab === 'search' ? extractIds(content) : [];

  switch (tab) {
    case 'files':
      return (
        <div className="sidebar-panel">
          <div className="sidebar-panel-header">Files</div>
          <div className="file-tree">
            {fileTree ? (
              fileTree.children?.map((node, i) => (
                <FileTreeNode
                  key={node.uri || i}
                  node={node}
                  depth={0}
                  onSelect={onFileSelect}
                  currentPath={filePath}
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
    case 'search':
      return (
        <div className="sidebar-panel">
          <div className="sidebar-panel-header">Search</div>
          <input
            type="text"
            className="search-input"
            placeholder="Search by ID, text, or file..."
          />
          <div className="search-section">IDs in current file ({ids.length})</div>
          <div className="search-results">
            {ids.length === 0 ? (
              <div className="search-hint">No IDs found in content</div>
            ) : (
              ids.map(({ id, tag }) => (
                <div key={id} className="search-result-item">
                  <span className="search-id">{id}</span>
                  <span className="search-type">{tag}</span>
                </div>
              ))
            )}
          </div>
          <div className="search-section">By Text</div>
          <div className="search-hint">Type to search content...</div>
        </div>
      );
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
      const elements = extractElements(content);
      const usedWithDocs = elements.filter(e => ELEMENT_DOCS[e]);
      const usedWithoutDocs = elements.filter(e => !ELEMENT_DOCS[e]);

      return (
        <div className="sidebar-panel">
          <div className="sidebar-panel-header">Documentation</div>
          <div className="docs-list">
            <a href="/docs/" target="_blank" className="docs-link">Full Documentation</a>

            {elements.length > 0 && (
              <>
                <div className="docs-section">Elements in this file</div>
                {usedWithDocs.map(tag => (
                  <a
                    key={tag}
                    href={ELEMENT_DOCS[tag].path}
                    target="_blank"
                    className="docs-item-link"
                  >
                    <span className="docs-tag">{tag}</span>
                    <span className="docs-desc">{ELEMENT_DOCS[tag].desc}</span>
                  </a>
                ))}
                {usedWithoutDocs.map(tag => (
                  <div key={tag} className="docs-item">
                    <span className="docs-tag">{tag}</span>
                  </div>
                ))}
              </>
            )}

            <div className="docs-section">Quick Reference</div>
            <a href="/docs/blocks/" target="_blank" className="docs-item">All Blocks</a>
            <a href="/docs/blocks/problems/" target="_blank" className="docs-item">Problem Types</a>
            <a href="/docs/blocks/layout/" target="_blank" className="docs-item">Layout Components</a>
            <a href="/docs/blocks/graders/" target="_blank" className="docs-item">Graders</a>
          </div>
        </div>
      );
    }
  }
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
