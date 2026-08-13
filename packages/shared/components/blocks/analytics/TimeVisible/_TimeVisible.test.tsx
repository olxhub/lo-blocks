// @vitest-environment jsdom

import React from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RuntimeProps } from '@/lib/types';

const mocks = vi.hoisted(() => ({
  useFieldState: vi.fn(),
  useKids: vi.fn(() => ({ kids: ['Measured child'] })),
}));

vi.mock('@/lib/state', () => ({
  useFieldState: mocks.useFieldState,
}));

vi.mock('@/lib/player/client/render', () => ({
  useKids: mocks.useKids,
}));

import TimeVisible from './_TimeVisible';

const props = {
  fields: { value: { name: 'value' } },
  runtime: { sideEffectFree: false },
} as RuntimeProps;

function makeVisible(element: HTMLElement) {
  Object.defineProperty(element, 'offsetParent', {
    configurable: true,
    value: document.body,
  });
}

describe('TimeVisible', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    mocks.useFieldState.mockReset();
  });

  it('batches visible, active seconds and flushes partial batches on unmount', () => {
    const setValue = vi.fn();
    mocks.useFieldState.mockReturnValue([10, setValue]);
    const view = render(<TimeVisible {...props} />);
    expect(view.getByText('Measured child')).toBeTruthy();
    makeVisible(view.container.querySelector('[data-time-visible-region]')!);

    act(() => vi.advanceTimersByTime(5000));
    expect(setValue).toHaveBeenLastCalledWith(15);

    act(() => vi.advanceTimersByTime(2000));
    view.unmount();
    expect(setValue).toHaveBeenLastCalledWith(17);
  });

  it('does not count a hidden panel or run during replay', () => {
    const setHiddenValue = vi.fn();
    mocks.useFieldState.mockReturnValue([0, setHiddenValue]);
    const hidden = render(<TimeVisible {...props} />);

    act(() => vi.advanceTimersByTime(5000));
    hidden.unmount();
    expect(setHiddenValue).not.toHaveBeenCalled();

    const setReplayValue = vi.fn();
    mocks.useFieldState.mockReturnValue([0, setReplayValue]);
    const replayProps = {
      ...props,
      runtime: { ...props.runtime, sideEffectFree: true },
    } as RuntimeProps;
    const replay = render(<TimeVisible {...replayProps} />);
    makeVisible(replay.container.querySelector('[data-time-visible-region]')!);

    act(() => vi.advanceTimersByTime(5000));
    replay.unmount();
    expect(setReplayValue).not.toHaveBeenCalled();
  });

  it('shares page-activity listeners across timer instances', () => {
    const add = vi.spyOn(document, 'addEventListener');
    mocks.useFieldState.mockReturnValue([0, vi.fn()]);

    const view = render(
      <>
        <TimeVisible {...props} />
        <TimeVisible {...props} />
      </>,
    );

    for (const event of ['keydown', 'mousemove', 'mousedown', 'wheel', 'scroll', 'touchstart']) {
      expect(add.mock.calls.filter(([type]) => type === event)).toHaveLength(1);
    }
    view.unmount();
  });
});
