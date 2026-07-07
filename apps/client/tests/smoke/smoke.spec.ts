import { test, expect, type Page, type APIRequestContext } from '@playwright/test';

/*
 * Browser smoke test for lo-blocks.
 *
 * WHY THIS EXISTS: End-to-end verification of live deployed servers. After
 * provisioning or deploying, run this against the server to confirm that
 * everything actually works: pages render, content loads via AJAX, static
 * assets are served, nginx proxying is correct, etc. Also useful during
 * local development to catch issues that jsdom-based tests miss (hydration
 * failures, bundle errors, browser-specific bugs).
 *
 * HOW IT WORKS: Rather than maintaining a list of URLs, the test asks the
 * server's own APIs (/api/activities) what pages exist and
 * visits each one. New content is automatically covered.
 *
 * RUNNING:
 *   npm run smoke                          # against localhost:8888 (npm run dev)
 *   SMOKE_URL=https://host SMOKE_USER=u SMOKE_PASS=p npm run smoke
 *
 * NOT part of `npm run test` — this requires a running server and takes
 * ~30s, so it's run manually or as a deploy verification step.
 *
 * FUTURE DIRECTIONS:
 * - Test interactive activities (fill in a problem, submit, check feedback)
 * - Verify WebSocket connection to /wsapi/in (event server)
 * - Screenshot comparison for visual regression
 */

// -- Page loading abstraction -------------------------------------------------

type PageResult =
  | { ok: true, jsErrors: string[] }
  | { ok: false, error: string, jsErrors: string[] };

/**
 * Load a page, wait for it to settle, and report what happened.
 *
 * Returns { ok: true } if the page loaded without DisplayError or JS
 * exceptions, { ok: false, error } if a .lo-display-error appeared.
 * Works for any page in the app — no per-page selectors needed.
 */
async function loadPage(page: Page, url: string): Promise<PageResult> {
  const jsErrors: string[] = [];
  const handler = (err: Error) => jsErrors.push(err.message);
  page.on('pageerror', handler);

  await page.goto(url, { waitUntil: 'networkidle' });

  page.off('pageerror', handler);

  const errorEl = await page.$('.lo-display-error');
  if (errorEl) {
    const text = await errorEl.textContent();
    return { ok: false, error: text?.trim() || 'DisplayError (no text)', jsErrors };
  }

  return { ok: true, jsErrors };
}

/** Load a page and assert it rendered successfully. */
async function expectPageOk(page: Page, url: string) {
  const result = await loadPage(page, url);
  expect(result.ok, `${url}: ${result.ok ? '' : result.error}`).toBe(true);
  expect(result.jsErrors, `JS errors on ${url}:\n${result.jsErrors.join('\n')}`)
    .toHaveLength(0);
}

async function fetchJSON(request: APIRequestContext, path: string) {
  const res = await request.get(path);
  expect(res.ok(), `GET ${path} failed: ${res.status()}`).toBeTruthy();
  return res.json();
}

// -- Tests --------------------------------------------------------------------

test('activities render', async ({ page, request }) => {
  const { activities } = await fetchJSON(request, '/api/activities');
  const ids = Object.keys(activities);
  expect(ids.length).toBeGreaterThan(0);

  for (const id of ids) {
    await test.step(id, () => expectPageOk(page, `/preview/${id}`));
  }
});

test('main page loads', async ({ page }) => {
  await expectPageOk(page, '/');
});

test('studio loads', async ({ page }) => {
  await expectPageOk(page, '/studio');
});

test('docs loads', async ({ page }) => {
  await expectPageOk(page, '/docs');
});

test('bogus activity shows DisplayError', async ({ page }) => {
  const result = await loadPage(page, '/preview/CONTENT/nonexistent_smoke_test');
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.error).toContain('Content Loading Error');
  }
});

// TODO: Test WebSocket connectivity to /wsapi/in (event server).
// The event server is a separate process; verifying the WS handshake
// succeeds would catch proxy misconfigurations and process failures.
