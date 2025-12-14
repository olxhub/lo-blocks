// src/components/common/PEGPreviewPane.tsx
// Preview pane for PEG content files (.chatpeg, .sortpeg, etc.)
'use client';

import { useState, useMemo, useEffect } from 'react';
import { getParserForExtension } from '@/generated/parserRegistry';
import RenderOLX from '@/components/common/RenderOLX';

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

function getExtension(path: string): string {
  return path.split('.').pop()?.toLowerCase() || '';
}

type TabType = 'parse' | 'preview';

/**
 * Preview pane for PEG content files (.chatpeg, .sortpeg, etc.)
 * Shows tabs for parsed AST and rendered preview.
 */
export default function PEGPreviewPane({ path, content }: PEGPreviewPaneProps) {
  const [activeTab, setActiveTab] = useState<TabType>('preview');
  const [previewOLX, setPreviewOLX] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const ext = useMemo(() => getExtension(path), [path]);

  // Load grammar metadata including preview template
  useEffect(() => {
    if (!ext) {
      setPreviewOLX(null);
      setPreviewError(null);
      return;
    }

    fetch(`/api/docs/grammar/${encodeURIComponent(ext)}`)
      .then(res => {
        if (!res.ok) {
          if (res.status === 404) {
            setPreviewOLX(null);
            setPreviewError(null); // No error, just no grammar found
          } else {
            throw new Error(`Failed to load grammar: ${res.status}`);
          }
          return null;
        }
        return res.json();
      })
      .then(data => {
        if (data?.grammar?.preview) {
          setPreviewOLX(data.grammar.preview);
        } else {
          setPreviewOLX(null); // No preview available for this grammar
        }
      })
      .catch(err => {
        setPreviewError(err.message);
        setPreviewOLX(null);
      });
  }, [ext]);

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

  const hasPreview = previewOLX !== null;

  // Inject content into the preview OLX
  // The preview OLX must use {{CONTENT}} as placeholder
  const previewWithContent = useMemo((): { olx: string } | { error: string } | null => {
    if (!previewOLX || !content) return null;

    if (!previewOLX.includes('{{CONTENT}}')) {
      return { error: `Preview OLX is missing {{CONTENT}} placeholder for grammar: ${ext}` };
    }

    return { olx: previewOLX.replace('{{CONTENT}}', content) };
  }, [previewOLX, content, ext]);

  return (
    <div className="h-full flex flex-col">
      {/* Tabs */}
      <div className="flex border-b">
        <button
          onClick={() => setActiveTab('preview')}
          disabled={!hasPreview}
          className={`px-4 py-2 text-sm font-medium ${
            activeTab === 'preview'
              ? 'border-b-2 border-blue-500 text-blue-600'
              : hasPreview
                ? 'text-gray-500 hover:text-gray-700'
                : 'text-gray-300 cursor-not-allowed'
          }`}
          title={hasPreview ? undefined : `No preview available for ${ext}`}
        >
          Preview
        </button>
        <button
          onClick={() => setActiveTab('parse')}
          className={`px-4 py-2 text-sm font-medium ${
            activeTab === 'parse'
              ? 'border-b-2 border-blue-500 text-blue-600'
              : 'text-gray-500 hover:text-gray-700'
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
              <div className="text-gray-500">Enter content to see parse result</div>
            ) : (
              <>
                <div className="font-semibold mb-2 flex items-center gap-2">
                  {parseResult.success ? (
                    <span className="text-green-600">✓</span>
                  ) : (
                    <span className="text-red-600">✗</span>
                  )}
                  Parse Result
                </div>

                {parseResult.success ? (
                  <pre className="flex-1 overflow-auto bg-gray-900 text-green-400 p-4 rounded text-xs font-mono whitespace-pre-wrap">
                    {JSON.stringify(parseResult.data, null, 2)}
                  </pre>
                ) : (
                  <div className="bg-red-50 border border-red-200 rounded p-4">
                    <div className="text-red-700 font-medium mb-2">
                      {parseResult.error?.location && (
                        <span className="text-red-500 text-sm mr-2">
                          Line {parseResult.error.location.line}, Column {parseResult.error.location.column}
                        </span>
                      )}
                      Error
                    </div>
                    <pre className="text-red-600 text-sm whitespace-pre-wrap font-mono">
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
            {previewError ? (
              <div className="text-red-600">Error loading preview: {previewError}</div>
            ) : previewWithContent && 'error' in previewWithContent ? (
              <div className="text-red-600">{previewWithContent.error}</div>
            ) : previewWithContent && 'olx' in previewWithContent ? (
              <RenderOLX
                id={`peg-preview-${ext}`}
                inline={previewWithContent.olx}
              />
            ) : (
              <div className="text-gray-500">Loading preview...</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
