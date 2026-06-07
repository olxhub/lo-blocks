// apps/web/app/layout.tsx
//
// Server component — reads PMSS config files and passes the raw text
// to StoreWrapper so the client can initialize config before rendering.
import fs from 'fs';
import path from 'path';
import StoreWrapper from './storeWrapper';
import { geistSans, geistMono } from './fonts';

import "./globals.css";

export const metadata = {
  title: "Learning Observer Blocks",
  description: "Learning Components",
};

function readPmss(): string {
  // Next.js runs from the repo root (next dev / next start), so cwd is reliable.
  const configDir = path.join(process.cwd(), 'config');
  const system = fs.readFileSync(path.join(configDir, 'system.pmss'), 'utf-8');
  let local = '';
  try {
    local = fs.readFileSync(path.join(configDir, 'local.pmss'), 'utf-8');
  } catch {
    // No local.pmss — that's fine
  }
  return [system, local].filter(Boolean).join('\n');
}

const pmss = readPmss();

export default function RootLayout({ children }) {
  return (
    <html lang="en" data-color-mode="auto" data-theme="default" data-brand="default">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <StoreWrapper pmss={pmss}>
          {children}
        </StoreWrapper>
      </body>
    </html>
  );
}
