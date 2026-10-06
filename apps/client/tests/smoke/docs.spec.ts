import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

/*
 * Every block's documentation page, rendered in a browser.
 *
 * WHY THIS EXISTS. `smoke.spec.ts` walks /api/activities -- course content and
 * the six demos. It never asks for a /docs/<Block> page, so 163 pages carrying
 * 215 live OLX examples were covered by nothing: the single `docs loads` test
 * fetches /docs, the index, and stops. Those examples are the broadest
 * engine-level surface in the repository. If a block's own documented example
 * stops rendering, something fundamental moved, and until now nothing noticed.
 *
 * ENUMERATED FROM THE REGISTRY, not from a list. `blockMetadataAutogen.json` is
 * generated at build time, so a block added tomorrow is covered tomorrow. A
 * hand-kept list silently stops covering what it was not told about.
 *
 * THREE THINGS IT DELIBERATELY DOES NOT COPY FROM smoke.spec's `loadPage`, each
 * of which produced a WRONG ANSWER while this was being written:
 *
 *   1. IT DOES NOT WAIT FOR `.spinner` TO DISAPPEAR. Docs pages render Spinner
 *      demos, and a Spinner spins forever BY DESIGN -- /docs/BlockDoc embeds
 *      one. The spinner-absence condition can never be satisfied there, and the
 *      page was reported as hanging when it was working perfectly.
 *
 *   2. IT ASSERTS CONTENT BEFORE IT ASSERTS HEALTH. A page that has not
 *      rendered has no `.lo-display-error` either, so it reads as clean. That
 *      produced three false "clean" results in one afternoon -- including one
 *      that nearly had a long-standing upstream defect filed as a merge
 *      regression. A page with no `[data-block-id]` is UNVERIFIED, which fails;
 *      it is not clean.
 *
 *   3. ITS RETRY VERIFIES SUCCESS, NOT ONLY FAILURE. The probe this replaces
 *      retried errors and accepted a first-pass "clean" unchallenged. That
 *      asymmetry can only manufacture false negatives: a page caught mid-render
 *      is recorded as healthy and never looked at again.
 */

// Pages whose DisplayError is the engine WORKING. Each needs a reason, and an
// entry that stops failing should be removed -- a declaration that outlives its
// cause is one nobody reviewed.
const EXPECTED_ERROR: Record<string, string> = {
  BadBlock:
    'blocks/_test/BadBlock.ts exists to fail: it "deliberately fails, so we can '
    + 'exercise -- and PROVE we detect -- the error pipeline end to end". Its '
    + 'DisplayError is the error pipeline working.',
  ErrorNode:
    'ErrorNode.olx references `<ThisBlockDoesNotExist />` deliberately -- the '
    + 'block that DISPLAYS parse errors demonstrates itself by causing one, and '
    + 'the demo says so on the next line. Found by this test on its first run, '
    + 'after the hand probe that preceded it reported the page clean: the probe '
    + 'exited on a quiet DOM before the error had rendered.',
  CustomGrader:
    'CustomGrader.validateAttributes disables the block unless '
    + '`allow-unsafe-content: true`, and config/system.pmss sets it false. Its '
    + 'demo CapaProblem then reports no grader. Enabling unsafe content to turn '
    + 'this green would trade the security posture for a tick.',
};

// READ FROM DISK, not imported. It is a BUILD ARTIFACT, and importing JSON
// needs an import attribute that the smoke runner does not supply; resolving
// it relative to this file also keeps the test independent of the directory
// the runner happens to start in.
const META = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../packages/shared/components/blockMetadataAutogen.json',
);
const BLOCKS: string[] = Object.keys(
  (JSON.parse(readFileSync(META, 'utf8')) as { blocks: Record<string, unknown> }).blocks,
).sort();

async function visit(page: Page, block: string) {
  const errors: string[] = [];
  const onError = (e: Error) => errors.push(e.message);
  page.on('pageerror', onError);
  await page.goto(`/docs/${encodeURIComponent(block)}`, { waitUntil: 'load' });
  // A dwell, not a settle race. See (1) and (2) above: the quiet-DOM condition
  // can fire before the app has mounted anything, and the spinner condition can
  // never fire at all on a page that demonstrates a Spinner.
  await page.waitForTimeout(4000);
  const rendered = await page.locator('[data-block-id]').count();
  const shown = await page.locator('.lo-display-error').allInnerTexts();
  page.off('pageerror', onError);
  return { rendered, shown, errors };
}

test.describe('block documentation', () => {
  test.describe.configure({ timeout: 25 * 60_000 });

  test('every block doc page renders its examples', async ({ page }) => {
    expect(BLOCKS.length).toBeGreaterThan(100);   // the registry really loaded

    const unverified: string[] = [];
    const broken: string[] = [];
    const recovered: string[] = [];

    for (const block of BLOCKS) {
      let r = await visit(page, block);
      // Retry EITHER WAY -- a clean first pass is re-checked, not trusted.
      if (r.rendered === 0 || r.shown.length || r.errors.length) {
        const again = await visit(page, block);
        if (again.rendered > 0 && !again.shown.length && !again.errors.length
            && (r.rendered === 0)) recovered.push(block);
        r = again;
      }

      const expected = EXPECTED_ERROR[block];
      if (r.rendered === 0) {
        unverified.push(`${block}: nothing rendered -- not evidence of health`);
      } else if (expected) {
        // Declared pages must STILL fail; a declaration whose cause is gone is
        // a stale waiver, and silence here would hide its removal.
        if (!r.shown.length && !r.errors.length) {
          broken.push(`${block}: DECLARED as expected-failing but now renders `
                    + `clean -- remove its EXPECTED_ERROR entry. (${expected})`);
        }
      } else if (r.shown.length) {
        broken.push(`${block}: ${r.shown[0].replace(/\s+/g, ' ').slice(0, 140)}`);
      } else if (r.errors.length) {
        broken.push(`${block}: JS -- ${r.errors[0].slice(0, 140)}`);
      }
    }

    if (recovered.length) {
      console.log(`docs: ${recovered.length} page(s) needed a second load: `
                + recovered.join(', '));
    }
    expect(unverified, `pages that rendered nothing:\n${unverified.join('\n')}`)
      .toHaveLength(0);
    expect(broken, `block doc pages failing:\n${broken.join('\n')}`)
      .toHaveLength(0);
  });
});
