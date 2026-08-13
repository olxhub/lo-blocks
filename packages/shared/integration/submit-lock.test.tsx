// @vitest-environment jsdom
// packages/shared/integration/submit-lock.test.tsx
//
// Handing in an activity freezes it: every input goes read-only and every
// button stops working, except the one that did the submitting.
//
// Mounted rather than unit-tested because the freeze is a COLLABORATION and
// each half is individually plausible while the whole thing does nothing. The
// flag lives on the Sequential; the readers are three unrelated files
// (inputInteraction for text inputs, _ChoiceGroup for radios and checkboxes,
// _ActionButton for buttons), and each finds the flag by walking its own
// ancestors. A unit test of any one reader would pass against a Sequential that
// never stores the field, and a unit test of the field would pass with no
// reader wired up at all. What is worth guarding is the wire.
//
// The specific regressions this holds down:
//   * the ancestor walk finding nothing and failing OPEN, silently — a handed-in
//     handout that stays editable looks exactly like a working one until a
//     student edits it after submitting;
//   * `value="true"` arriving as the STRING "true" and something later reading
//     it with a truthiness test that a string "false" would also pass;
//   * the submit button disabling ITSELF, which is invisible until a student
//     cancels the print dialog and finds no way back;
//   * the freeze escaping its activity — it is scoped to the nearest ancestor
//     Sequential precisely so submitting Handout 1 cannot freeze Handout 2.
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { fireEvent, waitFor, cleanup } from '@testing-library/react';
import { mountOLXString } from './demoRenderHarness';
import { BLOCK_REGISTRY } from '@/components/blockRegistry';
import { preloadBlockComponents } from '@/lib/blocks/loader/componentLoader';

// Two activities side by side, so "did the freeze stay inside its own
// Sequential" is a fact about this mount rather than a second test that could
// drift from it. PrintAction is deliberately absent: window.print is not the
// behaviour under test, and jsdom does not implement it.
const OLX = `<Vertical id="SubmitLockDemo">
  <Sequential id="lock_activity" title="Frozen activity" launchable="true">
    <Vertical id="lock_screen">
      <TextArea id="lock_text" rows="2" />
      <ChoiceInput id="lock_choice">
        <Distractor id="lock_choice_a">Alpha</Distractor>
        <Key id="lock_choice_b">Beta</Key>
      </ChoiceInput>
      <ActionButton id="lock_feedback_btn" label="Check my answer">
        <HelloAction id="lock_feedback_action" />
      </ActionButton>
      <ActionButton id="lock_submit_btn" label="Submit and freeze" ignoreSubmitLock="true">
        <SetFieldAction id="lock_submit_action" target="lock_activity" field="submitted" value="true" />
      </ActionButton>
    </Vertical>
  </Sequential>
  <Sequential id="other_activity" title="Untouched activity" launchable="true">
    <Vertical id="other_screen">
      <TextArea id="other_text" rows="2" />
      <ActionButton id="other_btn" label="Check my other answer">
        <HelloAction id="other_action" />
      </ActionButton>
    </Vertical>
  </Sequential>
</Vertical>`;

const byLabel = (c: HTMLElement, label: string) =>
  Array.from(c.querySelectorAll('button'))
    .find(b => b.textContent?.trim().startsWith(label)) as HTMLButtonElement;

/** The confirmation dialog portals to document.body, not into `container`. */
const dialog = () => document.querySelector('[role="dialog"]');
const dialogButton = (label: string) =>
  Array.from(dialog()?.querySelectorAll('button') ?? [])
    .find(b => b.textContent?.trim() === label) as HTMLButtonElement;

const sequentialState = (reduxStore: any, suffix: string) => {
  const comp = reduxStore.getState().application_state?.component ?? {};
  const key = Object.keys(comp).find(k => k.endsWith(suffix));
  return (key && comp[key]) || {};
};

describe('submitting an activity freezes it', () => {
  beforeAll(async () => {
    await preloadBlockComponents(Object.values(BLOCK_REGISTRY));
  }, 60_000);

  afterEach(() => cleanup());

  it('locks inputs and buttons inside the submitted Sequential only', async () => {
    const { reduxStore, container } = await mountOLXString(OLX, { sourceName: 'submit-lock' });

    const textareas = () => Array.from(container.querySelectorAll('textarea')) as HTMLTextAreaElement[];
    const radios = () => Array.from(container.querySelectorAll('input[type="radio"]')) as HTMLInputElement[];

    // Baseline: nothing is frozen before the button is pressed. Asserted so a
    // freeze that was somehow always on cannot pass this test.
    expect(textareas().length).toBe(2);
    expect(textareas().every(t => t.readOnly)).toBe(false);
    expect(radios().length).toBe(2);
    expect(radios().some(r => r.disabled)).toBe(false);
    expect(byLabel(container, 'Check my answer').disabled).toBe(false);
    expect(byLabel(container, 'Submit and freeze').disabled).toBe(false);

    // Freezing always asks first, and the question does NOT freeze anything by
    // itself. A student who misclicks is one Escape away from their work.
    fireEvent.click(byLabel(container, 'Submit and freeze'));
    await waitFor(() => expect(dialog()).toBeTruthy());
    expect(sequentialState(reduxStore, 'lock_activity').submitted).toBeUndefined();
    expect(textareas().some(t => t.readOnly), 'nothing frozen while merely asking').toBe(false);

    // Cancel leaves everything exactly as it was.
    fireEvent.click(dialogButton('Cancel'));
    await waitFor(() => expect(dialog()).toBeNull());
    expect(sequentialState(reduxStore, 'lock_activity').submitted).toBeUndefined();
    expect(textareas().some(t => t.readOnly), 'cancel freezes nothing').toBe(false);

    // Asking again and confirming is what actually submits.
    fireEvent.click(byLabel(container, 'Submit and freeze'));
    await waitFor(() => expect(dialog()).toBeTruthy());
    fireEvent.click(dialogButton('Submit and lock'));

    // The flag is a real boolean, not the string it was authored as: a reader
    // doing Boolean(raw) would be satisfied by "false" too.
    await waitFor(() =>
      expect(sequentialState(reduxStore, 'lock_activity').submitted).toBe(true));
    await waitFor(() => expect(dialog(), 'dialog closes on confirm').toBeNull());

    const frozenText = container.querySelector('#lock_text, [id$="lock_text"] textarea') as HTMLElement;
    await waitFor(() => {
      const inside = textareas().filter(t => t.readOnly);
      expect(inside.length, 'exactly the submitted activity\'s textarea is read-only').toBe(1);
    });
    expect(radios().every(r => r.disabled), 'radios in the submitted activity').toBe(true);
    expect(byLabel(container, 'Check my answer').disabled, 'feedback button').toBe(true);

    // The button that fired the freeze stays live — otherwise cancelling the
    // print dialog strands the student with no way to print again.
    expect(byLabel(container, 'Submit and freeze').disabled, 'submit button').toBe(false);

    // The sibling activity is untouched: the freeze is per-Sequential, not
    // per-namespace.
    expect(byLabel(container, 'Check my other answer').disabled, 'other activity button').toBe(false);
    expect(sequentialState(reduxStore, 'other_activity').submitted).toBeUndefined();

    // Pressing it AGAIN must not re-ask. The activity is already locked, so
    // there is nothing left to warn about — the button survives the lock only
    // so a student can print their submission again, and a dialog claiming it
    // is about to lock work that is already locked is simply false.
    fireEvent.click(byLabel(container, 'Submit and freeze'));
    await new Promise(r => setTimeout(r, 200));
    expect(dialog(), 'no confirmation once already locked').toBeNull();
    expect(sequentialState(reduxStore, 'lock_activity').submitted).toBe(true);

    void frozenText;
  }, 60_000);

  it('does not interrogate ordinary buttons with a dialog', async () => {
    // The confirmation is triggered by what the button DOES, so a button that
    // freezes nothing must run straight through. A dialog on every action
    // would train students to dismiss it unread, which is how the one that
    // matters gets clicked through.
    const { container } = await mountOLXString(OLX, { sourceName: 'submit-lock-plain' });

    fireEvent.click(byLabel(container, 'Check my answer'));
    await new Promise(r => setTimeout(r, 200));
    expect(dialog()).toBeNull();
  }, 60_000);
});
