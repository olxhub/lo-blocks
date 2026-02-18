// src/components/common/PreviewPane.tsx
//
// Unified preview component for all content types.
// Handles OLX, PEG (chatpeg, sortpeg, etc.), and future formats.
//
'use client';

import { useMemo } from 'react';
import RenderOLX from './RenderOLX';
import PEGPreviewPane from './PEGPreviewPane';
import RenderMarkdown from './RenderMarkdown';
import { isPEGFile, isMarkdownFile } from '@/lib/util/fileTypes';
import { NetworkStorageProvider } from '@/lib/lofs';
import type { IdMap } from '@/lib/types';
import type { StorageProvider } from '@/lib/lofs/types';

export interface PreviewPaneProps {
  /** File path - used for file type detection and provenance */
  path: string;
  /** Content to preview */
  content: string;
  /** Base ID map for cross-file references (OLX only) */
  idMap?: IdMap | null;
  /** Provider for resolving src="" references (OLX only) */
  resolveProvider?: StorageProvider;
  /** Called when parsing/rendering errors occur */
  onError?: (err: any) => void;
  /** Called after parsing completes with merged idMap (OLX only) */
  onParsed?: (result: { idMap: Record<string, any>; root: string | null }) => void;
}

/**
 * Unified preview component that renders content based on file type.
 *
 * - PEG files (.chatpeg, .sortpeg, etc.) → PEGPreviewPane
 * - Markdown files (.md) → _Markdown renderer
 * - OLX files (.olx, .xml) → RenderOLX with full props
 */
export default function PreviewPane({
  path,
  content,
  idMap,
  resolveProvider,
  onError,
  onParsed,
}: PreviewPaneProps) {
  // Create default provider if none supplied (for src="" resolution)
  const defaultProvider = useMemo(() => new NetworkStorageProvider(), []);
  const provider = resolveProvider ?? defaultProvider;
  const provenance = path ? `file:///content/${path}` : undefined;

  // PEG files get their own preview pane
  if (isPEGFile(path)) {
    return <PEGPreviewPane path={path} content={content} />;
  }

  // Markdown files render directly
  if (isMarkdownFile(path)) {
    return (
      <div className="markdown-preview">
        <RenderMarkdown>{content}</RenderMarkdown>
      </div>
    );
  }

  // OLX files use RenderOLX with full props
  return (
    <RenderOLX
      id={path || '_preview'}
      inline={content}
      baseIdMap={idMap ?? undefined}
      resolveProvider={provider}
      provenance={provenance}
      onError={onError}
      onParsed={onParsed}
    />
  );
}
