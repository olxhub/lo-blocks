// packages/shared/components/blocks/_test/SharedNotes.ts
//
// Test block for SHARED fields (fields-design 2c): one notes value that
// every connected user reads and writes — the minimal group-editing
// exercise. The field is a shared LWW register: last write wins whole-
// string, which is fine for a demo and deliberately avoids the shared-
// docField compaction question (rgaCompact assumes a single writer; see
// fields-design "Correctness traps").

import * as parsers from '@/lib/content/parsers';
import { test } from '@/lib/blocks';
import * as state from '@/lib/state';

export const fields = state.fields([
  { name: 'notes', level: 'everyone' },
]);

const SharedNotes = test({
  ...parsers.ignore(),
  name: 'SharedNotes',
  fields,
  internal: true,
});

export default SharedNotes;
