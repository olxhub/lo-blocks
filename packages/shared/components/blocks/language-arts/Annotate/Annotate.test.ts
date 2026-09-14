// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { docSpliceUpdate } from '@/lib/crdt/docText';
import { LO_FIELD_STRATEGY } from '@/lib/state';
import { mockRuntime } from '@/lib/test-utils';
import { extendIdPrefix, scopeMarker, scopedStateKeyForBlock } from '@/lib/types/id-grammar';
import Annotate, { fields, readAnnotations } from './Annotate';

const storedText = (text: string) => LO_FIELD_STRATEGY === 'crdt'
  ? docSpliceUpdate(undefined, { index: 0, deleteCount: 0, inserted: text }, 1)
  : text;

describe('Annotate value getter', () => {
  it('returns active annotations ordered by source position', () => {
    const props = {
      id: 'annotate_test',
      loBlock: Annotate,
      runtime: mockRuntime(),
    } as any;
    const component: Record<string, any> = {
      [String(scopedStateKeyForBlock(props))]: {
        notes: LO_FIELD_STRATEGY === 'crdt'
          ? { later: { ts: 1, actor: 'test' }, earlier: { ts: 1, actor: 'test' } }
          : ['later', 'earlier'],
      },
    };
    const addAnnotation = (
      id: string, quote: string, start: string, end: string, text: string,
    ) => {
      const { idPrefix } = extendIdPrefix(props, [props.id, scopeMarker(id)]);
      const key = scopedStateKeyForBlock({ ...props, idPrefix });
      component[String(key)] = { quote, start, end, text: storedText(text) };
    };
    addAnnotation('later', 'second quote', '20', '32', 'second note');
    addAnnotation('earlier', 'first quote', '3', '14', 'first note');

    expect(readAnnotations({ application_state: { component } }, props)).toEqual({
      annotations: [
        { id: 'earlier', quote: 'first quote', start: 3, end: 14, text: 'first note' },
        { id: 'later', quote: 'second quote', start: 20, end: 32, text: 'second note' },
      ],
    });
  });

  it('reserves value for the composite getter', () => {
    expect(fields.value).toBeUndefined();
    expect(fields.text.kind).toBe('doc');
    expect(Annotate.selectors?.value).toBeDefined();
  });
});
