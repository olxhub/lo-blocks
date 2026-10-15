// @vitest-environment jsdom
import React from 'react';
import { Provider } from 'react-redux';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { BLOCK_REGISTRY } from '@/components/blockRegistry';
import { fields } from '../../fields';
import { idField } from '../crdt/id';
import { store } from '../../store';
import { mockRuntime } from '@/lib/test-utils';
import { useNextId } from './useNextId';

const testFields = fields([idField('noteIds')]);

function setup() {
  const reduxStore = store.init({
    blockRegistry: BLOCK_REGISTRY,
    websocket: false,
    extraFields: testFields,
  });
  const props = {
    id: 'annotate_allocator_test',
    loBlock: { name: 'Annotate', fields: testFields },
    runtime: mockRuntime({ store: reduxStore }),
  } as any;
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <Provider store={reduxStore}>{children}</Provider>
  );
  return { props, wrapper };
}

describe('useNextId with a CRDT idField', () => {
  it('allocates distinct IDs across Redux renders', async () => {
    const { props, wrapper } = setup();
    const { result } = renderHook(
      () => useNextId(props, testFields.noteIds),
      { wrapper },
    );

    let first = '';
    act(() => { first = result.current(); });
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });

    let second = '';
    act(() => { second = result.current(); });

    expect(second).not.toBe(first);
  });

  it('allocates distinct IDs before Redux can re-render', () => {
    const { props, wrapper } = setup();
    const { result } = renderHook(
      () => useNextId(props, testFields.noteIds),
      { wrapper },
    );

    let ids: string[] = [];
    act(() => { ids = [result.current(), result.current()]; });

    expect(new Set(ids).size).toBe(2);
  });
});
