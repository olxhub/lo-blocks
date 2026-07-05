// packages/shared/lib/docs/schema.ts
//
// Wire schemas for the get_blocks MCP tool — shared between the server-side
// tool implementation (tools.ts) and the client-side docs slice
// (lib/state/docs.ts), which validates responses against them.
//
// Separate from tools.ts on purpose: tools.ts reads files (node:fs) and
// must never enter the browser bundle. Mirrors the catalog split
// (catalog/schema.ts shared, catalog/tool.ts server-side).

import { z } from 'zod';
import { AttributeDocSchema } from '@/lib/docs/schemaUtils';
import { OLXTagSchema, BlockGitStatusSchema } from '@/lib/types';

/** File content with its path. */
export const FileContentSchema = z.object({
  path: z.string().describe('Path relative to project root'),
  content: z.string().describe('File content (UTF-8)'),
});

/** Example file with content and metadata (value in examples dict). */
export const ExampleSchema = z.object({
  path: z.string().describe('Path relative to project root'),
  content: z.string().describe('Example file content (UTF-8)'),
  gitStatus: BlockGitStatusSchema.nullable(),
  rootId: z.string().nullable().optional().describe(
    'DefinitionKey of the file\'s top-level block in the system content ' +
    'index (docs.* namespace). Render examples by this id via the standard ' +
    'content pipeline — the indexed copy is parsed in place, so relative ' +
    'src=/cast= companions resolve. Null when the file is not indexed.'),
});

/** Per-block result. Fields beyond name/description/categories appear only
 *  when requested via `include`. */
export const BlockResultSchema = z.object({
  name: OLXTagSchema,
  description: z.string().nullable(),
  categories: z.array(z.string()).describe('All categories this block belongs to'),
  source: z.string().nullable().optional().describe('Blueprint file path'),
  namespace: z.string().optional().describe('Block namespace (e.g. "olx")'),
  isInput: z.boolean().optional(),
  isGrader: z.boolean().optional(),

  // Included on request
  attributes: z.array(AttributeDocSchema).nullable().optional(),
  // Open shape: the field system will grow (server-side fields, aggregating
  // fields, field types) — consumers must tolerate unknown keys.
  fields: z.array(z.object({ name: z.string() }).passthrough()).optional(),
  template: z.string().nullable().optional().describe('Editor insert template (bare block)'),
  demo: z.string().nullable().optional().describe('Docs marquee example (minimum working example with context)'),
  readme: FileContentSchema.nullable().optional(),
  examples: z.record(z.string(), ExampleSchema).optional().describe('Example files keyed by filename'),
  formats: z.array(z.string()).optional().describe('Content format names used by this block (e.g. "chatpeg")'),
});

export const GetBlocksOutput = z.object({
  blocks: z.array(BlockResultSchema),
  total: z.number().describe('Total matching blocks (before pagination)'),
});

/** One block's documentation record as it crosses the MCP wire. */
export type BlockDocInfo = z.infer<typeof BlockResultSchema>;

// ---------------------------------------------------------------------------
// get_formats wire schemas (content formats: PEG grammars, YAML schemas)
// ---------------------------------------------------------------------------

/** Format types. PEG grammars are auto-discovered; others will be registered
 *  as the format system grows. */
export const FormatType = z.enum(['peg', 'yaml']);

/** Per-format result. Fields beyond the descriptor appear only when
 *  requested via `include`. */
export const FormatResultSchema = z.object({
  name: z.string().describe('Format name (e.g. "chat")'),
  type: FormatType.describe('Format type'),
  extension: z.string().nullable().describe('Content file extension (e.g. "chatpeg"), null for inline-only formats'),
  description: z.string().nullable(),
  source: z.string().nullable().describe('Path to format spec file (e.g. .pegjs source)'),
  blocks: z.array(z.string()).describe('Block names that use this format'),

  // Included on request
  spec: z.string().nullable().optional().describe('Format specification (PEG grammar source, schema description, etc.)'),
  readme: FileContentSchema.nullable().optional(),
  preview: z.string().nullable().optional().describe('Preview OLX template'),
  examples: z.record(z.string(), z.object({
    path: z.string(),
    content: z.string(),
  })).optional(),
});

export const GetFormatsOutput = z.object({
  formats: z.array(FormatResultSchema),
  total: z.number().describe('Total matching formats (before pagination)'),
});

/** One content format's documentation record as it crosses the MCP wire. */
export type FormatDocInfo = z.infer<typeof FormatResultSchema>;
