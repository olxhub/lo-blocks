// packages/shared/components/blocks/display/Html/Html.ts
//
// Html block - renders raw HTML content.
//
// BACKWARDS COMPATIBILITY ONLY. Do not use in new content.
// Prefer <Markdown> for new content (Markdown passes through HTML natively).
//
// This block exists to support imported Open edX HTML content that contains
// complex HTML (tables, inline styles, etc.) which may not round-trip cleanly
// through a Markdown parser.
//
// Usage:
//   <Html>
//     <![CDATA[<p>Raw HTML content here</p>]]>
//   </Html>
//
import { dev } from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';

const Html = dev({
  ...parsers.text.raw(),
  name: 'Html',
  description: 'Render raw HTML content (OLX 1.0 backwards compatibility ONLY — NOT for new content).',
  requiresUniqueId: false,
  internal: true,
});

export default Html;
