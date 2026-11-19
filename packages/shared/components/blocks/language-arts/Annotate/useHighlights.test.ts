// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import { createRangeFromOffsets, highlightName } from './useHighlights';

describe('Annotate highlights', () => {
  it('gives each mount and note a distinct CSS-safe name', () => {
    const names = [
      highlightName('_r_0_', 'b275_0'),
      highlightName('_r_0_', 'b275_1'),
      highlightName('_r_1_', 'b275_0'),
    ];
    expect(new Set(names).size).toBe(names.length);
    expect(names.every(name => /^[a-z][a-z0-9-]*$/.test(name))).toBe(true);
  });

  it('reconstructs the selected text from stored offsets', () => {
    const container = document.createElement('div');
    container.innerHTML = '<p>First <em>selected text</em> last</p>';

    const range = createRangeFromOffsets(container, 6, 19);

    expect(range?.toString()).toBe('selected text');
  });
});
