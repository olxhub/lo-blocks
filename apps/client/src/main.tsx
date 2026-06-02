// apps/client/src/main.tsx
//
// Vite entry point. Fetches config from the server, then renders.
//
import { createRoot } from 'react-dom/client';
import { initConfig } from '@/lib/config';
import { resolveRoute } from './router';
import './globals.css';

function showError(message: string) {
  document.getElementById('root')!.textContent = message;
}

/**
 * Extract the content namespace from the current URL.
 *
 * In /preview/psych::intro_unit, the namespace is "psych" (before "::").
 * Returns undefined if no namespace is found.
 */
function extractNamespace(pathname: string): string | undefined {
  // /preview/<ns>::<id> pattern
  const match = pathname.match(/\/preview\/([^/:]+)::/);
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
  initConfig(pmss, ['client', ...classes], attributes);

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
