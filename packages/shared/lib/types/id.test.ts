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

  it("refToDefinitionKey extracts base ID from DefinitionRef", () => {
    // Plain IDs pass through
    expect(idResolver.refToDefinitionKey('foo')).toBe('foo');
    expect(idResolver.refToDefinitionKey('child_input')).toBe('child_input');
    expect(idResolver.refToDefinitionKey('_hash123')).toBe('_hash123');

    // Absolute prefix stripped
    expect(idResolver.refToDefinitionKey('/foo')).toBe('foo');

    // Explicit relative prefix stripped
    expect(idResolver.refToDefinitionKey('./foo')).toBe('foo');
  });

  it("refToDefinitionKey rejects StateKeys and other invalid input", () => {
    // StateKeys contain ":" — must use stateKeyToDefinitionKey() instead
    expect(() => idResolver.refToDefinitionKey('list:#0:child')).toThrow(/not a valid DefinitionRef/);
    expect(() => idResolver.refToDefinitionKey('scope:foo')).toThrow(/not a valid DefinitionRef/);
    expect(() => idResolver.refToDefinitionKey('/list:#0:child')).toThrow(/not a valid DefinitionRef/);

    // ScopeMarker-prefixed strings are not DefinitionRefs
    expect(() => idResolver.refToDefinitionKey('#0')).toThrow(/not a valid DefinitionRef/);

    // Other reserved characters
    expect(() => idResolver.refToDefinitionKey('foo-bar')).toThrow(/not a valid DefinitionRef/);
    expect(() => idResolver.refToDefinitionKey('foo.bar')).toThrow(/not a valid DefinitionRef/);

    // Empty after prefix stripping
    expect(() => idResolver.refToDefinitionKey('/')).toThrow(/not a valid DefinitionRef/);
    expect(() => idResolver.refToDefinitionKey('./')).toThrow(/not a valid DefinitionRef/);
  });

  it("toDefinitionRef rejects hyphens and leading digits", () => {
    // Hyphens are reserved delimiter characters
    expect(() => idResolver.toDefinitionRef('foo-bar')).toThrow(/invalid characters/);
    expect(() => idResolver.toDefinitionRef('my-id')).toThrow(/invalid characters/);

    // Leading digits are not allowed
    expect(() => idResolver.toDefinitionRef('0abc')).toThrow(/invalid characters/);
    expect(() => idResolver.toDefinitionRef('123')).toThrow(/invalid characters/);

    // Underscore-prefixed IDs are valid (used by auto-generated hashes)
    expect(idResolver.toDefinitionRef('_foo')).toBe('_foo');
    expect(idResolver.toDefinitionRef('_abc123')).toBe('_abc123');

    // Standard valid IDs
    expect(idResolver.toDefinitionRef('foo')).toBe('foo');
    expect(idResolver.toDefinitionRef('foo_bar')).toBe('foo_bar');
    expect(idResolver.toDefinitionRef('FooBar')).toBe('FooBar');

    // Path prefixes still work
    expect(idResolver.toDefinitionRef('/foo')).toBe('/foo');
    expect(idResolver.toDefinitionRef('./foo')).toBe('./foo');
  });

  it("toDefinitionKey rejects hyphens and leading digits", () => {
    expect(() => idResolver.toDefinitionKey('foo-bar')).toThrow(/not a valid DefinitionKey/);
    expect(() => idResolver.toDefinitionKey('0abc')).toThrow(/not a valid DefinitionKey/);
    expect(idResolver.toDefinitionKey('_foo')).toBe('_foo');
    expect(idResolver.toDefinitionKey('foo_bar')).toBe('foo_bar');
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

  it("stateKeyToDefinitionKey extracts the leaf block ID", () => {
    // Simple key — no scope
    expect(idResolver.stateKeyToDefinitionKey('answer')).toBe('answer');

    // Scoped key — last non-ScopeMarker segment
    expect(idResolver.stateKeyToDefinitionKey('myList:#0:answer')).toBe('answer');
    expect(idResolver.stateKeyToDefinitionKey('bank:#attempt_2:child')).toBe('child');

    // Nested scoping
    expect(idResolver.stateKeyToDefinitionKey('outer:#0:inner:#1:leaf')).toBe('leaf');

    // Multiple DefinitionKeys in chain — returns the last one
    expect(idResolver.stateKeyToDefinitionKey('a:#0:b:#1:c')).toBe('c');
  });

  it("allDefinitionKeys extracts all loadable block IDs", () => {
    // Simple key
    expect(idResolver.allDefinitionKeys('answer')).toEqual(['answer']);

    // Scoped key
    expect(idResolver.allDefinitionKeys('myList:#0:answer')).toEqual(['myList', 'answer']);
    expect(idResolver.allDefinitionKeys('bank:#attempt_2:child')).toEqual(['bank', 'child']);

    // Nested scoping
    expect(idResolver.allDefinitionKeys('outer:#0:inner:#1:leaf')).toEqual(['outer', 'inner', 'leaf']);

    // Multiple ScopeMarkers in a row
    expect(idResolver.allDefinitionKeys('a:#0:#1:b')).toEqual(['a', 'b']);
  });

  it("extendIdPrefix works with scopeMarker", () => {
    // DynamicList pattern
    expect(idResolver.extendIdPrefix({}, ['myList', idResolver.scopeMarker(0)])).toEqual({ idPrefix: 'myList:#0' });
    expect(idResolver.extendIdPrefix({}, ['myList', idResolver.scopeMarker(3)])).toEqual({ idPrefix: 'myList:#3' });

    // MasteryBank pattern
    expect(idResolver.extendIdPrefix({}, ['bank', idResolver.scopeMarker('attempt_2')])).toEqual({ idPrefix: 'bank:#attempt_2' });

    // With parent prefix
    expect(idResolver.extendIdPrefix({ idPrefix: 'parent' }, ['child', idResolver.scopeMarker(0)])).toEqual({ idPrefix: 'parent:child:#0' });

    // Round-trip: extendIdPrefix + stateKeyToDefinitionKey
    const { idPrefix } = idResolver.extendIdPrefix({}, ['myList', idResolver.scopeMarker(0)]);
    const fullKey = `${idPrefix}:answer`;
    expect(idResolver.stateKeyToDefinitionKey(fullKey)).toBe('answer');
    expect(idResolver.allDefinitionKeys(fullKey)).toEqual(['myList', 'answer']);
  });

  it("toStateKey validates StateKey format", () => {
    // Simple key
    expect(idResolver.toStateKey('foo')).toBe('foo');
    // Scoped key
    expect(idResolver.toStateKey('myList:#0:answer')).toBe('myList:#0:answer');
    // Multiple scopes
    expect(idResolver.toStateKey('a:#0:b:#1:c')).toBe('a:#0:b:#1:c');
    // Underscore-prefixed
    expect(idResolver.toStateKey('_hash123')).toBe('_hash123');
    // Leading underscore with scope
    expect(idResolver.toStateKey('_list:#0:_child')).toBe('_list:#0:_child');

    // Invalid: empty
    expect(() => idResolver.toStateKey('')).toThrow();
    // Invalid: bad characters (hyphen)
    expect(() => idResolver.toStateKey('foo-bar')).toThrow();
    // Invalid: scope-only, no DefinitionKey
    expect(() => idResolver.toStateKey('#0')).toThrow(/scope markers/);
    expect(() => idResolver.toStateKey('#0:#1')).toThrow(/scope markers/);
    // Invalid: leading digit
    expect(() => idResolver.toStateKey('0abc')).toThrow();
    // Invalid: spaces
    expect(() => idResolver.toStateKey('foo bar')).toThrow();
    // Invalid: dots
    expect(() => idResolver.toStateKey('foo.bar')).toThrow();
  });

  it("parseStateRef validates authored StateRef format", () => {
    expect(idResolver.parseStateRef('foo')).toBe('foo');
    expect(idResolver.parseStateRef('myList:#0:answer')).toBe('myList:#0:answer');
    expect(idResolver.parseStateRef('_list:#0:_child')).toBe('_list:#0:_child');

    expect(() => idResolver.parseStateRef('')).toThrow();
    expect(() => idResolver.parseStateRef('foo-bar')).toThrow();
    expect(() => idResolver.parseStateRef('#0')).toThrow(/scope markers/);
    expect(() => idResolver.parseStateRef('0abc')).toThrow();
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
