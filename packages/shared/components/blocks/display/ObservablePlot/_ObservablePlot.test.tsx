// @vitest-environment jsdom

import React from 'react';
import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RuntimeProps } from '@/lib/types';

declare global {
  var __observablePlotTestExecuted: boolean | undefined;
}

const mocks = vi.hoisted(() => ({
  useTextWithTemplate: vi.fn(),
}));

vi.mock('@/lib/player/client/useText', () => ({
  useTextWithTemplate: mocks.useTextWithTemplate,
}));

import ObservablePlot from './_ObservablePlot';

const javascript = `
  globalThis.__observablePlotTestExecuted = true;
  return document.createElement('div');
`;

function textResult(status: 'loading' | 'ready') {
  return {
    text: javascript,
    status,
    loading: status === 'loading',
    ready: status === 'ready',
    error: null,
  };
}

describe('ObservablePlot source loading', () => {
  afterEach(() => {
    delete globalThis.__observablePlotTestExecuted;
    mocks.useTextWithTemplate.mockReset();
  });

  it('does not evaluate a JavaScript fallback while its target is loading', () => {
    mocks.useTextWithTemplate.mockReturnValue(textResult('loading'));

    render(<ObservablePlot {...({ format: 'js' } as RuntimeProps)} />);

    expect(globalThis.__observablePlotTestExecuted).toBeUndefined();
  });

  it('evaluates JavaScript after its source is ready', () => {
    mocks.useTextWithTemplate.mockReturnValue(textResult('ready'));

    render(<ObservablePlot {...({ format: 'js' } as RuntimeProps)} />);

    expect(globalThis.__observablePlotTestExecuted).toBe(true);
  });
});
