// @vitest-environment node
// src/lib/blocks/idResolver.test.js
import * as idResolver from "./idResolver.js";

describe("ID helpers", () => {
  it("passes through strings, resolves objects, and throws when unresolved", () => {
    // Passes through strings
    expect(idResolver.reduxId("foo")).toBe("foo");

    // Resolves correct key from object
    expect(idResolver.reduxId({ stateId: "bar", id: "XXX" })).toBe("bar");
    expect(idResolver.reduxId({ id: "bar" })).toBe("bar");
    expect(idResolver.urlName({ url_name: "baz" })).toBe("baz");

    // Throws if no id found
    expect(() => idResolver.reduxId({})).toThrow(/requires a well-formed ID/);

    // Default value if missing
    expect(idResolver.reduxId({}, 'fallback')).toBe('fallback');
    expect(idResolver.reduxId({ id: 'foo', idPrefix: 'bar' })).toBe('bar.foo');
  });
  it("exports a named function for each ID_RESOLUTION_MATRIX key", () => {
    const expectedKeys = Object.keys(idResolver.__testables.ID_RESOLUTION_MATRIX);
    const actualKeys = Object.keys(idResolver).filter(k=>!k.startsWith("_"));

    // Check that every expected key is exported
    expect(actualKeys).toEqual(expect.arrayContaining(expectedKeys));
  });

  it("extendIdPrefix builds scoped prefix", () => {
    // Without parent prefix
    expect(idResolver.extendIdPrefix({}, 'child')).toEqual({ idPrefix: 'child' });
    expect(idResolver.extendIdPrefix({ id: 'foo' }, 'foo.0')).toEqual({ idPrefix: 'foo.0' });

    // With parent prefix
    expect(idResolver.extendIdPrefix({ idPrefix: 'parent' }, 'child')).toEqual({ idPrefix: 'parent.child' });
    expect(idResolver.extendIdPrefix({ idPrefix: 'list.0', id: 'item' }, 'item.sub')).toEqual({ idPrefix: 'list.0.item.sub' });
  });

  it("reduxId handles absolute and relative path syntax", () => {
    // Relative (default): gets prefix applied
    expect(idResolver.reduxId({ id: 'foo', idPrefix: 'scope' })).toBe('scope.foo');

    // Absolute: bypasses prefix
    expect(idResolver.reduxId({ id: '/foo', idPrefix: 'scope' })).toBe('foo');
    expect(idResolver.reduxId({ id: '/deep/path', idPrefix: 'scope' })).toBe('deep/path');

    // Explicit relative: same as default
    expect(idResolver.reduxId({ id: './foo', idPrefix: 'scope' })).toBe('scope.foo');

    // Without prefix, all behave the same
    expect(idResolver.reduxId({ id: 'foo' })).toBe('foo');
    expect(idResolver.reduxId({ id: '/foo' })).toBe('foo');
    expect(idResolver.reduxId({ id: './foo' })).toBe('foo');
  });
});
