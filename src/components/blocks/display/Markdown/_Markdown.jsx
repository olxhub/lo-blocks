import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { OLXCodeBlock, isOLXLanguage } from '@/components/common/OLXCodeBlock';
// Note: markdown.css is loaded via the generated components.css registry

/**
 * Custom code block renderer that handles OLX embeds.
 * Falls back to default rendering for non-OLX languages.
 */
function CodeBlockRenderer({ node, inline, className, children, ...props }) {
  // Extract language from className (e.g., "language-olx" -> "olx")
  const match = /language-(\S+)/.exec(className || '');
  const language = match ? match[1] : null;

  // Handle OLX code blocks
  if (!inline && isOLXLanguage(language)) {
    return <OLXCodeBlock language={language}>{children}</OLXCodeBlock>;
  }

  // Default code rendering
  return inline ? (
    <code className={className} {...props}>{children}</code>
  ) : (
    <pre className={className} {...props}>
      <code>{children}</code>
    </pre>
  );
}

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
      remarkPlugins={[remarkGfm]}
      components={{
        code: CodeBlockRenderer,
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
