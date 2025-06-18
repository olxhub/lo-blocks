import React from 'react';
import { Provider } from 'react-redux';
import { renderHook, act } from '@testing-library/react';

import { fields, useReduxState } from './redux';
import { scopes } from './scopes';
import { store } from './store';

const testFields = fields(['input']);
const settingFields = fields([{ name: 'speed', event: 'SET_SPEED', scope: scopes.componentSetting }]);
const systemFields = fields([{ name: 'lang', event: 'SET_LANG', scope: scopes.system }]);

// Baseline props with enough context for tests not to fail
const props = {
  id: 'sentinelId', blueprint: { OLXName: 'sentinelTag' }
};

// TODO: These should probably be streamlined into one `it` statement which
// tests all three end-to-end. This is a little bit verbose and hard-to-read.
describe('useReduxState integration', () => {
  it('reads, writes, and re-reads the same Redux slice', async () => {
    const reduxStore = store.init();
    const wrapper = ({ children }: any) => (
      <Provider store={reduxStore}>{children}</Provider>
    );

    const { result } = renderHook(
      () => useReduxState({ ...props, id: 'test' }, testFields.fieldInfoByField.input, 'bob'),
      { wrapper }
    );

    expect(result.current[0]).toBe('bob'); // current[0] is input

    act(() => {
      result.current[1]('bar');  // current[1] is setInput
    });

    await act(async () => {
      await new Promise(r => setTimeout(r, 0));
    });

    expect(result.current[0]).toBe('bar');
    const state = reduxStore.getState();
    expect(state.application_state.component_state['test'].input).toBe('bar');
  });


  it('handles componentSetting scoped fields', async () => {
    const reduxStore = store.init({ extraFields: settingFields });
    const wrapper = ({ children }: any) => (
      <Provider store={reduxStore}>{children}</Provider>
    );

    const { result } = renderHook(
      () =>
        useReduxState(
          { id: 'vid1', blueprint: { OLXName: 'video' } },
          settingFields.fieldInfoByField.speed,
          1
        ),
      { wrapper }
    );

    expect(result.current[0]).toBe(1);
    act(() => result.current[1](2));
    await act(async () => {
      await new Promise(r => setTimeout(r, 0));
    });
    expect(result.current[0]).toBe(2);
    const state = reduxStore.getState();
    expect(state.application_state.componentSetting_state.video.speed).toBe(2);
  });

  it('handles system scoped fields', async () => {
    const reduxStore = store.init({ extraFields: systemFields });
    const wrapper = ({ children }: any) => (
      <Provider store={reduxStore}>{children}</Provider>
    );

    const { result } = renderHook(
      () => useReduxState(props, systemFields.fieldInfoByField.lang, 'en'),
      { wrapper }
    );

    expect(result.current[0]).toBe('en');
    act(() => result.current[1]('fr'));
    await act(async () => {
      await new Promise(r => setTimeout(r, 0));
    });
    expect(result.current[0]).toBe('fr');
    const state = reduxStore.getState();
    expect(state.application_state.settings_state.lang).toBe('fr');
  });
});
