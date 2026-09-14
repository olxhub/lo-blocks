// packages/shared/components/common/CodeEditor/olxSchema.ts
//
// Generates CodeMirror XML schema (ElementSpec[] + AttrSpec[]) from the block
// registry, enabling schema-based autocompletion in the OLX editor.
//
// - Element names come from registered block tags
// - Per-element attributes are extracted from each block's Zod schema
// - Enum values (z.enum) become AttrSpec.values for completion
// - Base attributes (id, title, class, ...) are global (available on all elements)
// - childMode determines whether child element completion is offered
//
import { z } from 'zod';
import type { ElementSpec, AttrSpec } from '@codemirror/lang-xml';
import type { BlockRegistry } from '@/lib/types';
import { baseAttributes } from '@/lib/blocks/attributeSchemas';

/**
 * Extract enum values from a Zod schema, unwrapping optionals/transforms/unions.
 * Returns the string values if the innermost type is a ZodEnum, else undefined.
 */
function extractEnumValues(schema: z.ZodTypeAny): string[] | undefined {
  const def = (schema as any)._def;
  const typeName = def?.typeName;

  switch (typeName) {
    case 'ZodEnum':
      return def.values as string[];
    case 'ZodOptional':
    case 'ZodNullable':
    case 'ZodDefault':
      return extractEnumValues(def.innerType);
    case 'ZodEffects':
      return extractEnumValues(def.schema);
    case 'ZodUnion':
      // For unions like z_olx_boolean = z.union([z.enum(['true','false']), z.boolean()])
      // return the first enum found
      for (const option of (def.options as z.ZodTypeAny[])) {
        const vals = extractEnumValues(option);
        if (vals) return vals;
      }
      return undefined;
    default:
      return undefined;
  }
}

/**
 * Unwrap a Zod schema to reach the inner ZodObject, stripping
 * .strict()/.passthrough() (ZodEffects) wrappers.
 */
function unwrapToObject(schema: z.ZodTypeAny): z.ZodObject<any> | null {
  const def = (schema as any)._def;
  if (def?.typeName === 'ZodEffects' || def?.typeName === 'ZodPipeline') {
    return unwrapToObject(def.schema ?? def.in);
  }
  if (def?.typeName === 'ZodObject') {
    return schema as z.ZodObject<any>;
  }
  return null;
}

/**
 * Extract AttrSpec[] from a Zod object schema's shape.
 * Each key becomes an AttrSpec; enum types get their values populated.
 */
function extractAttrsFromZodObject(schema: z.ZodTypeAny): AttrSpec[] {
  const obj = unwrapToObject(schema);
  if (!obj) return [];

  const attrs: AttrSpec[] = [];
  for (const [name, fieldSchema] of Object.entries(obj.shape)) {
    const enumValues = extractEnumValues(fieldSchema as z.ZodTypeAny);
    const attr: AttrSpec = { name };
    if (enumValues) {
      attr.values = enumValues;
    }
    attrs.push(attr);
  }
  return attrs;
}

/** Names of attributes in baseAttributes (global on all elements). */
const BASE_ATTR_NAMES = new Set(Object.keys(baseAttributes.shape));

/**
 * Generate CodeMirror XML schema from the block registry.
 *
 * Returns ElementSpec[] and AttrSpec[] suitable for passing to
 * `xml({ elements, attributes })` from @codemirror/lang-xml.
 *
 * The result is pure data and safe to memoize.
 */
export function generateOlxSchema(registry: BlockRegistry): {
  elements: readonly ElementSpec[];
  attributes: readonly AttrSpec[];
} {
  // Global attributes: baseAttributes keys available on all elements
  const globalAttrs: AttrSpec[] = extractAttrsFromZodObject(baseAttributes)
    .map(attr => ({ ...attr, global: true }));

  const elements: ElementSpec[] = [];

  for (const [name, block] of Object.entries(registry)) {
    // Extract per-element attributes, excluding globals (already covered).
    // A block MAY shadow a base attribute with a wider schema (e.g. Tabs
    // widens `print` with "no-chrome"); those are kept locally so completion
    // offers the block's own values rather than the base ones.
    let localAttrs: AttrSpec[] = [];
    if (block.attributes) {
      const shape = unwrapToObject(block.attributes)?.shape ?? {};
      const allAttrs = extractAttrsFromZodObject(block.attributes);
      localAttrs = allAttrs.filter(a =>
        !BASE_ATTR_NAMES.has(a.name) || shape[a.name] !== (baseAttributes.shape as any)[a.name]
      );
    }

    // Determine child element completion behavior from childMode:
    //   'blocks' / undefined → all elements allowed (don't specify children)
    //   'text' / 'none'     → no child elements (children: [])
    const children = (block.childMode === 'text' || block.childMode === 'none')
      ? [] as string[]
      : undefined;

    elements.push({
      name,
      top: true,
      attributes: localAttrs.length > 0 ? localAttrs : undefined,
      children,
    });
  }

  return { elements, attributes: globalAttrs };
}
