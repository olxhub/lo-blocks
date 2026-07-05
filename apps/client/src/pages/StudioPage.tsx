// apps/client/src/pages/StudioPage.tsx
//
// The authoring studio, served at /studio. Renders the Studio block through
// the standard block pipeline (RenderOLX) — the same shape as DocsPage.
// Location state (?source=&file=&tab=) lives in the block's system-scoped
// URL fields, so this page needs no params from the router.

import RenderOLX from '@/components/common/RenderOLX';
import { asContentNamespace, asStateKey } from '@/lib/types/id-grammar';

export default function StudioPage() {
  return (
    <RenderOLX
      ns={asContentNamespace('system')}
      id={asStateKey('system/studio')}
      inline={'<Studio id="studio"/>'}
      eventContext="studio"
    />
  );
}
