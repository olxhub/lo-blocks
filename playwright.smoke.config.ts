import { defineConfig } from '@playwright/test';

/**
 * Smoke test config — runs against a live server (local or remote).
 *
 *   npm run smoke                                        # localhost:3000
 *   SMOKE_URL=https://example.com npm run smoke          # remote server
 *   SMOKE_USER=u SMOKE_PASS=p npm run smoke              # with basic auth
 */
export default defineConfig({
  testDir: 'tests/smoke',
  timeout: 30_000,
  retries: 0,
  workers: 1,  // sequential — one browser, many pages
  use: {
    baseURL: process.env.SMOKE_URL || 'http://localhost:3000',
    browserName: 'firefox',
    headless: true,
    httpCredentials: process.env.SMOKE_USER
      ? { username: process.env.SMOKE_USER, password: process.env.SMOKE_PASS || '' }
      : undefined,
  },
});
