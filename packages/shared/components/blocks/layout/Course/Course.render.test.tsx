// @vitest-environment jsdom
// packages/shared/components/blocks/layout/Course/Course.render.test.tsx
//
// A course HOLDS content it never SHOWS.
//
// The rubric is the case this exists for: it is scoped to the course and
// belongs inside it, and a learner must never see a sidebar entry for it.
// Deciding that at RENDER rather than at parse is what makes `<Use ref="..."/>`
// work -- the parser sees the tag `Use` and cannot know what it points at,
// because the target may live in a file not yet parsed.

import { describe, it, expect } from 'vitest';
import { BLOCK_REGISTRY } from '@/components/blockRegistry';

describe('the registry marks rubric content non-rendering', () => {
  it('every rubric block is internal', () => {
    // The filter reads this flag. If a block type stopped being internal, a
    // course holding one would start listing it, and nothing else would say so.
    for (const tag of ['Rubric', 'Verdicts', 'Frame', 'Segment', 'Deduction',
                       'Item', 'ItemTemplate', 'Param', 'Question', 'Slot',
                       'Expect', 'Forbid', 'Onlyif', 'Guidance']) {
      expect(BLOCK_REGISTRY[tag], tag + ' is not registered').toBeDefined();
      expect(BLOCK_REGISTRY[tag]?.internal, tag + ' is not internal').toBe(true);
    }
  });

  it('the things a course SHOULD show are not internal', () => {
    // The control: without it, a filter that hid everything would pass above.
    for (const tag of ['Markdown', 'Vertical', 'Sequential']) {
      expect(BLOCK_REGISTRY[tag]?.internal ?? false,
             tag + ' would be hidden from navigation').toBe(false);
    }
  });
});
