// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, waitFor } from '@testing-library/react';
import { mountOLXString } from './demoRenderHarness';
import { BLOCK_REGISTRY } from '@/components/blockRegistry';
import { preloadBlockComponents } from '@/lib/blocks/loader/componentLoader';

const choiceProblem = (id: string, attributes: string) => `<CapaProblem id="${id}" ${attributes}>
<KeyGrader><ChoiceInput><Distractor>Venus</Distractor><Key>Mercury</Key></ChoiceInput></KeyGrader>
</CapaProblem>`;

describe('problem answer and locking policy', () => {
  beforeAll(async () => {
    await preloadBlockComponents(Object.values(BLOCK_REGISTRY));
  }, 60_000);

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('reveals and locks a one-submission item', async () => {
    const { container, getByText, queryByText } = await mountOLXString(choiceProblem(
      'one_submission',
      'maxAttempts="1" showAnswer="attempted" answerReveal="auto" lockInput="closed"',
    ));
    const radios = Array.from(
      container.querySelectorAll('input[type="radio"]'),
    ) as HTMLInputElement[];

    fireEvent.click(radios[0]);
    await waitFor(() => expect(radios[0].checked).toBe(true));
    fireEvent.click(getByText('Submit'));
    await waitFor(() => expect(container.textContent).toContain('❌'));

    expect(container.querySelector('.lo-choiceinput-show-answer')).not.toBeNull();
    expect(radios.every(radio => radio.disabled)).toBe(true);
    expect(queryByText('Show Answer')).toBeNull();
  });

  it('supports showanswer while loudly requesting migration', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { getByText } = await mountOLXString(choiceProblem(
      'legacy_showanswer', 'showanswer="always"',
    ));

    expect(getByText('Show Answer')).toBeTruthy();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('migrate to showAnswer='));
  });
});
