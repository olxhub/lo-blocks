// src/components/common/CodeEditor.tsx
'use client';

import { useMemo } from 'react';
import dynamic from 'next/dynamic';
import { xml } from '@codemirror/lang-xml';
import { markdown } from '@codemirror/lang-markdown';

// Dynamic import for CodeMirror to avoid SSR issues
const CodeMirror = dynamic(
  () => import('@uiw/react-codemirror').then(mod => mod.default),
  { ssr: false }
);

export type CodeLanguage = 'xml' | 'olx' | 'md' | 'markdown';

interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  /** File path - used to detect language from extension */
  path?: string;
  /** Explicit language override (takes precedence over path) */
  language?: CodeLanguage;
  /** Height constraint - defaults to "100%" */
  height?: string;
  /** Max height constraint */
  maxHeight?: string;
  /** Basic setup options override */
  basicSetup?: {
    lineNumbers?: boolean;
    foldGutter?: boolean;
    [key: string]: unknown;
  };
}

function getLanguageExtension(language?: CodeLanguage) {
  switch (language) {
    case 'xml':
    case 'olx':
      return xml();
    case 'md':
    case 'markdown':
      return markdown();
    default:
      return undefined;
  }
}

function detectLanguageFromPath(path?: string): CodeLanguage | undefined {
  if (!path) return undefined;
  const ext = path.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'xml':
    case 'olx':
      return 'xml';
    case 'md':
      return 'md';
    default:
      return undefined;
  }
}

/**
 * A CodeMirror-based code editor with automatic language detection.
 *
 * Handles the dynamic import of CodeMirror to avoid SSR issues and
 * provides automatic syntax highlighting based on file extension or
 * explicit language prop.
 */
export default function CodeEditor({
  value,
  onChange,
  path,
  language,
  height = '100%',
  maxHeight,
  basicSetup = { lineNumbers: true, foldGutter: false },
}: CodeEditorProps) {
  const effectiveLanguage = language ?? detectLanguageFromPath(path);

  const extensions = useMemo(() => {
    const ext = getLanguageExtension(effectiveLanguage);
    return ext ? [ext] : [];
  }, [effectiveLanguage]);

  return (
    <CodeMirror
      value={value}
      onChange={onChange}
      extensions={extensions}
      height={height}
      maxHeight={maxHeight}
      basicSetup={basicSetup}
    />
  );
}
