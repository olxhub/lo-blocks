// @vitest-environment jsdom
// packages/shared/lib/state/bindings/useInputField.test.tsx
//
// Who owns the caret.
//
// A focused input owns its own, from the DOM. The stored `selection` field
// is for restoring an input nobody is typing in. The two must not be
// confused, because `selection` is ordinary shared state — folded straight
// out of the extras envelope with no ordering guard — so a replayed event,
// an event relayed from this user's other tab, an adopted bucket riding a
// content fetch, or a fold landing a beat behind the keystrokes will each
// put an old number in it. Restoring from that under a typing learner is
// the caret jumping backwards.

import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, fireEvent, act } from '@testing-library/react';

// The binding subscribes to the store and dispatches through updateField.
// This suite is about the caret, so the store is a plain variable and the
// write path is stubbed and its payload inspected.
vi.mock('react-redux', () => ({
  useSelector: (selector: any) => selector({}),
  shallowEqual: (a: any, b: any) => a === b,
}));

const writes: any[] = [];
vi.mock('../redux', async () => {
  const actual = await vi.importActual<any>('../redux');
  return {
    ...actual,
    updateField: (...args: any[]) => { writes.push(args); },
    rawFieldSelector: (_state: any, _props: any, _field: any, o: any) => o?.fallback,
    decodeField: (_field: any, raw: any) => raw,
    useFieldSelector: () => stored,
  };
});

// The stored selection, as the reducer would hold it.
let stored: any = { field: undefined, start: 0, end: 0 };

import { useInputField } from './useInputField';

const FIELD = { type: 'field', kind: 'state', name: 'value', scope: 'component' } as any;

function Box({ value }: { value: string }) {
  const [, inputProps] = useInputField({ } as any, FIELD, value);
  return <textarea data-testid="box" {...(inputProps as any)} />;
}

/** The caret the browser actually has. */
const caretOf = (el: HTMLTextAreaElement) => [el.selectionStart, el.selectionEnd];

beforeEach(() => {
  writes.length = 0;
  stored = { field: undefined, start: 0, end: 0 };
});

describe('a focused input', () => {
  it('keeps the caret the learner has, not the one the store remembers', () => {
    const { getByTestId, rerender } = render(<Box value="hello" />);
    const box = getByTestId('box') as HTMLTextAreaElement;
    box.focus();

    // Type at the end.
    fireEvent.change(box, { target: { value: 'hello!', selectionStart: 6, selectionEnd: 6 } });

    // A stale selection lands — a relayed event, a replay, a late fold.
    act(() => { stored = { field: 'value', start: 1, end: 1 }; });
    rerender(<Box value="hello!" />);

    expect(caretOf(box)).toEqual([6, 6]);
  });

  it('carries the caret across an edit that arrives from elsewhere', () => {
    const { getByTestId, rerender } = render(<Box value="world" />);
    const box = getByTestId('box') as HTMLTextAreaElement;
    box.focus();

    fireEvent.change(box, { target: { value: 'world!', selectionStart: 6, selectionEnd: 6 } });

    // A peer inserts six characters ABOVE the caret.
    rerender(<Box value="hello world!" />);
    expect(caretOf(box)).toEqual([12, 12]);
  });

  it('leaves the caret alone when the edit arrives after it', () => {
    const { getByTestId, rerender } = render(<Box value="abc" />);
    const box = getByTestId('box') as HTMLTextAreaElement;
    box.focus();

    fireEvent.change(box, { target: { value: 'Xabc', selectionStart: 1, selectionEnd: 1 } });

    rerender(<Box value="Xabc, and more" />);   // appended after the caret
    expect(caretOf(box)).toEqual([1, 1]);
  });

  it('tracks a caret moved by clicking or arrowing, not only by typing', () => {
    const { getByTestId, rerender } = render(<Box value="hello world" />);
    const box = getByTestId('box') as HTMLTextAreaElement;
    box.focus();

    box.setSelectionRange(5, 5);
    fireEvent.select(box);

    rerender(<Box value="say hello world" />);  // a peer inserts before it
    expect(caretOf(box)).toEqual([9, 9]);
  });

  it('keeps a selected range', () => {
    const { getByTestId, rerender } = render(<Box value="pick me up" />);
    const box = getByTestId('box') as HTMLTextAreaElement;
    box.focus();

    box.setSelectionRange(5, 7);              // "me"
    fireEvent.select(box);

    rerender(<Box value="please pick me up" />);
    expect(caretOf(box)).toEqual([12, 14]);
  });
});

describe('an input nobody is typing in', () => {
  it('restores where this learner left off', () => {
    stored = { field: 'value', start: 3, end: 3 };
    const { getByTestId, rerender } = render(<Box value="restore me" />);
    const box = getByTestId('box') as HTMLTextAreaElement;

    rerender(<Box value="restore me" />);
    expect(caretOf(box)).toEqual([3, 3]);
  });

  it('ignores a selection belonging to another input in the bucket', () => {
    stored = { field: 'somethingElse', start: 4, end: 4 };
    const { getByTestId, rerender } = render(<Box value="not mine" />);
    const box = getByTestId('box') as HTMLTextAreaElement;
    box.setSelectionRange(0, 0);

    rerender(<Box value="not mine" />);
    expect(caretOf(box)).toEqual([0, 0]);
  });
});

describe('the write path', () => {
  it('still reports the caret so an unfocused input can be restored later', () => {
    const { getByTestId } = render(<Box value="hi" />);
    const box = getByTestId('box') as HTMLTextAreaElement;
    box.focus();
    fireEvent.change(box, { target: { value: 'hi!', selectionStart: 3, selectionEnd: 3 } });

    expect(writes).toHaveLength(1);
    expect(writes[0]![3].extras.selection).toMatchObject({ field: 'value', start: 3, end: 3 });
  });
});
