// @vitest-environment jsdom
// packages/shared/integration/use-when.test.tsx
//
// `when=` on a <Use> reference gates THAT reference.
//
// Regression context. Two independent bugs made <Use ref="x" when="..."/> a
// silent no-op:
//
//   1. staticDynamicDom.getWhen() read `when` off the REFERENCED block's own
//      definition and ignored `kid.overrides.when`, so every <Use> gate was
//      dropped in every container.
//   2. _Course.tsx rebuilt its child list as bare { type, definitionKey },
//      discarding the overrides its parser had preserved — so Course stayed
//      unfiltered even once (1) was fixed.
//
// Semantics pinned here are HIDE-only: a gated child is absent from the tree
// (and from Course's nav and default selection), not present-but-disabled.

import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { act, fireEvent, cleanup } from '@testing-library/react';
import { mountOLXString } from './demoRenderHarness';
import { BLOCK_REGISTRY } from '@/components/blockRegistry';
import { preloadBlockComponents } from '@/lib/blocks/loader/componentLoader';

beforeAll(async () => {
  await preloadBlockComponents(Object.values(BLOCK_REGISTRY));
}, 60_000);

afterEach(async () => {
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
  cleanup();
});

// Ids are per-test: student state written under a StateKey outlives a mount,
// so a shared id would let one test's write decide the next test's gate.
async function clickReveal(view: { getByText: (t: string) => HTMLElement }) {
  await act(async () => {
    fireEvent.click(view.getByText('Reveal'));
    await new Promise(resolve => setTimeout(resolve, 0));
  });
}

// ─── Vertical ────────────────────────────────────────────────────────────────

const verticalOlx = (id: string) => `<Vertical id="uw_root_${id}" launchable="true">
  <Use ref="uw_target_${id}" when="@uw_flag_${id}.value" />
  <ActionButton id="uw_btn_${id}" label="Reveal">
    <SetFieldAction id="uw_set_${id}" target="uw_flag_${id}" field="value" value="yes" />
  </ActionButton>
  <Hidden id="uw_defs_${id}">
    <LineInput id="uw_flag_${id}" />
    <Markdown id="uw_target_${id}">GATED BODY</Markdown>
  </Hidden>
</Vertical>`;

describe('<Use when=...> inside a Vertical', () => {
  it('hides the reference while the condition is falsy and shows it once written', async () => {
    const view = await mountOLXString(verticalOlx('vert'), { sourceName: 'uw-vert' });

    expect(view.container.textContent).not.toContain('GATED BODY');

    await clickReveal(view);

    expect(view.reduxStore.getState()
      .application_state?.component?.['CONTENT/uw_flag_vert']?.value).toBe('yes');
    expect(view.container.textContent).toContain('GATED BODY');
  });

  it('leaves a <Use> with no when= alone (regression)', async () => {
    const view = await mountOLXString(
      `<Vertical id="uw_plain_root" launchable="true">
        <Use ref="uw_plain_target" />
        <Hidden id="uw_plain_defs">
          <Markdown id="uw_plain_target">UNGATED BODY</Markdown>
        </Hidden>
      </Vertical>`,
      { sourceName: 'uw-plain' });

    expect(view.container.textContent).toContain('UNGATED BODY');
  });
});

// ─── Course ──────────────────────────────────────────────────────────────────
//
// The first chapter child is the button, so it is the default selection and
// its content pane is what the click happens in. The gated child follows it.

const courseOlx = (id: string) => `<Course id="cw_course_${id}" title="Course">
  <Chapter id="cw_ch1_${id}" title="Chapter One">
    <ActionButton id="cw_btn_${id}" title="First Item" label="Reveal">
      <SetFieldAction id="cw_set_${id}" target="cw_flag_${id}" field="value" value="yes" />
    </ActionButton>
    <Use ref="cw_gated_${id}" when="@cw_flag_${id}.value" />
  </Chapter>
  <Hidden id="cw_defs_${id}">
    <LineInput id="cw_flag_${id}" />
    <Markdown id="cw_gated_${id}" title="Gated Item">GATED COURSE BODY</Markdown>
  </Hidden>
</Course>`;

describe('<Use when=...> inside a Course', () => {
  it('keeps the nav item out until the condition holds, and never default-selects it', async () => {
    const view = await mountOLXString(courseOlx('nav'), { sourceName: 'uw-course' });

    // Nav shows the ungated sibling but not the gated one...
    expect(view.container.textContent).toContain('First Item');
    expect(view.container.textContent).not.toContain('Gated Item');
    // ...and the hidden child is not what the course opened on.
    expect(view.container.textContent).not.toContain('GATED COURSE BODY');

    await clickReveal(view);

    expect(view.container.textContent).toContain('Gated Item');
  });

  it('leaves a Course <Use> with no when= alone (regression)', async () => {
    const view = await mountOLXString(
      `<Course id="cw_plain_course" title="Course">
        <Chapter id="cw_plain_ch" title="Chapter One">
          <Use ref="cw_plain_target" />
        </Chapter>
        <Hidden id="cw_plain_defs">
          <Markdown id="cw_plain_target" title="Plain Item">PLAIN COURSE BODY</Markdown>
        </Hidden>
      </Course>`,
      { sourceName: 'uw-course-plain' });

    expect(view.container.textContent).toContain('Plain Item');
    expect(view.container.textContent).toContain('PLAIN COURSE BODY');
  });
});
