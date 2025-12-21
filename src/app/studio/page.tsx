// src/app/studio/page.tsx
// Prototype editor - exploring layout and interaction patterns
'use client';

import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import RenderOLX from '@/components/common/RenderOLX';
import './studio.css';

// Dynamic import CodeMirror to avoid SSR issues
const CodeEditor = dynamic(
  () => import('@/components/common/CodeEditor'),
  { ssr: false }
);

type SidebarTab = 'files' | 'chat' | 'search' | 'data' | 'docs';

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

export default function StudioPage() {
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('files');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [content, setContent] = useState(DEMO_CONTENT);
  const [filePath, setFilePath] = useState('untitled.olx');
  const [showPreview, setShowPreview] = useState(true);

  // Command palette keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCommandPaletteOpen(open => !open);
      }
      if (e.key === 'Escape') {
        setCommandPaletteOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleSave = useCallback(() => {
    console.log('Save:', filePath, content);
    // TODO: Implement save
  }, [filePath, content]);

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
          <aside className="studio-sidebar">
            <nav className="studio-sidebar-tabs">
              {(['files', 'chat', 'search', 'data', 'docs'] as SidebarTab[]).map(tab => (
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
              <SidebarPanel tab={sidebarTab} />
            </div>
          </aside>
        )}

        {/* Main Editor Area */}
        <main className={`studio-main ${showPreview ? 'split' : ''}`}>
          <div className="studio-editor-pane">
            <CodeEditor
              value={content}
              onChange={setContent}
              path={filePath}
              height="100%"
            />
          </div>
          {showPreview && (
            <div className="studio-preview-pane">
              <div className="studio-preview-header">Preview</div>
              <div className="studio-preview-content">
                <RenderOLX id="studio-preview" inline={content} />
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Command Palette */}
      {commandPaletteOpen && (
        <CommandPalette onClose={() => setCommandPaletteOpen(false)} />
      )}

      {/* Footer hint */}
      <footer className="studio-footer">
        <kbd>⌘K</kbd> Command palette
      </footer>
    </div>
  );
}

function SidebarPanel({ tab }: { tab: SidebarTab }) {
  switch (tab) {
    case 'files':
      return (
        <div className="sidebar-panel">
          <div className="sidebar-panel-header">Files</div>
          <div className="file-tree">
            <div className="file-item">content/</div>
            <div className="file-item indent">demo.olx</div>
            <div className="file-item indent">quiz.olx</div>
            <div className="file-item">components/</div>
            <div className="file-item indent">mcq-template.olx</div>
          </div>
        </div>
      );
    case 'chat':
      return (
        <div className="sidebar-panel">
          <div className="sidebar-panel-header">Chat</div>
          <div className="chat-placeholder">
            LLM conversation will appear here.
            <br /><br />
            Ask to create content, explain concepts, or modify the current file.
          </div>
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
          <div className="search-section">By ID</div>
          <div className="search-results">
            <div className="search-result-item">
              <span className="search-id">demo-mcq</span>
              <span className="search-type">MCQ</span>
            </div>
            <div className="search-result-item">
              <span className="search-id">intro-video</span>
              <span className="search-type">Video</span>
            </div>
            <div className="search-result-item">
              <span className="search-id">quiz-1</span>
              <span className="search-type">Vertical</span>
            </div>
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
    case 'docs':
      return (
        <div className="sidebar-panel">
          <div className="sidebar-panel-header">Documentation</div>
          <div className="docs-list">
            <a href="/docs/" target="_blank" className="docs-link">Full Documentation</a>
            <div className="docs-section">Quick Reference</div>
            <div className="docs-item">OLX Elements</div>
            <div className="docs-item">Problem Types</div>
            <div className="docs-item">Layout Components</div>
            <div className="docs-item">Grading & Scoring</div>
          </div>
        </div>
      );
  }
}

function CommandPalette({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('');

  const commands = [
    { id: 'goto-id', label: 'Go to ID...', shortcut: '⌘G' },
    { id: 'new-file', label: 'New File', shortcut: '⌘N' },
    { id: 'save', label: 'Save', shortcut: '⌘S' },
    { id: 'insert-mcq', label: 'Insert: Multiple Choice Question', shortcut: '' },
    { id: 'insert-hint', label: 'Insert: Hint', shortcut: '' },
    { id: 'insert-markdown', label: 'Insert: Markdown Block', shortcut: '' },
    { id: 'toggle-preview', label: 'Toggle Preview', shortcut: '⌘P' },
    { id: 'fork', label: 'Fork to new file...', shortcut: '' },
    { id: 'history', label: 'Show version history', shortcut: '' },
    { id: 'docs', label: 'Open documentation', shortcut: 'F1' },
  ];

  const filtered = commands.filter(c =>
    c.label.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="command-palette-overlay" onClick={onClose}>
      <div className="command-palette" onClick={e => e.stopPropagation()}>
        <input
          type="text"
          className="command-palette-input"
          placeholder="Type a command..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          autoFocus
        />
        <div className="command-palette-results">
          {filtered.map(cmd => (
            <div key={cmd.id} className="command-palette-item">
              <span>{cmd.label}</span>
              {cmd.shortcut && <kbd>{cmd.shortcut}</kbd>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
