// @vitest-environment jsdom

import React from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
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
  });

  it('skips candidates that cannot receive focus', () => {
    const view = render(
      <div data-block-id="docs.FocusAction/editor">
        <input type="hidden" />
        <button disabled>Unavailable</button>
        <textarea />
      </div>,
    );
    const wrapper = view.container.firstElementChild as HTMLElement;
    makeVisible(wrapper);

    focusAction({ props: { target: 'editor', runtime } });

    expect(document.activeElement).toBe(view.container.querySelector('textarea'));
  });

  it('focuses a tabindex wrapper when it has no focusable descendant', () => {
    const view = render(<div data-block-id="docs.FocusAction/region" tabIndex={-1}>Summary</div>);
    const wrapper = view.container.firstElementChild as HTMLElement;
    makeVisible(wrapper);

    focusAction({ props: { target: 'region', runtime } });

    expect(document.activeElement).toBe(wrapper);
  });
});
