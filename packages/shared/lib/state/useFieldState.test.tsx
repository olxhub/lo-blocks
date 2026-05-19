import React from 'react';
import { Provider } from 'react-redux';
import { renderHook, act } from '@testing-library/react';

import * as lo_event from 'lo_event';

import { fields } from './fields';
import { useFieldState, useAggregate, updateField } from './redux';
import { scopes } from './scopes';
import { store } from './store';
import { BLOCK_REGISTRY } from '@/components/blockRegistry';
import { TEST_NS, testKey } from '@/lib/test-utils';

const testFields = fields(['input']);
const settingFields = fields([{ name: 'speed', event: 'SET_SPEED', scope: scopes.componentSetting }]);
const systemFields = fields([{ name: 'lang', event: 'SET_LANG', scope: scopes.system }]);
const storageFields = fields([{ name: 'content', event: 'SET_CONTENT', scope: scopes.storage }]);

// Minimal RuntimeProps-like object for tests.
// Includes runtime.logEvent (required by updateField) and block identity fields.
const props = {
  id: 'sentinelId',
  loBlock: { name: 'sentinelTag' },
  runtime: { logEvent: lo_event.logEvent },
};

// Test helpers — reduce boilerplate for Redux hook tests
function createWrapper(extraFields?) {
  const reduxStore = store.init({
    blockRegistry: BLOCK_REGISTRY,
    ...(extraFields ? { extraFields } : {}),
  });
  const wrapper = ({ children }: any) => (
    <Provider store={reduxStore}>{children}</Provider>
  );
  return { reduxStore, wrapper };
}

async function flushAsync() {
  await act(async () => { await new Promise(r => setTimeout(r, 0)); });
}

describe('useFieldState integration', () => {
  it('reads, writes, and re-reads component-scoped field', async () => {
    const { reduxStore, wrapper } = createWrapper();

    const { result } = renderHook(
      () => useFieldState({ ...props, id: 'test' }, testFields.input, 'bob'),
      { wrapper }
    );

    expect(result.current[0]).toBe('bob');
    act(() => result.current[1]('bar'));
    await flushAsync();

    expect(result.current[0]).toBe('bar');
    expect(reduxStore.getState().application_state.component[String(testKey('test'))].input).toBe('bar');
  });

  it('handles componentSetting scoped fields', async () => {
    const { reduxStore, wrapper } = createWrapper(settingFields);

    const { result } = renderHook(
      () => useFieldState(
        { id: 'vid1', loBlock: { name: 'video' }, runtime: { logEvent: lo_event.logEvent } },
        settingFields.speed, 1
      ),
      { wrapper }
    );

    expect(result.current[0]).toBe(1);
    act(() => result.current[1](2));
    await flushAsync();

    expect(result.current[0]).toBe(2);
    expect(reduxStore.getState().application_state.componentSetting.video.speed).toBe(2);
  });

  it('handles system scoped fields', async () => {
    const { reduxStore, wrapper } = createWrapper(systemFields);

    const { result } = renderHook(
      () => useFieldState(props, systemFields.lang, 'en'),
      { wrapper }
    );

    expect(result.current[0]).toBe('en');
    act(() => result.current[1]('fr'));
    await flushAsync();

    expect(result.current[0]).toBe('fr');
    expect(reduxStore.getState().application_state.system.lang).toBe('fr');
  });

  it('handles storage scoped fields', async () => {
    const { reduxStore, wrapper } = createWrapper(storageFields);

    const { result } = renderHook(
      () => useFieldState(null, storageFields.content, '', { stateKey: 'file1' as any }),
      { wrapper }
    );

    expect(result.current[0]).toBe('');
    act(() => result.current[1]('abc'));
    await flushAsync();

    expect(result.current[0]).toBe('abc');
    expect(reduxStore.getState().application_state.storage.file1.content).toBe('abc');
  });
});

describe('useAggregate aggregate hook', () => {
  it('returns values for multiple component IDs', async () => {
    const { wrapper } = createWrapper();

    await act(async () => {
      updateField(props, testFields.input, 'alpha', { stateKey: 'first' as any });
      updateField(props, testFields.input, 'beta', { stateKey: 'second' as any });
      await new Promise(r => setTimeout(r, 0));
    });

    const { result } = renderHook(
      () => useAggregate(props, testFields.input, ['first', 'second'], { fallback: '' }),
      { wrapper }
    );

    expect(result.current).toEqual(['alpha', 'beta']);
  });

  it('can return an object keyed by ID when requested', async () => {
    const { wrapper } = createWrapper();

    await act(async () => {
      updateField(props, testFields.input, 'alpha', { stateKey: 'first' as any });
      await new Promise(r => setTimeout(r, 0));
    });

    const { result } = renderHook(
      () => useAggregate(props, testFields.input, ['first', 'missing'], { fallback: 'fallback', aggregate: 'object' }),
      { wrapper }
    );

    expect(result.current).toEqual({ first: 'alpha', missing: 'fallback' });
  });

  it('supports custom aggregate functions', async () => {
    const { wrapper } = createWrapper();

    await act(async () => {
      updateField(props, testFields.input, 'hello', { stateKey: 'first' as any });
      updateField(props, testFields.input, 'world', { stateKey: 'second' as any });
      await new Promise(r => setTimeout(r, 0));
    });

    const { result } = renderHook(
      () => useAggregate(props, testFields.input, ['first', 'second'], {
        fallback: '',
        aggregate: (values) => values.join('-'),
      }),
      { wrapper }
    );

    expect(result.current).toEqual('hello-world');
  });
});
