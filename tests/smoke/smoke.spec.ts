import { test, expect } from '@playwright/test';

/*
 * Browser smoke test: verifies that pages actually render (React hydrates,
 * AJAX content loads), not just that the server returns 200.
 *
 * Discovers testable pages from the server's own APIs — no hardcoded URLs.
 * New content is automatically tested.
 */

const PAGE_TIMEOUT = 15_000;

// -- Helpers ------------------------------------------------------------------

/** Fetch JSON from the server via Playwright's request context. */
async function fetchJSON(request: any, path: string) {
  const res = await request.get(path);
  expect(res.ok(), `GET ${path} failed: ${res.status()}`).toBeTruthy();
  return res.json();
}

/** Navigate and wait for a selector, collecting console errors. */
async function expectPageRenders(
  page: any,
  url: string,
  selector: string,
) {
  const errors: string[] = [];
  page.on('pageerror', (err: Error) => errors.push(err.message));

  await page.goto(url);
  await page.waitForSelector(selector, { timeout: PAGE_TIMEOUT });

  expect(errors, `JS errors on ${url}:\n${errors.join('\n')}`).toHaveLength(0);
}

// -- Tests --------------------------------------------------------------------

test('main page loads with activity links', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('a[href^="/preview/"]', { timeout: PAGE_TIMEOUT });
});

test('all activities render', async ({ page, request }) => {
  const { activities } = await fetchJSON(request, '/api/activities');
  const ids = Object.keys(activities);
  expect(ids.length).toBeGreaterThan(0);

  for (const id of ids) {
    await test.step(id, async () => {
      await expectPageRenders(page, `/preview/${id}`, '[data-block-type]');
    });
  }
});

test('studio loads', async ({ page }) => {
  await expectPageRenders(page, '/studio', '.studio-editor-pane');
});

test('docs page loads', async ({ page, request }) => {
  const { documentation } = await fetchJSON(request, '/api/docs');
  expect(documentation.blocks.length).toBeGreaterThan(0);

  await expectPageRenders(page, '/docs', 'aside nav button');
});
