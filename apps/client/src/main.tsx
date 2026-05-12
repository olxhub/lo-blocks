// apps/client/src/main.tsx
//
// Vite entry point. Resolves the current URL to a route and renders.
//
import { createRoot } from 'react-dom/client';
import { resolveRoute } from './router';
import App from './App';
import './globals.css';

const route = resolveRoute(window.location.pathname);
createRoot(document.getElementById('root')!).render(<App route={route} />);
