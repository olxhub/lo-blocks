// @vitest-environment jsdom
// packages/shared/components/blocks/language-arts/TextSelection/textSelectionRender.test.tsx
//
// What the learner actually sees, mounted end to end through the OLX parser and
// the renderer. The model's own tables (textSelection.test.ts) pin the chunk
// projection; this file pins the two things only a mount can show:
//
//   - the chunks on screen are the separator's chunks — a transcript marked one
//     turn per line with a hidden `§` gives one button per turn, and terminal
//     punctuation inside a turn divides nothing;
//   - the passage keeps its line breaks, in word mode and chunk mode alike.
//
// A line break is half DOM and half CSS: the newline has to reach the DOM (jsdom
// can assert that) and the container has to be `white-space: pre-line` (jsdom
// does no layout, so the stylesheet is asserted as text). Both halves are here
// because either one alone renders the transcript as a wall of prose.
//
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { act, cleanup } from '@testing-library/react';
import fs from 'fs';
import path from 'path';
import { mountOLXString } from '@/integration/demoRenderHarness';
import { BLOCK_REGISTRY } from '@/components/blockRegistry';
import { preloadBlockComponents } from '@/lib/blocks/loader/componentLoader';

beforeAll(async () => {
  await preloadBlockComponents(Object.values(BLOCK_REGISTRY));
}, 60_000);

afterEach(async () => {
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
  cleanup();
});

/** A transcript: one turn per line, each turn closed by a hidden `§`, with a
 *  `?` and a `!` inside turns where a sentence splitter would wrongly cut. */
const TRANSCRIPT = `Ms. Boyd: Why does the ice float instead of sinking? §
Marcus: My grandpa takes me ice fishing! The ice is only on the top. §
[Ms. Boyd: Exactly, Marcus. So why only on top?|marcus] §
Diego looks down and doesn't answer.`;

const TURNS = [
  'Ms. Boyd: Why does the ice float instead of sinking?',
  'Marcus: My grandpa takes me ice fishing! The ice is only on the top.',
  'Ms. Boyd: Exactly, Marcus. So why only on top?',
  "Diego looks down and doesn't answer.",
];

const transcriptOlx = (id: string, attrs: string) =>
  `<SimpleTextSelection id="${id}" mode="graded" ${attrs}>
Mark the turns that carry the message.
---
${TRANSCRIPT}
</SimpleTextSelection>`;

async function mountPassage(id: string, attrs: string) {
  const { container } = await mountOLXString(transcriptOlx(id, attrs), { sourceName: id });
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
  const passage = container.querySelector('.text-content') as HTMLElement;
  return { container, passage };
}

describe('TextSelection passage rendering', () => {
  it('chunk mode: the clickable chunks are the separator\'s turns', async () => {
    const { container } = await mountPassage(
      'render_chunks', 'separatorRegexp="§" separatorHidden="true"',
    );
    const chunks = [...container.querySelectorAll('.text-chunk')];
    expect(chunks.map(c => c.textContent)).toEqual(TURNS);
    // Every chunk is a real button the learner can reach.
    expect(chunks.every(c => c.getAttribute('role') === 'button')).toBe(true);
    // The hidden separator never reaches the learner.
    expect(container.querySelector('.text-content')!.textContent).not.toContain('§');
  });

  it('chunk mode: every turn is on its own line', async () => {
    const { passage } = await mountPassage(
      'render_chunk_lines', 'separatorRegexp="§" separatorHidden="true"',
    );
    expect(passage.textContent).toBe(TURNS.join('\n'));
  });

  it('word mode: the passage keeps the same line breaks', async () => {
    const { passage, container } = await mountPassage('render_word_lines', '');
    // No separator: every word is its own target, and the line breaks are still
    // the author's. The `§` markers are ordinary content here.
    expect(container.querySelectorAll('.text-chunk')).toHaveLength(0);
    expect(passage.textContent!.split('\n').map(line => line.trim())).toEqual([
      'Ms. Boyd: Why does the ice float instead of sinking? §',
      'Marcus: My grandpa takes me ice fishing! The ice is only on the top. §',
      'Ms. Boyd: Exactly, Marcus. So why only on top? §',
      "Diego looks down and doesn't answer.",
    ]);
  });

  it('the passage container is white-space: pre-line, so those newlines show', () => {
    const css = fs.readFileSync(
      path.join(__dirname, 'textselection.css'), 'utf-8',
    ).replace(/\s+/g, ' ');
    expect(css).toMatch(/\.text-highlight-container \.text-content \{ white-space: pre-line; \}/);
  });
});
