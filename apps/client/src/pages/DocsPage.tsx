// apps/client/src/pages/DocsPage.tsx
//
// Block documentation, served at /docs (index) and /docs/:BlockName (one
// block). Renders the DocsBrowser block through the standard block
// pipeline (RenderOLX) — the same block authoring courses embed, so this
// page is just the standalone view of it. DocsBrowser's own sidebar
// handles navigation between blocks, replacing the old "back" link.

import RenderOLX from '@/components/common/RenderOLX';
import { asContentNamespace, asStateKey } from '@/lib/types/id-grammar';

export default function DocsPage({ block }: { block?: string }) {
  // `block` is a validated OLXTag (PascalCase — see router.ts), so it is
  // safe to interpolate into the inline OLX attribute.
  const inline = block
    ? `<DocsBrowser id="docsbrowser" selected="${block}"/>`
    : '<DocsBrowser id="docsbrowser"/>';

  return (
    <RenderOLX
      ns={asContentNamespace('system')}
      id={asStateKey('system/docs')}
      inline={inline}
      eventContext="docs"
    />
  );
}
