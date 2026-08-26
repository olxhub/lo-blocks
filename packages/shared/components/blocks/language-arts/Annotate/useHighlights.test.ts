// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import { createRangeFromOffsets, highlightName } from './useHighlights';

describe('Annotate highlights', () => {
  it('creates a CSS-safe name for qualified block and CRDT note IDs', () => {
    const first = highlightName('docs.Annotate/annotate_demo', 'b275_0');
    const second = highlightName('docs.Annotate/annotate_demo', 'b275_1');

    expect(first).toMatch(/^[a-z][a-z0-9-]*$/);
    expect(second).toMatch(/^[a-z][a-z0-9-]*$/);
    expect(second).not.toBe(first);
  });

  it('reconstructs the selected text from stored offsets', () => {
    const container = document.createElement('div');
    container.innerHTML = '<p>First <em>selected text</em> last</p>';

    const range = createRangeFromOffsets(container, 6, 19);

    expect(range?.toString()).toBe('selected text');
  });
});
