// apps/static/app/[...slug]/page.tsx
//
// Catch-all route for non-root pages. Reads the manifest and resolves
// the slug to an OlxKey. generateStaticParams enumerates all routes.
//
import { readManifest, resolveSlug } from '../../lib/manifest';
import StaticPage from './StaticPage';

export async function generateStaticParams() {
  const manifest = readManifest();
  return Object.keys(manifest.routes)
    .filter((urlPath: string) => urlPath !== '/')
    .map((urlPath: string) => ({
      slug: urlPath.split('/').filter(Boolean)
    }));
}

export default async function Page({ params }: { params: Promise<{ slug: string[] }> }) {
  const manifest = readManifest();
  const { slug } = await params;
  const olxKey = resolveSlug(manifest, slug);

  if (!olxKey) {
    const urlPath = '/' + slug.join('/');
    return (
      <div style={{ padding: '2rem' }}>
        <h1>Not Found</h1>
        <p>No content mapped to <code>{urlPath}</code></p>
      </div>
    );
  }

  return <StaticPage olxKey={olxKey} title={manifest.title} />;
}
