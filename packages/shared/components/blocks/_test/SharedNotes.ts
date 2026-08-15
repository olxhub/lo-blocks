// packages/shared/components/blocks/_test/SharedNotes.ts
//
// Test block for SHARED fields (fields-design 2c): one notes value that
// every connected user reads and writes — the minimal group-editing
// exercise.
//
// The field is a shared DOCUMENT. It was a shared LWW register while the
// prototype RGA backed docField, because that CRDT folded positional
// splices and needed a single writer; two people typing meant one of them
// silently lost a paragraph, so last-write-wins on the whole string was
// the more honest of two bad options. The sequence CRDT folds updates
// that name neighbouring characters instead of counting from the start,
// so concurrent edits merge and this block can be what it was always
// meant to be.
//
// The TEXT converges; the CURSORS do not yet. Editors cannot see each
// other's carets, and each editor's own caret is held locally rather than
// shared (state/bindings/useInputField.ts, TODO(cursor)) — worth knowing
// before using this block to demo collaboration.

import * as parsers from '@/lib/content/parsers';
import { test } from '@/lib/blocks';
import * as state from '@/lib/state';
import { docField } from '@/lib/state';

export const fields = state.fields([
  docField('notes', { level: 'everyone' }),
]);

const SharedNotes = test({
  ...parsers.ignore(),
  name: 'SharedNotes',
  fields,
  internal: true,
});

export default SharedNotes;
