// @vitest-environment node
// packages/shared/lib/state/fieldTypes/crdt/doc.test.ts
//
// The FieldInfo contract of docField. What the CRDT does with the edits
// is ./../../../crdt/docText.test.ts; what is checked here is that the
// field wires it to the field system correctly — the event it emits, the
// payload shape, what the reducer returns, and what it refuses.

import { docField } from './doc';
import { isDocUpdate } from '../../../crdt/docText';

/** Run the field's own write → reduce loop, as store.ts would. */
function edit(field: ReturnType<typeof docField>, raw: unknown, next: string) {
  const results = field.write!(raw as any, next);
  let state: Record<string, any> = { value: raw };
  for (const { event, payload } of results) {
    expect(event).toBe('SPLICE_INPUT');
    state = { ...state, ...field.reduce!(state, payload, 'value') };
  }
  return { results, raw: state.value };
}

describe('docField', () => {
  describe('constructor', () => {
    it('creates a FieldInfo with a SPLICE_INPUT event', () => {
      const field = docField('value');
      expect(field.type).toBe('field');
      expect(field.name).toBe('value');
      expect(field.kind).toBe('doc');
      expect(field.events).toEqual(['SPLICE_INPUT']);
      expect(field.event).toBe('SPLICE_INPUT');
      expect(field.scope).toBe('component');
    });

    it('accepts scope and level overrides', () => {
      const field = docField('notes', { scope: 'storage' as any, level: 'everyone' });
      expect(field.scope).toBe('storage');
      expect(field.level).toBe('everyone');
    });

    it('uses referential equality — every fold is a new object', () => {
      const field = docField('value');
      expect(field.equality).toBe(Object.is);

      const first = edit(field, undefined, 'a').raw;
      const second = edit(field, first, 'ab').raw;
      expect(field.equality!(first, second)).toBe(false);
      expect(field.equality!(first, first)).toBe(true);
    });
  });

  describe('read and display', () => {
    const field = docField('value');

    it('return the document text', () => {
      const { raw } = edit(field, undefined, 'hello');
      expect(field.read!(raw)).toBe('hello');
      expect(field.display!(raw)).toBe('hello');
    });

    it('return empty for absent state', () => {
      expect(field.read!(undefined as any)).toBe('');
      expect(field.read!(null as any)).toBe('');
    });

    it('pass a bare string through', () => {
      expect(field.read!('' as any)).toBe('');
      expect(field.read!('seeded' as any)).toBe('seeded');
    });
  });

  describe('write', () => {
    const field = docField('value');

    it('emits one event carrying the field name and an update', () => {
      const { results } = edit(field, undefined, 'hi');
      expect(results).toHaveLength(1);
      expect(results[0]!.payload.field).toBe('value');
      expect(isDocUpdate(results[0]!.payload.update)).toBe(true);
    });

    it('emits nothing when the text is unchanged', () => {
      const { raw } = edit(field, undefined, 'unchanged');
      expect(field.write!(raw as any, 'unchanged')).toEqual([]);
    });

    it('does NOT put positions in the payload', () => {
      // Positions are meaningful only against the writer's own text; an
      // update names neighbouring characters instead. Keeping them out of
      // the payload keeps a recipient from being tempted to use them.
      const { results } = edit(field, undefined, 'hi');
      expect(results[0]!.payload).not.toHaveProperty('index');
      expect(results[0]!.payload).not.toHaveProperty('deleteCount');
      expect(results[0]!.payload).not.toHaveProperty('inserted');
    });

    it('coerces a non-string value', () => {
      expect(edit(field, undefined, 42 as any).raw).toBeDefined();
      expect(field.read!(edit(field, undefined, 42 as any).raw)).toBe('42');
      expect(field.write!(undefined as any, null)).toEqual([]);
    });

    it('does not fold into the writer state itself', () => {
      // The reducer folds; if write folded too, the local copy would drift
      // from every peer's. Writing twice from the same starting value must
      // give the same update both times.
      const { raw } = edit(field, undefined, 'base');
      const first = field.write!(raw as any, 'base!');
      const second = field.write!(raw as any, 'base!');
      expect(first[0]!.payload.update).toEqual(second[0]!.payload.update);
    });
  });

  describe('reduce', () => {
    const field = docField('value');

    it('folds an update into the named field only', () => {
      const { results } = edit(field, undefined, 'hello');
      const patch = field.reduce!(
        { value: undefined, selection: { start: 0, end: 0 } },
        results[0]!.payload,
        'value',
      );
      expect(Object.keys(patch)).toEqual(['value']);
      expect(field.read!(patch.value)).toBe('hello');
    });

    it('ignores an event with no usable update', () => {
      const { raw } = edit(field, undefined, 'keep me');
      for (const payload of [
        { field: 'value' },
        { field: 'value', update: null },
        { field: 'value', update: 'nonsense' },
        { field: 'value', update: { version: 2, structs: [], deletes: [] } },
        { field: 'value', index: 0, deleteCount: 0, inserted: 'x' },
      ]) {
        expect(field.reduce!({ value: raw }, payload, 'value')).toEqual({});
      }
      expect(field.read!(raw)).toBe('keep me');
    });

    it('is idempotent — a redelivered event changes nothing', () => {
      const { results, raw } = edit(field, undefined, 'once');
      const again = field.reduce!({ value: raw }, results[0]!.payload, 'value');
      expect(field.read!(again.value)).toBe('once');
    });
  });

  describe('overrides', () => {
    it('let a caller replace any behavior wholesale', () => {
      const read = () => 'overridden';
      const field = docField('value', { read, event: 'CUSTOM' as any });
      expect(field.read).toBe(read);
      expect(field.event).toBe('CUSTOM');
    });
  });
});
