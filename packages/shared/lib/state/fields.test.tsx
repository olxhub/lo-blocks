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

describe('fields mapping', () => {
  beforeEach(() => __testables.reset());

  it('returns fields directly as { fieldName: FieldInfo }', () => {
    const result = fields.fields(['user', { name: 'input', event: 'SET_MY_INPUT' }]);

    // Fields are directly on the result
    expect(result.user).toMatchObject({ type: 'field', name: 'user', scope: 'component' });
    expect(result.user.events).toContain('UPDATE_USER');
    expect(result.user.event).toBe('UPDATE_USER');

    expect(result.input).toMatchObject({ type: 'field', name: 'input', scope: 'component' });
    expect(result.input.events).toContain('SET_MY_INPUT');
    expect(result.input.event).toBe('SET_MY_INPUT');

    // extend method is also present
    expect(typeof result.extend).toBe('function');
  });

  it('allows same field name with different events (block-scoped fields)', () => {
    // Fields now belong to blocks, not a global registry.
    // Same name with different events should NOT throw.
    fields.fields(['user']);
    expect(() => fields.fields([{ name: 'user', event: 'SOMETHING_ELSE' }])).not.toThrow();
  });

  it('extend() merges field definitions', () => {
    const base = fields.fields(['value']);
    const extended = base.extend(fields.fields(['loading', 'error']));

    expect(extended.value).toMatchObject({ type: 'field', name: 'value', scope: 'component' });
    expect(extended.value.events).toContain('UPDATE_VALUE');
    expect(extended.loading).toMatchObject({ type: 'field', name: 'loading', scope: 'component' });
    expect(extended.loading.events).toContain('UPDATE_LOADING');
    expect(extended.error).toMatchObject({ type: 'field', name: 'error', scope: 'component' });
    expect(extended.error.events).toContain('UPDATE_ERROR');
    expect(typeof extended.extend).toBe('function');
  });

  it('accepts arrays of specs (flattened into result)', () => {
    const result = fields.fields([
      'foo',
      ['bar', 'baz'],
      'qux',
    ]);

    expect(result.foo).toMatchObject({ type: 'field', name: 'foo' });
    expect(result.bar).toMatchObject({ type: 'field', name: 'bar' });
    expect(result.baz).toMatchObject({ type: 'field', name: 'baz' });
    expect(result.qux).toMatchObject({ type: 'field', name: 'qux' });
  });

  it('accepts single-element arrays', () => {
    const result = fields.fields(['foo', ['bar']]);

    expect(result.foo).toMatchObject({ type: 'field', name: 'foo' });
    expect(result.bar).toMatchObject({ type: 'field', name: 'bar' });
  });

  it('flattens nested arrays recursively', () => {
    const result = fields.fields([
      'foo',
      [['bar', 'baz'], 'qux'],
    ]);

    expect(result.foo).toMatchObject({ type: 'field', name: 'foo' });
    expect(result.bar).toMatchObject({ type: 'field', name: 'bar' });
    expect(result.baz).toMatchObject({ type: 'field', name: 'baz' });
    expect(result.qux).toMatchObject({ type: 'field', name: 'qux' });
  });

  it('accepts empty arrays (no-op)', () => {
    const result = fields.fields(['foo', [], 'bar']);

    expect(result.foo).toMatchObject({ type: 'field', name: 'foo' });
    expect(result.bar).toMatchObject({ type: 'field', name: 'bar' });
  });

  it('throws on duplicate field names', () => {
    expect(() => fields.fields(['foo', 'foo'])).toThrow('Duplicate field name "foo"');
  });

  it('throws on duplicate field names across groups', () => {
    expect(() => fields.fields(['foo', ['bar', 'foo']])).toThrow('Duplicate field name "foo"');
  });

  it('preserves read and equality from field type constructors', () => {
    const readFn = (raw: any) => String(raw);
    const eqFn = (a: any, b: any) => a === b;
    const result = fields.fields([{ name: 'doc', read: readFn, equality: eqFn }]);

    expect(result.doc.read).toBe(readFn);
    expect(result.doc.equality).toBe(eqFn);
  });
});

describe('commonFields', () => {
  it('provides typed FieldInfo for common fields', () => {
    expect(commonFields.value).toMatchObject({
      type: 'field',
      name: 'value',
      scope: 'component'
    });
    expect(commonFields.value.events).toContain('UPDATE_VALUE');

    expect(commonFields.correct).toMatchObject({
      type: 'field',
      name: 'correct',
      scope: 'component'
    });
    expect(commonFields.correct.events).toContain('UPDATE_CORRECT');
  });

  it('includes all expected common fields', () => {
    expect(commonFields.value).toBeDefined();
    expect(commonFields.correct).toBeDefined();
    expect(commonFields.message).toBeDefined();
    expect(commonFields.submitCount).toBeDefined();
    expect(commonFields.showAnswer).toBeDefined();
  });

  it('has backward-compatible event property', () => {
    expect(commonFields.value.event).toBe('UPDATE_VALUE');
    expect(commonFields.correct.event).toBe('UPDATE_CORRECT');
  });
});
