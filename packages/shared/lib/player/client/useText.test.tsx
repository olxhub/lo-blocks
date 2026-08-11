// @vitest-environment jsdom

import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  useValue: vi.fn(),
  useReferences: vi.fn(),
}));

vi.mock('@/lib/state/fieldHooks', () => ({
  useValue: mocks.useValue,
}));

vi.mock('@/lib/stateLanguage', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/stateLanguage')>(),
  useReferences: mocks.useReferences,
}));

import { useInterpolation, useText, useTextWithTemplate } from './useText';

const context = {
  componentState: { score: { value: 7 } },
  olxContent: {},
  globalVar: {},
  ns: 'test',
};

function props(overrides: Record<string, unknown> = {}) {
  return {
    kids: 'Score: {{@score.value}}',
    loBlock: { textContent: { source: 'kids' } },
    ...overrides,
  } as any;
}

describe('useText', () => {
  beforeEach(() => {
    mocks.useValue.mockReset();
    mocks.useReferences.mockReset();
    mocks.useValue.mockImplementation((_props, { fallback }) => ({
      value: fallback,
      status: 'ready',
      loading: false,
      error: null,
      ready: true,
    }));
    mocks.useReferences.mockReturnValue(context);
  });

  it('reads parsed kids without subscribing to the block value', () => {
    const input = props();
    const { result } = renderHook(() => useText(input));

    expect(result.current.text).toBe('Score: {{@score.value}}');
    expect(mocks.useValue).toHaveBeenCalledWith(input, {
      stateKey: null,
      target: undefined,
      fallback: 'Score: {{@score.value}}',
    });
  });

  it('uses a resolved value when the parser declares a value source', () => {
    mocks.useValue.mockReturnValue({
      value: 'Resolved', status: 'ready', loading: false, error: null, ready: true,
    });

    const { result } = renderHook(() => useText(props({
      loBlock: { textContent: { source: 'value' } },
    })));

    expect(result.current.text).toBe('Resolved');
  });

  it('passes target and inline text as the fallback contract', () => {
    const input = props({
      target: 'other',
      kids: 'Local fallback',
      loBlock: { textContent: { source: 'value' } },
    });
    renderHook(() => useText(input));

    expect(mocks.useValue).toHaveBeenCalledWith(input, {
      stateKey: undefined,
      target: 'other',
      fallback: 'Local fallback',
    });
  });

  it('passes through loading state', () => {
    mocks.useValue.mockReturnValue({
      value: 'Local fallback', status: 'loading', loading: true, error: null, ready: false,
    });

    const { result } = renderHook(() => useText(props({
      loBlock: { textContent: { source: 'value' } },
    })));

    expect(result.current).toMatchObject({ text: 'Local fallback', status: 'loading', loading: true });
  });

  it('uses the value fallback when its target fails to load', () => {
    mocks.useValue.mockReturnValue({
      value: 'Local fallback',
      status: 'error',
      loading: false,
      error: 'Target not found',
      ready: false,
    });

    const { result } = renderHook(() => useText(props({
      kids: 'Local fallback',
      loBlock: { textContent: { source: 'value' } },
    })));

    expect(result.current).toMatchObject({
      text: 'Local fallback', status: 'ready', loading: false, error: null, ready: true,
    });
  });

  it('preserves an intentionally empty resolved value', () => {
    mocks.useValue.mockReturnValue({
      value: '', status: 'ready', loading: false, error: null, ready: true,
    });

    const { result } = renderHook(() => useText(props({
      kids: 'Must not reappear',
      loBlock: { textContent: { source: 'value' } },
    })));

    expect(result.current.text).toBe('');
  });

  it('can change source policy without changing hook order', () => {
    const { result, rerender } = renderHook(
      ({ input }) => useText(input),
      { initialProps: { input: props() } },
    );
    expect(result.current.text).toBe('Score: {{@score.value}}');

    mocks.useValue.mockReturnValue({
      value: 'Resolved', status: 'ready', loading: false, error: null, ready: true,
    });
    rerender({ input: props({ loBlock: { textContent: { source: 'value' } } }) });
    expect(result.current.text).toBe('Resolved');
  });
});

describe('useInterpolation', () => {
  beforeEach(() => {
    mocks.useReferences.mockReset();
    mocks.useReferences.mockReturnValue(context);
  });

  it('keeps template-like text literal by default', () => {
    const input = props();
    const { result } = renderHook(() =>
      useInterpolation(input, 'Score: {{@score.value}}')
    );

    expect(result.current).toBe('Score: {{@score.value}}');
    expect(mocks.useReferences).toHaveBeenCalledWith(
      input,
      { componentState: [], olxContent: [], globalVar: [] },
    );
  });

  it('evaluates an explicitly selected state template', () => {
    const { result } = renderHook(() =>
      useInterpolation(props({ template: 'state' }), 'Score: {{@score.value}}')
    );

    expect(result.current).toBe('Score: 7');
  });

  it('honors a parser-declared compatibility default', () => {
    const { result } = renderHook(() => useInterpolation(props({
      loBlock: { textContent: { source: 'kids', defaultTemplateMode: 'state' } },
    }), 'Score: {{@score.value}}'));

    expect(result.current).toBe('Score: 7');
  });

  it('lets an authored mode override the compatibility default', () => {
    const { result } = renderHook(() => useInterpolation(props({
      template: 'none',
      loBlock: { textContent: { source: 'kids', defaultTemplateMode: 'state' } },
    }), 'Score: {{@score.value}}'));

    expect(result.current).toBe('Score: {{@score.value}}');
  });

  it('can change template mode without changing hook order', () => {
    const { result, rerender } = renderHook(
      ({ input }) => useInterpolation(input, 'Score: {{@score.value}}'),
      { initialProps: { input: props() } },
    );
    expect(result.current).toBe('Score: {{@score.value}}');

    rerender({ input: props({ template: 'state' }) });
    expect(result.current).toBe('Score: 7');

    rerender({ input: props({ template: 'none' }) });
    expect(result.current).toBe('Score: {{@score.value}}');
  });
});

describe('useTextWithTemplate', () => {
  it('composes source resolution and interpolation', () => {
    mocks.useValue.mockReturnValue({
      value: 'Resolved: {{@score.value}}',
      status: 'ready', loading: false, error: null, ready: true,
    });
    mocks.useReferences.mockReturnValue(context);

    const { result } = renderHook(() => useTextWithTemplate(props({
      template: 'state',
      loBlock: { textContent: { source: 'value', defaultTemplateMode: 'none' } },
    })));

    expect(result.current).toMatchObject({ text: 'Resolved: 7', status: 'ready' });
  });
});
