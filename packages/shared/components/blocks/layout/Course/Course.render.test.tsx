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
  it('every rubric block renders nothing', () => {
    // WHAT THE FILTER READS, and it used to read `internal` instead. That was
    // the wrong question twice over: 25 internal blocks DO render, and the rubric
    // family is now author-facing and deliberately NOT internal. A block with
    // neither `component` nor `componentLoader` renders nothing, which is the
    // property a course needs in order to hold content it never shows.
    for (const tag of ['Rubric', 'Verdicts', 'Frame', 'Segment', 'Deduction',
                       'Item', 'ItemTemplate', 'Param', 'Question', 'Slot',
                       'Expect', 'Forbid', 'Onlyif', 'Guidance']) {
      const b: any = BLOCK_REGISTRY[tag];
      expect(b, tag + ' is not registered').toBeDefined();
      expect(!!(b?.component || b?.componentLoader),
             tag + ' renders, so a course would list it').toBe(false);
    }
  });

  it('the things a course SHOULD show do render', () => {
    // The control: without it, a predicate that called everything non-rendering
    // would pass above.
    for (const tag of ['Markdown', 'Vertical', 'Sequential']) {
      const b: any = BLOCK_REGISTRY[tag];
      expect(!!(b?.component || b?.componentLoader),
             tag + ' would be hidden from navigation').toBe(true);
    }
  });

  it('the rubric family is NOT internal, so authors can find it', () => {
    // The decision this file was changed for: these are the vocabulary a
    // hand-authored rubric is written in, so the docs browser must not hide them.
    for (const tag of ['Rubric', 'Item', 'Slot', 'Credit', 'Guidance']) {
      expect(BLOCK_REGISTRY[tag]?.internal ?? false,
             tag + ' is hidden from the docs').toBe(false);
    }
  });
});
