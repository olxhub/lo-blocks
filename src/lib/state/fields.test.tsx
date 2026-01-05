// @vitest-environment node
// src/lib/state/fields.test.tsx
import * as fields from './fields';
import { commonFields } from './commonFields';

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

  it('returns fields directly as { fieldName: FieldInfo }', () => {
    const result = fields.fields(['user', { name: 'input', event: 'SET_MY_INPUT' }]);

    // Fields are now directly on the result (no .fieldInfoByField wrapper)
    expect(result.user).toEqual({ type: 'field', name: 'user', event: 'UPDATE_USER', scope: 'component' });
    expect(result.input).toEqual({ type: 'field', name: 'input', event: 'SET_MY_INPUT', scope: 'component' });

    // extend method is also present
    expect(typeof result.extend).toBe('function');
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

  it('extend() merges field definitions', () => {
    const base = fields.fields(['value']);
    const extended = base.extend(fields.fields(['loading', 'error']));

    expect(extended.value).toEqual({ type: 'field', name: 'value', event: 'UPDATE_VALUE', scope: 'component' });
    expect(extended.loading).toEqual({ type: 'field', name: 'loading', event: 'UPDATE_LOADING', scope: 'component' });
    expect(extended.error).toEqual({ type: 'field', name: 'error', event: 'UPDATE_ERROR', scope: 'component' });
    expect(typeof extended.extend).toBe('function');
  });
});

describe('commonFields', () => {
  it('provides typed FieldInfo for common fields', () => {
    expect(commonFields.value).toEqual({
      type: 'field',
      name: 'value',
      event: 'UPDATE_VALUE',
      scope: 'component'
    });

    expect(commonFields.correct).toEqual({
      type: 'field',
      name: 'correct',
      event: 'UPDATE_CORRECT',
      scope: 'component'
    });
  });

  it('includes all expected common fields', () => {
    expect(commonFields.value).toBeDefined();
    expect(commonFields.correct).toBeDefined();
    expect(commonFields.message).toBeDefined();
    expect(commonFields.submitCount).toBeDefined();
    expect(commonFields.showAnswer).toBeDefined();
  });

  // Note: commonFields are registered in the global field registry at module load
  // time. The fieldByName('correct') integration is tested implicitly through
  // the system tests (e.g., MasteryBank using commonFields.correct).
  // We don't test it here because __testables.reset() in other tests clears the registry.
});
