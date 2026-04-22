// src/components/common/CodeEditor/CodeEditor.tsx
'use client';

import { useMemo, useRef, useImperativeHandle, forwardRef, useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { xml } from '@codemirror/lang-xml';
import { markdown } from '@codemirror/lang-markdown';
import { yaml } from '@codemirror/lang-yaml';
import { javascript } from '@codemirror/lang-javascript';
import { indentService, syntaxTree } from '@codemirror/language';
import { linter, lintGutter, Diagnostic } from '@codemirror/lint';
import { Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import type { ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { getParserForExtension, type PEGContentExtension } from '@/generated/parserRegistry';
import { getExtension, getContentType, isPEGFile, isOLXFile } from '@/lib/util/fileTypes';
import { BLOCK_REGISTRY } from '@/components/blockRegistry';
import { generateOlxSchema } from './olxSchema';

// Dynamic import for CodeMirror to avoid SSR issues
const CodeMirror = dynamic(
  () => import('@uiw/react-codemirror').then(mod => mod.default),
  { ssr: false }
);

// OLX schema for CodeMirror autocompletion — lazy singleton to avoid
// circular-init issues (BLOCK_REGISTRY is a module-level const too).
let _olxSchema: ReturnType<typeof generateOlxSchema> | null = null;
function getOlxSchema() {
  if (!_olxSchema) _olxSchema = generateOlxSchema(BLOCK_REGISTRY);
  return _olxSchema;
}

// ---------------------------------------------------------------------------
// OLX cursor context — which block tag is the cursor inside?
//
// Lezer's XML parser gives us: Element > OpenTag > TagName. We walk up the
// tree from the cursor to find the enclosing Element and read its tag name.
//
// This is currently a standalone helper. The long-term plan is to expose
// cursor context as a subscribable field so sibling components (e.g. a
// contextual docs panel) can react to it:
//
//   <Docs target="editorId" />
//   <CodeEditor id="editorId" />
//
// That will happen once the editor is extracted from /studio/ into its own
// reusable component. For now, this is penciled in as a building block.
//
// This is NOT TESTED CODE.
//
// If it is removed, we should also remove the syntaxTree import, and the
// getEnclosingTagName export from index.ts
//
// Possible paths forward:
// * <Docs target="codeMirrorId"/>
// * CodeMirror hoverTooltip API
// * The existing autocompletion already supports info fields on Completion
//   objects. Could we attach .describe() text there? This is a deeper dive.
// ---------------------------------------------------------------------------

/**
 * Returns the OLX tag name of the nearest enclosing element at `pos`,
 * or null if the cursor is outside any element (e.g. in the document root
 * or in a non-XML file).
 *
 * Uses CodeMirror's Lezer syntax tree — no re-parsing required.
 */
export function getEnclosingTagName(state: import('@codemirror/state').EditorState, pos: number): string | null {
  const tree = syntaxTree(state);
  let node = tree.resolveInner(pos, -1);
  for (let cur: typeof node | null = node; cur; cur = cur.parent) {
    if (cur.name === 'Element') {
      const tagName = cur.firstChild?.getChild('TagName');
      if (tagName) return state.doc.sliceString(tagName.from, tagName.to);
    }
  }
  return null;
}

export type CodeLanguage = 'xml' | 'olx' | 'md' | 'markdown' | 'yaml' | 'json' | 'js' | 'mermaid' | PEGContentExtension;

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

/** Resolves 'auto' theme to 'light' or 'dark' based on data-color-mode and prefers-color-scheme. */
function useResolvedTheme(theme: 'light' | 'dark' | 'auto'): 'light' | 'dark' {
  const [resolved, setResolved] = useState<'light' | 'dark'>(() => {
    if (theme !== 'auto') return theme;
    if (typeof document === 'undefined') return 'light';
    const attr = document.documentElement.dataset.colorMode;
    if (attr === 'light' || attr === 'dark') return attr;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  useEffect(() => {
    if (theme !== 'auto') { setResolved(theme); return; }

    const resolve = () => {
      const attr = document.documentElement.dataset.colorMode;
      if (attr === 'light' || attr === 'dark') { setResolved(attr); return; }
      setResolved(window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    };
    resolve();

    // Watch data-color-mode attribute changes
    const observer = new MutationObserver(resolve);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-color-mode'] });

    // Watch prefers-color-scheme changes
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    mql.addEventListener('change', resolve);

    return () => { observer.disconnect(); mql.removeEventListener('change', resolve); };
  }, [theme]);

  return resolved;
}

interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  /** File path - used to detect language from extension */
  path?: string;
  /** Explicit language override (takes precedence over path) */
  language?: CodeLanguage;
  /** Theme - 'light', 'dark', or 'auto' (follows data-color-mode / prefers-color-scheme). Defaults to 'auto'. */
  theme?: 'light' | 'dark' | 'auto';
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
  /** Enable line wrapping. Defaults to true. */
  lineWrapping?: boolean;
  /** Additional CodeMirror extensions */
  extensions?: Extension[];
}

/** Methods exposed via ref */
export interface CodeEditorHandle {
  /** Insert text at cursor position, with proper indentation for OLX */
  insertAtCursor: (text: string) => void;
  /** Get the underlying EditorView (if available) */
  getView: () => EditorView | undefined;
  /** Find an id="..." attribute in the document, select it, and scroll into view. Returns true if found. */
  scrollToId: (id: string) => boolean;
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
      const schema = getOlxSchema();
      return xml({
        elements: schema.elements,
        attributes: schema.attributes,
      });
    case 'md':
    case 'markdown':
      return markdown();
    case 'yaml':
    case 'json':
      return yaml();
    case 'js':
      return javascript();
    default:
      // PEG content files and mermaid don't have CodeMirror syntax highlighting
      return undefined;
  }
}

/** Detect syntax highlighting language from file path via getContentType(). */
function detectLanguageFromPath(filePath?: string): CodeLanguage | undefined {
  const type = getContentType(filePath);
  switch (type) {
    case 'olx':      return 'xml';
    case 'markdown':  return 'md';
    case 'data':      return 'yaml';
    case 'mermaid':   return 'mermaid';
    default:          break;
  }
  // TODO/HACK: getContentType groups all code files (js, ts, css, html) as 'code' —
  // check extension directly for languages with CodeMirror support.
  const ext = getExtension(filePath);
  if (ext.toLowerCase() === 'js') return 'js';
  return undefined;
}

/**
 * A CodeMirror-based code editor with automatic language detection.
 *
 * Handles the dynamic import of CodeMirror to avoid SSR issues and
 * provides automatic syntax highlighting based on file extension or
 * explicit language prop.
 *
 * For OLX files, provides schema-based autocompletion for block elements
 * and attributes, derived from the block registry.
 *
 * For PEG content files (.chatpeg, .sortpeg, etc.), provides inline
 * error highlighting using the appropriate parser.
 */
const CodeEditor = forwardRef<CodeEditorHandle, CodeEditorProps>(function CodeEditor({
  value,
  onChange,
  path,
  language,
  theme = 'auto',
  height = '100%',
  maxHeight,
  lineWrapping = true,
  basicSetup = { lineNumbers: true, foldGutter: false },
  extensions: additionalExtensions = [],
}, ref) {
  const editorRef = useRef<ReactCodeMirrorRef>(null);
  const resolvedTheme = useResolvedTheme(theme);
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
    scrollToId: (id: string) => {
      const view = editorRef.current?.view;
      if (!view) return false;
      const doc = view.state.doc.toString();
      // Match id="value" or id='value'
      const pattern = new RegExp(`\\bid=["']${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`);
      const match = pattern.exec(doc);
      if (!match) return false;
      const from = match.index;
      const to = from + match[0].length;
      view.dispatch({
        selection: { anchor: from, head: to },
        scrollIntoView: true,
      });
      view.focus();
      return true;
    },
  }), [value, onChange, path]);

  const extensions = useMemo(() => {
    const exts: Extension[] = [];

    // Line wrapping
    if (lineWrapping) exts.push(EditorView.lineWrapping);

    // Language extension (syntax highlighting + schema-based autocompletion)
    const langExt = getLanguageExtension(effectiveLanguage);
    if (langExt) exts.push(langExt);

    // For XML/OLX, override auto-indentation: just preserve the previous
    // line's indentation instead of indenting based on element nesting.
    // Literate XML is formatted around content, not around tag hierarchy.
    if (effectiveLanguage === 'xml' || effectiveLanguage === 'olx') {
      exts.push(indentService.of((context, pos) => {
        const line = context.lineAt(pos);
        if (line.from > 0) return context.lineIndent(line.from - 1);
        return 0;
      }));
    }

    // PEG content files: parse with the specific parser for inline errors
    if (isPegContent && ext) {
      exts.push(createPEGContentLinter(ext));
      exts.push(lintGutter());
      exts.push(errorTheme);
    }

    // User-provided extensions
    exts.push(...additionalExtensions);

    return exts;
  }, [lineWrapping, effectiveLanguage, isPegContent, ext, additionalExtensions]);

  return (
    <CodeMirror
      ref={editorRef}
      value={value}
      onChange={onChange}
      theme={resolvedTheme}
      extensions={extensions}
      height={height}
      maxHeight={maxHeight}
      basicSetup={basicSetup}
    />
  );
});

export default CodeEditor;
