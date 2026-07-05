// packages/shared/components/common/OLXCodeBlock.tsx
//
// Renders OLX code blocks embedded in Markdown.
//
// Supports multiple render modes via language suffix:
//   ```olx         - Render the component (default)
//   ```olx:code    - Show syntax-highlighted code only
//   ```olx:playground - Show code + live preview side-by-side
//
// Usage in Markdown:
//   ```olx
//   <ChoiceInput>
//     <Key>Correct</Key>
//     <Distractor>Wrong</Distractor>
//   </ChoiceInput>
//   ```
//
'use client';

import React, { useState, useId } from 'react';
import RenderOLX from '@/components/common/RenderOLX';
import { parseStateKey } from '@/lib/types/id-grammar';
import type { ContentNamespace } from '@/lib/types';

// TODO: Add CodeMirror support once Turbopack dynamic import issue is resolved
// For now, using textarea to avoid Turbopack crash

/**
 * Parse the language string to extract mode.
 * Examples: "olx:render" -> { mode: 'render' }
 *           "olx:code" -> { mode: 'code' }
 *           "olx:playground" -> { mode: 'playground' }
 *
 * Note: Plain "olx" is not yet defined - we're being explicit during prototyping.
 * TODO: Decide on default behavior for bare "olx" language tag.
 *   - Convention suggests "olx" alone should do the default/common thing (show highlighted code)
 *   - Showing a rendered component gives better discoverability, and is likely used more often
 */
function parseOLXLanguage(language) {
  if (!language) return null;

  const lower = language.toLowerCase();
  if (lower === 'olx:render') return { mode: 'render' };
  if (lower === 'olx:code') return { mode: 'code' };
  if (lower === 'olx:playground') return { mode: 'playground' };

  return null;
}

/**
 * Code-only view.
 * TODO: Add proper syntax highlighting (current regex approach was broken)
 */
function OLXCodeView({ code }) {
  return (
    <pre className="olx-code-block">
      <code>{code}</code>
    </pre>
  );
}

/**
 * Live rendered OLX component.
 * Renders inline without extra wrapper chrome - let the OLX provide its own styling.
 *
 * Embeds share the namespace of the context hosting them (e.g. docs.ActionButton
 * for a block README), so snippets can <Use ref> the block's shared fixtures
 * with bare refs.
 */
function OLXRenderView({ code, ns }: { code: string; ns: ContentNamespace }) {
  const uniqueId = useId();
  // No leading underscore: this id lands in authored OLX (the inline
  // wrapper), and the id grammar reserves leading "_" for system-assigned
  // refs — parse rejects it with a DisplayError on every embed.
  const bareId = `embed_${uniqueId.replace(/[^a-zA-Z0-9_]/g, '_')}`;
  const rootId = `${ns}/${bareId}`;

  // Wrap in a root element with known ID
  const wrappedOLX = `<Vertical id="${bareId}">${code}</Vertical>`;

  return (
    <RenderOLX
      id={parseStateKey(rootId)}
      ns={ns}
      inline={wrappedOLX}
      provenance="markdown-embed://"
    />
  );
}

/**
 * Playground view - code + live preview side-by-side with editing.
 * TODO: Use CodeMirror once Turbopack dynamic import issue is resolved.
 */
function OLXPlaygroundView({ code: initialCode, ns }: { code: string; ns: ContentNamespace }) {
  const [code, setCode] = useState(initialCode);
  const uniqueId = useId();
  // No leading underscore — see OLXRenderView's bareId note.
  const bareId = `playground_${uniqueId.replace(/[^a-zA-Z0-9_]/g, '_')}`;
  // See OLXRenderView for namespace semantics.
  const rootId = `${ns}/${bareId}`;

  const wrappedOLX = `<Vertical id="${bareId}">${code}</Vertical>`;

  return (
    <div className="olx-playground">
      <div className="olx-playground-editor">
        <div className="olx-playground-header">OLX Source</div>
        <textarea
          className="olx-playground-textarea"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          spellCheck={false}
        />
      </div>
      <div className="olx-playground-preview">
        <div className="olx-playground-header">Preview</div>
        <div className="olx-playground-content">
          <RenderOLX
            id={parseStateKey(rootId)}
            ns={ns}
            inline={wrappedOLX}
            provenance="markdown-playground://"
          />
        </div>
      </div>
    </div>
  );
}

/**
 * Main OLX code block component.
 * Dispatches to appropriate view based on mode.
 *
 * `ns` is the content namespace for rendered/playground snippets — the
 * hosting context's namespace (e.g. docs.ActionButton for a block README) so
 * snippet refs resolve against that namespace's content. Always provided by
 * RenderMarkdown's PreRenderer, which requires it from its own caller.
 */
export function OLXCodeBlock({ language, children, ns }: {
  language: string | null;
  children: React.ReactNode;
  ns: ContentNamespace;
}) {
  const parsed = parseOLXLanguage(language);

  // Not an OLX block - return null to fall through to default rendering
  if (!parsed) return null;

  const code = String(children).trim();

  switch (parsed.mode) {
    case 'code':
      return <OLXCodeView code={code} />;
    case 'playground':
      return <OLXPlaygroundView code={code} ns={ns} />;
    case 'render':
    default:
      return <OLXRenderView code={code} ns={ns} />;
  }
}

/**
 * Check if a language string is an OLX variant.
 */
export function isOLXLanguage(language) {
  return parseOLXLanguage(language) !== null;
}
