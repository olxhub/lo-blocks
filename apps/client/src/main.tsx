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

async function boot() {
  const res = await fetch('/api/config');
  if (!res.ok) {
    showError(`Failed to load configuration (${res.status}). Is the server running?`);
    return;
  }
  initConfig(await res.text(), ['client']);

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
