'use client';
// _RepoDetail — full repo view. Reads origin from block attributes, looks up
// the Repository from Redux catalog state, renders RepoCard in full mode.

import { ArrowLeft } from 'lucide-react';
import Spinner from '@/components/common/Spinner';
import RepoCard from '@/components/catalog/RepoCard';
import { useCatalog } from '@/lib/catalog/useCatalog';
import { useRepoByOrigin } from '@/lib/state/catalog';
import { scopedRepoProps } from '@/components/blocks/navigation/Catalog/locals';

export default function _RepoDetail(props: any) {
  const origin: string = props.origin ?? '';

  // Ensure catalog is loaded (handles direct navigation to /repo/:origin).
  const { loading, error } = useCatalog(['launchables.description']);
  const repo = useRepoByOrigin(origin);

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

  if (!repo) {
    return (
      <div className="max-w-4xl mx-auto px-8 py-8">
        {backLink}
        <p className="text-secondary">
          No repository found for <code className="text-xs">{origin}</code>.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-8 py-8">
      {backLink}
      <RepoCard {...scopedRepoProps(props, origin)} repo={repo} compact={false} />
    </div>
  );
}
