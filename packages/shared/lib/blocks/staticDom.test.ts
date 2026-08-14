import { expect, it } from 'vitest';
import { mockRuntime, TEST_NS, testKey } from '@/lib/test-utils';
import { asStateKey } from '@/lib/types/id-grammar';
import type { RuntimeProps } from '@/lib/types';
import { inferKids } from './staticDom';

it('rejects scoped Use refs instead of discarding their runtime identity', () => {
  const input = {
    id: testKey('answer'),
    tag: 'InputProbe',
    attributes: {},
    kids: [],
  };
  const content = {
    [input.id]: {
      olxJson: { '*': input },
      loadingState: { status: 'ready' },
    },
  };
  const state = { application_state: { olxjson: { content } } };
  const props = {
    runtime: mockRuntime({
      blockRegistry: { InputProbe: { isInput: true } } as any,
      olxJsonSources: ['content'],
    }),
  } as RuntimeProps;
  const kids = [{
    type: 'block',
    definitionKey: input.id,
    stateKey: asStateKey(`${TEST_NS}/bank:#0:answer`),
  }];

  expect(() => inferKids(state, props, kids, { selector: block => block.isInput }))
    .toThrow(/Static DOM inference cannot traverse <Use> of scoped state/);
});
