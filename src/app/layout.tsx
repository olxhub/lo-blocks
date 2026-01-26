// src/app/layout.js
import StoreWrapper from './storeWrapper';
import { geistSans, geistMono } from './fonts';

import "./globals.css";

export const metadata = {
  title: "Learning Observer Blocks",
  description: "Learning Components",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <StoreWrapper>
          {children}
        </StoreWrapper>
      </body>
    </html>
  );
}
