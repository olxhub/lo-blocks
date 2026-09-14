// packages/shared/components/blocks/input/NumberLineInput/numberlineinput.css.test.ts
//
// The CSS invariants this block cannot be correct without, and which no
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
// 3. The control draws its own track and thumb. A native range is painted
//    from `accent-color`, which colours track and thumb together: styling
//    the unanswered state that way made the whole line disappear into the
//    page background. appearance: none plus both vendors' track and thumb
//    pseudo-elements is what keeps the states independent.
//
// 4. Anchored endpoints. `data-edge` is set by _Tick.tsx; without the rules
//    that consume it the labels at min and max are clipped in half.
//
// 5. Display mode draws its own track and its own marker. There is no
//    <input> in that tree, so every rule above that hangs off
//    `.lo-numberline__input` contributes nothing: an unstyled display line
//    is an empty box, and a marker that inherits the disabled grey is a
//    real score that reads as a dead control.
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

  it('draws its own control rather than letting the engine paint it', () => {
    expect(css).toMatch(/\.lo-numberline__input\s*\{[^}]*appearance:\s*none/);
    // Both engines, or the line is unstyled in one of them.
    expect(css).toMatch(/::-webkit-slider-runnable-track\s*\{/);
    expect(css).toMatch(/::-moz-range-track\s*\{/);
  });

  it('never recolours the unanswered state with accent-color', () => {
    // accent-color paints the track fill AND the thumb; setting it to the
    // page background to say "unanswered" erased the whole control.
    const unsetRules = css.match(/\[data-unset[^{]*\{[^}]*\}/g) ?? [];
    expect(unsetRules.join('\n')).not.toMatch(/accent-color/);
  });

  it('anchors the endpoint ticks so their labels are not clipped', () => {
    expect(css).toMatch(/\[data-edge="start"\][^{]*\{[^}]*transform:/);
    expect(css).toMatch(/\[data-edge="end"\][^{]*\{[^}]*transform:/);
  });

  it('draws its own track in display mode, where there is no input to draw one', () => {
    expect(css).toMatch(/\.lo-numberline__track::before\s*\{[^}]*background:/);
    expect(css).toMatch(/\.lo-numberline__track::before\s*\{[^}]*block-size:\s*var\(--lo-numberline-track\)/);
  });

  it('draws the computed marker like a committed thumb, never greyed', () => {
    const marker = css.match(/\.lo-numberline__marker-mark\s*\{[^}]*\}/)?.[0] ?? '';
    expect(marker).toMatch(/background:\s*var\(--lo-primary\)/);
    expect(marker).not.toMatch(/--lo-text-muted|--lo-border\b/);
  });

  it('centres and mirrors the computed marker with the ticks', () => {
    // Same two rules the ticks and the reference ride in: a marker left out
    // of either sits half a thumb off its position, or off it in RTL only.
    expect(css).toMatch(/\.lo-numberline__marker\s*\{\s*position:\s*absolute/);
    expect(css).toMatch(/\[dir="rtl"\][^{]*\.lo-numberline__marker\s*\{[^}]*transform:\s*translateX\(50%\)/);
  });

  it('gives the tick layer its own containing block', () => {
    // Ticks are absolutely positioned; without this they would resolve
    // against some scrolled ancestor instead of the track.
    expect(css).toMatch(/\.lo-numberline__marks\s*\{[^}]*position:\s*relative/);
  });
});
