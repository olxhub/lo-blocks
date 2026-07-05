'use client';
// packages/shared/components/blocks/authoring/Studio/newFileDialog.tsx
//
// Ported from apps/web/app/studio/NewFileDialog.tsx.

import { useState } from 'react';
import { CREATABLE_TYPES } from '@/lib/util/fileTypes';
import { sanitizeFileName } from './fileNames';

/**
 * The single new-file control. Owned by the shell and opened from two places
 * (the Files panel "+" and the no-file placeholder), so there's one creation
 * flow, not two. Creates `<currentDir>/<name>.<ext>` from the chosen type's
 * template via onCreate.
 */
export default function NewFileDialog({
  open,
  currentDir,
  onCreate,
  onClose,
}: {
  open: boolean;
  currentDir: string;
  onCreate: (path: string, content: string) => Promise<void>;
  onClose: () => void;
}) {
  // useState-ok: ephemeral inline-edit state — dialog's in-progress filename.
  const [name, setName] = useState('');
  // useState-ok: ephemeral inline-edit state — dialog's selected file type.
  const [type, setType] = useState('olx');

  if (!open) return null;

  const creatableTypeKeys = Object.keys(CREATABLE_TYPES);
  const selectedType = CREATABLE_TYPES[type];

  const create = async () => {
    if (!name.trim()) return;
    const filename = `${name.trim()}.${selectedType.ext}`;
    const path = currentDir ? `${currentDir}/${filename}` : filename;
    try {
      await onCreate(path, selectedType.template);
      setName('');
      setType('olx');
      onClose();
    } catch (err) {
      // Create handler re-throws on failure — dialog stays open.
      console.error('Failed to create file:', err);
    }
  };

  return (
    <div className="command-palette-overlay" onClick={onClose}>
      <div className="file-dialog" onClick={e => e.stopPropagation()}>
        <div className="file-dialog-dir">in: {currentDir || '/'}</div>
        <div className="file-dialog-name-row">
          <input
            type="text"
            className="file-dialog-name"
            placeholder="filename"
            value={name}
            onChange={e => setName(sanitizeFileName(e.target.value))}
            onKeyDown={e => {
              if (e.key === 'Enter') create();
              if (e.key === 'Escape') onClose();
            }}
            autoFocus
          />
          <span className="file-dialog-ext">.{selectedType.ext}</span>
        </div>
        <label className="file-dialog-label">
          Type:
          <select
            className="file-dialog-select"
            value={type}
            onChange={e => setType(e.target.value)}
          >
            {creatableTypeKeys.map(key => (
              <option key={key} value={key}>{CREATABLE_TYPES[key].label}</option>
            ))}
          </select>
        </label>
        <div className="file-dialog-actions">
          <button className="file-dialog-btn" onClick={create} disabled={!name.trim()}>Create</button>
          <button className="file-dialog-btn cancel" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
