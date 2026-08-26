// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RuntimeProps } from '@/lib/types';

const mocks = vi.hoisted(() => ({
  useFieldState: vi.fn(),
}));

vi.mock('@/lib/state', () => ({
  useFieldState: mocks.useFieldState,
}));

import Done from './_Done';

const props = {
  fields: { value: { name: 'value' } },
} as RuntimeProps;

describe('Done', () => {
  afterEach(() => {
    cleanup();
    mocks.useFieldState.mockReset();
  });

  it('marks an incomplete activity as done', () => {
    const setDone = vi.fn();
    mocks.useFieldState.mockReturnValue([false, setDone]);
    const view = render(<Done {...props} />);

    const checkbox = view.getByRole('checkbox', { name: 'I have completed this activity' });
    expect((checkbox as HTMLInputElement).checked).toBe(false);
    fireEvent.click(checkbox);

    expect(setDone).toHaveBeenCalledWith(true);
  });

  it('allows a completed activity to be unmarked', () => {
    const setDone = vi.fn();
    mocks.useFieldState.mockReturnValue([true, setDone]);
    const view = render(<Done {...props} align="right" />);

    const checkbox = view.getByRole('checkbox', { name: 'I have completed this activity' });
    expect((checkbox as HTMLInputElement).checked).toBe(true);
    expect(checkbox.closest('.done-control-right')).toBeTruthy();
    fireEvent.click(checkbox);

    expect(setDone).toHaveBeenCalledWith(false);
  });
});
