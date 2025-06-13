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
    expect(() => idResolver.reduxId({})).toThrow(/Could not resolve ID/);

    // Default value if missing
    expect(idResolver.reduxId({}, 'fallback')).toBe('fallback');
  });
  it("exports a named function for each ID_RESOLUTION_MATRIX key", () => {
    const expectedKeys = Object.keys(idResolver.__testables.ID_RESOLUTION_MATRIX);
    const actualKeys = Object.keys(idResolver).filter(k=>!k.startsWith("_"));

    // Check that every expected key is exported
    expect(actualKeys).toEqual(expect.arrayContaining(expectedKeys));
    // Optionally check for *no extra* exported functions
    expect(expectedKeys).toEqual(expect.arrayContaining(actualKeys));
  });
});
