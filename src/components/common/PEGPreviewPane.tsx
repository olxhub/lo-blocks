// src/components/common/PEGPreviewPane.tsx
// Preview pane for PEG grammar and content files
'use client';

import { useState, useEffect, useMemo } from 'react';
import { getParserForExtension, isPEGContentExtension } from '@/generated/parserRegistry';

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
      offset: number;
    };
  };
}

function getExtension(path: string): string {
  return path.split('.').pop()?.toLowerCase() || '';
}

/**
 * Preview pane for PEG files.
 * - For .pegjs files: Shows grammar compilation result
 * - For PEG content files (.chatpeg, etc.): Shows parsed AST
 */
export default function PEGPreviewPane({ path, content }: PEGPreviewPaneProps) {
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [compileResult, setCompileResult] = useState<ParseResult | null>(null);

  const ext = useMemo(() => getExtension(path), [path]);
  const isPegGrammar = ext === 'pegjs';
  const isPegContent = isPEGContentExtension(ext);

  // Compile .pegjs grammar files
  useEffect(() => {
    if (!isPegGrammar || !content.trim()) {
      setCompileResult(null);
      return;
    }

    let cancelled = false;

    async function compile() {
      try {
        const peggy = await import('peggy');
        // Compile and get the generated parser source
        const parserSource = peggy.generate(content, { output: 'source', format: 'es' });
        if (!cancelled) {
          setCompileResult({
            success: true,
            data: `Grammar compiled successfully.\nGenerated parser: ${parserSource.length} characters`
          });
        }
      } catch (e: any) {
        if (!cancelled) {
          setCompileResult({
            success: false,
            error: {
              message: e.message,
              location: e.location?.start
            }
          });
        }
      }
    }

    compile();
    return () => { cancelled = true; };
  }, [isPegGrammar, content]);

  // Parse PEG content files
  useEffect(() => {
    if (!isPegContent || !content.trim()) {
      setParseResult(null);
      return;
    }

    const parser = getParserForExtension(ext);
    if (!parser) {
      setParseResult({
        success: false,
        error: { message: `No parser found for extension: ${ext}` }
      });
      return;
    }

    try {
      const result = parser.parse(content);
      setParseResult({ success: true, data: result });
    } catch (e: any) {
      setParseResult({
        success: false,
        error: {
          message: e.message,
          location: e.location?.start
        }
      });
    }
  }, [isPegContent, ext, content]);

  const result = isPegGrammar ? compileResult : parseResult;
  const title = isPegGrammar ? 'Grammar Compilation' : 'Parse Result';

  if (!result) {
    return (
      <div className="p-4 text-gray-500">
        {content.trim() ? 'Processing...' : 'Enter content to see preview'}
      </div>
    );
  }

  return (
    <div className="p-4 h-full flex flex-col">
      <div className="font-semibold mb-2 flex items-center gap-2">
        {result.success ? (
          <span className="text-green-600">✓</span>
        ) : (
          <span className="text-red-600">✗</span>
        )}
        {title}
      </div>

      {result.success ? (
        <pre className="flex-1 overflow-auto bg-gray-900 text-green-400 p-4 rounded text-xs font-mono whitespace-pre-wrap">
          {typeof result.data === 'string'
            ? result.data
            : JSON.stringify(result.data, null, 2)}
        </pre>
      ) : (
        <div className="flex-1 overflow-auto">
          <div className="bg-red-50 border border-red-200 rounded p-4">
            <div className="text-red-700 font-medium mb-2">
              {result.error?.location && (
                <span className="text-red-500 text-sm mr-2">
                  Line {result.error.location.line}, Column {result.error.location.column}
                </span>
              )}
              Error
            </div>
            <pre className="text-red-600 text-sm whitespace-pre-wrap font-mono">
              {result.error?.message}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
