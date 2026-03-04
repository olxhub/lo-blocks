import React from 'react';
import { Provider } from 'react-redux';
import { renderHook, act } from '@testing-library/react';

import * as lo_event from 'lo_event';

import { fields } from './fields';
import { useFieldState, useAggregate, updateField } from './redux';
import { scopes } from './scopes';
import { store } from './store';

const testFields = fields(['input']);
const settingFields = fields([{ name: 'speed', event: 'SET_SPEED', scope: scopes.componentSetting }]);
const systemFields = fields([{ name: 'lang', event: 'SET_LANG', scope: scopes.system }]);
const storageFields = fields([{ name: 'content', event: 'SET_CONTENT', scope: scopes.storage }]);

// Minimal RuntimeProps-like object for tests.
// Includes runtime.logEvent (required by updateField) and block identity fields.
const props = {
  id: 'sentinelId',
  loBlock: { OLXName: 'sentinelTag' },
  runtime: { logEvent: lo_event.logEvent },
};

// TODO: These should probably be streamlined into one `it` statement which
// tests all three end-to-end. This is a little bit verbose and hard-to-read.
describe('useFieldState integration', () => {
  it('reads, writes, and re-reads the same Redux slice', async () => {
    const reduxStore = store.init();
    const wrapper = ({ children }: any) => (
      <Provider store={reduxStore}>{children}</Provider>
    );

    const { result } = renderHook(
      () => useFieldState({ ...props, id: 'test' }, testFields.input, 'bob'),
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
    expect(state.application_state.component['test'].input).toBe('bar');
  });


  it('handles componentSetting scoped fields', async () => {
    const reduxStore = store.init({ extraFields: settingFields });
    const wrapper = ({ children }: any) => (
      <Provider store={reduxStore}>{children}</Provider>
    );

    const { result } = renderHook(
      () =>
        useFieldState(
          { id: 'vid1', loBlock: { OLXName: 'video' }, runtime: { logEvent: lo_event.logEvent } },
          settingFields.speed,
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
    expect(state.application_state.componentSetting.video.speed).toBe(2);
  });

  it('handles system scoped fields', async () => {
    const reduxStore = store.init({ extraFields: systemFields });
    const wrapper = ({ children }: any) => (
      <Provider store={reduxStore}>{children}</Provider>
    );

    const { result } = renderHook(
      () => useFieldState(props, systemFields.lang, 'en'),
      { wrapper }
    );

    expect(result.current[0]).toBe('en');
    act(() => result.current[1]('fr'));
    await act(async () => {
      await new Promise(r => setTimeout(r, 0));
    });
    expect(result.current[0]).toBe('fr');
    const state = reduxStore.getState();
    expect(state.application_state.system.lang).toBe('fr');
  });

  it('handles storage scoped fields', async () => {
    const reduxStore = store.init({ extraFields: storageFields });
    const wrapper = ({ children }: any) => (
      <Provider store={reduxStore}>{children}</Provider>
    );

    const { result } = renderHook(
      () => useFieldState(null, storageFields.content, '', { id: 'file1' }),
      { wrapper }
    );

    expect(result.current[0]).toBe('');
    act(() => result.current[1]('abc'));
    await act(async () => {
      await new Promise(r => setTimeout(r, 0));
    });
    expect(result.current[0]).toBe('abc');
    const state = reduxStore.getState();
    expect(state.application_state.storage.file1.content).toBe('abc');
  });
});

describe('useAggregate aggregate hook', () => {
  it('returns values for multiple component IDs', async () => {
    const reduxStore = store.init();
    const wrapper = ({ children }: any) => (
      <Provider store={reduxStore}>{children}</Provider>
    );

    await act(async () => {
      updateField(props, testFields.input, 'alpha', { id: 'first' });
      updateField(props, testFields.input, 'beta', { id: 'second' });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const ids = ['first', 'second'];
    const { result } = renderHook(
      () => useAggregate(props, testFields.input, ids, { fallback: '' }),
      { wrapper }
    );

    expect(result.current).toEqual(['alpha', 'beta']);
  });

  it('can return an object keyed by ID when requested', async () => {
    const reduxStore = store.init();
    const wrapper = ({ children }: any) => (
      <Provider store={reduxStore}>{children}</Provider>
    );

    await act(async () => {
      updateField(props, testFields.input, 'alpha', { id: 'first' });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const ids = ['first', 'missing'];
    const { result } = renderHook(
      () => useAggregate(props, testFields.input, ids, { fallback: 'fallback', aggregate: 'object' }),
      { wrapper }
    );

    expect(result.current).toEqual({ first: 'alpha', missing: 'fallback' });
  });

  it('supports custom aggregate functions', async () => {
    const reduxStore = store.init();
    const wrapper = ({ children }: any) => (
      <Provider store={reduxStore}>{children}</Provider>
    );

    await act(async () => {
      updateField(props, testFields.input, 'hello', { id: 'first' });
      updateField(props, testFields.input, 'world', { id: 'second' });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const ids = ['first', 'second'];
    const { result } = renderHook(
      () =>
        useAggregate(props, testFields.input, ids, {
          fallback: '',
          aggregate: (values) => values.join('-'),
        }),
      { wrapper }
    );

    expect(result.current).toEqual('hello-world');
  });
});