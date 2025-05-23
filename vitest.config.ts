import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom', // for React/component tests
    globals: true,
    include: [
      'src/**/*.test.{js,ts,jsx,tsx}'
    ],
  },
});
