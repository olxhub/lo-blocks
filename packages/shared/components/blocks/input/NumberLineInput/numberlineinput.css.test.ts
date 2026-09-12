// packages/shared/components/blocks/input/NumberLineInput/numberlineinput.css.test.ts
//
// Two CSS invariants this block cannot be correct without, and which no
// render test would catch (jsdom does no layout):
//
// 1. LOGICAL positioning only. The native range mirrors itself under
//    dir="rtl"; the tick layer is ours, and a physical `left`/`right` offset
//    would leave the labels on the left while the thumb runs to the right —
//    an RTL learner reading a scale whose ends are swapped.
//
// 2. A visible :focus-visible ring. Custom track and thumb styling is the
//    usual way a slider loses its focus ring, and a slider with no visible
//    focus is unusable by keyboard.
//
import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const css = fs.readFileSync(path.join(__dirname, 'numberlineinput.css'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '');

describe('numberlineinput.css', () => {
  it('positions with logical properties, never left/right', () => {
    const physical = css.match(/(^|[;{\s])(left|right|margin-left|margin-right|padding-left|padding-right|inset-left|inset-right)\s*:/g);
    expect(physical, `physical positioning found: ${physical?.join(', ')}`).toBeNull();
    // The per-tick offset itself is an inline style (it is data, not
    // design); what the stylesheet contributes must be logical too.
    expect(css).toMatch(/(inset-(inline|block)-(start|end)|margin-inline|inline-size)\s*:/);
  });

  it('draws a focus ring that survives the custom control styling', () => {
    expect(css).toMatch(/:focus-visible\s*\{[^}]*outline\s*:/);
  });

  it('gives the tick layer its own containing block', () => {
    // Ticks are absolutely positioned; without this they would resolve
    // against some scrolled ancestor instead of the track.
    expect(css).toMatch(/\.lo-numberline__marks\s*\{[^}]*position:\s*relative/);
  });
});
