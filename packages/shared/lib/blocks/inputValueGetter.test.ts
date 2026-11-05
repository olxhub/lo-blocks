// @vitest-environment node
// packages/shared/lib/blocks/inputValueGetter.test.ts
//
// The factory's DEFAULT `selectors.value` for input blocks (factory.tsx) must
// decode through the BLOCK'S OWN `value` field, not through the plain LWW
// `commonFields.value`.
//
// The bug this pins: an input block whose value is a docField (Freewrite)
// stores a DocValue — `{ format, epoch, update }` — in Redux.
// commonFields.value is a plain stateField with no `read`, so decoding through
// it handed the block back its raw envelope. Level-3 reads are FINAL
// (useFieldSelector does not re-apply field.read to a getter result), so the
// component received an OBJECT where its own docField declares a string, and
// the first string method on it threw:
//
//     TypeError: value.trim is not a function      (_Freewrite countWords)
//
// Only reachable once something is actually stored — an empty field decodes to
// the '' fallback either way, which is why it survived to production.

import * as state from '@/lib/state';
import { fieldSelector, valueSelector, docField, LO_FIELD_STRATEGY } from '@/lib/state';
import { dev } from '@/lib/blocks';
import { docSpliceUpdate } from '@/lib/crdt/docText';
import { scopedStateKeyForBlock } from '@/lib/types/id-grammar';
import { mockRuntime } from '@/lib/test-utils';
import Freewrite, { fields as freewriteFields }
  from '@/components/blocks/language-arts/Freewrite/Freewrite';

/** A stored docField value holding `text`, as a learner's typing would leave
 *  it. Classic mode aliases docField to a bare stateField, so there the stored
 *  representation IS the string and the assertions below hold trivially — the
 *  bug is reachable only under the CRDT envelope. */
const storedDoc = (text: string) =>
  LO_FIELD_STRATEGY === 'crdt'
    ? docSpliceUpdate(undefined, { index: 0, deleteCount: 0, inserted: text }, 1)
    : text;

const propsFor = (block: any, id: string) => ({ id, loBlock: block, runtime: mockRuntime() });

const stateWith = (props: any, bucket: Record<string, unknown>) => ({
  application_state: { component: { [String(scopedStateKeyForBlock(props))]: bucket } },
});

describe('default input value getter', () => {
  it('decodes a docField-backed value to text (Freewrite regression)', () => {
    const props = propsFor(Freewrite, 'fw');
    const state = stateWith(props, { value: storedDoc('hello world') });

    const value = fieldSelector(state, props, freewriteFields.value, { fallback: '' });

    // The crash: countWords(value) did `value.trim()` on the DocValue envelope.
    expect(typeof value).toBe('string');
    expect(value).toBe('hello world');
    expect(() => (value as unknown as string).trim()).not.toThrow();
  });

  it('still yields the fallback for an unwritten field', () => {
    const props = propsFor(Freewrite, 'fw');
    expect(fieldSelector(stateWith(props, {}), props, freewriteFields.value, { fallback: '' }))
      .toBe('');
  });
});

// The same rule on the OTHER default value read: valueSelector's no-getter
// branch (state/blockValues.ts). Only non-input blocks reach it — the factory
// installs a value getter on every input block — so a docField-valued
// non-input block is the case that would regress silently. Every non-input
// block in the tree today declares commonFields.value, which is why this needs
// a purpose-built block to exercise at all.
const DocHolder = dev({
  name: 'DocHolder',
  description: 'Test-only: a non-input block whose value is a docField.',
  fields: state.fields([docField('value')]),
});

describe('valueSelector without a value getter', () => {
  const stateKey = 'CONTENT/holder' as any;
  const props = propsFor(DocHolder, 'holder');
  const resolved = { node: {} as any, loBlock: DocHolder, targetProps: props as any };
  const select = (bucket: Record<string, unknown>) =>
    valueSelector(props as any, { application_state: { component: { [stateKey]: bucket } } },
      stateKey, { fallback: '', resolved });

  it('decodes a docField-backed value to text', () => {
    expect(DocHolder.selectors?.value).toBeUndefined();  // else the branch is unreachable
    const { value } = select({ value: storedDoc('hello world') });
    expect(typeof value).toBe('string');
    expect(value).toBe('hello world');
  });

  it('still yields the fallback for an unwritten field', () => {
    expect(select({}).value).toBe('');
  });
});
