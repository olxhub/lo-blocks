// packages/shared/components/blocks/_test/ServerPoll.ts
//
// Test block for SERVER-reduced fields (fields-design 2d): every user's vote
// folds into one derived count map. The write sends a CONTRIBUTION (the
// chosen option); the reduce is the FOLD (increment that option's
// count). Raw votes never fan out — the server sends everyone the
// folded result. This is the word-cloud/percentile pattern at its
// smallest.

import * as parsers from '@/lib/content/parsers';
import { test } from '@/lib/blocks';
import * as state from '@/lib/state';
import type { FieldEvent } from '@/lib/types';

export const fields = state.fields([
  {
    name: 'counts',
    level: 'everyone',
    delivery: 'folded',
    // Contribution in: the value passed to setCounts(option) becomes one
    // vote event. No ts/actor — this is not LWW; every event counts.
    write: (_oldRaw: any, option: any) => [{
      event: 'UPDATE_COUNTS' as FieldEvent,
      payload: { field: 'counts', contribution: String(option) },
    }],
    // Fold: one vote increments its option. Runs optimistically on the
    // contributor's client AND authoritatively on the server; the
    // server's derived bucket replaces the optimistic copy on arrival.
    reduce: (componentState: Record<string, any>, action: any, fieldName: string) => {
      const counts = { ...(componentState[fieldName] ?? {}) };
      counts[action.contribution] = (counts[action.contribution] ?? 0) + 1;
      return { [fieldName]: counts };
    },
  },
]);

const ServerPoll = test({
  ...parsers.ignore(),
  name: 'ServerPoll',
  fields,
  internal: true,
});

export default ServerPoll;
