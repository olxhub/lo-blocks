// Annotate/Annotate.ts
//
// Annotate — text annotation block for close reading and note-taking.
//
// Students select text from a passage (the block's children), and each
// selection becomes an annotation with a colored highlight in the passage
// and a card in the sidebar. The annotation card contains an editor for
// student notes — by default a TextArea, but configurable via the `editor`
// attribute to reference any block by ID.
//
// TODO: THIS IS VERY MUCH A PROTOTYPE BLOCK. Key issues remaining
// include:
//
// - Aggregation of child nodes. This will be best done when we have
//   getters / setters beyond the value selector
// - Properly supporting child blocks, beyond TextArea (editor
//  attribute; untested)
// - Documentation
// - Nicer CSS.
// - Etc.
//
// We'll get back to this once we have a little bit more infrastructure
//
// Fields:
//   noteIds      (idField)    — counter for generating unique annotation IDs
//   notes        (setField)   — active annotation IDs
//   pendingQuote (stateField) — text currently selected (before saving)
//   pendingStart (stateField) — char offset of pending selection start
//   pendingEnd   (stateField) — char offset of pending selection end
//   quote        (stateField) — per-annotation: the selected text (scoped)
//   start        (stateField) — per-annotation: char offset start (scoped)
//   end          (stateField) — per-annotation: char offset end (scoped)
//   activeNote   (stateField) — currently selected annotation ID
//   value        (stateField) — per-annotation: note text (scoped, default editor only)
//
// When editor= references a custom block ID, that block manages its own
// state through scoped props. The `value` field is only used by the
// built-in default textarea editor.
//
// Attributes:
//   editor — Block ID for the per-annotation editor, "textarea" (default),
//            or "false" to disable comments (annotation-only mode).
//
import { z } from 'zod';
import { test } from '@/lib/blocks';
import * as state from '@/lib/state';
import * as parsers from '@/lib/content/parsers';
import { baseAttributes } from '@/lib/blocks/attributeSchemas';
import _Annotate from './_Annotate';

// All fields on the block — including per-annotation scoped fields.
// They must be registered here so the reducer knows their event types.
// At runtime, per-annotation fields use scoped idPrefix to store under
// separate Redux keys (e.g., "annotate_demo:#0:quote").
export const fields = state.fields([
  state.idField('noteIds'),
  state.setField('notes'),
  'pendingQuote',
  'pendingStart',
  'pendingEnd',
  'quote',
  'start',
  'end',
  'activeNote',
  'value',
]);

const Annotate = test({
  ...parsers.blocks(),
  name: 'Annotate',
  category: 'language-arts',
  description: 'Text annotation block: students highlight passages and take notes in a sidebar',
  component: _Annotate,
  fields,
  attributes: baseAttributes.extend({
    editor: z.string().optional()
      .describe('Per-annotation editor: block ID, "textarea" (default), or "false" to disable'),
  }),
});

export default Annotate;
