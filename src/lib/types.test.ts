// @vitest-environment node
// src/lib/types.test.ts
import { parseProvenance, formatProvenance, parseProvenanceList, formatProvenanceList } from './storage/provenance';

describe('provenance helpers', () => {
  it('parses file URIs with and without query', () => {
    const simple = parseProvenance('file:///foo/bar');
    expect(simple).toEqual({ type: 'file', path: '/foo/bar' });

    const withQuery = parseProvenance('file:///foo/bar?hash=abc&x=1');
    expect(withQuery).toEqual({ type: 'file', path: '/foo/bar', hash: 'abc', x: '1' });
  });

  it('formats structured provenance back to URIs', () => {
    const uri = 'file:///foo/bar?hash=abc';
    const parsed = parseProvenance(uri);
    expect(formatProvenance(parsed)).toBe(uri);
  });

  it('handles lists', () => {
    const list = ['file:///a', 'file:///b'];
    const parsed = parseProvenanceList(list);
    expect(parsed.length).toBe(2);
    expect(formatProvenanceList(parsed)).toEqual(list);
  });

  it('throws on unknown types', () => {
    expect(() => parseProvenance('bogus://foo')).toThrow(/Unknown provenance type/);
  });

  it('rejects malformed file URIs with path in query', () => {
    const uri = 'file:///foo/bar?path=abc';
    expect(() => parseProvenance(uri)).toThrow(/Malformed file provenance/);
  });
});
