// apps/static/app/page.tsx
//
// Root page (/). Reads the manifest's "/" route and renders it.
//
import fs from 'fs';
import path from 'path';
import StaticPage from './[...slug]/StaticPage';

function getManifest() {
  const manifestPath = path.join(process.cwd(), 'apps', 'static', 'public', 'static-content', 'manifest.json');
  return JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
}

export default async function Page() {
  const manifest = getManifest();
  const olxKey = manifest.routes['/'];

  if (!olxKey) {
    return (
      <div style={{ padding: '2rem' }}>
        <h1>No root content</h1>
        <p>No content mapped to <code>/</code> in the manifest.</p>
      </div>
    );
  }

  return <StaticPage olxKey={olxKey} title={manifest.title} />;
}
