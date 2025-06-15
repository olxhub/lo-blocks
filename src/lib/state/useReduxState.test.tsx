import React from 'react';
import { Provider } from 'react-redux';
import { renderHook, act } from '@testing-library/react';

import { fields, useReduxState } from './redux';
import { store } from './store';

const testFields = fields(['input']);

describe('useReduxState integration', () => {
  it('reads, writes, and re-reads the same Redux slice', async () => {
    const reduxStore = store.init();
    const wrapper = ({ children }: any) => (
      <Provider store={reduxStore}>{children}</Provider>
    );

    const { result } = renderHook(
      () => useReduxState({ id: 'test' }, testFields.fieldInfoByField.input, 'bob'),
      { wrapper }
    );

    expect(result.current[0]).toBe('bob'); // current[0] is input

    act(() => {
      result.current[1]('bar');  // current[1] is setInput
    });

    await new Promise(r => setTimeout(r, 0));

    expect(result.current[0]).toBe('bar');
    const state = reduxStore.getState();
    expect(state.application_state.component_state['test'].input).toBe('bar');
  });
});
