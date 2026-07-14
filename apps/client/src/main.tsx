// apps/client/src/main.tsx
//
// Vite entry point. Fetches config from the server, then renders.
//
import { createRoot } from 'react-dom/client';
import { initConfig } from '@/lib/config';
import { resolveRoute } from './router';
import { loadDynamicBlocks } from './dynamicBlocks';
import './globals.css';

function showError(message: string) {
  document.getElementById('root')!.textContent = message;
}

/**
 * Extract the content namespace from the current URL.
 *
 * In /preview/psych/psych_course, the namespace is "psych" (the first
 * segment after /preview/, before the /path). Only matches when there
 * are at least two segments after /preview/.
 * Returns undefined if no namespace is found (e.g. /preview/someBlock).
 */
function extractNamespace(pathname: string): string | undefined {
  // /preview/<ns>/<id> — namespace is the first segment when there are 2+
  const match = pathname.match(/^\/preview\/([^/]+)\/.+/);
  return match?.[1];
}

async function boot() {
  const ns = extractNamespace(window.location.pathname);
  const configUrl = ns ? `/api/config?ns=${encodeURIComponent(ns)}` : '/api/config';
  const res = await fetch(configUrl);
  if (!res.ok) {
    showError(`Failed to load configuration (${res.status}). Is the server running?`);
    return;
  }

  let pmss: string, classes: string[], attributes: Record<string, string>;
  const clone = res.clone();
  try {
    ({ pmss, classes, attributes } = await res.json());
  } catch {
    // Non-JSON response — fall back to raw PMSS text (during migration)
    pmss = await clone.text();
    classes = [];
    attributes = {};
  }
  const env = process.env.NODE_ENV === 'production' ? 'production' : 'development';
  initConfig(pmss, ['client', env, ...classes], attributes);

  // Register runtime-loaded blocks into BLOCK_REGISTRY before App.tsx runs
  // store.init() — so the store's reducer registration includes them and
  // parseOLX resolves their tags on the first render.
  await loadDynamicBlocks();

  // Dynamic import: App.tsx has module-level getConfigBool() calls that
  // require initConfig() to have completed first.
  const { default: App } = await import('./App');
  const route = resolveRoute(window.location.pathname);
  createRoot(document.getElementById('root')!).render(<App route={route} />);
}

boot().catch((err) => {
  console.error('Boot failed:', err);
  showError('Failed to start. Check the console for details.');
});
