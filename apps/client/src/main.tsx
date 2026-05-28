// apps/client/src/main.tsx
//
// Vite entry point. Fetches config from the server, then renders.
//
import { createRoot } from 'react-dom/client';
import { initConfig } from '@/lib/config';
import { resolveRoute } from './router';
import './globals.css';

async function boot() {
  const pmss = await fetch('/api/config').then(r => r.text());
  initConfig(pmss, ['client']);

  // Dynamic import: App.tsx has module-level getConfigBool() calls that
  // require initConfig() to have completed first.
  const { default: App } = await import('./App');
  const route = resolveRoute(window.location.pathname);
  createRoot(document.getElementById('root')!).render(<App route={route} />);
}

boot();
