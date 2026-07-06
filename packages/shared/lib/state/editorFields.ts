// packages/shared/lib/state/editorFields.ts
// Editor state field definitions - used by Studio, docs, and other editing contexts
//
// The text buffers are docFields — DOCUMENTS, not LWW registers: under the
// CRDT strategy each edit dispatches a SPLICE_INPUT delta (index, deleted
// count, inserted text — add/tombstone character semantics) instead of a
// whole-file UPDATE_CONTENT megaevent. That's the point of CRDTs for
// editing large files: event size tracks the edit, not the document.
// (Under classic, docField delegates to stateField — megaevents, as before.)
import { fields, scopes, docField } from '@/lib/state';

export const editorFields = fields([
  docField('content', { scope: scopes.storage }),
  { name: 'parsed', scope: scopes.storage },
  docField('editedContent', { scope: scopes.storage }),  // docs page live editing
]);
