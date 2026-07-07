// apps/static/src/main.tsx
//
// Vite entry point. Reads the OLX key from the data attribute stamped
// into each page's HTML by the post-build script. In dev mode (key is
// the literal placeholder), falls back to manifest-based routing so
// `vite dev` works without the stamp step.
//
import { createRoot } from 'react-dom/client';
import App from './App';
import './globals.css';

const PLACEHOLDER = '%OLX_KEY%';

async function resolveOlxKey(): Promise<string> {
  const root = document.getElementById('root')!;
  const key = root.getAttribute('data-olx-key') || '';

  // In production the stamp script replaces the placeholder with the real key
  if (key && key !== PLACEHOLDER) {
    return key;
  }

  // Dev mode: fetch manifest and match against current pathname
  const basePath = (process.env.LO_BASE_PATH as string) || '';
  const res = await fetch(`${basePath}/static-content/manifest.json`);
  if (!res.ok) {
    throw new Error(`Failed to load manifest: HTTP ${res.status}`);
  }
  const manifest: { routes: Record<string, string> } = await res.json();

  // Strip basePath prefix from pathname for matching
  let pathname = window.location.pathname;
  if (basePath && pathname.startsWith(basePath)) {
    pathname = pathname.slice(basePath.length) || '/';
  }
  // Normalize trailing slashes
  if (pathname !== '/' && pathname.endsWith('/')) {
    pathname = pathname.slice(0, -1);
  }

  const resolved = manifest.routes[pathname];
  if (!resolved) {
    throw new Error(`No manifest route for ${pathname}`);
  }
  return resolved;
}

resolveOlxKey().then(definitionKey => {
  const root = document.getElementById('root')!;
  createRoot(root).render(<App definitionKey={definitionKey} />);
}).catch(err => {
  console.error('Failed to resolve OLX key:', err);
  const root = document.getElementById('root')!;
  root.innerHTML = `<div style="padding:2rem;color:red">Failed to load: ${err.message}</div>`;
});
