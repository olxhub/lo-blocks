// packages/shared/lib/docs/schemaUtils.ts
//
// Utilities for extracting documentation-friendly information from Zod schemas.
//
import { z } from 'zod';
import { baseAttributes, inputAttributes, graderAttributes, isInternalAttribute } from '@/lib/blocks/attributeSchemas';

// Mixin membership for attribute grouping — derived from the actual mixin
// shapes so the docs can never drift from the factory's composition.
const ATTRIBUTE_GROUPS: Array<[group: 'base' | 'input' | 'grader', names: Set<string>]> = [
  ['base', new Set(Object.keys(baseAttributes.shape))],
  ['input', new Set(Object.keys(inputAttributes.shape))],
  ['grader', new Set(Object.keys(graderAttributes.shape))],
];

function attributeGroup(name: string): 'own' | 'base' | 'input' | 'grader' {
  for (const [group, names] of ATTRIBUTE_GROUPS) {
    if (names.has(name)) return group;
  }
  return 'own';
}

/** Attribute documentation extracted from a block's Zod schema. */
export const AttributeDocSchema = z.object({
  name: z.string().describe('Attribute name as used in OLX'),
  type: z.string().describe('Type label (string, number, boolean, enum, etc.)'),
  required: z.boolean(),
  description: z.string().optional(),
  enumValues: z.array(z.string()).optional().describe('Allowed values for enum types'),
  default: z.unknown().optional(),
  group: z.enum(['own', 'base', 'input', 'grader']).optional().describe(
    'Where the attribute comes from: block-specific ("own") or a shared ' +
    'mixin (base/input/grader). Computed where the mixin schemas live.'),
});

export type AttributeDoc = z.infer<typeof AttributeDocSchema>;

/**
 * Get the human-readable type name from a Zod schema.
 */
function getTypeName(schema: z.ZodTypeAny): { type: string; enumValues?: string[] } {
  const def = schema._def;
  const typeName = def?.typeName;

  switch (typeName) {
    case 'ZodString':
      return { type: 'string' };
    case 'ZodNumber':
      return { type: 'number' };
    case 'ZodBoolean':
      return { type: 'boolean' };
    case 'ZodEnum':
      return { type: 'enum', enumValues: def.values as string[] };
    case 'ZodNativeEnum':
      return { type: 'enum', enumValues: Object.values(def.values) as string[] };
    case 'ZodLiteral':
      return { type: `literal(${JSON.stringify(def.value)})` };
    case 'ZodArray':
      const inner = getTypeName(def.type);
      return { type: `${inner.type}[]` };
    case 'ZodOptional':
      return getTypeName(def.innerType);
    case 'ZodNullable':
      return getTypeName(def.innerType);
    case 'ZodDefault':
      return getTypeName(def.innerType);
    case 'ZodEffects':
      // Transforms, refinements, etc.
      return getTypeName(def.schema);
    case 'ZodUnion':
      const options = (def.options as z.ZodTypeAny[]).map(o => getTypeName(o).type);
      return { type: options.join(' | ') };
    case 'ZodObject':
      return { type: 'object' };
    case 'ZodAny':
      return { type: 'any' };
    default:
      return { type: typeName?.replace('Zod', '').toLowerCase() || 'unknown' };
  }
}

/**
 * Check if a schema is optional (wrapped in ZodOptional or has a default).
 */
function isOptional(schema: z.ZodTypeAny): boolean {
  const typeName = schema._def?.typeName;
  if (typeName === 'ZodOptional') return true;
  if (typeName === 'ZodDefault') return true;
  if (typeName === 'ZodNullable') {
    // Nullable + optional = optional
    return isOptional(schema._def.innerType);
  }
  return false;
}

/**
 * Get the description from a Zod schema (set via .describe()).
 */
function getDescription(schema: z.ZodTypeAny): string | undefined {
  return schema._def?.description || schema.description;
}

/**
 * Get default value if set.
 */
function getDefault(schema: z.ZodTypeAny): unknown | undefined {
  if (schema._def?.typeName === 'ZodDefault') {
    return schema._def.defaultValue();
  }
  return undefined;
}

/**
 * Extract attribute documentation from a Zod object schema.
 * Returns an array of attribute docs, or null if the schema is not extractable.
 */
export function extractAttributes(schema: z.ZodTypeAny | undefined): AttributeDoc[] | null {
  if (!schema) return null;

  // Unwrap passthrough/strict wrappers
  let effectiveSchema = schema;
  const def = schema._def;

  // Handle ZodEffects (transforms, refinements)
  if (def?.typeName === 'ZodEffects') {
    effectiveSchema = def.schema;
  }

  // Must be a ZodObject
  if (effectiveSchema._def?.typeName !== 'ZodObject') {
    return null;
  }

  const shape = (effectiveSchema as z.ZodObject<any>).shape;
  if (!shape) return null;

  const attributes: AttributeDoc[] = [];

  for (const [name, fieldSchema] of Object.entries(shape)) {
    if (isInternalAttribute(name)) continue;  // not authorable
    const field = fieldSchema as z.ZodTypeAny;
    const { type, enumValues } = getTypeName(field);
    const description = getDescription(field);
    const defaultValue = getDefault(field);

    attributes.push({
      name,
      type,
      required: !isOptional(field),
      description,
      enumValues,
      default: defaultValue,
      group: attributeGroup(name),
    });
  }

  // Sort: required first, then alphabetically
  attributes.sort((a, b) => {
    if (a.required !== b.required) return a.required ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return attributes;
}
