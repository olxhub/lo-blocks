// packages/shared/lib/state/snapshotLoad.test.ts
//
// deserializeOnLoad — how a server snapshot (the fetch_blob response) is
// applied to the live Redux store.
//
// Every fetch_blob response is applied, including late retry responses. A
// stale snapshot must not replace newer work already present in Redux.

import { test, expect } from 'vitest';
import { computeSplice } from '../crdt/computeSplice';
import { docSpliceUpdate, docText, foldDocUpdate } from '../crdt/docText';
import { deserializeOnLoad } from './store';

const stamped = (field: string, value: any, ts: number, actor = 'learner') => ({
  [field]: value, [`${field}.ts`]: ts, [`${field}.actor`]: actor,
});

const snapshot = (scopesIn: Record<string, any>) => ({ application_state: scopesIn });
const live = (scopesIn: Record<string, any>) => ({ application_state: scopesIn });

const doc = (text: string, actor: number, base?: unknown) =>
  foldDocUpdate(base, docSpliceUpdate(base, computeSplice(docText(base), text), actor));

test('a first load into an empty store adopts everything', () => {
  const out = deserializeOnLoad(
    snapshot({ component: { board: stamped('value', { a: 1 }, 100) }, system: {} }),
    live({ component: {}, system: {} }),
  );
  expect(out.application_state.component.board.value).toEqual({ a: 1 });
});

test('a LATE snapshot does not revert newer local answers', () => {
  // The retry carries state from before the learner's newer local writes.
  const out = deserializeOnLoad(
    snapshot({ component: { board: stamped('value', { row1: 0 }, 100) } }),
    live({ component: { board: stamped('value', { row1: 0, row2: 1, row3: 2 }, 500) } }),
  );
  expect(out.application_state.component.board.value)
    .toEqual({ row1: 0, row2: 1, row3: 2 });
  expect(out.application_state.component.board['value.ts']).toBe(500);
});

test('a late snapshot still fills buckets the learner has not touched', () => {
  const out = deserializeOnLoad(
    snapshot({
      component: {
        board: stamped('value', 'stale', 100),
        untouched: stamped('value', 'from-server', 100),
      },
    }),
    live({ component: { board: stamped('value', 'fresh', 500) } }),
  );
  expect(out.application_state.component.board.value).toBe('fresh');
  expect(out.application_state.component.untouched.value).toBe('from-server');
});

test('the flat system scope merges by field, not by bucket', () => {
  // `system` has no bucket level; treating it as one is how `locale`'s
  // metadata became a character map server-side (scopes.ts).
  const out = deserializeOnLoad(
    snapshot({ system: stamped('locale', { code: 'fr' }, 1) }),
    live({ system: stamped('locale', { code: 'en' }, 2) }),
  );
  expect(out.application_state.system.locale).toEqual({ code: 'en' });
  expect(out.application_state.system).not.toHaveProperty('0');
});

test('scopes the snapshot does not persist survive the load', () => {
  const out = deserializeOnLoad(
    snapshot({ component: {} }),
    live({ component: {}, olxjson: { blocks: { a: 1 } } }),
  );
  expect(out.application_state.olxjson).toEqual({ blocks: { a: 1 } });
});

test('a null/empty snapshot changes nothing', () => {
  expect(deserializeOnLoad(null, live({ component: {} }))).toEqual({});
  expect(deserializeOnLoad({}, live({ component: {} }))).toEqual({});
});

test.skip('TODO: a late snapshot merges document edits from both copies', () => {
  // Implement this at the shared bucket-reconciliation boundary, not only
  // in deserializeOnLoad; ServerState.seed needs the same mixed-CRDT rule.
  const shared = doc('The fox jumps over the dog', 1);
  const stored = doc('The fox jumps over the lazy dog', 2, shared);
  const local = doc('The quick fox jumps over the dog', 1, shared);

  const out = deserializeOnLoad(
    snapshot({ component: { essay: { value: stored } } }),
    live({ component: { essay: { value: local } } }),
  );

  expect(docText(out.application_state.component.essay.value))
    .toBe('The quick fox jumps over the lazy dog');
});
