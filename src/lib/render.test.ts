// src/lib/render.test.js
//
// Unit tests for render utilities. Integration tests for rendering
// are in demo-render.test.js which tests all .olx files.
//
import { assignReactKeys } from '@/lib/blocks/idResolver';

describe('assignReactKeys', () => {
  it('assigns keys correctly and passes through primitives', () => {
    const input = [
      { id: "foo", data: 1 },
      { id: "bar", data: 2 },
      { id: "foo", data: 3 },
      { id: "baz", data: 4 },
      { id: "foo", data: 5 },
      { data: 6 }, // No id
      null,        // Primitive
      "string",    // Primitive
    ];

    const expected = [
      { id: "foo", data: 1, key: "foo" },
      { id: "bar", data: 2, key: "bar" },
      { id: "foo", data: 3, key: "foo:1" },
      { id: "baz", data: 4, key: "baz" },
      { id: "foo", data: 5, key: "foo:2" },
      { data: 6, key: "__idx__5" },
      null,
      "string",
    ];

    const result = assignReactKeys(input);
    expect(result).toStrictEqual(expected);
  });

  it('throws an error if a child already has a key property', () => {
    const input = [{ id: 'foo', key: 'already-set', data: 1 }];
    expect(() => assignReactKeys(input)).toThrow(/already has a 'key' property/);
  });
});
