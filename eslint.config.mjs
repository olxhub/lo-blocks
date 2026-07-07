// eslint.config.mjs — flat config (replaced next/core-web-vitals when
// Next.js was removed, 2026-07). Scope: the react-hooks rules are the
// load-bearing ones (the codebase's inline disables reference them);
// react plugin carries the JSX rules we kept from the old config.
import reactPlugin from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  {
    files: ['packages/**/*.{ts,tsx,js,jsx}', 'apps/**/*.{ts,tsx,js,jsx}'],
    ignores: ['**/dist/**', '**/node_modules/**', '**/generated/**'],
    plugins: {
      react: reactPlugin,
      'react-hooks': reactHooks,
    },
    languageOptions: {
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    settings: { react: { version: 'detect' } },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react/no-unescaped-entities': ['error', { forbid: ['>', '}'] }],
    },
  },
];
