'use client';
// packages/shared/components/blocks/authoring/Studio/commandPalette.tsx
//
// ⌘K command palette — ported from the legacy StudioPage. Substring filter,
// arrow-key navigation, Enter to run; "soon" commands are documented
// roadmap previews (rendered greyed and inert, so nothing silently
// no-ops). Palette state lives in fields per the replay mandate; the
// shell resets query/selection when it opens the palette, matching the
// legacy fresh-on-open behavior.

import React from 'react';
import { useFieldState } from '@/lib/state';
import type { RuntimeProps } from '@/lib/types';
import { studioFields } from './locals';

// Template snippets for insertion.
// TODO(studio-as-blocks): "Insert" should open a block palette (Insert →
// pick a block, driven by the block registry), not this flat list of
// hardcoded templates. These three are the interim stand-in.
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

interface Command {
  id: string;
  label: string;
  shortcut?: string;
  action: () => void;
  /** A PREVIEW command: shown so the palette's roadmap is visible, but not
   *  yet wired. Rendered greyed with a "soon" tag and inert. The per-item
   *  comment says what to wire. */
  soon?: boolean;
}

export interface CommandPaletteProps {
  props: RuntimeProps;
  onClose: () => void;
  onSave: () => void;
  onTogglePreview: () => void;
  onInsert: (template: string) => void;
  onNewFile: () => void;
}

export function CommandPalette({ props, onClose, onSave, onTogglePreview, onInsert, onNewFile }: CommandPaletteProps) {
  const [query, setQuery] = useFieldState(props, studioFields.studioPaletteQuery, '');
  const [selectedIndex, setSelectedIndex] = useFieldState(props, studioFields.studioPaletteIndex, 0);

  const commands: Command[] = [
    { id: 'save', label: 'Save', shortcut: '⌘S', action: () => { onSave(); onClose(); } },
    { id: 'new-file', label: 'New File', shortcut: '⌘N', action: () => { onNewFile(); onClose(); } },
    { id: 'toggle-preview', label: 'Toggle Preview', shortcut: '⌘P', action: () => { onTogglePreview(); onClose(); } },
    { id: 'insert-mcq', label: 'Insert: Multiple Choice Question', action: () => { onInsert(TEMPLATES.mcq); onClose(); } },
    { id: 'insert-hint', label: 'Insert: Hint', action: () => { onInsert(TEMPLATES.hint); onClose(); } },
    { id: 'insert-markdown', label: 'Insert: Markdown Block', action: () => { onInsert(TEMPLATES.markdown); onClose(); } },
    { id: 'docs', label: 'Open documentation', shortcut: 'F1', action: () => { window.open('/docs', '_blank'); onClose(); } },
    // --- Previews (roadmap; wired later, see TODOs) ---
    // TODO: wire to the Search panel — open it, focus search, jump to the id.
    { id: 'goto-id', label: 'Go to ID…', soon: true, action: () => {} },
    // TODO: fork the current file to a new name in the same (or a new) source.
    { id: 'fork', label: 'Fork to new file…', soon: true, action: () => {} },
    // TODO(content-in-git): show the file's git history — or link to the
    // forge's history — and (now within reach) load content at a commit.
    { id: 'history', label: 'Show version history', soon: true, action: () => {} },
  ];

  const filtered = commands.filter(c =>
    c.label.toLowerCase().includes(query.toLowerCase())
  );
  const current = Math.min(selectedIndex, Math.max(filtered.length - 1, 0));

  // Run a command — previews ("soon") are inert.
  const run = (cmd: Command) => { if (!cmd.soon) cmd.action(); };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(Math.min(current + 1, filtered.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(Math.max(current - 1, 0));
        break;
      case 'Enter':
        if (filtered.length > 0 && filtered[current]) {
          run(filtered[current]);
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
          onChange={e => { setQuery(e.target.value); setSelectedIndex(0); }}
          onKeyDown={handleKeyDown}
          autoFocus
        />
        <div className="command-palette-results">
          {filtered.map((cmd, idx) => (
            <div
              key={cmd.id}
              className={`command-palette-item ${idx === current ? 'selected' : ''} ${cmd.soon ? 'soon' : ''}`}
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
