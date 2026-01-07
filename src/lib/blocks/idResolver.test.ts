// @vitest-environment node
// src/lib/blocks/idResolver.test.js
import * as idResolver from "./idResolver";

describe("ID helpers", () => {
  it("passes through strings, resolves objects, and throws when unresolved", () => {
    // Passes through strings
    expect(idResolver.refToReduxKey("foo")).toBe("foo");

    // Resolves correct key from object
    expect(idResolver.refToReduxKey({ id: "bar" })).toBe("bar");

    // Throws if no id found
    expect(() => idResolver.refToReduxKey({})).toThrow(/requires a well-formed ID/);

    // With prefix
    expect(idResolver.refToReduxKey({ id: 'foo', idPrefix: 'bar' })).toBe('bar:foo');
  });

  it("extendIdPrefix builds scoped prefix", () => {
    // Without parent prefix - string form
    expect(idResolver.extendIdPrefix({}, 'child')).toEqual({ idPrefix: 'child' });

    // Without parent prefix - array form (recommended for multi-level)
    expect(idResolver.extendIdPrefix({ id: 'foo' }, ['foo', 0])).toEqual({ idPrefix: 'foo:0' });

    // With parent prefix - string form
    expect(idResolver.extendIdPrefix({ idPrefix: 'parent' }, 'child')).toEqual({ idPrefix: 'parent:child' });

    // With parent prefix - array form
    expect(idResolver.extendIdPrefix({ idPrefix: 'list:0', id: 'item' }, ['item', 'sub'])).toEqual({ idPrefix: 'list:0:item:sub' });
  });

  it("refToReduxKey handles absolute and relative path syntax", () => {
    // Relative (default): gets prefix applied
    expect(idResolver.refToReduxKey({ id: 'foo', idPrefix: 'scope' })).toBe('scope:foo');

    // Absolute: bypasses prefix
    expect(idResolver.refToReduxKey({ id: '/foo', idPrefix: 'scope' })).toBe('foo');
    expect(idResolver.refToReduxKey({ id: '/deep/path', idPrefix: 'scope' })).toBe('deep/path');

    // Explicit relative: same as default
    expect(idResolver.refToReduxKey({ id: './foo', idPrefix: 'scope' })).toBe('scope:foo');

    // Without prefix, all behave the same
    expect(idResolver.refToReduxKey({ id: 'foo' })).toBe('foo');
    expect(idResolver.refToReduxKey({ id: '/foo' })).toBe('foo');
    expect(idResolver.refToReduxKey({ id: './foo' })).toBe('foo');
  });

  it("refToOlxKey extracts base ID (last segment) for idMap lookup", () => {
    // Plain IDs pass through
    expect(idResolver.refToOlxKey('foo')).toBe('foo');
    expect(idResolver.refToOlxKey('child_input')).toBe('child_input');

    // Absolute prefix stripped, then last segment extracted
    expect(idResolver.refToOlxKey('/foo')).toBe('foo');
    expect(idResolver.refToOlxKey('/list:0:child')).toBe('child');

    // Explicit relative prefix stripped
    expect(idResolver.refToOlxKey('./foo')).toBe('foo');
    expect(idResolver.refToOlxKey('./list:0:child')).toBe('child');

    // Non-strings pass through unchanged
    expect(idResolver.refToOlxKey(null)).toBe(null);
    expect(idResolver.refToOlxKey(undefined)).toBe(undefined);

    // Redux scope prefixes stripped - always takes last segment
    expect(idResolver.refToOlxKey('list:0:child')).toBe('child');
    expect(idResolver.refToOlxKey('mastery:attempt_0:q1')).toBe('q1');
    expect(idResolver.refToOlxKey('a:b:c:d')).toBe('d');
    expect(idResolver.refToOlxKey('sortable:sortitem:0:ref_id')).toBe('ref_id');
  });
});
