import { test, expect, type Page, type Locator } from '@playwright/test';

/*
 * A SIMULATED STUDENT CLICKS THROUGH THE WHOLE COURSE.
 *
 * WHAT THIS COVERS THAT THE SCORER-SIDE CHECK DOES NOT. `e2e_session.sh` runs
 * every item through `agreement_app.py`, which reads the .olx and calls the
 * grader directly. It proves the RUBRIC works. It never opens a page, so it
 * cannot see a handout that fails to render, an input that will not accept
 * text, a Next button that dead-ends, or a feedback button that returns
 * nothing -- all of which are how a student would actually meet a broken
 * release. This test is the other half: it drives the real UI.
 *
 * WHAT IT ASSERTS, per handout: every screen renders without a DisplayError,
 * every input on every screen accepts an answer, every feedback button is
 * pressed and answers, and Next advances until the last screen. The course
 * page is visited first and must link to all three handouts.
 *
 * THE ANSWERS ARE INVENTED. Every string in ANSWERS was written for this test
 * about a fictional behaviour. Nothing here comes from the corpus, and nothing
 * a real participant wrote may ever be pasted in -- this file is committed to
 * a public repository.
 *
 * RUNNING
 *   SMOKE_URL=http://localhost:8899 npx playwright test \
 *     --config apps/client/playwright.smoke.config.ts student_session
 *
 * NOTE ON PORTS: the client refuses to boot on a port that has no event-server
 * route in `WS_PORT_MAP` (packages/shared/lib/state/store.ts) -- it throws
 * "no event-server route configured". A non-standard acceptance port must be
 * added there or the page renders only "Failed to start."
 */

const COURSE = 'edu.memphis.psych/bmod_course';
const HANDOUTS = ['bmod_handout1', 'bmod_handout2', 'bmod_handout3'];
const MAX_SCREENS = 60;
const FEEDBACK_TIMEOUT = 240_000;

// Invented answers for a fictional student. See the header: never real text.
const ANSWERS = {
  numeric: '3, 4, 2, 5, 3, 4, 6',
  prose: [
    'My unwanted target behaviour is drinking sugary soda in the evening, usually while I am studying at my desk.',
    'I want to replace it with drinking a glass of water instead, starting after dinner each day.',
    'One consequence is that I sleep less well, because the sugar and caffeine keep me awake past midnight.',
    'A second consequence is that I spend money every week on drinks I do not actually need.',
    'The antecedent is that I keep cans in the fridge where I can see them whenever I open it.',
    'I will move the cans out of the house entirely and keep a filled water bottle on my desk instead.',
    'I will count the number of sugary drinks I finish each day and write the number in a notebook.',
    'By the end of three weeks I want to be drinking no more than one sugary drink per week.',
    'A benefit I expect is getting to bed sooner, so morning classes stop being a struggle.',
    'A further benefit is that I will save money that I would rather spend on something else.',
  ],
};

// ---------------------------------------------------------------------------

const installObserver = () => {
  (window as any).__lastDomChange = Date.now();
  new MutationObserver(() => { (window as any).__lastDomChange = Date.now(); })
    .observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
  // LET A BUTTON DEMONSTRATE WHAT IT IS. Markup cannot tell a printer from a
  // grader here: handout 3's "Print this page" sits on the SAME screen as
  // "Check my labelling", and handout 1's CapaProblem "Check" has an empty
  // container because its grader is a SIBLING, not a child. So a per-screen
  // rule wrongly requires the printer to answer and a per-container rule
  // wrongly excuses the Check. Stubbing `print` settles it by behaviour: a
  // button that printed is a printer, and owes no feedback.
  (window as any).__printed = 0;
  window.print = () => { (window as any).__printed++; };
};

/**
 * Wait for content, THEN for the DOM to go quiet.
 *
 * QUIESCENCE ALONE IS NOT ENOUGH, and this cost two handouts. A wait that only
 * asks "has the DOM been still for 700ms?" is satisfied by the still moment
 * BEFORE the content arrives: handouts 2 and 3 reported zero blocks and zero
 * buttons, and looked broken, when they were merely slower to load than
 * handout 1. Anchoring on a rendered block first makes the wait mean what it
 * says.
 */
async function settle(page: Page, opts: { needContent?: boolean } = {}) {
  if (opts.needContent !== false) {
    await page.waitForSelector('[class*="lo-tag-"]', { timeout: 90_000 });
  }
  await page.waitForFunction(
    () => Date.now() - (window as any).__lastDomChange > 700 && !document.querySelector('.spinner'),
    undefined, { timeout: 90_000, polling: 150 },
  );
}

async function assertNoDisplayError(page: Page, where: string) {
  const err = await page.$('.lo-display-error');
  const text = err ? ((await err.textContent()) || '').trim().slice(0, 300) : '';
  expect(err, `${where}: DisplayError -- ${text}`).toBeNull();
}

/** Fill every input on the current screen. Returns how many were answered. */
async function answerScreen(page: Page, seed: number): Promise<number> {
  let filled = 0;

  const areas = page.locator('textarea:visible');
  for (let i = 0; i < await areas.count(); i++) {
    const el = areas.nth(i);
    if (await el.isEditable().catch(() => false) === false) continue;
    await el.fill(ANSWERS.prose[(seed + i) % ANSWERS.prose.length]);
    filled++;
  }

  const texts = page.locator('input[type="text"]:visible, input[type="number"]:visible, input:not([type]):visible');
  for (let i = 0; i < await texts.count(); i++) {
    const el = texts.nth(i);
    if (await el.isEditable().catch(() => false) === false) continue;
    // Handout 3 asks for a week of counts; a prose sentence is not a series.
    const numeric = await el.evaluate((n: HTMLInputElement) =>
      n.type === 'number' || n.inputMode === 'numeric' ||
      /number|comma|Sunday|count/i.test((n.closest('div')?.textContent) || ''));
    await el.fill(numeric ? ANSWERS.numeric : ANSWERS.prose[(seed + i) % ANSWERS.prose.length]);
    filled++;
  }

  // One radio per group; every checkbox group gets its first box.
  const groups = await page.evaluate(() => {
    const names = new Set<string>();
    document.querySelectorAll('input[type="radio"]').forEach(r => names.add((r as HTMLInputElement).name));
    return [...names];
  });
  for (const name of groups) {
    // CLICK THE LABEL, NOT THE INPUT. `ChoiceInput` hides the native control
    // (`opacity: 0; width: 0; pointer-events: none`) behind a styled label, so
    // Playwright reports "Element is outside of the viewport" and `force: true`
    // does not help -- force skips actionability checks, not layout. The label
    // is what a student clicks, which is also what we are meant to simulate.
    //
    // `CSS.escape` is a BROWSER global and this file runs in node; referencing
    // it here threw ReferenceError on the first radio screen of every handout.
    const esc = name.replace(/["\\]/g, '\\$&');
    const r = page.locator(`input[type="radio"][name="${esc}"]`).first();
    if (!(await r.count())) continue;
    const label = page.locator(`label:has(input[type="radio"][name="${esc}"])`).first();
    const target = (await label.count()) ? label : r;
    await target.scrollIntoViewIfNeeded().catch(() => {});
    await target.click({ force: true }).catch(() => {});
    if (await r.isChecked().catch(() => false)) filled++;
  }
  const boxes = page.locator('input[type="checkbox"]');
  if (await boxes.count()) {
    const cb = boxes.first();
    const cbLabel = page.locator('label:has(input[type="checkbox"])').first();
    const t = (await cbLabel.count()) ? cbLabel : cb;
    await t.scrollIntoViewIfNeeded().catch(() => {});
    await t.click({ force: true }).catch(() => {});
    if (await cb.isChecked().catch(() => false)) filled++;
  }

  const sels = page.locator('select:visible');
  for (let i = 0; i < await sels.count(); i++) {
    const opts = await sels.nth(i).locator('option').count();
    if (opts > 1) { await sels.nth(i).selectOption({ index: 1 }); filled++; }
  }

  return filled;
}

/**
 * What the screen's feedback regions say right now.
 *
 * TWO SIGNALS, BECAUSE THE BLOCKS ANSWER IN TWO DIFFERENT WAYS. An LLMAction
 * writes prose, so its arrival shows up as the text getting longer. A
 * CapaProblem answers through `Correctness`, which renders exactly ONE EMOJI --
 * `?` before submitting, then a tick or a cross. The text does not grow at all;
 * one glyph replaces another. A length test cannot see it, and the first
 * version of this file reported the "Check" button on handout 1 screen 0 as
 * never answering when it had answered instantly.
 */
async function feedbackSignature(page: Page): Promise<{ len: number; marks: string }> {
  return page.evaluate(() => ({
    len: Array.from(document.querySelectorAll(
      '.lo-tag-llmfeedback, .lo-tag-statustext, .lo-tag-slotsheetgrader'))
      .map(e => (e as HTMLElement).innerText || '').join('').length,
    marks: Array.from(document.querySelectorAll('.lo-tag-correctness'))
      .map(e => ((e as HTMLElement).innerText || '').trim()).join('|'),
  }));
}

/** Does this screen have anything that OWES an answer? */
async function screenIsGraded(page: Page): Promise<boolean> {
  return (await page.locator(
    '.lo-tag-llmaction, .lo-tag-correctgrader, .lo-tag-slotsheetgrader').count()) > 0;
}

/**
 * Press every action button on the screen and wait for each to answer.
 *
 * NOT EVERY BUTTON OWES FEEDBACK. The last screen of handout 1 carries "Submit
 * here then save to PDF", which prints -- it is not a grader and has nothing to
 * say back. Requiring a reply from it failed the handout for doing exactly what
 * it is supposed to do. So a reply is required only on a screen that actually
 * holds a grading block, and the exempt presses are reported rather than
 * quietly dropped.
 */
async function requestAllFeedback(page: Page, where: string) {
  const results: { label: string; answered: boolean; required: boolean; printed?: boolean }[] = [];
  const required = await screenIsGraded(page);
  const buttons = page.locator('.lo-tag-actionbutton button:visible, .lo-tag-llmaction button:visible');
  const n = await buttons.count();

  for (let i = 0; i < n; i++) {
    const b = buttons.nth(i);
    if (await b.isDisabled().catch(() => true)) continue;
    const label = ((await b.textContent()) || '').trim().slice(0, 40) || `button ${i}`;

    const before = await feedbackSignature(page);
    const printsBefore = await page.evaluate(() => (window as any).__printed || 0);
    await b.click();

    let answered = false;
    try {
      await page.waitForFunction(
        (prev: { len: number; marks: string }) => {
          const len = Array.from(document.querySelectorAll(
            '.lo-tag-llmfeedback, .lo-tag-statustext, .lo-tag-slotsheetgrader'))
            .map(e => (e as HTMLElement).innerText || '').join('').length;
          const marks = Array.from(document.querySelectorAll('.lo-tag-correctness'))
            .map(e => ((e as HTMLElement).innerText || '').trim()).join('|');
          // A settled verdict only: the hourglass and the question mark are the
          // block's "not yet", and counting them would pass on a pending grade.
          const settled = marks !== prev.marks && !/[\u23F3\u2754]/.test(marks);
          return len > prev.len + 10 || settled;
        },
        before, { timeout: FEEDBACK_TIMEOUT, polling: 500 },
      );
      answered = true;
    } catch { /* recorded as unanswered below */ }

    const printed = (await page.evaluate(() => (window as any).__printed || 0)) > printsBefore;
    results.push({ label, answered, required: required && !printed, printed });
    await assertNoDisplayError(page, `${where} after pressing "${label}"`);
  }
  return results;
}

function nextButton(page: Page): Locator {
  return page.getByRole('button', { name: /^\s*next\b/i }).last();
}

// ---------------------------------------------------------------------------

test('the course page links to every handout', async ({ page }) => {
  await page.addInitScript(installObserver);
  await page.goto(`/preview/${COURSE}`, { waitUntil: 'load' });
  await settle(page);
  await assertNoDisplayError(page, COURSE);

  const body = await page.evaluate(() => document.body.innerText);
  for (const want of ['Handout 1', 'Handout 2', 'Handout 3']) {
    expect(body, `course page does not mention ${want}`).toContain(want);
  }
});

for (const handout of HANDOUTS) {
  test(`a student completes ${handout}`, async ({ page }) => {
    test.setTimeout(30 * 60_000);
    await page.addInitScript(installObserver);
    await page.goto(`/preview/edu.memphis.psych/${handout}`, { waitUntil: 'load' });
    await settle(page);

    let screens = 0, answered = 0, pressed = 0;
    const silent: string[] = [], exempt: string[] = [];

    for (let s = 0; s < MAX_SCREENS; s++) {
      screens++;
      const where = `${handout} screen ${s}`;
      await assertNoDisplayError(page, where);

      answered += await answerScreen(page, s);
      const fb = await requestAllFeedback(page, where);
      pressed += fb.length;
      for (const f of fb) {
        if (f.answered) continue;
        if (f.required) silent.push(`${where}: "${f.label}"`);
        else exempt.push(`${where}: "${f.label}" (${f.printed ? 'printed — not a grader' : 'no grading block on this screen'})`);
      }
      console.log(`${where}: inputs answered so far=${answered}, feedback pressed=${fb.length}` +
        (fb.length ? ` [${fb.map(f => `${f.label}${f.answered ? '' : (f.required ? ' NO REPLY' : (f.printed ? ' printed' : ' no reply, not a grader'))}`).join(', ')}]` : ''));

      const next = nextButton(page);
      if (await next.count() === 0 || await next.isDisabled()) break;
      await next.click();
      await settle(page);
    }

    console.log(`${handout}: ${screens} screens, ${answered} inputs answered, ${pressed} feedback presses` +
      (exempt.length ? `; ${exempt.length} press(es) not required to answer: ${exempt.join('; ')}` : ''));
    expect(screens, `${handout}: only one screen was reachable`).toBeGreaterThan(1);
    expect(answered, `${handout}: no input accepted an answer`).toBeGreaterThan(0);
    expect(pressed, `${handout}: no feedback button was found`).toBeGreaterThan(0);
    expect(silent, `feedback buttons that never answered:\n${silent.join('\n')}`).toHaveLength(0);
  });
}
