// apps/client/src/pages/RepoDetailPage.tsx
//
// Full repository view at /repo/:encodedOrigin. Renders the RepoDetail block
// through the standard block pipeline (RenderOLX). The origin is passed as a
// block attribute so the component can look up the repo from Redux.

import RenderOLX from '@/components/common/RenderOLX';
import { asContentNamespace, asStateKey } from '@/lib/types/id-grammar';

/** Escape a string for use in an XML attribute value (double-quoted). */
function escapeXmlAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export default function RepoDetailPage({ origin }: { origin: string }) {
  return (
    <RenderOLX
      ns={asContentNamespace('system')}
      id={asStateKey('system/repo-detail')}
      inline={`<RepoDetail origin="${escapeXmlAttr(origin)}" />`}
      eventContext="repo-detail"
    />
  );
}
