// @vitest-environment jsdom

import React from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { focusAction } from './FocusAction';

function makeVisible(element: HTMLElement) {
  Object.defineProperty(element, 'offsetParent', {
    configurable: true,
    value: document.body,
  });
}

describe('FocusAction', () => {
  const runtime = { ns: 'docs.FocusAction' };

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('focuses the target block first focusable descendant', () => {
    const view = render(<div data-block-id="docs.FocusAction/editor"><span /><textarea /></div>);
    const wrapper = view.container.firstElementChild as HTMLElement;
    makeVisible(wrapper);

    focusAction({ props: { target: 'editor', runtime } });

    expect(document.activeElement).toBe(view.container.querySelector('textarea'));
  });

  it('skips hidden duplicate mounts and focuses within the visible copy', () => {
    const view = render(<><div data-block-id="docs.FocusAction/reused"><input /></div><div data-block-id="docs.FocusAction/reused"><button>Continue</button></div></>);
    const [, visible] = Array.from(view.container.children) as HTMLElement[];
    makeVisible(visible);

    focusAction({ props: { target: 'reused', runtime } });

    expect(document.activeElement).toBe(visible.querySelector('button'));
  });

  it('focuses a tabindex wrapper when it has no focusable descendant', () => {
    const view = render(<div data-block-id="docs.FocusAction/region" tabIndex={-1}>Summary</div>);
    const wrapper = view.container.firstElementChild as HTMLElement;
    makeVisible(wrapper);

    focusAction({ props: { target: 'region', runtime } });

    expect(document.activeElement).toBe(wrapper);
  });

  it('warns and does not throw when the target is missing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    expect(() => focusAction({ props: { target: 'missing', runtime } })).not.toThrow();

    expect(warn).toHaveBeenCalledWith('FocusAction: Target "missing" not found in visible DOM');
  });

  it('warns and does not throw when no element can receive focus', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const view = render(<div data-block-id="docs.FocusAction/plain"><span>Plain text</span></div>);
    makeVisible(view.container.firstElementChild as HTMLElement);

    expect(() => focusAction({ props: { target: 'plain', runtime } })).not.toThrow();

    expect(warn).toHaveBeenCalledWith('FocusAction: Target "plain" has no focusable element');
  });
});
