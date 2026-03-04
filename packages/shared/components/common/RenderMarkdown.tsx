// src/components/common/RenderMarkdown.tsx
//
// Shared Markdown renderer with consistent GFM, math, and KaTeX support.
// Use this component for all Markdown rendering to ensure consistency.
//
// Note: {{...}} interpolation is handled by _Markdown.tsx before calling this component.
//
'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
// Note: katex.min.css is loaded via globals.css
import { OLXCodeBlock, isOLXLanguage } from '@/components/common/OLXCodeBlock';

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
 * Component overrides for ReactMarkdown.
 * Exported for cases where custom components need to be merged.
 */
export const markdownComponents = {
  pre: PreRenderer,
  code: CodeRenderer,
};

export interface RenderMarkdownProps {
  /** Markdown content to render */
  children: string;
  /** Optional className for the wrapper div */
  className?: string;
  /** Additional component overrides (merged with defaults) */
  components?: Record<string, React.ComponentType<any>>;
}

/**
 * Renders Markdown with consistent GFM, math, and KaTeX support.
 *
 * Features:
 * - GitHub Flavored Markdown (tables, strikethrough, autolinks, task lists)
 * - LaTeX math via KaTeX ($inline$ and $$block$$)
 * - OLX code block rendering (```olx, ```xml-preview)
 */
export default function RenderMarkdown({
  children,
  className,
  components,
}: RenderMarkdownProps) {
  const mergedComponents = components
    ? { ...markdownComponents, ...components }
    : markdownComponents;

  const content = (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[rehypeKatex]}
      components={mergedComponents}
    >
      {children}
    </ReactMarkdown>
  );

  const cls = className ? `rendered-markdown ${className}` : 'rendered-markdown';
  return <div className={cls}>{content}</div>;
}
