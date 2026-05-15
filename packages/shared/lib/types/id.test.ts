// @vitest-environment node
// src/lib/blocks/idResolver.test.js
import * as idResolver from "./id";

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
    expect(idResolver.extendIdPrefix({ id: 'foo' }, ['foo', idResolver.scopeMarker(0)])).toEqual({ idPrefix: 'foo:#0' });

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

  it("refToOlxKey extracts base ID from OlxReference", () => {
    // Plain IDs pass through
    expect(idResolver.refToOlxKey('foo')).toBe('foo');
    expect(idResolver.refToOlxKey('child_input')).toBe('child_input');
    expect(idResolver.refToOlxKey('_hash123')).toBe('_hash123');

    // Absolute prefix stripped
    expect(idResolver.refToOlxKey('/foo')).toBe('foo');

    // Explicit relative prefix stripped
    expect(idResolver.refToOlxKey('./foo')).toBe('foo');
  });

  it("refToOlxKey rejects ReduxStateKeys and other invalid input", () => {
    // ReduxStateKeys contain ":" — must use reduxKeyToOlxKey() instead
    expect(() => idResolver.refToOlxKey('list:#0:child')).toThrow(/not a valid OlxReference/);
    expect(() => idResolver.refToOlxKey('scope:foo')).toThrow(/not a valid OlxReference/);
    expect(() => idResolver.refToOlxKey('/list:#0:child')).toThrow(/not a valid OlxReference/);

    // ScopeMarker-prefixed strings are not OlxReferences
    expect(() => idResolver.refToOlxKey('#0')).toThrow(/not a valid OlxReference/);

    // Other reserved characters
    expect(() => idResolver.refToOlxKey('foo-bar')).toThrow(/not a valid OlxReference/);
    expect(() => idResolver.refToOlxKey('foo.bar')).toThrow(/not a valid OlxReference/);

    // Empty after prefix stripping
    expect(() => idResolver.refToOlxKey('/')).toThrow(/not a valid OlxReference/);
    expect(() => idResolver.refToOlxKey('./')).toThrow(/not a valid OlxReference/);
  });

  it("toOlxReference rejects hyphens and leading digits", () => {
    // Hyphens are reserved delimiter characters
    expect(() => idResolver.toOlxReference('foo-bar')).toThrow(/invalid characters/);
    expect(() => idResolver.toOlxReference('my-id')).toThrow(/invalid characters/);

    // Leading digits are not allowed
    expect(() => idResolver.toOlxReference('0abc')).toThrow(/invalid characters/);
    expect(() => idResolver.toOlxReference('123')).toThrow(/invalid characters/);

    // Underscore-prefixed IDs are valid (used by auto-generated hashes)
    expect(idResolver.toOlxReference('_foo')).toBe('_foo');
    expect(idResolver.toOlxReference('_abc123')).toBe('_abc123');

    // Standard valid IDs
    expect(idResolver.toOlxReference('foo')).toBe('foo');
    expect(idResolver.toOlxReference('foo_bar')).toBe('foo_bar');
    expect(idResolver.toOlxReference('FooBar')).toBe('FooBar');

    // Path prefixes still work
    expect(idResolver.toOlxReference('/foo')).toBe('/foo');
    expect(idResolver.toOlxReference('./foo')).toBe('./foo');
  });

  it("toOlxKey rejects hyphens and leading digits", () => {
    expect(() => idResolver.toOlxKey('foo-bar')).toThrow(/not a valid OlxKey/);
    expect(() => idResolver.toOlxKey('0abc')).toThrow(/not a valid OlxKey/);
    expect(idResolver.toOlxKey('_foo')).toBe('_foo');
    expect(idResolver.toOlxKey('foo_bar')).toBe('foo_bar');
  });

  it("scopeMarker creates branded ScopeMarker strings", () => {
    expect(idResolver.scopeMarker(0)).toBe('#0');
    expect(idResolver.scopeMarker(42)).toBe('#42');
    expect(idResolver.scopeMarker('attempt_2')).toBe('#attempt_2');
    expect(idResolver.scopeMarker('foo')).toBe('#foo');
    expect(idResolver.scopeMarker('A1')).toBe('#A1');
  });

  it("scopeMarker rejects invalid labels", () => {
    // Reserved delimiters
    expect(() => idResolver.scopeMarker('foo:bar')).toThrow(/invalid/);
    expect(() => idResolver.scopeMarker('foo#bar')).toThrow(/invalid/);
    expect(() => idResolver.scopeMarker('foo.bar')).toThrow(/invalid/);
    expect(() => idResolver.scopeMarker('foo-bar')).toThrow(/invalid/);

    // Empty
    expect(() => idResolver.scopeMarker('')).toThrow(/invalid/);
  });

  it("reduxKeyToOlxKey extracts the leaf block ID", () => {
    // Simple key — no scope
    expect(idResolver.reduxKeyToOlxKey('answer')).toBe('answer');

    // Scoped key — last non-ScopeMarker segment
    expect(idResolver.reduxKeyToOlxKey('myList:#0:answer')).toBe('answer');
    expect(idResolver.reduxKeyToOlxKey('bank:#attempt_2:child')).toBe('child');

    // Nested scoping
    expect(idResolver.reduxKeyToOlxKey('outer:#0:inner:#1:leaf')).toBe('leaf');

    // Multiple OlxKeys in chain — returns the last one
    expect(idResolver.reduxKeyToOlxKey('a:#0:b:#1:c')).toBe('c');
  });

  it("allOlxKeys extracts all loadable block IDs", () => {
    // Simple key
    expect(idResolver.allOlxKeys('answer')).toEqual(['answer']);

    // Scoped key
    expect(idResolver.allOlxKeys('myList:#0:answer')).toEqual(['myList', 'answer']);
    expect(idResolver.allOlxKeys('bank:#attempt_2:child')).toEqual(['bank', 'child']);

    // Nested scoping
    expect(idResolver.allOlxKeys('outer:#0:inner:#1:leaf')).toEqual(['outer', 'inner', 'leaf']);

    // Multiple ScopeMarkers in a row
    expect(idResolver.allOlxKeys('a:#0:#1:b')).toEqual(['a', 'b']);
  });

  it("extendIdPrefix works with scopeMarker", () => {
    // DynamicList pattern
    expect(idResolver.extendIdPrefix({}, ['myList', idResolver.scopeMarker(0)])).toEqual({ idPrefix: 'myList:#0' });
    expect(idResolver.extendIdPrefix({}, ['myList', idResolver.scopeMarker(3)])).toEqual({ idPrefix: 'myList:#3' });

    // MasteryBank pattern
    expect(idResolver.extendIdPrefix({}, ['bank', idResolver.scopeMarker('attempt_2')])).toEqual({ idPrefix: 'bank:#attempt_2' });

    // With parent prefix
    expect(idResolver.extendIdPrefix({ idPrefix: 'parent' }, ['child', idResolver.scopeMarker(0)])).toEqual({ idPrefix: 'parent:child:#0' });

    // Round-trip: extendIdPrefix + reduxKeyToOlxKey
    const { idPrefix } = idResolver.extendIdPrefix({}, ['myList', idResolver.scopeMarker(0)]);
    const fullKey = `${idPrefix}:answer`;
    expect(idResolver.reduxKeyToOlxKey(fullKey)).toBe('answer');
    expect(idResolver.allOlxKeys(fullKey)).toEqual(['myList', 'answer']);
  });

  it("toReduxStateKey validates ReduxStateKey format", () => {
    // Simple key
    expect(idResolver.toReduxStateKey('foo')).toBe('foo');
    // Scoped key
    expect(idResolver.toReduxStateKey('myList:#0:answer')).toBe('myList:#0:answer');
    // Multiple scopes
    expect(idResolver.toReduxStateKey('a:#0:b:#1:c')).toBe('a:#0:b:#1:c');
    // Underscore-prefixed
    expect(idResolver.toReduxStateKey('_hash123')).toBe('_hash123');
    // Leading underscore with scope
    expect(idResolver.toReduxStateKey('_list:#0:_child')).toBe('_list:#0:_child');

    // Invalid: empty
    expect(() => idResolver.toReduxStateKey('')).toThrow();
    // Invalid: bad characters (hyphen)
    expect(() => idResolver.toReduxStateKey('foo-bar')).toThrow();
    // Invalid: scope-only, no OlxKey
    expect(() => idResolver.toReduxStateKey('#0')).toThrow(/scope markers/);
    expect(() => idResolver.toReduxStateKey('#0:#1')).toThrow(/scope markers/);
    // Invalid: leading digit
    expect(() => idResolver.toReduxStateKey('0abc')).toThrow();
    // Invalid: spaces
    expect(() => idResolver.toReduxStateKey('foo bar')).toThrow();
    // Invalid: dots
    expect(() => idResolver.toReduxStateKey('foo.bar')).toThrow();
  });

  it("parseReduxStateRef validates authored ReduxStateRef format", () => {
    expect(idResolver.parseReduxStateRef('foo')).toBe('foo');
    expect(idResolver.parseReduxStateRef('myList:#0:answer')).toBe('myList:#0:answer');
    expect(idResolver.parseReduxStateRef('_list:#0:_child')).toBe('_list:#0:_child');

    expect(() => idResolver.parseReduxStateRef('')).toThrow();
    expect(() => idResolver.parseReduxStateRef('foo-bar')).toThrow();
    expect(() => idResolver.parseReduxStateRef('#0')).toThrow(/scope markers/);
    expect(() => idResolver.parseReduxStateRef('0abc')).toThrow();
  });

  it("VALID_REDUX_STATE_REF regex", () => {
    const re = idResolver.VALID_REDUX_STATE_REF;
    // Valid patterns
    expect(re.test('foo')).toBe(true);
    expect(re.test('myList:#0:answer')).toBe(true);
    expect(re.test('a:#0:b:#1:c')).toBe(true);
    expect(re.test('#0:foo')).toBe(true);       // scope-first is valid syntax
    expect(re.test('_hash')).toBe(true);
    expect(re.test('A1')).toBe(true);

    // Invalid patterns
    expect(re.test('foo-bar')).toBe(false);      // hyphen
    expect(re.test('')).toBe(false);             // empty
    expect(re.test('foo::')).toBe(false);        // trailing colon
    expect(re.test(':foo')).toBe(false);         // leading colon
    expect(re.test('foo bar')).toBe(false);      // space
    expect(re.test('0foo')).toBe(false);         // leading digit (not a scope marker)
  });

  it("VALID_REDUX_STATE_KEY regex", () => {
    const re = idResolver.VALID_REDUX_STATE_KEY;
    // Valid patterns
    expect(re.test('foo')).toBe(true);
    expect(re.test('myList:#0:answer')).toBe(true);
    expect(re.test('a:#0:b:#1:c')).toBe(true);
    expect(re.test('#0:foo')).toBe(true);       // scope-first is valid syntax
    expect(re.test('_hash')).toBe(true);
    expect(re.test('A1')).toBe(true);

    // Invalid patterns
    expect(re.test('foo-bar')).toBe(false);      // hyphen
    expect(re.test('')).toBe(false);             // empty
    expect(re.test('foo::')).toBe(false);        // trailing colon
    expect(re.test(':foo')).toBe(false);         // leading colon
    expect(re.test('foo bar')).toBe(false);      // space
    expect(re.test('0foo')).toBe(false);         // leading digit (not a scope marker)
  });

  it("VALID_ID_SEGMENT matches expected patterns", () => {
    const re = idResolver.VALID_ID_SEGMENT;
    // Valid
    expect(re.test('foo')).toBe(true);
    expect(re.test('Foo')).toBe(true);
    expect(re.test('_foo')).toBe(true);
    expect(re.test('foo123')).toBe(true);
    expect(re.test('_')).toBe(true);
    expect(re.test('a')).toBe(true);

    // Invalid
    expect(re.test('foo-bar')).toBe(false);   // hyphen reserved
    expect(re.test('0foo')).toBe(false);       // leading digit
    expect(re.test('foo.bar')).toBe(false);    // dot reserved
    expect(re.test('foo:bar')).toBe(false);    // colon reserved
    expect(re.test('foo/bar')).toBe(false);    // slash reserved
    expect(re.test('foo,bar')).toBe(false);    // comma reserved
    expect(re.test('')).toBe(false);           // empty
  });
});
