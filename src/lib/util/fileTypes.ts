// src/lib/util/fileTypes.ts
//
// Centralized file type detection and categorization.
//
// Provides type-safe helpers for checking file types and categories.
// Single source of truth for extension lists used throughout the app.
//

import path from 'path';
import { PEG_CONTENT_EXTENSIONS } from '@/generated/parserRegistry';

// ============================================================
// BASE EXTENSION SETS (atoms we compose from)
// ============================================================

export const EXT = {
  olx: ['olx', 'xml'] as const,
  markdown: ['md'] as const,
  peg: PEG_CONTENT_EXTENSIONS,

  // Code (for upload, syntax highlighting)
  code: ['js', 'jsx', 'ts', 'tsx', 'css', 'html', 'py', 'json', 'yaml', 'yml', 'pegjs'] as const,
  plainText: ['txt'] as const,

  // Media
  image: ['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp'] as const,
  video: ['mp4', 'avi', 'webm'] as const,
  document: ['pdf'] as const,
} as const;

// ============================================================
// COMPOSABLE CATEGORIES (for different purposes)
// ============================================================

export const CATEGORY = {
  // What can be loaded as authored content
  content: [...EXT.olx, ...EXT.markdown, ...EXT.peg] as const,

  // What the editor can open (content + sidecar files in future)
  editable: [...EXT.olx, ...EXT.markdown, ...EXT.peg] as const,

  // What can be uploaded/attached to chat
  uploadable: [...EXT.olx, ...EXT.markdown, ...EXT.peg, ...EXT.code, ...EXT.plainText] as const,

  // Media files
  media: [...EXT.image, ...EXT.video, ...EXT.document] as const,
} as const;

// ============================================================
// CORE UTILITIES
// ============================================================

/**
 * Get the lowercase file extension from a path.
 *
 * @example
 * getExtension('foo/bar.OLX') // => 'olx'
 * getExtension('file.chatpeg') // => 'chatpeg'
 * getExtension('noextension') // => ''
 */
export function getExtension(filePath: string | undefined | null): string {
  if (!filePath) return '';
  const ext = path.extname(filePath);
  return ext ? ext.slice(1).toLowerCase() : '';
}

/**
 * Check if a file path has one of the given extensions.
 * Use the named helpers below for common cases.
 */
export function fileHasExtension(path: string | undefined | null, extensions: readonly string[]): boolean {
  const ext = getExtension(path);
  return ext !== '' && extensions.includes(ext);
}

/**
 * Check if an extension (already extracted) is in a list.
 * Use when you already have the extension and don't need path parsing.
 */
export function isExtensionIn(ext: string, extensions: readonly string[]): boolean {
  return ext !== '' && extensions.includes(ext.toLowerCase());
}

// ============================================================
// TYPE DETECTION (for dispatch: editors[getContentType(path)])
// ============================================================

export type ContentType = 'olx' | 'markdown' | 'peg' | 'code' | 'text' | 'image' | 'video' | 'document' | 'unknown';

/**
 * Get the content type for dispatch.
 *
 * @example
 * const editors = { olx: OLXEditor, markdown: MarkdownEditor };
 * const Editor = editors[getContentType(path)];
 */
export function getContentType(path: string | undefined | null): ContentType {
  const ext = getExtension(path);
  if (!ext) return 'unknown';
  if ((EXT.olx as readonly string[]).includes(ext)) return 'olx';
  if ((EXT.markdown as readonly string[]).includes(ext)) return 'markdown';
  if ((EXT.peg as readonly string[]).includes(ext)) return 'peg';
  if ((EXT.code as readonly string[]).includes(ext)) return 'code';
  if ((EXT.plainText as readonly string[]).includes(ext)) return 'text';
  if ((EXT.image as readonly string[]).includes(ext)) return 'image';
  if ((EXT.video as readonly string[]).includes(ext)) return 'video';
  if ((EXT.document as readonly string[]).includes(ext)) return 'document';
  return 'unknown';
}

// ============================================================
// NAMED HELPERS (the 95% case - readable, typo-proof)
// ============================================================

// Specific file types
export const isOLXFile = (path: string | undefined | null) =>
  fileHasExtension(path, EXT.olx);

export const isMarkdownFile = (path: string | undefined | null) =>
  fileHasExtension(path, EXT.markdown);

export const isPEGFile = (path: string | undefined | null) =>
  fileHasExtension(path, EXT.peg);

export const isImageFile = (path: string | undefined | null) =>
  fileHasExtension(path, EXT.image);

export const isVideoFile = (path: string | undefined | null) =>
  fileHasExtension(path, EXT.video);

// Category checks
export const isContentFile = (path: string | undefined | null) =>
  fileHasExtension(path, CATEGORY.content);

export const isEditableFile = (path: string | undefined | null) =>
  fileHasExtension(path, CATEGORY.editable);

export const isUploadableFile = (path: string | undefined | null) =>
  fileHasExtension(path, CATEGORY.uploadable);

export const isMediaFile = (path: string | undefined | null) =>
  fileHasExtension(path, CATEGORY.media);

// ============================================================
// UTILITIES FOR BUILDING UI / CONFIG
// ============================================================

/**
 * Get extensions with dots for HTML accept attribute or validation.
 *
 * @example
 * <input accept={extensionsWithDots(CATEGORY.uploadable).join(',')} />
 */
export function extensionsWithDots(extensions: readonly string[]): string[] {
  return extensions.map(e => `.${e}`);
}

/**
 * Get the accept string for file inputs.
 *
 * @example
 * <input accept={acceptString('uploadable')} />
 */
export function acceptString(category: keyof typeof CATEGORY): string {
  return extensionsWithDots(CATEGORY[category]).join(',');
}
