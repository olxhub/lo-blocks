// apps/static/app/page.tsx
//
// Root page (/). Reads the manifest's "/" route and renders it.
//
import { readManifest, resolveSlug } from '../lib/manifest';
import StaticPage from './[...slug]/StaticPage';

export default async function Page() {
  const manifest = readManifest();
  const definitionKey = resolveSlug(manifest);

  if (!definitionKey) {
    return (
      <div style={{ padding: '2rem' }}>
        <h1>No root content</h1>
        <p>No content mapped to <code>/</code> in the manifest.</p>
      </div>
    );
  }

  return <StaticPage definitionKey={definitionKey} title={manifest.title} />;
}
