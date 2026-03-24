// @vitest-environment node
// lib/state/fieldTypes/classic/id.test.ts
import { describe, it, expect } from 'vitest';
import { idField } from './id';

describe('classic idField', () => {
  describe('constructor', () => {
    it('creates a FieldInfo with kind id', () => {
      const field = idField('noteIds');
      expect(field.type).toBe('field');
      expect(field.kind).toBe('id');
      expect(field.name).toBe('noteIds');
      expect(field.events).toEqual(['UPDATE_NOTE_IDS']);
      expect(field.event).toBe('UPDATE_NOTE_IDS');
      expect(field.scope).toBe('component');
    });

    it('accepts scope override', () => {
      const field = idField('ids', { scope: 'componentSetting' as any });
      expect(field.scope).toBe('componentSetting');
    });
  });

  describe('read', () => {
    const field = idField('noteIds');

    it('returns 0 for null/undefined', () => {
      expect(field.read!(null)).toBe(0);
      expect(field.read!(undefined)).toBe(0);
    });

    it('returns the counter value', () => {
      expect(field.read!(5)).toBe(5);
    });

    it('returns 0 for non-number values', () => {
      expect(field.read!('bad')).toBe(0);
      expect(field.read!({})).toBe(0);
    });
  });

  describe('write', () => {
    const field = idField('noteIds');

    it('increments counter and returns allocatedId', () => {
      const results = field.write!(0, null);
      expect(results).toHaveLength(1);
      expect(results[0].event).toBe('UPDATE_NOTE_IDS');
      expect(results[0].payload).toEqual({
        field: 'noteIds',
        noteIds: 1,
        allocatedId: '0',
      });
    });

    it('produces sequential IDs from successive writes', () => {
      const r0 = field.write!(0, null);
      expect(r0[0].payload.allocatedId).toBe('0');

      const r1 = field.write!(1, null);
      expect(r1[0].payload.allocatedId).toBe('1');

      const r2 = field.write!(2, null);
      expect(r2[0].payload.allocatedId).toBe('2');
    });

    it('handles missing oldRaw (first write)', () => {
      const results = field.write!(undefined, null);
      expect(results[0].payload.allocatedId).toBe('0');
      expect(results[0].payload.noteIds).toBe(1);
    });
  });

  describe('reduce', () => {
    const field = idField('noteIds');

    it('accepts advancing counter', () => {
      const patch = field.reduce!({}, { noteIds: 1 }, 'noteIds');
      expect(patch).toEqual({ noteIds: 1 });
    });

    it('rejects stale counter (same value)', () => {
      const patch = field.reduce!({ noteIds: 3 }, { noteIds: 3 }, 'noteIds');
      expect(patch).toEqual({});
    });

    it('rejects stale counter (lower value)', () => {
      const patch = field.reduce!({ noteIds: 5 }, { noteIds: 2 }, 'noteIds');
      expect(patch).toEqual({});
    });

    it('accepts advancing from default 0', () => {
      const patch = field.reduce!({}, { noteIds: 1 }, 'noteIds');
      expect(patch).toEqual({ noteIds: 1 });
    });

    it('ignores non-number payload', () => {
      const patch = field.reduce!({}, { noteIds: 'bad' }, 'noteIds');
      expect(patch).toEqual({});
    });
  });

  describe('display', () => {
    const field = idField('noteIds');

    it('displays count for 0', () => {
      expect(field.display!(0)).toBe('0 ids allocated');
    });

    it('displays singular for 1', () => {
      expect(field.display!(1)).toBe('1 id allocated');
    });

    it('displays plural for 3', () => {
      expect(field.display!(3)).toBe('3 ids allocated');
    });

    it('handles missing value', () => {
      expect(field.display!(undefined)).toBe('0 ids allocated');
    });
  });

  describe('round-trip: write → reduce → read', () => {
    const field = idField('noteIds');

    it('allocates three sequential IDs', () => {
      let state: any = {};
      const ids: string[] = [];

      for (let i = 0; i < 3; i++) {
        const raw = state.noteIds ?? 0;
        const results = field.write!(raw, null);
        ids.push(results[0].payload.allocatedId);
        const patch = field.reduce!(state, results[0].payload, 'noteIds');
        state = { ...state, ...patch };
      }

      expect(ids).toEqual(['0', '1', '2']);
      expect(field.read!(state.noteIds)).toBe(3);
      expect(field.display!(state.noteIds)).toBe('3 ids allocated');
    });
  });
});
