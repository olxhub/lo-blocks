// packages/shared/lib/mcp/zodToJsonSchema.ts
//
// Thin wrapper around zod-to-json-schema for converting Zod schemas
// to JSON Schema. Used by the tool registry to generate schemas for
// MCP, Claude API tool_use, and OpenAPI.

import { zodToJsonSchema as convert } from 'zod-to-json-schema';
import type { z } from 'zod';

/**
 * Convert a Zod schema to a JSON Schema object suitable for tool
 * descriptors. Strips the $schema meta-property since tool formats
 * don't need it.
 */
export function zodToJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const jsonSchema = convert(schema, { $refStrategy: 'none' });
  const { $schema, ...rest } = jsonSchema as Record<string, unknown>;
  return rest;
}
