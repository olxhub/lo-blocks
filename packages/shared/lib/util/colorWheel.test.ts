import { describe, expect, it } from 'vitest';

import { groupHue, stringColorIndex } from './colorWheel';

describe('stringColorIndex', () => {
  it('assigns distinct stable hues to sequential CRDT IDs', () => {
    const first = groupHue(stringColorIndex('b275_0'));
    const second = groupHue(stringColorIndex('b275_1'));

    expect(first).not.toBe(second);
    expect(groupHue(stringColorIndex('b275_0'))).toBe(first);
  });
});
