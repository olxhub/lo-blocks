// @vitest-environment jsdom

import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  useTextContent: vi.fn(),
  useReferences: vi.fn(),
}));

vi.mock('@/lib/state/redux', () => ({
  useTextContent: mocks.useTextContent,
}));

vi.mock('@/lib/stateLanguage', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/stateLanguage')>(),
  useReferences: mocks.useReferences,
}));

import { useText } from './useText';

const context = {
  componentState: { score: { value: 7 } },
  olxContent: {},
  globalVar: {},
  ns: 'test',
};

function props(overrides: Record<string, unknown> = {}) {
  return {
    kids: 'Score: {{@score.value}}',
    loBlock: { textContent: { source: 'kids', defaultTemplate: 'none' } },
    ...overrides,
  } as any;
}

describe('useText', () => {
  beforeEach(() => {
    mocks.useTextContent.mockImplementation((_props, { fallback }) => ({
      text: fallback,
      loading: false,
      error: null,
      ready: true,
    }));
    mocks.useReferences.mockReturnValue(context);
  });

  it('keeps template-like text literal by default', () => {
    const { result } = renderHook(() => useText(props()));

    expect(result.current.text).toBe('Score: {{@score.value}}');
    expect(mocks.useReferences).toHaveBeenCalledWith(
      expect.anything(),
      { componentState: [], olxContent: [], globalVar: [] },
    );
  });

  it('evaluates an explicitly selected state template', () => {
    const { result } = renderHook(() => useText(props({ template: 'state' })));

    expect(result.current.text).toBe('Score: 7');
  });

  it('uses a resolved value only when the parser declares a value source', () => {
    mocks.useTextContent.mockReturnValue({
      text: 'Resolved: {{@score.value}}',
      loading: false,
      error: null,
      ready: true,
    });

    const { result } = renderHook(() => useText(props({
      template: 'state',
      loBlock: { textContent: { source: 'value', defaultTemplate: 'none' } },
    })));

    expect(result.current.text).toBe('Resolved: 7');
  });

  it('honors a blueprint compatibility default', () => {
    const { result } = renderHook(() => useText(props({
      loBlock: { textContent: { source: 'kids', defaultTemplate: 'state' } },
    })));

    expect(result.current.text).toBe('Score: 7');
  });

  it('can change template mode without changing hook order', () => {
    const initial = props();
    const { result, rerender } = renderHook(
      ({ currentProps }) => useText(currentProps),
      { initialProps: { currentProps: initial } },
    );

    expect(result.current.text).toBe('Score: {{@score.value}}');

    rerender({ currentProps: props({ template: 'state' }) });
    expect(result.current.text).toBe('Score: 7');

    rerender({ currentProps: props({ template: 'none' }) });
    expect(result.current.text).toBe('Score: {{@score.value}}');
  });
});
