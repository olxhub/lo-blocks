// @vitest-environment jsdom
//
// The chat transcript must only ever scroll ITSELF. Element.scrollIntoView()
// scrolls every scrollable ancestor, including the page, which yanks the whole
// layout out from under the reader — the same class of bug as the
// visually-hidden ChoiceInput input (see choiceinput.css.test.ts).

import React from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/components/common/RenderMarkdown', () => ({
  default: ({ children }: any) => <span>{children}</span>,
}));

import { ChatComponent } from './ChatComponent';

const messages = [0, 1, 2, 3].map(i => ({
  type: 'SystemMessage' as const,
  text: `msg ${i}`,
}));

describe('ChatComponent scrolling', () => {
  afterEach(cleanup);

  it('never calls scrollIntoView, for any initialScrollPosition', () => {
    const spy = vi.fn();
    Element.prototype.scrollIntoView = spy;
    Element.prototype.scrollTo = vi.fn();

    for (const pos of ['bottom', 'top', 0, 2] as const) {
      render(
        <ChatComponent
          id="chat"
          messages={messages}
          ns={'test' as any}
          initialScrollPosition={pos}
        />
      );
      cleanup();
    }

    expect(spy).not.toHaveBeenCalled();
  });

  it('scrolls only its own container when new messages arrive', () => {
    const scrollTo = vi.fn();
    Element.prototype.scrollIntoView = vi.fn();
    Element.prototype.scrollTo = scrollTo;

    const view = render(
      <ChatComponent id="chat" messages={messages.slice(0, 2)} ns={'test' as any} />
    );
    scrollTo.mockClear();
    view.rerender(
      <ChatComponent id="chat" messages={messages} ns={'test' as any} />
    );

    expect(scrollTo).toHaveBeenCalled();
    // `this` is the transcript div, not window/documentElement.
    const target = scrollTo.mock.instances[0] as Element;
    expect(target).toBeInstanceOf(HTMLDivElement);
    expect(target).not.toBe(document.documentElement);
  });
});
