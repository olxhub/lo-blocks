// apps/static/app/layout.tsx
//
// Root layout for static builds. Minimal shell: Redux store + content provider.
// No debug panel, no replay, no dev tools.
//
import StoreWrapper from './storeWrapper';
import StaticContentProvider from '../lib/StaticContentProvider';
import { geistSans, geistMono } from './fonts';

import "./globals.css";

export const metadata = {
  title: "Learning Observer",
  description: "Interactive learning exploration",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-color-mode="auto" data-theme="default" data-brand="default">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <StoreWrapper>
          <StaticContentProvider>
            {children}
          </StaticContentProvider>
        </StoreWrapper>
      </body>
    </html>
  );
}
