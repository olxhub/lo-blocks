// src/app/studio/panels/FilesPanel.tsx
'use client';

import { useState } from 'react';
import type { UriNode } from '@/lib/storage/types';
import { isEditableFile, isOLXFile } from '@/lib/util/fileTypes';

interface FilesPanelProps {
  fileTree: UriNode | null;
  currentPath: string;
  dirtyFiles?: Set<string>;
  onFileSelect: (path: string) => void;
  onFileCreate: (path: string, content: string) => Promise<void>;
  onFileDelete: (path: string) => Promise<void>;
  onFileRename: (oldPath: string, newPath: string) => Promise<void>;
}

export function FilesPanel({
  fileTree,
  currentPath,
  dirtyFiles = new Set(),
  onFileSelect,
  onFileCreate,
  onFileDelete,
  onFileRename,
}: FilesPanelProps) {
  // TODO: Consider moving dialog state to redux for analytics
  const [showNewFileDialog, setShowNewFileDialog] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  const [fileActionPath, setFileActionPath] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const handleCreateFile = async () => {
    if (!newFileName.trim()) return;

    // Determine the filename with extension (use fileTypes for valid extensions)
    const filename = isEditableFile(newFileName) ? newFileName : `${newFileName}.olx`;

    // Create in the same directory as the current file
    const currentDir = currentPath.includes('/') ? currentPath.substring(0, currentPath.lastIndexOf('/')) : '';
    const path = currentDir ? `${currentDir}/${filename}` : filename;

    // Template based on extension
    const template = isOLXFile(filename)
      ? `<Vertical>
  <Markdown>
# New Content

Start writing here.
  </Markdown>
</Vertical>`
      : '';

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
              onRenameChange={setRenameValue}
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
  node, depth, onSelect, currentPath, dirtyFiles,
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
        style={{ paddingLeft: depth * 12 + 8 }}
        onClick={() => isDir ? setExpanded(!expanded) : onSelect(node.uri)}
      >
        {isDir && <span className="file-icon">{expanded ? '▼' : '▶'}</span>}
        {!isDir && <span className="file-icon">📄</span>}
        <span className="file-name">{isDirty ? `${name} *` : name}</span>
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
