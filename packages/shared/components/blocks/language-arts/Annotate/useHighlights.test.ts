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

  it('names the mount, not the block: two copies of one block differ', () => {
    // CSS.highlights is one document-wide registry, so copies of a block that
    // are on screen together need distinct names or only one of them paints.
    expect(highlightName('_r_0_', 'b275_0')).not.toBe(highlightName('_r_1_', 'b275_0'));
    expect(highlightName('_r_0_', 'b275_0')).toMatch(/^[a-z][a-z0-9-]*$/);
  });

  it('reconstructs the selected text from stored offsets', () => {
    const container = document.createElement('div');
    container.innerHTML = '<p>First <em>selected text</em> last</p>';

    const range = createRangeFromOffsets(container, 6, 19);

    expect(range?.toString()).toBe('selected text');
  });
});
