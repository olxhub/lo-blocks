// packages/shared/lib/state/snapshotLoad.test.ts
//
// deserializeOnLoad — how a server snapshot (the fetch_blob response) is
// applied to the live Redux store.
//
// The regression this pins: lo_event calls handleLoadState for EVERY
// fetch_blob response, not just the first, and it re-asks for the snapshot
// after a ten-second silence or a reconnect with the request outstanding.
// A retried request that is answered twice therefore lands a second
// snapshot after IS_LOADED has released the UI and the learner has started
// answering — and the merge used to be "loaded wins", so it reverted them.

import { test, expect } from 'vitest';
import { deserializeOnLoad } from './store';

const stamped = (field: string, value: any, ts: number, actor = 'learner') => ({
  [field]: value, [`${field}.ts`]: ts, [`${field}.actor`]: actor,
});

const snapshot = (scopesIn: Record<string, any>) => ({ application_state: scopesIn });
const live = (scopesIn: Record<string, any>) => ({ application_state: scopesIn });

test('a first load into an empty store adopts everything', () => {
  const out = deserializeOnLoad(
    snapshot({ component: { board: stamped('value', { a: 1 }, 100) }, system: {} }),
    live({ component: {}, system: {} }),
  );
  expect(out.application_state.component.board.value).toEqual({ a: 1 });
});

test('a LATE snapshot does not revert newer local answers', () => {
  // The captured shape: the learner has been ticking rows since the page
  // released, and the retry's response carries the state as it was before.
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
