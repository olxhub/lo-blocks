// @vitest-environment node
// packages/shared/lib/blocks/printAttribute.test.ts
//
// `print` is an OPEN enum: baseAttributes declares the values every block
// understands ("true"/"false"), and an individual block may widen it by
// redeclaring `print` in its own attribute schema plus `allowOverrides`.
// Tabs is the first such extension ("no-chrome").
//
// These tests pin down the three things that make the extension usable:
//   1. the base enum still validates on every block,
//   2. an extending block accepts BOTH the base values and its own,
//   3. a non-extending block rejects another block's value.
import { z } from 'zod';
import { baseAttributes, printModes } from './attributeSchemas';
import { extractAttributes } from '@/lib/docs/schemaUtils';
import Tabs from '@/components/blocks/layout/Tabs/Tabs';
import Vertical from '@/components/blocks/layout/Vertical/Vertical';

const parseAttrs = (block: { attributes?: z.ZodTypeAny }, attrs: Record<string, unknown>) =>
  (block.attributes as z.ZodTypeAny).safeParse(attrs);

describe('print attribute: base enum', () => {
  it('baseAttributes accepts "true" and "false" and keeps them as strings', () => {
    expect(baseAttributes.parse({ print: 'false' }).print).toBe('false');
    expect(baseAttributes.parse({ print: 'true' }).print).toBe('true');
  });

  it('print is optional and rejects unknown values', () => {
    expect(baseAttributes.parse({}).print).toBeUndefined();
    expect(baseAttributes.safeParse({ print: 'no-chrome' }).success).toBe(false);
    expect(baseAttributes.safeParse({ print: 'maybe' }).success).toBe(false);
  });

  it('printModes is the shared list blocks extend from', () => {
    expect([...printModes]).toEqual(['true', 'false']);
  });
});

describe('print attribute: block-level extension', () => {
  it('Tabs accepts its own "no-chrome" mode', () => {
    const parsed = parseAttrs(Tabs, { print: 'no-chrome' });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.print).toBe('no-chrome');
  });

  it('Tabs still accepts the base values (the override widens, never narrows)', () => {
    for (const mode of printModes) {
      expect(parseAttrs(Tabs, { print: mode }).success).toBe(true);
    }
    expect(parseAttrs(Tabs, { print: 'nonsense' }).success).toBe(false);
  });

  it('the override does not leak: a block without it rejects "no-chrome"', () => {
    expect(parseAttrs(Vertical, { print: 'no-chrome' }).success).toBe(false);
    expect(parseAttrs(Vertical, { print: 'false' }).success).toBe(true);
  });

  it('the rest of baseAttributes survives the override (still strict)', () => {
    expect(parseAttrs(Tabs, { print: 'no-chrome', title: 'T', id: 'tabs1' }).success).toBe(true);
    expect(parseAttrs(Tabs, { bogusAttribute: 'x' }).success).toBe(false);
  });
});

describe('print attribute: docs extraction', () => {
  it('base blocks document print as a two-value enum', () => {
    const doc = extractAttributes(Vertical.attributes)?.find(a => a.name === 'print');
    expect(doc).toBeDefined();
    expect(doc!.type).toBe('enum');
    expect(doc!.enumValues).toEqual(['true', 'false']);
    expect(doc!.required).toBe(false);
    expect(doc!.group).toBe('base');
  });

  it('an extending block documents its widened value list', () => {
    const doc = extractAttributes(Tabs.attributes)?.find(a => a.name === 'print');
    expect(doc!.enumValues).toEqual(['true', 'false', 'no-chrome']);
    // Grouping is by NAME, so an extended base attribute still reads as
    // "base" in the docs — it is the same authored attribute, widened.
    expect(doc!.group).toBe('base');
    expect(doc!.description).toMatch(/no-chrome/);
  });

  it('print appears exactly once in a block\'s attribute docs', () => {
    const names = extractAttributes(Tabs.attributes)!.map(a => a.name);
    expect(names.filter(n => n === 'print')).toHaveLength(1);
  });
});
