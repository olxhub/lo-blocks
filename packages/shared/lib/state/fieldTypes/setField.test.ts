// @vitest-environment node
// lib/state/fieldTypes/setField.test.ts
import { setField } from './setField';

describe('setField', () => {
  describe('constructor', () => {
    it('creates a FieldInfo with SET_ADD and SET_REMOVE events', () => {
      const field = setField('visited');
      expect(field.type).toBe('field');
      expect(field.name).toBe('visited');
      expect(field.events).toEqual(['SET_ADD', 'SET_REMOVE']);
      expect(field.event).toBe('SET_ADD');
      expect(field.scope).toBe('component');
    });

    it('sets kind to set', () => {
      const field = setField('visited');
      expect(field.kind).toBe('set');
    });

    it('accepts scope override', () => {
      const field = setField('tags', { scope: 'componentSetting' as any });
      expect(field.scope).toBe('componentSetting');
    });
  });

  describe('read (SetDoc → Set<string>)', () => {
    const field = setField('tags');

    it('returns empty set for null/undefined', () => {
      expect(field.read!(null)).toEqual(new Set());
      expect(field.read!(undefined)).toEqual(new Set());
    });

    it('materializes active elements', () => {
      const doc = {
        'SVD': { ts: 100, actor: 'a' },
        'PCA': { ts: 101, actor: 'a' },
      };
      expect(field.read!(doc)).toEqual(new Set(['SVD', 'PCA']));
    });

    it('excludes removed elements', () => {
      const doc = {
        'SVD': { ts: 100, actor: 'a' },
        'PCA': { ts: 101, actor: 'a', removed: true },
      };
      expect(field.read!(doc)).toEqual(new Set(['SVD']));
    });

    it('is idempotent on Set input', () => {
      const s = new Set(['a', 'b']);
      expect(field.read!(s)).toBe(s);
    });
  });

  describe('write (diff → events)', () => {
    const field = setField('tags');

    it('produces SET_ADD events for new elements', () => {
      const oldDoc = { 'SVD': { ts: 100, actor: 'a' } };
      const newSet = new Set(['SVD', 'PCA']);
      const results = field.write!(oldDoc, newSet);

      expect(results).toHaveLength(1);
      expect(results[0].event).toBe('SET_ADD');
      expect(results[0].payload.field).toBe('tags');
      expect(results[0].payload.element).toBe('PCA');
      expect(results[0].payload.ts).toBeGreaterThan(0);
      expect(results[0].payload.actor).toBeTruthy();
    });

    it('produces SET_REMOVE events for removed elements', () => {
      const oldDoc = {
        'SVD': { ts: 100, actor: 'a' },
        'PCA': { ts: 101, actor: 'a' },
      };
      const newSet = new Set(['SVD']);
      const results = field.write!(oldDoc, newSet);

      expect(results).toHaveLength(1);
      expect(results[0].event).toBe('SET_REMOVE');
      expect(results[0].payload.element).toBe('PCA');
    });

    it('produces no events when sets are equal', () => {
      const oldDoc = { 'SVD': { ts: 100, actor: 'a' } };
      const newSet = new Set(['SVD']);
      expect(field.write!(oldDoc, newSet)).toHaveLength(0);
    });

    it('produces both add and remove events', () => {
      const oldDoc = { 'A': { ts: 100, actor: 'a' } };
      const newSet = new Set(['B']);
      const results = field.write!(oldDoc, newSet);

      expect(results).toHaveLength(2);
      const events = results.map(r => `${r.event}:${r.payload.element}`);
      expect(events).toContain('SET_ADD:B');
      expect(events).toContain('SET_REMOVE:A');
    });

    it('accepts arrays as convenience', () => {
      const results = field.write!(null, ['a', 'b']);
      expect(results).toHaveLength(2);
      expect(results.map(r => r.payload.element).sort()).toEqual(['a', 'b']);
    });

    it('handles null oldRaw (first write)', () => {
      const results = field.write!(null, new Set(['x']));
      expect(results).toHaveLength(1);
      expect(results[0].event).toBe('SET_ADD');
      expect(results[0].payload.element).toBe('x');
    });
  });

  describe('reduce', () => {
    const field = setField('tags');

    it('adds an element', () => {
      const state = {};
      const action = { type: 'SET_ADD', field: 'tags', element: 'SVD', ts: 100, actor: 'a' };
      const patch = field.reduce!(state, action, 'tags');

      expect(patch.tags).toEqual({ 'SVD': { ts: 100, actor: 'a' } });
    });

    it('removes an element', () => {
      const state = { tags: { 'SVD': { ts: 100, actor: 'a' } } };
      const action = { type: 'SET_REMOVE', field: 'tags', element: 'SVD', ts: 200, actor: 'a' };
      const patch = field.reduce!(state, action, 'tags');

      expect(patch.tags['SVD']).toEqual({ ts: 200, actor: 'a', removed: true });
    });

    it('rejects stale add (existing has newer timestamp)', () => {
      const state = { tags: { 'SVD': { ts: 200, actor: 'a' } } };
      const action = { type: 'SET_REMOVE', field: 'tags', element: 'SVD', ts: 100, actor: 'b' };
      const patch = field.reduce!(state, action, 'tags');

      expect(patch).toEqual({});
    });

    it('accepts same-timestamp writes (LWW tie)', () => {
      const state = { tags: { 'SVD': { ts: 100, actor: 'a' } } };
      const action = { type: 'SET_REMOVE', field: 'tags', element: 'SVD', ts: 100, actor: 'b' };
      const patch = field.reduce!(state, action, 'tags');

      // Same timestamp: last writer wins (accepted)
      expect(patch.tags['SVD']).toEqual({ ts: 100, actor: 'b', removed: true });
    });

    it('handles multiple elements independently', () => {
      let state: any = {};

      // Add two elements
      let patch = field.reduce!(state, { type: 'SET_ADD', element: 'A', ts: 100, actor: 'x' }, 'tags');
      state = { ...state, ...patch };
      patch = field.reduce!(state, { type: 'SET_ADD', element: 'B', ts: 101, actor: 'x' }, 'tags');
      state = { ...state, ...patch };

      // Remove one
      patch = field.reduce!(state, { type: 'SET_REMOVE', element: 'A', ts: 200, actor: 'x' }, 'tags');
      state = { ...state, ...patch };

      // Read: only B should be active
      expect(field.read!(state.tags)).toEqual(new Set(['B']));
    });

    it('ignores actions with no element', () => {
      const patch = field.reduce!({}, { type: 'SET_ADD', ts: 100, actor: 'a' }, 'tags');
      expect(patch).toEqual({});
    });

    it('re-add after remove works with newer timestamp', () => {
      let state: any = {};

      // Add
      let patch = field.reduce!(state, { type: 'SET_ADD', element: 'X', ts: 100, actor: 'a' }, 'tags');
      state = { ...state, ...patch };
      expect(field.read!(state.tags).has('X')).toBe(true);

      // Remove
      patch = field.reduce!(state, { type: 'SET_REMOVE', element: 'X', ts: 200, actor: 'a' }, 'tags');
      state = { ...state, ...patch };
      expect(field.read!(state.tags).has('X')).toBe(false);

      // Re-add
      patch = field.reduce!(state, { type: 'SET_ADD', element: 'X', ts: 300, actor: 'a' }, 'tags');
      state = { ...state, ...patch };
      expect(field.read!(state.tags).has('X')).toBe(true);
    });
  });

  describe('display', () => {
    const field = setField('tags');

    it('displays empty set as empty string', () => {
      expect(field.display!(null)).toBe('');
      expect(field.display!({})).toBe('');
    });

    it('displays active elements comma-separated', () => {
      const doc = {
        'SVD': { ts: 100, actor: 'a' },
        'PCA': { ts: 101, actor: 'a' },
      };
      const display = field.display!(doc);
      expect(display).toContain('SVD');
      expect(display).toContain('PCA');
      expect(display).toContain(', ');
    });

    it('excludes removed elements from display', () => {
      const doc = {
        'SVD': { ts: 100, actor: 'a' },
        'PCA': { ts: 101, actor: 'a', removed: true },
      };
      expect(field.display!(doc)).toBe('SVD');
    });
  });

  describe('round-trip: write → reduce → read', () => {
    const field = setField('visited');

    it('add-only round trip', () => {
      let state: any = {};

      // Write: add SVD and PCA
      const events = field.write!(null, new Set(['SVD', 'PCA']));
      expect(events).toHaveLength(2);

      // Reduce each event
      for (const { event, payload } of events) {
        const action = { type: event, ...payload };
        const patch = field.reduce!(state, action, 'visited');
        state = { ...state, ...patch };
      }

      // Read
      const result = field.read!(state.visited);
      expect(result).toEqual(new Set(['SVD', 'PCA']));
    });

    it('add then remove round trip', () => {
      let state: any = {};

      // Add two
      for (const { event, payload } of field.write!(null, new Set(['A', 'B']))) {
        state = { ...state, ...field.reduce!(state, { type: event, ...payload }, 'visited') };
      }
      expect(field.read!(state.visited)).toEqual(new Set(['A', 'B']));

      // Remove one (pass current raw state as oldRaw)
      for (const { event, payload } of field.write!(state.visited, new Set(['A']))) {
        state = { ...state, ...field.reduce!(state, { type: event, ...payload }, 'visited') };
      }
      expect(field.read!(state.visited)).toEqual(new Set(['A']));
    });
  });
});
