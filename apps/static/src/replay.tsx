// apps/static/src/replay.tsx
//
// Vite entry point for the static session-replay viewer (/replay.html).
// A separate HTML entry from the course pages, but part of the same static
// build so it deploys with no server.
//
import { createRoot } from 'react-dom/client';
import { initConfig } from '@/lib/config';
import ReplayViewer from './replay/ReplayViewer';
import './globals.css';

// Injected at build time by Vite define (see vite.config.ts).
declare const __SYSTEM_PMSS__: string;
declare const __STATIC_CLASSES__: string[];

const env = process.env.NODE_ENV === 'production' ? 'production' : 'development';
initConfig(__SYSTEM_PMSS__, ['static', env, ...__STATIC_CLASSES__]);

const root = document.getElementById('root')!;
createRoot(root).render(<ReplayViewer />);
