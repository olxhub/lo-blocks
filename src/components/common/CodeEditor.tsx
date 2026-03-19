// src/components/common/CodeEditor.tsx
'use client';

import { useMemo, useRef, useImperativeHandle, forwardRef } from 'react';
import dynamic from 'next/dynamic';
import { xml } from '@codemirror/lang-xml';
import { markdown } from '@codemirror/lang-markdown';
import { linter, lintGutter, Diagnostic } from '@codemirror/lint';
import { Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import type { ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { getParserForExtension, type PEGContentExtension } from '@/generated/parserRegistry';
import { getExtension, isPEGFile, isOLXFile, isMarkdownFile } from '@/lib/util/fileTypes';

// Dynamic import for CodeMirror to avoid SSR issues
const CodeMirror = dynamic(
  () => import('@uiw/react-codemirror').then(mod => mod.default),
  { ssr: false }
);

export type CodeLanguage = 'xml' | 'olx' | 'md' | 'markdown' | PEGContentExtension;

// PEG parse error type
interface PEGParseError extends Error {
  location?: {
    start: { line: number; column: number; offset: number };
    end?: { line: number; column: number; offset: number };
  };
  expected?: Array<{ type: string; text?: string; description?: string }>;
  found?: string;
}

// Custom theme for error highlighting
const errorTheme = EditorView.baseTheme({
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
 * Creates diagnostics from a PEG parse error.
 */
function createPEGDiagnostics(
  error: PEGParseError,
  content: string,
  source: string
): Diagnostic[] {
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

    return [{
      from: fromOffset,
      to: toOffset,
      severity: 'error',
      message,
      source,
    }];
  }

  return [{
    from: 0,
    to: Math.min(10, content.length),
    severity: 'error',
    message: error.message || 'Parse error',
    source,
  }];
}

/**
 * Creates a linter for PEG content files using the parser for that extension.
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
      return createPEGDiagnostics(e as PEGParseError, content, `${extension} Parser`);
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
  /** Theme - 'light' or 'dark'. Defaults to 'light'. */
  theme?: 'light' | 'dark';
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

/** Methods exposed via ref */
export interface CodeEditorHandle {
  /** Insert text at cursor position, with proper indentation for OLX */
  insertAtCursor: (text: string) => void;
  /** Get the underlying EditorView (if available) */
  getView: () => EditorView | undefined;
}

/**
 * Indents a multi-line string to match a base indentation.
 * The first line is not indented (it goes at cursor), subsequent lines get the base indent.
 */
function indentText(text: string, baseIndent: string): string {
  const lines = text.split('\n');
  if (lines.length <= 1) return text;

  // First line stays as-is, subsequent lines get the base indent
  return lines.map((line, i) => i === 0 ? line : baseIndent + line).join('\n');
}

function getLanguageExtension(language?: CodeLanguage): Extension | undefined {
  switch (language) {
    case 'xml':
    case 'olx':
      return xml();
    case 'md':
    case 'markdown':
      return markdown();
    default:
      // PEG content files don't have specific syntax highlighting
      return undefined;
  }
}

/** Detect syntax highlighting language from file path */
function detectLanguageFromPath(path?: string): 'xml' | 'md' | undefined {
  if (isOLXFile(path)) return 'xml';
  if (isMarkdownFile(path)) return 'md';
  return undefined;
}

/**
 * A CodeMirror-based code editor with automatic language detection.
 *
 * Handles the dynamic import of CodeMirror to avoid SSR issues and
 * provides automatic syntax highlighting based on file extension or
 * explicit language prop.
 *
 * For PEG content files (.chatpeg, .sortpeg, etc.), provides inline
 * error highlighting using the appropriate parser.
 */
const CodeEditor = forwardRef<CodeEditorHandle, CodeEditorProps>(function CodeEditor({
  value,
  onChange,
  path,
  language,
  theme = 'dark',
  height = '100%',
  maxHeight,
  basicSetup = { lineNumbers: true, foldGutter: false },
  extensions: additionalExtensions = [],
}, ref) {
  const editorRef = useRef<ReactCodeMirrorRef>(null);
  const effectiveLanguage = language ?? detectLanguageFromPath(path);
  const ext = getExtension(path);
  const isPegContent = isPEGFile(path);

  // Expose methods via ref
  useImperativeHandle(ref, () => ({
    insertAtCursor: (text: string) => {
      const view = editorRef.current?.view;
      if (!view) {
        // Fallback: append to end if no view available
        onChange(value + '\n\n' + text);
        return;
      }

      const state = view.state;
      const selection = state.selection.main;
      const cursorPos = selection.head;

      // Get the current line to determine indentation
      const line = state.doc.lineAt(cursorPos);
      const lineText = line.text;
      const indentMatch = lineText.match(/^(\s*)/);
      const baseIndent = indentMatch ? indentMatch[1] : '';

      // For OLX files, indent the inserted text
      const isOlx = isOLXFile(path);
      const insertText = isOlx ? indentText(text, baseIndent) : text;

      // Insert at cursor with proper newlines
      const before = cursorPos > 0 && state.doc.sliceString(cursorPos - 1, cursorPos) !== '\n' ? '\n' : '';
      const after = '\n';

      view.dispatch({
        changes: {
          from: cursorPos,
          to: cursorPos,
          insert: before + insertText + after,
        },
        selection: { anchor: cursorPos + before.length + insertText.length + after.length },
      });
      view.focus();
    },
    getView: () => editorRef.current?.view,
  }), [value, onChange, path]);

  const extensions = useMemo(() => {
    const exts: Extension[] = [];

    // Language extension (syntax highlighting)
    const langExt = getLanguageExtension(effectiveLanguage);
    if (langExt) exts.push(langExt);

    // PEG content files: parse with the specific parser for inline errors
    if (isPegContent && ext) {
      exts.push(createPEGContentLinter(ext));
      exts.push(lintGutter());
      exts.push(errorTheme);
    }

    // User-provided extensions
    exts.push(...additionalExtensions);

    return exts;
  }, [effectiveLanguage, isPegContent, ext, additionalExtensions]);

  return (
    <CodeMirror
      ref={editorRef}
      value={value}
      onChange={onChange}
      theme={theme}
      extensions={extensions}
      height={height}
      maxHeight={maxHeight}
      basicSetup={basicSetup}
    />
  );
});

export default CodeEditor;
