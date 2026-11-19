import { afterEach, expect, test, vi } from 'vitest';

import { updateResponseReducer } from '@/lib/state/store';
import { LOAD_OLXJSON, OLXJSON_LOADING, selectBlock } from '@/lib/state/olxjson';
import { mockRuntime, TEST_NS, testKey } from '@/lib/test-utils';
import type { BaselineProps, DefinitionRef, UserLocale } from '@/lib/types';
import { ensureBlock, selectOlxJson, selectOlxJsonMultiple } from './useOlxJson';

const LOCALE = 'en-Latn-US' as UserLocale;
const blocksFor = (id: string) => ({ [id]: { [LOCALE]: { id, tag: 'Html' } } });

afterEach(() => vi.unstubAllGlobals());

function harness() {
  let app: any = { olxjson: {} };
  const logEvent = (event: string, payload: any) => {
    app = updateResponseReducer(app, { event, ...payload });
  };
  const props: BaselineProps = {
    runtime: mockRuntime({
      sideEffectFree: false,
      ns: TEST_NS,
      store: { getState: () => ({ application_state: app }) } as any,
      logEvent,
      locale: { code: LOCALE, dir: 'ltr' },
    }),
  };
  return {
    props,
    state: () => ({ application_state: app }),
    entry: (id: string) => app.olxjson.content?.[id],
    fold: (event: string, payload: any) => logEvent(event, payload),
  };
}

test('a loading event does not shadow loaded content', () => {
  const id = testKey('loaded_block');
  const h = harness();
  h.fold(LOAD_OLXJSON, { source: 'content', blocks: blocksFor(id) });
  h.fold(OLXJSON_LOADING, { source: 'content', id });

  expect(h.entry(id).loadingState.status).toBe('ready');
  expect(h.entry(id).olxJson[LOCALE].tag).toBe('Html');
});

test('selectors read content accompanied by a stale loading marker', () => {
  const id = testKey('legacy_block');
  const h = harness();
  const state = {
    application_state: {
      olxjson: {
        content: {
          [id]: { olxJson: blocksFor(id)[id], loadingState: { status: 'loading' } },
        },
      },
    },
  } as any;

  expect(selectOlxJson(state, h.props, id as DefinitionRef).status).toBe('ready');
  expect(selectOlxJsonMultiple(state, h.props, [id as DefinitionRef]).allReady).toBe(true);
  expect(selectBlock(state, ['content'], id, LOCALE)?.tag).toBe('Html');
});

test('a response which omits the requested block clears its loading state', async () => {
  const id = testKey('omitted_block');
  const h = harness();
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ ok: true, idMap: {} }),
  })));

  ensureBlock(h.props, id as DefinitionRef);

  await vi.waitFor(() => expect(h.entry(id).loadingState.status).toBe('error'));
  expect(h.entry(id).error.message).toContain('did not contain');
});
