// @vitest-environment node
//
// buildActivityCards — card extraction from a parsed idMap.

import { describe, it, expect } from 'vitest';
import { buildActivityCards } from './buildActivityCards';

/** Minimal idMap entry: only the fields buildActivityCards reads. */
function entry(attributes: Record<string, unknown>, kids?: unknown) {
  return {
    attributes, tag: 'Course', category: 'psychology', index: 0,
    source: 'file:content://ns/a.olx#0', ...(kids ? { kids } : {}),
  };
}
const sections = (...ids: string[]) =>
  ({ sections: ids.map(id => ({ id, type: 'block', overrides: {} })) });

describe('buildActivityCards members', () => {
  it("records a course's sections as its members", () => {
    const { cards } = buildActivityCards({
      'ns/course': { '*': entry({ id: 'course', launchable: 'course', title: 'C' },
        sections('ns/one', 'ns/two')) },
    } as any);
    expect(cards['ns/course'].members).toEqual(['ns/one', 'ns/two']);
  });

  it('leaves members absent on a non-course launchable', () => {
    const { cards } = buildActivityCards({
      'ns/act': { '*': entry({ id: 'act', launchable: 'true', title: 'A' },
        sections('ns/one')) },
    } as any);
    expect(cards['ns/act'].members).toBeUndefined();
  });

  it('gives a course declaring no sections an empty membership, not an absent one', () => {
    const { cards } = buildActivityCards({
      'ns/course': { '*': entry({ id: 'course', launchable: 'course', title: 'C' }) },
    } as any);
    expect(cards['ns/course'].members).toEqual([]);
  });

  it('skips section entries that are not blocks', () => {
    const { cards } = buildActivityCards({
      'ns/course': { '*': entry({ id: 'course', launchable: 'course', title: 'C' },
        { sections: [
          { id: 'ns/one', type: 'block', overrides: {} },
          { type: 'inline' },                               // no id
        ] }) },
    } as any);
    expect(cards['ns/course'].members).toEqual(['ns/one']);
  });
});
