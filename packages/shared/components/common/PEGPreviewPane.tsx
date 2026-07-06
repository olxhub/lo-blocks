// packages/shared/components/common/PEGPreviewPane.tsx
// Preview pane for PEG content files (.chatpeg, .sortpeg, etc.)
'use client';

import { useState, useMemo } from 'react';
import { getParserForExtension } from '@/generated/parserRegistry';
import { useFormats } from '@/lib/docs/useDocs';
import { injectPreviewContent } from '@/lib/template/previewTemplate';
import RenderOLX from '@/components/common/RenderOLX';
import Spinner from '@/components/common/Spinner';
import { DisplayError } from '@/lib/util/debug';
import { getExtension } from '@/lib/util/fileTypes';
import { stateKeyFromFilename } from '@/lib/types/id-grammar';
import { toContentNamespace } from '@/lib/types';

interface PEGPreviewPaneProps {
  path: string;
  content: string;
}

interface ParseResult {
  success: boolean;
  data?: unknown;
  error?: {
    message: string;
    location?: {
      line: number;
      column: number;
    };
  };
}

type TabType = 'parse' | 'preview';

/**
 * Preview pane for PEG content files (.chatpeg, .sortpeg, etc.)
 * Shows tabs for parsed AST and rendered preview.
 */
export default function PEGPreviewPane({ path, content }: PEGPreviewPaneProps) {
  const [activeTab, setActiveTab] = useState<TabType>('preview');

  const ext = useMemo(() => getExtension(path), [path]);

  // Grammar preview template via the get_formats MCP tool (the legacy
  // /api/docs/grammar REST route is retired). get_formats filter matches
  // extensions; the 'preview' facet is the OLX template.
  const { formats, loading, error } = useFormats(ext ? { match: [ext] } : { match: [] }, ['preview']);
  const format = formats.find(f => f.extension === ext || f.name === ext);
  const previewOLX = format?.preview ?? null;
  const previewError = error ?? (!loading && ext && !format ? `Grammar '${ext}' not found` : null);

  const parseResult = useMemo((): ParseResult | null => {
    if (!content.trim()) return null;

    const parser = getParserForExtension(ext);
    if (!parser) {
      return {
        success: false,
        error: { message: `No parser found for extension: ${ext}` }
      };
    }

    try {
      const data = parser.parse(content);
      return { success: true, data };
    } catch (e: any) {
      return {
        success: false,
        error: {
          message: e.message,
          location: e.location?.start
        }
      };
    }
  }, [ext, content]);

  const hasPreview = !loading && previewOLX !== null;

  // Inject content into the preview OLX using shared template logic
  const previewWithContent = useMemo((): { olx: string } | { error: string } | null => {
    if (!previewOLX || !content) return null;
    return injectPreviewContent(previewOLX, content);
  }, [previewOLX, content]);

  return (
    <div className="h-full flex flex-col">
      {/* Tabs */}
      <div className="flex border-b">
        <button
          onClick={() => setActiveTab('preview')}
          disabled={!hasPreview}
          className={`px-4 py-2 text-sm font-medium ${
            activeTab === 'preview'
              ? 'border-b-2 border-accent text-accent'
              : hasPreview
                ? 'text-dimmed hover:text-secondary'
                : 'text-dimmed cursor-not-allowed'
          }`}
          title={hasPreview ? undefined : `No preview available for ${ext}`}
        >
          Preview
        </button>
        <button
          onClick={() => setActiveTab('parse')}
          className={`px-4 py-2 text-sm font-medium ${
            activeTab === 'parse'
              ? 'border-b-2 border-accent text-accent'
              : 'text-dimmed hover:text-secondary'
          }`}
        >
          Parse Result
        </button>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-auto">
        {activeTab === 'parse' && (
          <div className="p-4 h-full flex flex-col">
            {!parseResult ? (
              <div className="text-dimmed">Enter content to see parse result</div>
            ) : (
              <>
                <div className="font-semibold mb-2 flex items-center gap-2">
                  {parseResult.success ? (
                    <span className="text-success">✓</span>
                  ) : (
                    <span className="text-error">✗</span>
                  )}
                  Parse Result
                </div>

                {parseResult.success ? (
                  <pre className="flex-1 overflow-auto bg-background text-green-400 p-4 rounded text-xs font-mono whitespace-pre-wrap">
                    {JSON.stringify(parseResult.data, null, 2)}
                  </pre>
                ) : (
                  <div className="bg-error-subtle border border-error rounded p-4">
                    <div className="text-error font-medium mb-2">
                      {parseResult.error?.location && (
                        <span className="text-error text-sm mr-2">
                          Line {parseResult.error.location.line}, Column {parseResult.error.location.column}
                        </span>
                      )}
                      Error
                    </div>
                    <pre className="text-error text-sm whitespace-pre-wrap font-mono">
                      {parseResult.error?.message}
                    </pre>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {activeTab === 'preview' && (
          <div className="p-4">
            {loading ? (
              <Spinner>Loading preview...</Spinner>
            ) : previewError ? (
              <DisplayError message={previewError} />
            ) : previewWithContent && 'error' in previewWithContent ? (
              <DisplayError message={previewWithContent.error} />
            ) : previewWithContent && 'olx' in previewWithContent ? (
              <RenderOLX
                id={stateKeyFromFilename(`preview.${ext}`, toContentNamespace('pegPreview'))}
                ns={toContentNamespace('pegPreview')}
                inline={previewWithContent.olx}
              />
            ) : (
              <div className="text-dimmed">No preview available for this grammar</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
