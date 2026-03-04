// apps/static/app/[...slug]/page.tsx
//
// Catch-all route for non-root pages. Reads the manifest and resolves
// the slug to an OlxKey. generateStaticParams enumerates all routes.
//
import fs from 'fs';
import path from 'path';
import StaticPage from './StaticPage';

function getManifest() {
  const manifestPath = path.join(process.cwd(), 'apps', 'static', 'public', 'static-content', 'manifest.json');
  return JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
}

export async function generateStaticParams() {
  const manifest = getManifest();
  return Object.keys(manifest.routes)
    .filter((urlPath: string) => urlPath !== '/')
    .map((urlPath: string) => ({
      slug: urlPath.split('/').filter(Boolean)
    }));
}

export default async function Page({ params }: { params: Promise<{ slug: string[] }> }) {
  const manifest = getManifest();
  const { slug } = await params;
  const urlPath = '/' + slug.join('/');
  const olxKey = manifest.routes[urlPath] || null;

  if (!olxKey) {
    return (
      <div style={{ padding: '2rem' }}>
        <h1>Not Found</h1>
        <p>No content mapped to <code>{urlPath}</code></p>
      </div>
    );
  }

  return <StaticPage olxKey={olxKey} title={manifest.title} />;
}
