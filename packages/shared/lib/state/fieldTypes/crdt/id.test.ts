// @vitest-environment node
// packages/shared/lib/state/fieldTypes/crdt/id.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { idField, __shortActor } from './id';

// Mock getActorId to control actor IDs in tests
vi.mock('../../../crdt/actorId', () => {
  let _mockActor = 'aaaa-bbbb-cccc-dddd';
  return {
    getActorId: () => _mockActor,
    __setMockActor: (id: string) => { _mockActor = id; },
  };
});

// Import the mock setter
const { __setMockActor } = await import('../../../crdt/actorId') as any;

describe('CRDT idField', () => {
  beforeEach(() => {
    __setMockActor('aaaa-bbbb-cccc-dddd');
  });

  describe('shortActor', () => {
    it('extracts first 4 hex chars, stripping hyphens', () => {
      expect(__shortActor('aaaa-bbbb-cccc-dddd')).toBe('aaaa');
      expect(__shortActor('1234-5678-9abc-def0')).toBe('1234');
    });

    it('handles UUIDs without hyphens', () => {
      expect(__shortActor('abcdef0123456789')).toBe('abcd');
    });
  });

  describe('constructor', () => {
    it('creates a FieldInfo with kind id', () => {
      const field = idField('noteIds');
      expect(field.type).toBe('field');
      expect(field.kind).toBe('id');
      expect(field.name).toBe('noteIds');
      expect(field.events).toEqual(['UPDATE_NOTE_IDS']);
      expect(field.scope).toBe('component');
    });
  });

  describe('read', () => {
    const field = idField('noteIds');

    it('returns 0 for null/undefined', () => {
      expect(field.read!(null)).toBe(0);
      expect(field.read!(undefined)).toBe(0);
    });

    it('sums across actors', () => {
      const state = { 'actor-1': 3, 'actor-2': 2 };
      expect(field.read!(state)).toBe(5);
    });

    it('handles single actor', () => {
      const state = { 'actor-1': 7 };
      expect(field.read!(state)).toBe(7);
    });

    it('ignores non-number entries', () => {
      const state = { 'actor-1': 3, 'garbage': 'bad' };
      expect(field.read!(state)).toBe(3);
    });
  });

  describe('write', () => {
    const field = idField('noteIds');

    it('produces actor-prefixed IDs', () => {
      const results = field.write!({}, null);
      expect(results).toHaveLength(1);
      expect(results[0].payload.allocatedId).toBe('aaaa_0');
      expect(results[0].payload.actor).toBe('aaaa-bbbb-cccc-dddd');
      expect(results[0].payload.counter).toBe(1);
    });

    it('increments this actor counter', () => {
      const state = { 'aaaa-bbbb-cccc-dddd': 3 };
      const results = field.write!(state, null);
      expect(results[0].payload.allocatedId).toBe('aaaa_3');
      expect(results[0].payload.counter).toBe(4);
    });

    it('handles first write (no state)', () => {
      const results = field.write!(null, null);
      expect(results[0].payload.allocatedId).toBe('aaaa_0');
      expect(results[0].payload.counter).toBe(1);
    });

    it('different actors produce different prefixes', () => {
      __setMockActor('1234-5678-9abc-def0');
      const results = field.write!({}, null);
      expect(results[0].payload.allocatedId).toBe('1234_0');
    });
  });

  describe('reduce', () => {
    const field = idField('noteIds');

    it('accepts new actor counter', () => {
      const patch = field.reduce!({}, { actor: 'actor-1', counter: 1 }, 'noteIds');
      expect(patch).toEqual({ noteIds: { 'actor-1': 1 } });
    });

    it('advances existing actor counter', () => {
      const state = { noteIds: { 'actor-1': 2 } };
      const patch = field.reduce!(state, { actor: 'actor-1', counter: 3 }, 'noteIds');
      expect(patch.noteIds['actor-1']).toBe(3);
    });

    it('rejects stale actor counter', () => {
      const state = { noteIds: { 'actor-1': 5 } };
      const patch = field.reduce!(state, { actor: 'actor-1', counter: 3 }, 'noteIds');
      expect(patch).toEqual({});
    });

    it('accepts concurrent actors independently', () => {
      let state: any = {};

      // Actor 1 allocates
      let patch = field.reduce!(state, { actor: 'actor-1', counter: 1 }, 'noteIds');
      state = { ...state, ...patch };

      // Actor 2 allocates concurrently
      patch = field.reduce!(state, { actor: 'actor-2', counter: 1 }, 'noteIds');
      state = { ...state, ...patch };

      expect(state.noteIds).toEqual({ 'actor-1': 1, 'actor-2': 1 });
    });

    it('preserves other actors when one advances', () => {
      const state = { noteIds: { 'actor-1': 3, 'actor-2': 2 } };
      const patch = field.reduce!(state, { actor: 'actor-1', counter: 4 }, 'noteIds');
      expect(patch.noteIds).toEqual({ 'actor-1': 4, 'actor-2': 2 });
    });

    it('ignores actions with no actor', () => {
      const patch = field.reduce!({}, { counter: 1 }, 'noteIds');
      expect(patch).toEqual({});
    });

    it('ignores actions with non-number counter', () => {
      const patch = field.reduce!({}, { actor: 'a', counter: 'bad' }, 'noteIds');
      expect(patch).toEqual({});
    });
  });

  describe('display', () => {
    const field = idField('noteIds');

    it('displays 0 for empty state', () => {
      expect(field.display!(null)).toBe('0 ids allocated');
      expect(field.display!({})).toBe('0 ids allocated');
    });

    it('displays total for single actor (no actor count suffix)', () => {
      expect(field.display!({ 'actor-1': 3 })).toBe('3 ids allocated');
    });

    it('displays total and actor count for multiple actors', () => {
      expect(field.display!({ 'actor-1': 3, 'actor-2': 2 })).toBe('5 ids allocated (2 actors)');
    });

    it('displays singular for 1', () => {
      expect(field.display!({ 'actor-1': 1 })).toBe('1 id allocated');
    });
  });

  describe('round-trip: write → reduce → read', () => {
    const field = idField('noteIds');

    it('allocates three IDs from single actor', () => {
      let state: any = {};
      const ids: string[] = [];

      for (let i = 0; i < 3; i++) {
        const raw = state.noteIds;
        const results = field.write!(raw, null);
        ids.push(results[0].payload.allocatedId);
        const patch = field.reduce!(state, results[0].payload, 'noteIds');
        state = { ...state, ...patch };
      }

      expect(ids).toEqual(['aaaa_0', 'aaaa_1', 'aaaa_2']);
      expect(field.read!(state.noteIds)).toBe(3);
    });

    it('allocates IDs from two concurrent actors', () => {
      let state: any = {};
      const ids: string[] = [];

      // Actor 1 allocates two
      __setMockActor('aaaa-bbbb-cccc-dddd');
      for (let i = 0; i < 2; i++) {
        const results = field.write!(state.noteIds, null);
        ids.push(results[0].payload.allocatedId);
        const patch = field.reduce!(state, results[0].payload, 'noteIds');
        state = { ...state, ...patch };
      }

      // Actor 2 allocates one
      __setMockActor('1111-2222-3333-4444');
      const results = field.write!(state.noteIds, null);
      ids.push(results[0].payload.allocatedId);
      const patch = field.reduce!(state, results[0].payload, 'noteIds');
      state = { ...state, ...patch };

      expect(ids).toEqual(['aaaa_0', 'aaaa_1', '1111_0']);
      expect(field.read!(state.noteIds)).toBe(3);
      expect(field.display!(state.noteIds)).toBe('3 ids allocated (2 actors)');
    });
  });
});
