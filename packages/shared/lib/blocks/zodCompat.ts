// packages/shared/lib/blocks/zodCompat.ts
//
// Zod schema compatibility checking for input/grader type safety.
//
// Inputs declare what they produce (valueSchema), graders declare what they
// accept (inputSchema). This module checks structural compatibility by
// comparing base types — refinements like .positive() or .min(5) are
// ignored since they narrow values without changing the wire type.
//
import { z } from 'zod';

/**
 * Extract the structural base type from a Zod schema, ignoring refinements.
 *
 * Examples:
 *   z.string()            → 'string'
 *   z.number().positive()  → 'number'
 *   z.array(z.string())   → 'string[]'
 *   z.object({...})       → 'object'
 *   z.any()               → 'any'
 *   z.union([z.string(), z.number()]) → 'string | number'
 */
export function describeZodType(schema: z.ZodType): string {
  const def = (schema as any)._def;
  const typeName = def?.typeName;

  switch (typeName) {
    case 'ZodString':
      return 'string';
    case 'ZodNumber':
      return 'number';
    case 'ZodBoolean':
      return 'boolean';
    case 'ZodArray':
      return `${describeZodType(def.type)}[]`;
    case 'ZodObject':
      return 'object';
    case 'ZodRecord':
      return 'record';
    case 'ZodEnum':
      return 'enum';
    case 'ZodLiteral':
      return `literal(${JSON.stringify(def.value)})`;
    case 'ZodUnion':
      return (def.options as z.ZodType[]).map(o => describeZodType(o)).join(' | ');
    case 'ZodAny':
      return 'any';
    // Wrappers — unwrap and recurse
    case 'ZodEffects':
      return describeZodType(def.schema);
    case 'ZodOptional':
    case 'ZodNullable':
      return describeZodType(def.innerType);
    case 'ZodDefault':
      return describeZodType(def.innerType);
    default:
      return typeName?.replace('Zod', '').toLowerCase() || 'unknown';
  }
}

/**
 * Get the raw Zod typeName, unwrapping refinements/optionals/defaults.
 * Returns the canonical type identifier for structural comparison.
 *
 * For arrays, returns 'ZodArray' (caller can inspect element type separately).
 * For unions, returns 'ZodUnion' (caller handles member checking).
 */
function getRawTypeName(schema: z.ZodType): string {
  const def = (schema as any)._def;
  const typeName = def?.typeName;

  switch (typeName) {
    // Wrappers — unwrap
    case 'ZodEffects':
      return getRawTypeName(def.schema);
    case 'ZodOptional':
    case 'ZodNullable':
      return getRawTypeName(def.innerType);
    case 'ZodDefault':
      return getRawTypeName(def.innerType);
    default:
      return typeName || 'unknown';
  }
}

/**
 * Get the element type schema for arrays, unwrapping wrappers first.
 * Returns undefined if the schema is not an array.
 */
function getArrayElementSchema(schema: z.ZodType): z.ZodType | undefined {
  const def = (schema as any)._def;
  const typeName = def?.typeName;

  switch (typeName) {
    case 'ZodArray':
      return def.type;
    case 'ZodEffects':
      return getArrayElementSchema(def.schema);
    case 'ZodOptional':
    case 'ZodNullable':
      return getArrayElementSchema(def.innerType);
    case 'ZodDefault':
      return getArrayElementSchema(def.innerType);
    default:
      return undefined;
  }
}

/**
 * Check if a value produced by an input (inputSchema) is structurally
 * compatible with what a grader expects (graderSchema).
 *
 * Rules:
 * - ZodAny accepts everything
 * - Matching base types are compatible (refinements ignored)
 * - Arrays are compatible if their element types are compatible
 * - Unions: input is compatible if it matches ANY member of the grader's union
 * - Everything else: base types must match exactly
 */
export function isZodCompatible(inputSchema: z.ZodType, graderSchema: z.ZodType): boolean {
  const graderType = getRawTypeName(graderSchema);

  // ZodAny accepts anything
  if (graderType === 'ZodAny') return true;

  const inputType = getRawTypeName(inputSchema);

  // ZodAny input is compatible with anything (we can't know what it produces)
  if (inputType === 'ZodAny') return true;

  // Union on grader side: input must match at least one member
  if (graderType === 'ZodUnion') {
    const options = (graderSchema as any)._def.options as z.ZodType[];
    return options.some(opt => isZodCompatible(inputSchema, opt));
  }

  // Union on input side: every possible output must be accepted by grader
  if (inputType === 'ZodUnion') {
    const options = (inputSchema as any)._def.options as z.ZodType[];
    return options.every(opt => isZodCompatible(opt, graderSchema));
  }

  // Base types must match
  if (inputType !== graderType) return false;

  // For arrays, also check element type compatibility
  if (inputType === 'ZodArray') {
    const inputElement = getArrayElementSchema(inputSchema);
    const graderElement = getArrayElementSchema(graderSchema);
    if (inputElement && graderElement) {
      return isZodCompatible(inputElement, graderElement);
    }
    // If either element type is missing, accept (can't check further)
    return true;
  }

  return true;
}
