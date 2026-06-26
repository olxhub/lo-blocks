// packages/shared/lib/catalog/links.ts
//
// Destinations the author catalog links to. Studio is origin-scoped (?source=
// picks the repo, ?file= opens a file); preview renders a launchable by id.

export function studioHref(origin: string, path?: string): string {
  const file = path ? `&file=${encodeURIComponent(path)}` : '';
  return `/studio?source=${encodeURIComponent(origin)}${file}`;
}

export function previewHref(id: string): string {
  // A StateKey is namespace/path; the "/" is a structural separator and must
  // survive into the URL (the /preview/:id route splits on it). Encode each
  // segment individually rather than the whole id, so a launchable like
  // "edu.memphis.psych/psych_course" stays a real path, not "…%2F…".
  const encoded = id.split('/').map(encodeURIComponent).join('/');
  return `/preview/${encoded}`;
}
