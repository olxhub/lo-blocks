import * as id from "./id.js";

describe("ID helpers", () => {
  it("passes through strings, resolves objects, and throws when unresolved", () => {
    // Passes through strings
    expect(id.reduxId("foo")).toBe("foo");

    // Resolves correct key from object
    expect(id.reduxId({ stateId: "bar", id: "XXX" })).toBe("bar");
    expect(id.reduxId({ id: "bar" })).toBe("bar");
    expect(id.urlName({ url_name: "baz" })).toBe("baz");

    // Throws if no id found
    expect(() => id.reduxId({})).toThrow(/Could not resolve ID/);
  });
  it("exports a named function for each ID_RESOLUTION_MATRIX key", () => {
    const expectedKeys = Object.keys(id.__testables.ID_RESOLUTION_MATRIX);
    const actualKeys = Object.keys(id).filter(k=>!k.startsWith("_"));

    // Check that every expected key is exported
    expect(actualKeys).toEqual(expect.arrayContaining(expectedKeys));
    // Optionally check for *no extra* exported functions
    expect(expectedKeys).toEqual(expect.arrayContaining(actualKeys));
  });
});
