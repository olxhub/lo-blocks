// packages/shared/components/common/PreviewPane.tsx
//
// Unified preview component for all content types.
// Handles OLX, PEG (chatpeg, sortpeg, etc.), and future formats.
//
'use client';

import { useMemo } from 'react';
import RenderOLX from './RenderOLX';
import PEGPreviewPane from './PEGPreviewPane';
import RenderMarkdown from './RenderMarkdown';
import { isPEGFile, isMarkdownFile, getContentType, PREVIEW_WRAPPER } from '@/lib/util/fileTypes';
import { NetworkStorageProvider } from '@/lib/lofs';
import type { IdMap, OlxDomNode } from '@/lib/types';
import type { StorageProvider } from '@/lib/types/storage';
import type { AppError } from '@/lib/types/errors';
import { stateKeyFromFilename } from '@/lib/types/id-grammar';
import type { ContentNamespace } from '@/lib/types';

export interface PreviewPaneProps {
  /** File path - used for file type detection and provenance */
  path: string;
  /** Content to preview */
  content: string;
  /** Content namespace for the previewed OLX (e.g. docs.ActionButton for a
   *  block example, or the file's provider-resolved namespace in studio). */
  ns: ContentNamespace;
  /** Base ID map for cross-file references (OLX only) */
  idMap?: IdMap | null;
  /** Provider for resolving src="" references (OLX only) */
  resolveProvider?: StorageProvider;
  /** Called with a canonical AppError when parsing/rendering fails */
  onError?: (error: AppError) => void;
  /** Called after parsing completes with merged idMap (OLX only) */
  onParsed?: (result: { idMap: Record<string, any>; root: string | null }) => void;
  /** Ref to expose the root OlxDomNode for external tree inspection (OLX only) */
  nodeInfoRef?: React.MutableRefObject<OlxDomNode | null>;
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
  ns,
  idMap,
  resolveProvider,
  onError,
  onParsed,
  nodeInfoRef,
}: PreviewPaneProps) {
  // Create default provider if none supplied (for src="" resolution)
  const defaultProvider = useMemo(() => new NetworkStorageProvider(), []);
  const provider = resolveProvider ?? defaultProvider;
  const provenance = path ? `file:content://${path}` : undefined;

  // PEG files get their own preview pane
  if (isPEGFile(path)) {
    return <PEGPreviewPane path={path} content={content} />;
  }

  // Markdown files render directly (ns: embedded ```olx fences parse in
  // the previewed file's namespace)
  if (isMarkdownFile(path)) {
    return (
      <div className="markdown-preview">
        <RenderMarkdown ns={ns}>{content}</RenderMarkdown>
      </div>
    );
  }

  // Content types with a 1:1 OLX block wrapper (mermaid, observable, etc.)
  // TODO: This should probably use `src=`
  // TODO: This should probably not be inlined but come in from templates
  const wrapperBlock = PREVIEW_WRAPPER[getContentType(path)];
  if (wrapperBlock) {
    if (!content?.trim()) {
      return <div className="preview-empty">No content to preview</div>;
    }
    return (
      <RenderOLX
        id={stateKeyFromFilename(path || '_preview.olx', ns)}
        ns={ns}
        inline={`<${wrapperBlock}><![CDATA[\n${content}\n]]></${wrapperBlock}>`}
      />
    );
  }

  // Empty content — nothing to render (avoids crash when parsed.root is null
  // and the file path falls through as a block reference)
  if (!content?.trim()) {
    return <div className="preview-empty">No content to preview</div>;
  }

  // OLX files use RenderOLX with full props
  return (
    <RenderOLX
      id={stateKeyFromFilename(path || '_preview.olx', ns)}
      ns={ns}
      inline={content}
      baseIdMap={idMap ?? undefined}
      resolveProvider={provider}
      provenance={provenance}
      onError={onError}
      onParsed={onParsed}
      nodeInfoRef={nodeInfoRef}
    />
  );
}
