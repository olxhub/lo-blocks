// @vitest-environment jsdom

import React from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { scrollToAction } from './ScrollToAction';

function makeVisible(element: HTMLElement) {
  Object.defineProperty(element, 'offsetParent', {
    configurable: true,
    value: document.body,
  });
}

describe('ScrollToAction', () => {
  const scrollIntoView = vi.fn();
  const runtime = { ns: 'docs.ScrollToAction' };

  beforeEach(() => {
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    });
  });

  afterEach(() => {
    cleanup();
    scrollIntoView.mockReset();
    vi.restoreAllMocks();
  });

  it('skips hidden duplicate mounts and scrolls the visible copy', () => {
    const view = render(<><div data-block-id="docs.ScrollToAction/reused" /><div data-block-id="docs.ScrollToAction/reused" /></>);
    const [hidden, visible] = Array.from(view.container.children) as HTMLElement[];
    makeVisible(visible);

    scrollToAction({ props: { target: 'reused', runtime } });

    expect(scrollIntoView).toHaveBeenCalledOnce();
    expect(scrollIntoView.mock.instances[0]).toBe(visible);
    expect(scrollIntoView.mock.instances[0]).not.toBe(hidden);
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
  });
});
