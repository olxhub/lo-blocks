'use client';
// _RepoDetail — full repo view. Reads origin from block attributes, looks up
// the Repository from Redux catalog state, renders RepoCard in full mode.

import { useEffect } from 'react';
import { ArrowLeft } from 'lucide-react';
import Spinner from '@/components/common/Spinner';
import RepoCard from '@/components/catalog/RepoCard';
import { refreshCatalog, useRepoByOrigin } from '@/lib/state/catalog';

export default function _RepoDetail(props: any) {
  const origin: string = props.origin ?? '';

  // Ensure catalog is loaded (handles direct navigation to /repo/:origin).
  useEffect(() => {
    refreshCatalog({ include: ['launchables.description'] });
  }, []);

  const repo = useRepoByOrigin(origin);

  if (!repo) {
    return (
      <div className="max-w-4xl mx-auto px-8 py-8">
        <a href="/catalog" className="flex items-center gap-1.5 text-sm text-secondary hover:text-foreground mb-6">
          <ArrowLeft size={14} /> Back to catalog
        </a>
        <Spinner>Loading repository…</Spinner>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-8 py-8">
      <a href="/catalog" className="flex items-center gap-1.5 text-sm text-secondary hover:text-foreground mb-6">
        <ArrowLeft size={14} /> Back to catalog
      </a>
      <RepoCard repo={repo} compact={false} />
    </div>
  );
}
