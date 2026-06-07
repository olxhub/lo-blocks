// packages/shared/lib/state/fieldTypes/crdt/doc.ts
//
// Document field — collaborative text via RGA CRDT.
//
// Stores an RgaDoc in Redux. Materializes to string for consumers.
// Edits are dispatched as splice deltas (SPLICE_INPUT), not full text
// replacement, enabling character-level collaborative editing.
//
// Currently used by TextArea. Any block that needs collaborative text
// editing should use docField('value') instead of a plain state field.
//
// Behavior summary:
//   - read:     RgaDoc -> string via rgaText() (handles plain string for pre-init)
//   - write:    computes splice delta from old text -> new text via computeSplice()
//   - reduce:   applies rgaSplice + compaction, auto-inits RgaDoc on first edit
//   - display:  same as read (both produce a string)
//   - equality: referential (each rgaSplice produces a new object; no-ops don't)
//   - events:   SPLICE_INPUT (insert/delete deltas)
//
// The reduce function includes auto-init: on the first splice, if the stored
// value is a plain string (or missing), it creates an RgaDoc and inserts the
// text before applying the splice. This handles the transition from
// "no user input yet" to "collaborative editing."
//
// After each splice, rgaCompact() runs immediately. In single-user mode,
// all ops are local, so the version vector shows everything is seen and
// tombstones can be garbage-collected right away.
//
import { scopes } from '../../scopes';
import { rgaCreate, rgaInsert, rgaSplice, rgaText, rgaCompact, rgaVersionVector } from '../../../crdt/rga';
import { computeSplice } from '../../../crdt/computeSplice';
import { getActorId } from '../../../crdt/actorId';
import type { FieldInfo, FieldName, FieldEvent, WriteResult } from '../../../types';

/**
 * CRDT document field — stores an RgaDoc in Redux, materializes to string.
 */
export function docField(name: string, opts?: Partial<FieldInfo>): FieldInfo {
  return {
    type: 'field',
    kind: 'doc',
    name: name as FieldName,
    events: ['SPLICE_INPUT' as FieldEvent],
    event: 'SPLICE_INPUT',
    scope: scopes.component,
    read: (raw: any): string => {
      if (!raw) return '';
      if (typeof raw === 'string') return raw;
      if (raw.ops) return rgaText(raw);
      return '';
    },
    display: (raw: any): string => {
      if (!raw) return '';
      if (typeof raw === 'string') return raw;
      if (raw.ops) return rgaText(raw);
      return '';
    },
    write: (oldRaw: any, newValue: any): WriteResult[] => {
      const newText = String(newValue ?? '');
      const oldText = oldRaw?.ops ? rgaText(oldRaw) : (typeof oldRaw === 'string' ? oldRaw : '');
      const splice = computeSplice(oldText, newText);
      if (splice.deleteCount === 0 && splice.inserted.length === 0) return [];
      const needsInit = !oldRaw || typeof oldRaw !== 'object' || !oldRaw.ops;
      return [{
        event: 'SPLICE_INPUT' as FieldEvent,
        payload: {
          field: name,
          index: splice.index,
          deleteCount: splice.deleteCount,
          inserted: splice.inserted,
          ...(needsInit ? { initText: oldText, actor: getActorId() } : {}),
        }
      }];
    },
    reduce: (componentState: Record<string, any>, action: any, fieldName: string) => {
      const { index, deleteCount, inserted, initText, actor } = action;
      // Selection keys are prefixed by useInputField: "value.selectionStart"
      const selectionStart = action[`${fieldName}.selectionStart`];
      const selectionEnd = action[`${fieldName}.selectionEnd`];
      let doc = componentState[fieldName];

      // Auto-init on first splice: create RgaDoc from existing value or initText
      if (!doc || typeof doc !== 'object' || !doc.ops) {
        const text = typeof doc === 'string' ? doc : (initText ?? '');
        doc = rgaCreate(actor ?? 'default');
        if (text) doc = rgaInsert(doc, 0, text);
      }

      doc = rgaSplice(doc, index, deleteCount, inserted);
      doc = rgaCompact(doc, rgaVersionVector(doc));  // Single-user: all ops are seen

      const patch: Record<string, any> = { [fieldName]: doc };
      if (selectionStart !== undefined) patch[`${fieldName}.selectionStart`] = selectionStart;
      if (selectionEnd !== undefined) patch[`${fieldName}.selectionEnd`] = selectionEnd;
      return patch;
    },
    equality: opts?.equality ?? Object.is,
    ...(opts?.schema ? { schema: opts.schema } : {}),
    ...(opts?.batching ? { batching: opts.batching } : {}),
  };
}
