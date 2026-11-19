// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RuntimeProps } from '@/lib/types';

const mocks = vi.hoisted(() => ({
  useFieldState: vi.fn(),
  useInputReadOnly: vi.fn(),
}));

vi.mock('@/lib/state', () => ({
  useFieldState: mocks.useFieldState,
}));

vi.mock('@/lib/player/inputInteraction', () => ({
  useInputReadOnly: mocks.useInputReadOnly,
}));

import Done from './_Done';

const props = {
  fields: { value: { name: 'value' } },
} as RuntimeProps;

describe('Done', () => {
  beforeEach(() => {
    mocks.useInputReadOnly.mockReturnValue(false);
  });

  afterEach(() => {
    cleanup();
    mocks.useFieldState.mockReset();
    mocks.useInputReadOnly.mockReset();
  });

  it('marks an incomplete activity as done', () => {
    const setDone = vi.fn();
    mocks.useFieldState.mockReturnValue([false, setDone]);
    const view = render(<Done {...props} />);

    const checkbox = view.getByRole('checkbox', { name: 'Mark as complete' });
    expect((checkbox as HTMLInputElement).checked).toBe(false);
    fireEvent.click(checkbox);

    expect(setDone).toHaveBeenCalledWith(true);
  });

  it('does not change while the enclosing problem locks its inputs', () => {
    mocks.useFieldState.mockReturnValue([false, vi.fn()]);
    mocks.useInputReadOnly.mockReturnValue(true);
    const view = render(<Done {...props} />);

    const checkbox = view.getByRole('checkbox', { name: 'Mark as complete' });
    expect((checkbox as HTMLInputElement).disabled).toBe(true);
  });
});
