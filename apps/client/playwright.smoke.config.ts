import { defineConfig } from '@playwright/test';

/**
 * Playwright config for browser smoke tests (npm run smoke).
 *
 * Separate from the vitest suite — these require a running server and
 * a real browser, so they're slower (~30s) and run on-demand.
 *
 * Usage:
 *   npm run smoke                                        # localhost:8888
 *   SMOKE_URL=https://example.com npm run smoke          # remote server
 *   SMOKE_USER=u SMOKE_PASS=p npm run smoke              # with basic auth
 *
 * Firefox is used, but we might want more browsers in the future
 */
export default defineConfig({
  testDir: 'tests/smoke',
  timeout: 120_000, // all-activities test visits every page serially
  retries: 0,
  workers: 1,       // sequential — one browser, many pages
  use: {
    baseURL: process.env.SMOKE_URL || 'http://localhost:8888',
    browserName: 'firefox',
    headless: true,
    httpCredentials: process.env.SMOKE_USER
      ? { username: process.env.SMOKE_USER, password: process.env.SMOKE_PASS || '' }
      : undefined,
  },
});
