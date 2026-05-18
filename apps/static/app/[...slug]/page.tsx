// apps/static/app/[...slug]/page.tsx
//
// Catch-all route for non-root pages. Reads the manifest and resolves
// the slug to an DefinitionKey. generateStaticParams enumerates all routes.
//
import { readManifest, resolveSlug } from '../../lib/manifest';
import StaticPage from './StaticPage';

export async function generateStaticParams() {
  const manifest = readManifest();
  const params = Object.keys(manifest.routes)
    .filter((urlPath: string) => urlPath !== '/')
    .map((urlPath: string) => ({
      slug: urlPath.split('/').filter(Boolean)
    }));
  // Next.js output: 'export' requires at least one entry for dynamic routes
  if (params.length === 0) {
    return [{ slug: ['_not-found'] }];
  }
  return params;
}

export default async function Page({ params }: { params: Promise<{ slug: string[] }> }) {
  const manifest = readManifest();
  const { slug } = await params;
  const definitionKey = resolveSlug(manifest, slug);

  if (!definitionKey) {
    const urlPath = '/' + slug.join('/');
    return (
      <div style={{ padding: '2rem' }}>
        <h1>Not Found</h1>
        <p>No content mapped to <code>{urlPath}</code></p>
      </div>
    );
  }

  return <StaticPage definitionKey={definitionKey} title={manifest.title} />;
}
