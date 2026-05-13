// packages/shared/lib/docs/tools.ts
//
// Docs tools — register block documentation tools with a ToolRegistry.
//
// One tool:
//   get_blocks — unified block query with filtering, pagination, and
//                selectable detail level via `include`.
//
// Replaces the earlier list_blocks + get_block_info pair.

import fs from 'fs/promises';
import path from 'path';
import { z } from 'zod';
import { BLOCK_REGISTRY } from '@/components/blockRegistry';
import { extractAttributes, AttributeDocSchema } from '@/lib/docs/schemaUtils';
import { getCategories } from '@/lib/docs/categoryUtils';
import { resolveSafeReadPath } from '@/lib/lofs/providers/file';
import { OLXTagSchema, BlockGitStatusSchema } from '@/lib/types';
import type { LoBlock } from '@/lib/types';
import type { ToolRegistry } from '@/lib/mcp/registry';

/** Optional heavy fields that callers can request via `include`. */
const IncludeField = z.enum([
  'attributes',  // Zod-extracted attribute docs
  'fields',      // State field names
  'template',    // Editor insert template (bare block)
  'demo',        // Docs marquee example (minimum working example with context)
  'readme',      // Full README content
  'examples',    // All example files with content
]);

// -- Input ------------------------------------------------------------------

const GetBlocksInput = z.object({
  filter: z.array(z.string()).optional().describe(
    'Block names and/or categories to include (OR). ' +
    'Each entry matches against block names and category labels. ' +
    'Omit to return all non-internal blocks.',
  ),
  include: z.array(IncludeField).optional().describe(
    'Additional detail to include per block. ' +
    'Without this, only name/description/categories are returned.',
  ),
  limit: z.number().int().min(0).max(500).optional().describe('Max blocks to return (default 300)'),
  offset: z.number().int().min(0).optional().describe('Number of blocks to skip (default 0)'),
});

// -- Output -----------------------------------------------------------------

/** File content with its path. */
const FileContentSchema = z.object({
  path: z.string().describe('Path relative to project root'),
  content: z.string().describe('File content (UTF-8)'),
});

/** Example file with content and metadata. */
const ExampleSchema = z.object({
  path: z.string().describe('Path relative to project root'),
  filename: z.string().describe('Base filename'),
  content: z.string().describe('Example file content (UTF-8)'),
  gitStatus: BlockGitStatusSchema.nullable(),
});

/** Per-block result. Fields beyond name/description/categories appear only
 *  when requested via `include`. */
const BlockResultSchema = z.object({
  name: OLXTagSchema,
  description: z.string().nullable(),
  categories: z.array(z.string()).describe('All categories this block belongs to'),

  // Included on request
  attributes: z.array(AttributeDocSchema).nullable().optional(),
  fields: z.array(z.string()).optional(),
  template: z.string().nullable().optional().describe('Editor insert template (bare block)'),
  demo: z.string().nullable().optional().describe('Docs marquee example (minimum working example with context)'),
  readme: FileContentSchema.nullable().optional(),
  examples: z.array(ExampleSchema).optional(),
});

const GetBlocksOutput = z.object({
  blocks: z.array(BlockResultSchema),
  total: z.number().describe('Total matching blocks (before pagination)'),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// TODO: Cache file reads. Will be addressed when docs tools move to LOFS.
/** Read a file relative to cwd, returning null on failure. */
async function safeReadFile(relPath: string): Promise<string | null> {
  try {
    const full = await resolveSafeReadPath(process.cwd(), relPath);
    return await fs.readFile(full, 'utf8');
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

const DEFAULT_LIMIT = 300;

async function getBlocks(
  args: z.infer<typeof GetBlocksInput>,
): Promise<z.infer<typeof GetBlocksOutput>> {
  const { filter, include, limit = DEFAULT_LIMIT, offset = 0 } = args;
  const includeSet = new Set(include ?? []);

  // -- Collect all blocks with their categories ----------------------------
  type Entry = { block: LoBlock; name: string; categories: string[] };
  const allEntries: Entry[] = [];
  for (const block of Object.values(BLOCK_REGISTRY) as LoBlock[]) {
    if (!block._isBlock) continue;
    const categories = getCategories(block);
    allEntries.push({ block, name: block.name, categories });
  }

  // -- Filter --------------------------------------------------------------
  let matched: Entry[];
  if (filter && filter.length > 0) {
    const filterSet = new Set(filter);
    matched = allEntries.filter(
      (e) => filterSet.has(e.name) || e.categories.some((c) => filterSet.has(c)),
    );
  } else {
    // No filter → all non-internal blocks
    matched = allEntries.filter((e) => !e.block.internal);
  }

  // -- Sort & paginate -----------------------------------------------------
  matched.sort((a, b) => a.name.localeCompare(b.name));
  const total = matched.length;
  const page = matched.slice(offset, offset + limit);

  // -- Build results -------------------------------------------------------
  const blocks: z.infer<typeof BlockResultSchema>[] = [];

  for (const { block, name, categories } of page) {
    const entry: z.infer<typeof BlockResultSchema> = {
      name,
      description: block.description || null,
      categories,
    };

    if (includeSet.has('attributes')) {
      entry.attributes = extractAttributes(block.attributes);
    }
    if (includeSet.has('fields')) {
      entry.fields = Object.keys(block.fields || {});
    }
    if (includeSet.has('template')) {
      // Resolved by generateBlockRegistry.js:
      // {BlockName}.template.olx if it exists, else {BlockName}.olx.
      entry.template = block.template ? await safeReadFile(block.template) : null;
    }
    if (includeSet.has('demo')) {
      // Resolved by generateBlockRegistry.js:
      // {BlockName}.demo.olx if it exists, else {BlockName}.olx.
      entry.demo = block.demo ? await safeReadFile(block.demo) : null;
    }
    if (includeSet.has('readme') && block.readme) {
      const content = await safeReadFile(block.readme);
      entry.readme = content ? { path: block.readme, content } : null;
    }
    if (includeSet.has('examples') && block.examples?.length) {
      entry.examples = [];
      for (const example of block.examples) {
        const content = await safeReadFile(example.path);
        if (content !== null) {
          entry.examples.push({
            path: example.path,
            filename: path.basename(example.path),
            content,
            gitStatus: example.gitStatus ?? null,
          });
        }
      }
    }

    blocks.push(entry);
  }

  return { blocks, total };
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

/**
 * Register docs tools with a ToolRegistry.
 *
 * Tools registered:
 *   get_blocks — query block documentation with filtering, pagination,
 *                and selectable detail level.
 */
export function registerDocsTools(registry: ToolRegistry): void {
  registry.register('get_blocks', {
    description:
      'Query OLX block types. Returns name, description, and categories by default. ' +
      'Use `filter` to select blocks by name or category (OR). ' +
      'Use `include` to add detail: attributes, fields, template, demo, readme, examples.',
    input: GetBlocksInput,
    output: GetBlocksOutput,
    annotations: { readOnlyHint: true, idempotentHint: true },
  }, getBlocks);
}
