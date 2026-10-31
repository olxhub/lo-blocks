// packages/shared/components/blocks/input/Sortable/_SortableInput.test.tsx
// @vitest-environment jsdom

import React from 'react';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RuntimeProps } from '@/lib/types';

// Every field write is a logged event, so the test counts setter calls.
const mocks = vi.hoisted(() => ({
  writes: [] as [string, unknown][],
}));

vi.mock('@/lib/state', async () => {
  const { useState } = await import('react');
  return {
    useFieldState: (_props, field: { name: string }, fallback) => {
      const [value, setValue] = useState(fallback);
      const write = (next) => {
        mocks.writes.push([field.name, next]);
        setValue(next);
      };
      return [value, write];
    },
  };
});

vi.mock('@/lib/player/client/render', () => ({
  useKids: ({ kids }) => ({ kids: kids.map((kid) => kid.definitionKey) }),
}));

vi.mock('@/lib/player/client/useOlxJson', () => ({
  useOlxJsonMultiple: (_props, keys: string[]) => ({
    olxJsons: keys.map((id) => ({ id, attributes: {} })),
  }),
}));

vi.mock('@/lib/player/inputInteraction', () => ({
  useInputReadOnly: () => false,
}));

vi.mock('@/lib/player/useGraderAnswer', () => ({
  useGraderAnswer: () => ({ showAnswer: false }),
}));

import SortableInput from './_SortableInput';

const props = {
  id: 'sortable',
  kids: ['a', 'b', 'c'].map((definitionKey) => ({ type: 'block', definitionKey })),
  fields: {
    arrangement: { name: 'arrangement' },
    draggedItem: { name: 'draggedItem' },
    dragOverIndex: { name: 'dragOverIndex' },
  },
  shuffle: false,
  runtime: {},
} as unknown as RuntimeProps;

const dataTransfer = { setData: () => {}, effectAllowed: '' };

function writesTo(fieldName: string) {
  return mocks.writes.filter(([name]) => name === fieldName).map(([, value]) => value);
}

function renderSortable() {
  const view = render(<SortableInput {...props} />);
  const items = Array.from(view.container.querySelectorAll('.sortable-item'));
  expect(items).toHaveLength(3);
  return items;
}

describe('SortableInput drag state', () => {
  afterEach(() => {
    cleanup();
    mocks.writes.length = 0;
  });

  it('writes dragOverIndex once per slot, not once per dragover event', () => {
    const items = renderSortable();

    fireEvent.dragStart(items[0], { dataTransfer });
    fireEvent.dragOver(items[1]);
    fireEvent.dragOver(items[1]);
    fireEvent.dragOver(items[1]);
    expect(writesTo('dragOverIndex')).toEqual([1]);

    fireEvent.dragOver(items[2]);
    fireEvent.dragOver(items[2]);
    expect(writesTo('dragOverIndex')).toEqual([1, 2]);

    fireEvent.dragOver(items[1]);
    expect(writesTo('dragOverIndex')).toEqual([1, 2, 1]);
  });

  it('writes several dragover events in one tick, before a re-render, only once', () => {
    const items = renderSortable();

    fireEvent.dragStart(items[0], { dataTransfer });
    act(() => {
      fireEvent.dragOver(items[1]);
      fireEvent.dragOver(items[1]);
      fireEvent.dragOver(items[1]);
    });
    expect(writesTo('dragOverIndex')).toEqual([1]);
  });

  it('does not write null over a drag state that is already null', () => {
    const items = renderSortable();

    // Leaving and ending with no drag in progress changes nothing.
    fireEvent.dragLeave(items[1]);
    fireEvent.dragEnd(items[0]);
    expect(writesTo('dragOverIndex')).toEqual([]);
    expect(writesTo('draggedItem')).toEqual([]);

    // A drop is followed at once by dragend; the reset is written once.
    fireEvent.dragStart(items[0], { dataTransfer });
    fireEvent.dragOver(items[2]);
    act(() => {
      fireEvent.drop(items[2]);
      fireEvent.dragEnd(items[0]);
    });
    expect(writesTo('draggedItem')).toEqual([0, null]);
    expect(writesTo('dragOverIndex')).toEqual([2, null]);
    expect(writesTo('arrangement').at(-1)).toEqual([1, 2, 0]);
  });
});
