// src/components/common/CodeEditor.tsx
'use client';

import { useMemo } from 'react';
import dynamic from 'next/dynamic';
import { xml } from '@codemirror/lang-xml';
import { markdown } from '@codemirror/lang-markdown';
import { javascript } from '@codemirror/lang-javascript';
import { linter, lintGutter, Diagnostic } from '@codemirror/lint';
import { Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import {
  isPEGContentExtension,
  getParserForExtension,
  type PEGContentExtension
} from '@/generated/parserRegistry';

// Dynamic import for CodeMirror to avoid SSR issues
const CodeMirror = dynamic(
  () => import('@uiw/react-codemirror').then(mod => mod.default),
  { ssr: false }
);

export type CodeLanguage = 'xml' | 'olx' | 'md' | 'markdown' | 'pegjs' | PEGContentExtension;

// PEG compilation error type (from Peggy)
interface PEGLocation {
  start: { line: number; column: number; offset: number };
  end?: { line: number; column: number; offset: number };
}

interface PEGCompileError extends Error {
  location?: PEGLocation;
  expected?: Array<{ type: string; text?: string; description?: string }>;
  found?: string;
}

// Custom theme for error highlighting in PEG files
const pegErrorTheme = EditorView.baseTheme({
  '.cm-lintRange-error': {
    backgroundImage: 'none',
    backgroundColor: 'rgba(255, 0, 0, 0.15)',
    borderBottom: '2px solid #e53e3e',
  },
  '.cm-lint-marker-error': {
    content: '"●"',
    color: '#e53e3e',
  },
  '.cm-tooltip-lint': {
    backgroundColor: '#1a202c',
    color: '#fff',
    border: '1px solid #e53e3e',
    borderRadius: '4px',
    padding: '8px 12px',
    fontSize: '13px',
    maxWidth: '400px',
  },
});

/**
 * Creates diagnostics from a PEG parse/compile error.
 * Shared between grammar linter and content linter.
 */
function createPEGDiagnostics(
  error: PEGCompileError,
  content: string,
  source: string
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  if (error.location) {
    const { start, end } = error.location;
    const fromOffset = start.offset;
    const toOffset = end?.offset ?? Math.min(fromOffset + 10, content.length);

    let message = error.message;
    if (error.expected && error.expected.length > 0) {
      const expectedItems = error.expected
        .map(exp => exp.description || exp.text || exp.type)
        .filter(Boolean)
        .slice(0, 5);
      if (expectedItems.length > 0 && !message.includes('Expected')) {
        message += `\nExpected: ${expectedItems.join(', ')}`;
      }
    }
    if (error.found && !message.includes('found')) {
      message += `\nFound: "${error.found}"`;
    }

    diagnostics.push({
      from: fromOffset,
      to: toOffset,
      severity: 'error',
      message,
      source,
    });
  } else {
    diagnostics.push({
      from: 0,
      to: Math.min(10, content.length),
      severity: 'error',
      message: error.message || 'Parse error',
      source,
    });
  }

  return diagnostics;
}

/**
 * Creates a linter that compiles PEG grammars using Peggy.
 * Returns diagnostics for compilation errors.
 */
function createPEGGrammarLinter(): Extension {
  return linter(async (view) => {
    const content = view.state.doc.toString();
    if (!content.trim()) return [];

    try {
      const peggy = await import('peggy');
      peggy.generate(content, { output: 'source', format: 'es' });
      return [];
    } catch (e) {
      return createPEGDiagnostics(e as PEGCompileError, content, 'Peggy Compiler');
    }
  });
}

/**
 * Creates a linter for PEG content files using a specific parser.
 * Returns diagnostics for parse errors.
 */
function createPEGContentLinter(extension: string): Extension {
  return linter((view) => {
    const content = view.state.doc.toString();
    if (!content.trim()) return [];

    const parser = getParserForExtension(extension);
    if (!parser) return [];

    try {
      parser.parse(content);
      return [];
    } catch (e) {
      return createPEGDiagnostics(e as PEGCompileError, content, `${extension} Parser`);
    }
  });
}

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
  /** Additional CodeMirror extensions */
  extensions?: Extension[];
}

function getLanguageExtension(language?: CodeLanguage): Extension | undefined {
  switch (language) {
    case 'xml':
    case 'olx':
      return xml();
    case 'md':
    case 'markdown':
      return markdown();
    case 'pegjs':
      // PEG grammars contain JavaScript in actions - use JS highlighting
      return javascript();
    default:
      return undefined;
  }
}

function detectLanguageFromPath(path?: string): CodeLanguage | undefined {
  if (!path) return undefined;
  const ext = path.split('.').pop()?.toLowerCase();

  // Check for PEG content extensions first (e.g., .chatpeg, .sortpeg)
  if (ext && isPEGContentExtension(ext)) {
    return ext as PEGContentExtension;
  }

  switch (ext) {
    case 'xml':
    case 'olx':
      return 'xml';
    case 'md':
      return 'md';
    case 'pegjs':
      return 'pegjs';
    default:
      return undefined;
  }
}

/** Check if a language/path indicates a PEG grammar file (.pegjs) */
export function isPEGGrammarFile(path?: string, language?: CodeLanguage): boolean {
  if (language === 'pegjs') return true;
  if (!path) return false;
  return path.endsWith('.pegjs');
}

/** Check if a language/path indicates a PEG content file (.chatpeg, .sortpeg, etc.) */
export function isPEGContentFile(path?: string, language?: CodeLanguage): boolean {
  if (language && isPEGContentExtension(language)) return true;
  if (!path) return false;
  const ext = path.split('.').pop()?.toLowerCase();
  return ext ? isPEGContentExtension(ext) : false;
}

/** Get the extension from a path */
function getExtensionFromPath(path?: string): string | undefined {
  if (!path) return undefined;
  return path.split('.').pop()?.toLowerCase();
}

// Legacy export for backwards compatibility
export const isPEGFile = isPEGGrammarFile;

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
  extensions: additionalExtensions = [],
}: CodeEditorProps) {
  const effectiveLanguage = language ?? detectLanguageFromPath(path);
  const isPegGrammar = isPEGGrammarFile(path, effectiveLanguage);
  const isPegContent = isPEGContentFile(path, effectiveLanguage);
  const ext = getExtensionFromPath(path);

  const extensions = useMemo(() => {
    const exts: Extension[] = [];

    // Language extension (syntax highlighting)
    const langExt = getLanguageExtension(effectiveLanguage);
    if (langExt) exts.push(langExt);

    // PEG grammar files (.pegjs): compile with Peggy to validate
    if (isPegGrammar) {
      exts.push(createPEGGrammarLinter());
      exts.push(lintGutter());
      exts.push(pegErrorTheme);
    }

    // PEG content files (.chatpeg, .sortpeg, etc.): parse with the specific parser
    if (isPegContent && ext) {
      exts.push(createPEGContentLinter(ext));
      exts.push(lintGutter());
      exts.push(pegErrorTheme);
    }

    // User-provided extensions
    exts.push(...additionalExtensions);

    return exts;
  }, [effectiveLanguage, isPegGrammar, isPegContent, ext, additionalExtensions]);

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
