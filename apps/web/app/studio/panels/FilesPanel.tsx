// apps/web/app/studio/panels/FilesPanel.tsx
'use client';

import { useState } from 'react';
import type { UriNode } from '@/lib/types/storage';
import { FORBIDDEN_FILENAME_CHARS } from '@/lib/types/storage';
import ExpandIcon from '@/components/common/ExpandIcon';

/** Strip characters that are not allowed in filenames. */
function sanitizeFileName(input: string): string {
  return input
    .replace(FORBIDDEN_FILENAME_CHARS, '')
    .replace(/(^|\/)\.+/g, '$1');  // strip leading dots per segment
}

interface FilesPanelProps {
  fileTree: UriNode | null;
  currentPath: string;
  dirtyFiles?: Set<string>;
  /** Whether the selected source accepts writes. When false, create/rename/
   *  delete controls are hidden (the server rejects them too — see route.js). */
  canWrite: boolean;
  onFileSelect: (path: string) => void;
  /** Open the shared new-file dialog (owned by StudioPage — one creation flow). */
  onNewFile: () => void;
  onFileDelete: (path: string) => Promise<void>;
  onFileRename: (oldPath: string, newPath: string) => Promise<void>;
}

export function FilesPanel({
  fileTree,
  currentPath,
  dirtyFiles = new Set(),
  canWrite,
  onFileSelect,
  onNewFile,
  onFileDelete,
  onFileRename,
}: FilesPanelProps) {
  const [fileActionPath, setFileActionPath] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

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

  return (
    <div className="sidebar-panel">
      <div className="sidebar-panel-header">
        Files
        {canWrite && (
          <button
            className="file-action-btn"
            onClick={onNewFile}
            title="New file"
          >
            +
          </button>
        )}
      </div>

      <div className="file-tree">
        {fileTree ? (
          fileTree.children?.map((node, i) => (
            <FileTreeNode
              key={node.uri || i}
              node={node}
              depth={0}
              canWrite={canWrite}
              onSelect={onFileSelect}
              currentPath={currentPath}
              dirtyFiles={dirtyFiles}
              onShowActions={(path) => {
                setFileActionPath(path);
                setRenameValue(path);
              }}
              actionPath={fileActionPath}
              onDelete={handleDeleteFile}
              onRename={handleRenameFile}
              renameValue={renameValue}
              onRenameChange={(v) => setRenameValue(sanitizeFileName(v))}
            />
          ))
        ) : (
          <div className="file-tree-loading">Loading...</div>
        )}
      </div>
    </div>
  );
}

// File tree node component
interface FileTreeNodeProps {
  node: UriNode;
  depth: number;
  canWrite: boolean;
  onSelect: (path: string) => void;
  currentPath: string;
  dirtyFiles: Set<string>;
  onShowActions: (path: string) => void;
  actionPath: string | null;
  onDelete: (path: string) => void;
  onRename: (path: string) => void;
  renameValue: string;
  onRenameChange: (value: string) => void;
}

function FileTreeNode({
  node, depth, canWrite, onSelect, currentPath, dirtyFiles,
  onShowActions, actionPath, onDelete, onRename, renameValue, onRenameChange
}: FileTreeNodeProps) {
  // TODO: Consider moving expanded state to redux (persist tree state)
  const [expanded, setExpanded] = useState(depth < 2);
  const isDir = Array.isArray(node.children);
  const name = node.uri.split('/').pop() || node.uri;
  const isActive = node.uri === currentPath;
  const isDirty = dirtyFiles.has(node.uri);
  const showingActions = actionPath === node.uri;

  return (
    <div>
      <div
        className={`file-item ${isActive ? 'active' : ''} ${isDirty ? 'dirty' : ''}`}
        style={{ paddingInlineStart: depth * 12 + 8 }}
        onClick={() => isDir ? setExpanded(!expanded) : onSelect(node.uri)}
      >
        {isDir && <span className="file-icon"><ExpandIcon expanded={expanded} /></span>}
        {!isDir && <span className="file-icon">📄</span>}
        <span className="file-name">{isDirty ? `${name} *` : name}</span>
        {!isDir && canWrite && (
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
      {showingActions && !isDir && canWrite && (
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
          canWrite={canWrite}
          onSelect={onSelect}
          currentPath={currentPath}
          dirtyFiles={dirtyFiles}
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
