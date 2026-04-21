// src/lib/util/fileTypes.ts
//
// Centralized file type detection and categorization.
//
// Provides type-safe helpers for checking file types and categories.
// Single source of truth for extension lists used throughout the app.
//

import path from 'path';
import { PEG_CONTENT_EXTENSIONS, pegMetadata, pegTemplates } from '@/generated/parserRegistry';

// ============================================================
// BASE EXTENSION SETS (atoms we compose from)
// ============================================================

export const EXT = {
  olx: ['olx', 'xml'] as const,
  markdown: ['md'] as const,
  peg: PEG_CONTENT_EXTENSIONS,

  // Data / config formats (loadable as content via src=)
  mermaid: ['mmd', 'mermaid'] as const,
  data: ['yaml', 'yml', 'json'] as const,
  cast: ['cast'] as const,

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
  content: [...EXT.olx, ...EXT.markdown, ...EXT.peg, ...EXT.mermaid, ...EXT.data, ...EXT.cast] as const,

  // What the editor can open (content + sidecar files in future)
  editable: [...EXT.olx, ...EXT.markdown, ...EXT.peg, ...EXT.mermaid, ...EXT.data, ...EXT.cast] as const,

  // What can be uploaded/attached to chat
  uploadable: [...EXT.olx, ...EXT.markdown, ...EXT.peg, ...EXT.cast, ...EXT.code, ...EXT.plainText] as const,

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
  const ext = getExtension(path);  // Already lowercased
  // Case-insensitive comparison (extensions may have mixed case like textSelectionpeg)
  return ext !== '' && extensions.some(e => e.toLowerCase() === ext);
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

export type ContentType = 'olx' | 'markdown' | 'peg' | 'mermaid' | 'data' | 'cast' | 'code' | 'text' | 'image' | 'video' | 'document' | 'unknown';

/**
 * Get the content type for dispatch.
 *
 * @example
 * const editors = { olx: OLXEditor, markdown: MarkdownEditor };
 * const Editor = editors[getContentType(path)];
 */
// Case-insensitive extension check (ext is already lowercased)
function extInList(ext: string, list: readonly string[]): boolean {
  return list.some(e => e.toLowerCase() === ext);
}

export function getContentType(path: string | undefined | null): ContentType {
  const ext = getExtension(path);
  if (!ext) return 'unknown';
  if (extInList(ext, EXT.olx)) return 'olx';
  if (extInList(ext, EXT.markdown)) return 'markdown';
  if (extInList(ext, EXT.peg)) return 'peg';
  if (extInList(ext, EXT.mermaid)) return 'mermaid';
  if (extInList(ext, EXT.data)) return 'data';
  if (extInList(ext, EXT.cast)) return 'cast';
  if (extInList(ext, EXT.code)) return 'code';
  if (extInList(ext, EXT.plainText)) return 'text';
  if (extInList(ext, EXT.image)) return 'image';
  if (extInList(ext, EXT.video)) return 'video';
  if (extInList(ext, EXT.document)) return 'document';
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

// ============================================================
// CREATABLE TYPES (for file creation UI)
// ============================================================
// PEG types auto-discovered from .pegjs.template.{ext} / .preview.{ext} files.
// Non-PEG types defined statically below.

export interface CreatableType {
  label: string;
  ext: string;
  template: string;
}

// Static types (not grammar-based — no auto-discovery for these)
const STATIC_CREATABLE: Record<string, CreatableType> = {
  // TODO: OLX template should come from a canonical .template.olx file
  olx: {
    label: 'OLX',
    ext: 'olx',
    template: `<Vertical>
  <Markdown>
# New Content

Start writing here.
  </Markdown>
</Vertical>`,
  },
  markdown: { label: 'Markdown', ext: 'md', template: '# New Document\n\n' },
  mermaid: { label: 'Mermaid', ext: 'mmd', template: 'graph TD\n    A[Start] --> B[End]\n' },
};

// Combine static + auto-discovered PEG types (filtered by creatable flag)
export const CREATABLE_TYPES: Record<string, CreatableType> = {
  ...STATIC_CREATABLE,
  ...Object.fromEntries(
    Object.entries(pegMetadata)
      .filter(([ext, meta]) => meta.creatable && pegTemplates[ext])
      .map(([ext, meta]) => [ext, { label: meta.name, ext, template: pegTemplates[ext]! }])
  ),
};
