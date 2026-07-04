// packages/shared/components/blocks/authoring/Catalog/links.ts
//
// Destinations the author catalog links to. Studio is origin-scoped (?source=
// picks the repo, ?file= opens a file); preview renders a launchable by id.

export function studioHref(
  origin: string,
  opts: { file?: string; tab?: 'chat' | 'docs' | 'search' | 'files' | 'data' } = {},
): string {
  const params = new URLSearchParams({ source: origin });
  if (opts.file) params.set('file', opts.file);
  if (opts.tab) params.set('tab', opts.tab);
  return `/studio?${params.toString()}`;
}

export function previewHref(id: string): string {
  // A StateKey is namespace/path; the "/" is a structural separator and must
  // survive into the URL (the /preview/:id route splits on it). Encode each
  // segment individually rather than the whole id, so a launchable like
  // "edu.memphis.psych/psych_course" stays a real path, not "…%2F…".
  const encoded = id.split('/').map(encodeURIComponent).join('/');
  return `/preview/${encoded}`;
}

export function repoDetailHref(origin: string): string {
  return `/repo/${encodeURIComponent(origin)}`;
}
