// vitest.config.ts
import { defineConfig } from 'vitest/config';
import path from 'path';
import postcssNesting from 'postcss-nesting';

export default defineConfig({
  test: {
    environment: 'jsdom', // for React/component tests
    globals: true,
    include: [
      'src/**/*.test.{js,ts,jsx,tsx}'
    ],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  css: {
    postcss: {
      plugins: [
        postcssNesting
      ],
    },
  }
});
