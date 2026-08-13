// packages/shared/lib/player/client/Use.integration.test.tsx
// @vitest-environment jsdom

import React from 'react';
import { Provider } from 'react-redux';
import { cleanup, render as renderReact } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';
import { baseAttributes } from '@/lib/blocks/attributeSchemas';
import { dispatchOlxJsonSync } from '@/lib/state/olxjson';
import { store } from '@/lib/state/store';
import { mockRuntime } from '@/lib/test-utils';
import type { DefinitionKey, IdMap, IdPrefix, StateKey } from '@/lib/types';
import { asDefinitionKey, asIdPrefix, asStateKey, scopedStateKeyForBlock } from '@/lib/types/id-grammar';
import { toMemoryRef } from '@/lib/types/storage';
import { makeRootNode, renderCompiledKids } from './render';

function StateKeyProbe(props: any) {
  return <span data-testid="state-key">{scopedStateKeyForBlock(props)}</span>;
}

const probeBlock = {
  name: 'StateKeyProbe',
  component: StateKeyProbe,
  attributes: baseAttributes,
  reducers: [],
  fields: {},
  locals: {},
  isGrader: false,
  isInput: false,
  isMatch: false,
  _isBlock: true,
} as any;

function probeEntry(id: DefinitionKey) {
  return {
    id,
    tag: 'StateKeyProbe',
    attributes: {},
    kids: [],
    source: toMemoryRef('use-state-ref.olx'),
    parseDeps: [],
  } as any;
}

function renderReferences(entries: [DefinitionKey, StateKey][], surroundingIdPrefix?: IdPrefix) {
  const blockRegistry = { StateKeyProbe: probeBlock } as any;
  const reduxStore = store.init({ blockRegistry, websocket: false });
  const idMap: IdMap = {};
  for (const [definitionKey] of entries) {
    idMap[definitionKey] = { '*': probeEntry(definitionKey) } as any;
  }
  dispatchOlxJsonSync(reduxStore, 'content', idMap);

  const runtime = mockRuntime({
    blockRegistry,
    store: reduxStore,
    olxJsonSources: ['content'],
    ...(surroundingIdPrefix ? { idPrefix: surroundingIdPrefix } : {}),
  });
  const nodeInfo = makeRootNode(runtime);
  const kids = entries.map(([id, stateKey]) => ({ type: 'block', id, stateKey }));
  const elements = renderCompiledKids({ kids, nodeInfo, runtime });
  const result = renderReact(<Provider store={reduxStore}>{elements}</Provider>);
  return { ...result, nodeInfo };
}

afterEach(cleanup);

describe('<Use> state identity', () => {
  test.each([
    ['bare', asDefinitionKey('CONTENT/answer'), asStateKey('CONTENT/answer')],
    ['scoped', asDefinitionKey('CONTENT/answer'), asStateKey('CONTENT/list:#3:answer')],
    ['namespace-qualified', asDefinitionKey('calculus/answer'), asStateKey('calculus/list:#3:answer')],
  ])('%s reference renders the leaf definition with the referenced StateKey', (_label, id, stateKey) => {
    const { getByTestId, nodeInfo } = renderReferences([[id, stateKey]]);

    expect(getByTestId('state-key').textContent).toBe(stateKey);
    expect(Object.keys(nodeInfo.renderedKids)).toEqual([stateKey]);
    expect(nodeInfo.renderedKids[stateKey].olxJson.id).toBe(id);
  });

  test('repeated references render twice while sharing one state instance', () => {
    const id = asDefinitionKey('CONTENT/answer');
    const stateKey = asStateKey('CONTENT/list:#3:answer');
    const { getAllByTestId, nodeInfo } = renderReferences([[id, stateKey], [id, stateKey]]);

    expect(getAllByTestId('state-key')).toHaveLength(2);
    expect(Object.keys(nodeInfo.renderedKids)).toEqual([stateKey]);
  });

  test('a bare StateRef selects global state rather than inheriting the surrounding scope', () => {
    const id = asDefinitionKey('CONTENT/answer');
    const stateKey = asStateKey('CONTENT/answer');
    const { getByTestId } = renderReferences([[id, stateKey]], asIdPrefix('outer:#2'));

    expect(getByTestId('state-key').textContent).toBe('CONTENT/answer');
  });
});
