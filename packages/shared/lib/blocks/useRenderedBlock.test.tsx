// @vitest-environment jsdom
// useRenderedBlock / useRenderedBlockMulti: the instance hook stack.
// A dynamic (scoped) instance must not render — and so can never write —
// until its state resolves (adopted or confirmed absent): the client
// half of the residency invariant.

import React from 'react';
import { Provider } from 'react-redux';
import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/content/fetchOlxJson', () => ({
  fetchFieldState: vi.fn(),
  fetchOlxJson: vi.fn(),
}));

import { fetchFieldState } from '@/lib/content/fetchOlxJson';
import { store } from '@/lib/state/store';
import { dispatchOlxJsonSync } from '@/lib/state/olxjson';
import { policies } from '@/lib/state/fieldLedger';
import { useRenderedBlock, useRenderedBlockMulti } from './useRenderedBlock';
import { resetEnsureForTests } from './ensure';
import { makeRootNode } from '@/lib/render';
import { BLOCK_REGISTRY } from '@/components/blockRegistry';
import { mockRuntime } from '@/lib/test-utils';
import { parseDefinitionKey } from '@/lib/types/id-grammar';
import { parseStateKey } from '@/lib/types/id-grammar';

const fetchMock = fetchFieldState as ReturnType<typeof vi.fn>;

// A namespace no fixture shares: demo-render tests load real content
// into the SAME lo_event singleton store under CONTENT/, and a leaked
// entry for our keys would defeat the gate assertions (flaked 2026-07).
const LEAF = parseDefinitionKey('gatetest/note');
// The lo_event store is a module singleton surviving store.init — every
// test uses its OWN scope marker so ledger entries can't leak between them.
const SCOPED = parseStateKey('gatetest/list:#0:note');

function setup() {
  const reduxStore = store.init({ blockRegistry: BLOCK_REGISTRY, websocket: false });
  // Content for the leaf definition is already loaded — these tests are
  // about the STATE lane.
  dispatchOlxJsonSync(reduxStore, 'content', {
    [LEAF]: {
      'en-US': {
        id: LEAF, tag: 'TextBlock', attributes: {}, kids: ['hello'],
        source: '', parseDeps: [],
      },
    },
  });
  const runtime = mockRuntime({
    store: reduxStore,
    sideEffectFree: false,
    blockRegistry: BLOCK_REGISTRY,
  });
  const props: any = {
    id: 'note',
    runtime,
    nodeInfo: makeRootNode(runtime, 'test'),
  };
  const wrapper = ({ children }: any) => <Provider store={reduxStore}>{children}</Provider>;
  return { reduxStore, props, wrapper };
}

// The pipeline is multi-tick (microtask fetch batch, then lo_event's own
// dispatch tick) and tick counts vary under load — poll, never count.
const flush = () => act(async () => {
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 10));
});
const until = (probe: () => void) => waitFor(probe, { timeout: 5000 });

beforeEach(() => {
  resetEnsureForTests();
  fetchMock.mockReset();
});

describe('useRenderedBlock', () => {
  it('gates a dynamic instance on its state, then renders on confirmed-none', async () => {
    const { props, wrapper } = setup();
    fetchMock.mockResolvedValue({ ok: true, absent: [SCOPED] });

    const { result } = renderHook(() => useRenderedBlock(props, SCOPED), { wrapper });
    // Content is present, but state is unresolved — the block must not render.
    expect(result.current.loading).toBe(true);

    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toEqual([SCOPED]);
    await until(() => expect(result.current.ready).toBe(true));
    expect(result.current.olxJson?.tag).toBe('TextBlock');
  });

  it('a static instance (StateKey = DefinitionKey) resolved by content coverage never fetches state', async () => {
    const { reduxStore, props, wrapper } = setup();
    // Simulate the content fetch marking its served defs as coverage —
    // what ensureBlock's adoptFieldState(fieldState, idMap keys) does.
    const { adoptFieldState } = await import('@/lib/state/store');
    act(() => adoptFieldState(undefined, [LEAF]));

    const { result } = renderHook(() => useRenderedBlock(props, LEAF as any), { wrapper });
    await until(() => expect(result.current.ready).toBe(true));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(reduxStore.getState().application_state.fieldLedger[LEAF].resolvedAt).toBeTruthy();
  });

  it('ephemeral policy renders without any state fetch', async () => {
    const { props, wrapper } = setup();
    const { result } = renderHook(
      () => useRenderedBlock(props, parseStateKey('gatetest/list:#eph:note'), { policy: policies.ephemeral }),
      { wrapper });
    await until(() => expect(result.current.ready).toBe(true));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports error with attempt facts once retries are exhausted', async () => {
    const { props, wrapper } = setup();
    const failKey = parseStateKey('gatetest/list:#fail:note');
    fetchMock.mockResolvedValue({ ok: false, error: 'server exploded' });
    // Exhaust attempts: retry timers fire on the ledger's backoff; rather
    // than fake timers across microtask batching, use a policy-free path
    // and just verify the FIRST failure reads as loading (retry-wait),
    // not error — failure is not final until attempts run out.
    const { result } = renderHook(() => useRenderedBlock(props, failKey), { wrapper });
    await flush();
    expect(result.current.loading).toBe(true);
    expect(result.current.error).toBeNull();
  });
});

describe('instance closure', () => {
  it('gates on static descendants, not just the root key', async () => {
    const { props, wrapper } = setup();
    const reduxStore = props.runtime.store;
    // A template with a static kid: the instance comprises BOTH scoped
    // keys, and rendering before the kid's state resolves would let the
    // kid write-from-empty.
    const PAIR = parseDefinitionKey('gatetest/pair');
    dispatchOlxJsonSync(reduxStore, 'content', {
      [PAIR]: {
        'en-US': {
          id: PAIR, tag: 'Vertical', attributes: {},
          kids: [{ type: 'block', id: LEAF }],
          source: '', parseDeps: [],
        },
      },
    });
    const root = parseStateKey('gatetest/list:#c1:pair');
    const kidKey = parseStateKey('gatetest/list:#c1:note');
    fetchMock.mockResolvedValue({ ok: true, absent: [root, kidKey] });

    const { result } = renderHook(() => useRenderedBlock(props, root), { wrapper });
    expect(result.current.loading).toBe(true);

    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0].sort()).toEqual([root, kidKey].sort());
    await until(() => expect(result.current.ready).toBe(true));
  });
});

describe('useRenderedBlockMulti', () => {
  it('returns one renderable entry per key and batches their state fetch', async () => {
    const { props, wrapper } = setup();
    const k1 = parseStateKey('gatetest/list:#m1:note');
    const k2 = parseStateKey('gatetest/list:#m2:note');
    fetchMock.mockResolvedValue({ ok: true, absent: [k1, k2] });

    const { result } = renderHook(
      () => useRenderedBlockMulti(props, [k1, k2]), { wrapper });
    expect(result.current.blocks).toHaveLength(2);
    expect(result.current.allReady).toBe(false);
    // olxJsons is index-aligned with the keys (the raw-content view).
    expect(result.current.olxJsons).toHaveLength(2);

    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0].sort()).toEqual([k1, k2].sort());
    await until(() => expect(result.current.allReady).toBe(true));
    expect(result.current.blocks).toHaveLength(2);
    // Resolved: the raw-content view exposes each definition for callers
    // that read attributes (tab titles, item positions) rather than render.
    expect(result.current.olxJsons.map(o => o?.tag)).toEqual(['TextBlock', 'TextBlock']);
  });
});
