import { describe, it, expect } from 'vitest';
import {
  parseQualifiedReference,
  isQualifiedReference,
  toQualifiedReference,
} from './namespace';
import { toContentNamespace } from './types';
import type { OlxKey } from '../types';

describe('parseQualifiedReference', () => {
  it('parses namespace:key format', () => {
    const result = parseQualifiedReference('github.com/pmitros/ee101:hw1_problem3');
    expect(result.namespace).toBe('github.com/pmitros/ee101');
    expect(result.key).toBe('hw1_problem3');
  });

  it('parses multi-segment namespace', () => {
    const result = parseQualifiedReference('gitlab.com/dept/cs101:intro');
    expect(result.namespace).toBe('gitlab.com/dept/cs101');
    expect(result.key).toBe('intro');
  });

  it('parses institution namespace', () => {
    const result = parseQualifiedReference('institution.edu/cs101:lab1');
    expect(result.namespace).toBe('institution.edu/cs101');
    expect(result.key).toBe('lab1');
  });

  it('returns no namespace for bare references', () => {
    const result = parseQualifiedReference('my_block');
    expect(result.namespace).toBeUndefined();
    expect(result.key).toBe('my_block');
  });

  it('returns no namespace for absolute references', () => {
    const result = parseQualifiedReference('/my_block');
    expect(result.namespace).toBeUndefined();
    expect(result.key).toBe('my_block');
  });

  it('does not split on colon without slash (Redux scope marker)', () => {
    // "list:#0:child" has colons but no slash before the first colon
    const result = parseQualifiedReference('list');
    expect(result.namespace).toBeUndefined();
    expect(result.key).toBe('list');
  });

  it('does not treat bare colon-separated IDs as namespaces', () => {
    // "foo:bar" — no slash, so this is NOT a namespace reference
    const result = parseQualifiedReference('foo');
    expect(result.namespace).toBeUndefined();
  });
});

describe('isQualifiedReference', () => {
  it('returns true for namespace:key format', () => {
    expect(isQualifiedReference('github.com/pmitros/ee101:hw1')).toBe(true);
  });

  it('returns false for bare references', () => {
    expect(isQualifiedReference('my_block')).toBe(false);
  });

  it('returns false for colon without slash', () => {
    expect(isQualifiedReference('foo:bar')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isQualifiedReference('')).toBe(false);
  });
});

describe('toQualifiedReference', () => {
  it('builds namespace:key string', () => {
    const ns = toContentNamespace('github.com/pmitros/ee101');
    const key = 'hw1_problem3' as OlxKey;
    expect(toQualifiedReference(ns, key)).toBe('github.com/pmitros/ee101:hw1_problem3');
  });
});
