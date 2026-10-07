// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { flashAction } from './Flash';

function makeVisible(element: HTMLElement) {
  Object.defineProperty(element, 'offsetParent', {
    configurable: true,
    value: document.body,
  });
}

describe('Flash', () => {
  const runtime = { ns: 'docs.Flash' };

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('flashes the visible copy when a hidden duplicate is mounted first', () => {
    const view = render(<><div data-block-id="docs.Flash/reused" /><div data-block-id="docs.Flash/reused" /></>);
    const [hidden, visible] = Array.from(view.container.children) as HTMLElement[];
    makeVisible(visible);

    flashAction({ props: { target: 'reused', color: 'tomato', duration: '1s', runtime } });

    expect(hidden.classList.contains('lo-flash-active')).toBe(false);
    expect(visible.classList.contains('lo-flash-active')).toBe(true);
    expect(visible.style.getPropertyValue('--lo-flash-color')).toBe('tomato');
    expect(visible.style.getPropertyValue('--lo-flash-duration')).toBe('1s');

    fireEvent.animationEnd(visible);
    expect(visible.classList.contains('lo-flash-active')).toBe(false);
  });

  it('warns without throwing when no visible target exists', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    render(<div data-block-id="docs.Flash/hidden" />);

    expect(() => flashAction({ props: { target: 'hidden', runtime } })).not.toThrow();
    expect(warn).toHaveBeenCalledWith('[Flash] Target "hidden" not found in visible DOM');
  });
});
