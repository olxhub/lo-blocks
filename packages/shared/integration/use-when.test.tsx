// @vitest-environment jsdom
import { act, cleanup, fireEvent } from '@testing-library/react';
import { afterEach, beforeAll, expect, it } from 'vitest';
import { BLOCK_REGISTRY } from '@/components/blockRegistry';
import { preloadBlockComponents } from '@/lib/blocks/loader/componentLoader';
import { mountOLXString } from './demoRenderHarness';

beforeAll(async () => {
  await preloadBlockComponents(Object.values(BLOCK_REGISTRY));
}, 60_000);

afterEach(async () => {
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
  cleanup();
});

async function click(view: { getByText: (text: string) => HTMLElement }, label: string) {
  await act(async () => {
    fireEvent.click(view.getByText(label));
    await new Promise(resolve => setTimeout(resolve, 0));
  });
}

function occurrences(text: string, value: string): number {
  return text.split(value).length - 1;
}

it('evaluates when= independently for each Use reference', async () => {
  const view = await mountOLXString(`<Vertical id="use_when_root" launchable="true">
    <Use ref="use_when_target" when="!@use_when_flag.value" />
    <Use ref="use_when_target" when="@use_when_flag.value" />
    <ActionButton id="use_when_button" label="Reveal">
      <SetFieldAction id="use_when_set" target="use_when_flag" field="value" value="yes" />
    </ActionButton>
    <Hidden id="use_when_definitions">
      <LineInput id="use_when_flag" />
      <Markdown id="use_when_target">TARGET BODY</Markdown>
    </Hidden>
  </Vertical>`, { sourceName: 'use-when-references' });

  expect(occurrences(view.container.textContent ?? '', 'TARGET BODY')).toBe(1);
  await click(view, 'Reveal');
  expect(occurrences(view.container.textContent ?? '', 'TARGET BODY')).toBe(1);
});

it('updates Course navigation when a Use condition changes', async () => {
  const view = await mountOLXString(`<Vertical id="course_test_root" launchable="true">
    <Course id="use_when_course" title="Course">
      <Chapter id="use_when_chapter" title="Chapter">
        <ActionButton id="course_reveal" title="First Item" label="Reveal">
          <SetFieldAction id="course_set" target="course_flag" field="value" value="yes" />
        </ActionButton>
        <Use ref="course_target" when="@course_flag.value" />
      </Chapter>
    </Course>
    <Hidden id="course_definitions">
      <LineInput id="course_flag" />
      <Markdown id="course_target" title="Gated Item">COURSE BODY</Markdown>
    </Hidden>
  </Vertical>`, {
    sourceName: 'use-when-course',
  });

  expect(view.container.textContent).not.toContain('Gated Item');
  await click(view, 'Reveal');
  expect(view.container.textContent).toContain('Gated Item');

  await click(view, 'Gated Item');
  expect(view.container.textContent).toContain('COURSE BODY');
});
