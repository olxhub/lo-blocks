// src/components/common/OLXCodeBlock.jsx
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
 */
function OLXRenderView({ code }) {
  const uniqueId = useId();
  const rootId = `olx_embed_${uniqueId.replace(/:/g, '_')}`;

  // Wrap in a root element with known ID
  const wrappedOLX = `<Vertical id="${rootId}">${code}</Vertical>`;

  return (
    <RenderOLX
      id={rootId}
      inline={wrappedOLX}
      provenance="markdown-embed://"
    />
  );
}

/**
 * Playground view - code + live preview side-by-side with editing.
 * TODO: Use CodeMirror once Turbopack dynamic import issue is resolved.
 */
function OLXPlaygroundView({ code: initialCode }) {
  const [code, setCode] = useState(initialCode);
  const uniqueId = useId();
  const rootId = `olx_playground_${uniqueId.replace(/:/g, '_')}`;

  const wrappedOLX = `<Vertical id="${rootId}">${code}</Vertical>`;

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
            id={rootId}
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
 */
export function OLXCodeBlock({ language, children }) {
  const parsed = parseOLXLanguage(language);

  // Not an OLX block - return null to fall through to default rendering
  if (!parsed) return null;

  const code = String(children).trim();

  switch (parsed.mode) {
    case 'code':
      return <OLXCodeView code={code} />;
    case 'playground':
      return <OLXPlaygroundView code={code} />;
    case 'render':
    default:
      return <OLXRenderView code={code} />;
  }
}

/**
 * Check if a language string is an OLX variant.
 */
export function isOLXLanguage(language) {
  return parseOLXLanguage(language) !== null;
}
