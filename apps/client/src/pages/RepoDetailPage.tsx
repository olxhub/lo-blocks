// apps/client/src/pages/RepoDetailPage.tsx
//
// Full repository view at /repo/:encodedOrigin. Renders the RepoCard block
// with an idPrefix that matches the scoped state key the Catalog creates —
// so expand/collapse state is shared between the catalog listing and the
// detail page.
//
// State key: system/catalog:#[encodedOrigin]:repo
// OLX key:   system/repo

import { ArrowLeft } from 'lucide-react';
import Spinner from '@/components/common/Spinner';
import RenderOLX from '@/components/common/RenderOLX';
import { asContentNamespace, asStateKey } from '@/lib/types/id-grammar';
import { useCatalog } from '@/lib/catalog/useCatalog';
import { repoIdPrefix, REPO_ID } from '@/components/blocks/navigation/Catalog/locals';

export default function RepoDetailPage({ origin }: { origin: string }) {
  // Ensure catalog data is loaded (handles direct navigation to /repo/:origin).
  const { loading, error } = useCatalog(['launchables.description']);

  const backLink = (
    <a href="/catalog" className="flex items-center gap-1.5 text-sm text-secondary hover:text-foreground mb-6">
      <ArrowLeft size={14} /> Back to catalog
    </a>
  );

  if (error) {
    return (
      <div className="max-w-4xl mx-auto px-8 py-8">
        {backLink}
        <p className="text-error">Failed to load catalog: {error}</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-8 py-8">
        {backLink}
        <Spinner>Loading repository…</Spinner>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-8 py-8">
      {backLink}
      <RenderOLX
        ns={asContentNamespace('system')}
        id={asStateKey(`system/${REPO_ID}`)}
        inline={`<RepoCard id="${REPO_ID}" compact="false"/>`}
        idPrefix={repoIdPrefix(origin)}
        eventContext="repo-detail"
      />
    </div>
  );
}
