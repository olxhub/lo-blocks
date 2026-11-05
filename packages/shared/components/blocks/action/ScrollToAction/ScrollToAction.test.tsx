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

  it('scrolls the visible target with the requested alignment', () => {
    const view = render(<div data-block-id="docs.ScrollToAction/destination" />);
    const target = view.container.firstElementChild as HTMLElement;
    makeVisible(target);

    scrollToAction({ props: { target: 'destination', block: 'center', runtime } });

    expect(scrollIntoView).toHaveBeenCalledOnce();
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' });
    expect(scrollIntoView.mock.instances[0]).toBe(target);
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

  it('warns and does not throw when the target is missing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    expect(() => scrollToAction({ props: { target: 'missing', runtime } })).not.toThrow();

    expect(warn).toHaveBeenCalledWith('ScrollToAction: Target "missing" not found in visible DOM');
    expect(scrollIntoView).not.toHaveBeenCalled();
  });
});
