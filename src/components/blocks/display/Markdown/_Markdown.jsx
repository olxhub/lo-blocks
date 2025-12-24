import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
// Note: katex.min.css is loaded via globals.css (can't import CSS in Node.js scripts)
import { OLXCodeBlock, isOLXLanguage } from '@/components/common/OLXCodeBlock';
// Note: markdown.css is loaded via the generated components.css registry

/**
 * Custom pre renderer - intercepts fenced code blocks for OLX handling.
 * This avoids hydration errors from <pre> inside <p>.
 */
function PreRenderer({ children, node, ...props }) {
  // For fenced code blocks, children is a <code> element
  // Check the node's first child for the language class
  const codeNode = node?.children?.[0];
  const className = codeNode?.properties?.className?.[0] || '';
  const match = /language-(\S+)/.exec(className);
  const language = match ? match[1] : null;

  if (isOLXLanguage(language)) {
    // Extract text content from the code node
    const text = codeNode?.children?.[0]?.value || '';
    return <OLXCodeBlock language={language}>{text}</OLXCodeBlock>;
  }

  // Default pre rendering
  return <pre {...props}>{children}</pre>;
}

/**
 * Custom code renderer - handles inline code only.
 * Fenced code blocks are handled by PreRenderer.
 */
function CodeRenderer({ inline, className, children, ...props }) {
  // Inline code - just render as <code>
  if (inline) {
    return <code className={className} {...props}>{children}</code>;
  }
  // Fenced code blocks come through PreRenderer, but just in case:
  return <code className={className} {...props}>{children}</code>;
}

/**
 * Shared ReactMarkdown component overrides for OLX embedding.
 * Export for use in docs page and other markdown renderers.
 */
export const markdownComponents = {
  pre: PreRenderer,
  code: CodeRenderer,
};

export function _Markdown(props) {
  const { kids } = props;

  /*** HACK HACK HACK ***/
  // This works around a bug where CapaProblem doesn't use block parsers correctly
  let content = kids;
  if (Array.isArray(kids) && kids.length > 0) {
    // If kids contains objects with type 'text', extract the text content
    content = kids.map((kid) => {
      if (typeof kid === 'object' && kid.type === 'text') {
        return kid.text;
      }
      return typeof kid === 'string' ? kid : '';
    }).join('');
  }
  /*** end of hack ***/

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[rehypeKatex]}
      components={markdownComponents}
    >
      {content}
    </ReactMarkdown>
  );
}
