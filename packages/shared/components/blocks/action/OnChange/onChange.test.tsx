// @vitest-environment jsdom
//
// OnChange fires when a watched VALUE changes. `Trigger` is edge-triggered on
// truth -- once on false->true, then quiet -- which is the wrong shape for keeping
// a grader current: the thing watched is not a condition that flips, it is a value
// that keeps moving as the student types, and every new value needs grading.
//
// Three behaviours here are deliberate and each would be easy to lose:
//   * the empty first render does NOT fire (it would grade a screen the student
//     has not reached, and would record that emptiness as "seen", suppressing the
//     first real change)
//   * an identical value does NOT re-fire
//   * an object value is diffed by CONTENT, because a published sheet is JSON and
//     its identity changes on every render
import React from 'react';
import { render, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { RuntimeProps } from '@/lib/types';

const mocks = vi.hoisted(() => ({
  executeNodeActions: vi.fn(),
  value: undefined as unknown,
  prev: '' as string,
}));

vi.mock('@/lib/blocks', async (orig) => ({
  ...(await orig<any>()), executeNodeActions: mocks.executeNodeActions,
}));
vi.mock('@/lib/stateLanguage/hooks', async (orig) => ({
  ...(await orig<any>()), useReferences: () => ({}),
}));
vi.mock('@/lib/stateLanguage/references', async (orig) => ({
  ...(await orig<any>()), extractStructuredRefs: () => [],
}));
// Spread the original: other modules import real exports from here, and a
// wholesale replacement breaks their load before a single test is collected.
vi.mock('@/lib/stateLanguage/evaluate', async (orig) => ({
  ...(await orig<any>()),
  evaluate: () => mocks.value,
  createContext: () => ({}),
}));
vi.mock('@/lib/player/client/render', async (orig) => ({
  ...(await orig<any>()), useKids: () => null,
}));
vi.mock('@/lib/state', async (orig) => ({
  ...(await orig<any>()),
  useFieldState: () => [mocks.prev, (v: string) => { mocks.prev = v; }],
}));

import _OnChange from './_OnChange';

function renderWith(value: unknown) {
  mocks.value = value;
  return render(React.createElement(_OnChange as any, {
    watch: { expr: '@x', ast: {} },
    fields: { prevValue: 'prev' },
    runtime: { sideEffectFree: false } as any,
  } as unknown as RuntimeProps));
}

beforeEach(() => { mocks.executeNodeActions.mockClear(); mocks.prev = ''; });
afterEach(() => cleanup());

describe('OnChange', () => {
  it('does not fire on an empty first render', () => {
    renderWith('');
    expect(mocks.executeNodeActions).not.toHaveBeenCalled();
  });

  it('fires when a value first appears', () => {
    renderWith('hello');
    expect(mocks.executeNodeActions).toHaveBeenCalledTimes(1);
    expect(mocks.prev).toBe('hello');
  });

  it('does not re-fire on an identical value', () => {
    mocks.prev = 'hello';
    renderWith('hello');
    expect(mocks.executeNodeActions).not.toHaveBeenCalled();
  });

  it('fires again when the value moves on', () => {
    mocks.prev = 'hello';
    renderWith('goodbye');
    expect(mocks.executeNodeActions).toHaveBeenCalledTimes(1);
  });

  it('diffs an object by CONTENT, not identity', () => {
    // A published sheet is JSON: a fresh object every render, same content.
    mocks.prev = JSON.stringify({ a: 1 });
    renderWith({ a: 1 });
    expect(mocks.executeNodeActions, 'same content must not re-fire').not.toHaveBeenCalled();
    cleanup();
    renderWith({ a: 2 });
    expect(mocks.executeNodeActions, 'changed content must fire').toHaveBeenCalledTimes(1);
  });

  it('stays quiet when the runtime is side-effect free', () => {
    mocks.value = 'hello';
    render(React.createElement(_OnChange as any, {
      watch: { expr: '@x', ast: {} },
      fields: { prevValue: 'prev' },
      runtime: { sideEffectFree: true } as any,
    } as unknown as RuntimeProps));
    expect(mocks.executeNodeActions).not.toHaveBeenCalled();
    // ...but it still records what it saw, so the next real render is a change.
    expect(mocks.prev).toBe('hello');
  });
});
