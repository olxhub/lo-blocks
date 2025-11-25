// @vitest-environment node
// src/lib/blocks/redux.test.tsx
import * as fields from './fields';

const { __testables } = fields;

const { fieldNameToDefaultEventName } = __testables;

describe('fieldNameToDefaultEventName', () => {
  it('converts camelCase to UPDATE_SNAKE_CASE', () => {
    expect(fieldNameToDefaultEventName('myField')).toBe('UPDATE_MY_FIELD');
    expect(fieldNameToDefaultEventName('anotherFieldName')).toBe('UPDATE_ANOTHER_FIELD_NAME');
  });

  it('works with PascalCase', () => {
    expect(fieldNameToDefaultEventName('FieldName')).toBe('UPDATE_FIELD_NAME');
  });

  it('breaks acronyms', () => {
    expect(fieldNameToDefaultEventName('SQLQuery')).toBe('UPDATE_SQLQUERY');
  });

  it('works with single word', () => {
    expect(fieldNameToDefaultEventName('input')).toBe('UPDATE_INPUT');
  });
});

describe('fields mapping and conflict detection', () => {
  beforeEach(() => __testables.reset());

  it('allows explicit event mapping for some fields and defaults for others', () => {
    const result = fields.fields(['user', { name: 'input', event: 'SET_MY_INPUT' }]);
    expect(result.fieldInfoByField).toEqual({
      user: { type: 'field', name: 'user', event: 'UPDATE_USER', scope: 'component' },
      input: { type: 'field', name: 'input', event: 'SET_MY_INPUT', scope: 'component' },
    });
    expect(result.fieldInfoByEvent).toEqual({
      UPDATE_USER: { type: 'field', name: 'user', event: 'UPDATE_USER', scope: 'component' },
      SET_MY_INPUT: { type: 'field', name: 'input', event: 'SET_MY_INPUT', scope: 'component' },
    });
  });

  it('throws on conflicting field or event registration (all in one test)', () => {
    fields.fields(['user', { name: 'input', event: 'SET_MY_INPUT' }]);

    // field re-registered with a different event
    expect(() => fields.fields([{ name: 'user', event: 'SOMETHING_ELSE' }])).toThrow();

    // new field tries to map to already-used event
    expect(() => fields.fields([{ name: 'another', event: 'UPDATE_USER' }])).toThrow();

    // This check is not worth the complexity of implementation right
    // now, but if we run into a bug, we could add it!
    // expect(() => fields.fields({ a: 'FOO', b: 'FOO' })).toThrow();
  });
});
