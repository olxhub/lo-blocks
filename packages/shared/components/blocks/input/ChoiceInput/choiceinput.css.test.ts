// Regression test for the "clicking a chat-embedded answer jumps the page" bug.
//
// `.lo-choice-item__input` is the real <input>, hidden with position:absolute.
// If its <label> is not a containing block, the input's containing block
// becomes the initial containing block, so its box lands at the item's
// UNSCROLLED document coordinate — inside a scrolled chat transcript that is
// thousands of pixels below the fold. Clicking the label focuses the input and
// the browser scrolls every scrollable ancestor (including the page) to reveal
// it. Measured in Chromium on the MTSU Temperance course: the hidden input sat
// at y=11701 while its label sat at y=416, and each answer click scrolled
// window.scrollY by +118px (the page's full scroll range).
//
// The offset error equals the scroll container's scrollTop, which is why
// pane-hosted (unscrolled) choice inputs never showed the jump.
//
// jsdom does no layout, so this asserts the CSS invariant directly.

import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const css = fs.readFileSync(path.join(__dirname, 'choiceinput.css'), 'utf8');

/** Body of the first top-level `selector { ... }` rule, comments stripped. */
function ruleBody(selector: string): string {
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const idx = stripped.indexOf(`${selector} {`);
  expect(idx, `rule ${selector} not found`).toBeGreaterThanOrEqual(0);
  const start = stripped.indexOf('{', idx);
  return stripped.slice(start + 1, stripped.indexOf('}', start));
}

describe('choiceinput.css hidden-input containment', () => {
  it('hides the native input with position:absolute', () => {
    expect(ruleBody('.lo-choice-item__input')).toMatch(/position:\s*absolute/);
  });

  it('makes the choice item a containing block so the input cannot escape a scroll container', () => {
    expect(ruleBody('.lo-choice-item')).toMatch(/position:\s*relative/);
  });
});
