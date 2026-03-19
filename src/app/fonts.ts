// src/app/fonts.js
import localFont from "next/font/local";

// Geist Sans: 100-900, normal style
export const geistSans = localFont({
  src: [
    {
      path: "../../node_modules/@fontsource/geist-sans/files/geist-sans-latin-100-normal.woff2",
      weight: "100",
      style: "normal",
    },
    {
      path: "../../node_modules/@fontsource/geist-sans/files/geist-sans-latin-200-normal.woff2",
      weight: "200",
      style: "normal",
    },
    {
      path: "../../node_modules/@fontsource/geist-sans/files/geist-sans-latin-300-normal.woff2",
      weight: "300",
      style: "normal",
    },
    {
      path: "../../node_modules/@fontsource/geist-sans/files/geist-sans-latin-400-normal.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "../../node_modules/@fontsource/geist-sans/files/geist-sans-latin-500-normal.woff2",
      weight: "500",
      style: "normal",
    },
    {
      path: "../../node_modules/@fontsource/geist-sans/files/geist-sans-latin-600-normal.woff2",
      weight: "600",
      style: "normal",
    },
    {
      path: "../../node_modules/@fontsource/geist-sans/files/geist-sans-latin-700-normal.woff2",
      weight: "700",
      style: "normal",
    },
    {
      path: "../../node_modules/@fontsource/geist-sans/files/geist-sans-latin-800-normal.woff2",
      weight: "800",
      style: "normal",
    },
    {
      path: "../../node_modules/@fontsource/geist-sans/files/geist-sans-latin-900-normal.woff2",
      weight: "900",
      style: "normal",
    },
  ],
  variable: "--font-geist-sans",
  display: "swap",
  // TODO: Remove unused weights before production if desired
});

// Geist Mono: 100-900, normal style
export const geistMono = localFont({
  src: [
    {
      path: "../../node_modules/@fontsource/geist-mono/files/geist-mono-latin-100-normal.woff2",
      weight: "100",
      style: "normal",
    },
    {
      path: "../../node_modules/@fontsource/geist-mono/files/geist-mono-latin-200-normal.woff2",
      weight: "200",
      style: "normal",
    },
    {
      path: "../../node_modules/@fontsource/geist-mono/files/geist-mono-latin-300-normal.woff2",
      weight: "300",
      style: "normal",
    },
    {
      path: "../../node_modules/@fontsource/geist-mono/files/geist-mono-latin-400-normal.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "../../node_modules/@fontsource/geist-mono/files/geist-mono-latin-500-normal.woff2",
      weight: "500",
      style: "normal",
    },
    {
      path: "../../node_modules/@fontsource/geist-mono/files/geist-mono-latin-600-normal.woff2",
      weight: "600",
      style: "normal",
    },
    {
      path: "../../node_modules/@fontsource/geist-mono/files/geist-mono-latin-700-normal.woff2",
      weight: "700",
      style: "normal",
    },
    {
      path: "../../node_modules/@fontsource/geist-mono/files/geist-mono-latin-800-normal.woff2",
      weight: "800",
      style: "normal",
    },
    {
      path: "../../node_modules/@fontsource/geist-mono/files/geist-mono-latin-900-normal.woff2",
      weight: "900",
      style: "normal",
    },
  ],
  variable: "--font-geist-mono",
  display: "swap",
  // TODO: Remove unused weights before production if desired
});
