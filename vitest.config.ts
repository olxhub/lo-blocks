// vitest.config.ts
import { defineConfig } from 'vitest/config';
import path from 'path';
import postcssNesting from 'postcss-nesting';

export default defineConfig({
  test: {
    environment: 'node', // files needing jsdom opt in with // @vitest-environment jsdom
    globals: true,
    include: [
      'packages/shared/**/*.test.{js,ts,jsx,tsx}',
      'apps/web/**/*.test.{js,ts,jsx,tsx}'
    ],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './packages/shared'),
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
