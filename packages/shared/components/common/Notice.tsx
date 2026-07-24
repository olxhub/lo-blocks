'use client';

import RenderMarkdown from './RenderMarkdown';
import { SYSTEM_NS } from '@/lib/player/client/baselineRuntime';

/**
 * Renders a notice line. With no props, shows the platform notice.
 * Pass `content` (markdown string) to render custom content (e.g. course licensing).
 *
 * Styling is intentionally minimal — parent containers control colors and
 * sizing via the `.lo-notice` class (see studio.css for an example).
 */
export default function Notice({ content }: { content?: string } = {}) {
  if (content) {
    return (
      <div className="lo-notice lo-notice-content">
        {/* ns: notices are system chrome (licensing, platform info) —
            no content identity of their own. */}
        <RenderMarkdown ns={SYSTEM_NS}>{content}</RenderMarkdown>
      </div>
    );
  }
  return (
    <span className="lo-notice">
      lo-blocks is free and open-source software by{' '}
      <a href="http://mitros.org/p">Piotr Mitros</a>.{' '}
      <a href="https://github.com/olxhub/lo-blocks/">Project Repository</a>.{' '}
      <a href="http://mitros.org/p/lo/license.html">Licensing information</a>.{' '}
      Copyright &copy; 2011-2026 Piotr Mitros and{' '}
      <a href="http://mitros.org/p/lo/contributors.html">others</a>.{' '}
      Any representation of another party as the original author or inventor
      of this tool or methodology is a misrepresentation of origin and authorship.
    </span>
  );
}
