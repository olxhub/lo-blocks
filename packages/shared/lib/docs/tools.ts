// packages/shared/lib/docs/tools.ts
//
// Docs tools — register block and content format documentation tools
// with a ToolRegistry.
//
// Two tools:
//   get_blocks  — unified block query with filtering, pagination, and
//                 selectable detail level via `include`.
//   get_formats — content format query (PEG grammars, YAML schemas, etc.)
//                 with filtering, pagination, and selectable detail.

import fs from 'fs/promises';
import path from 'path';
import { z } from 'zod';
import { BLOCK_REGISTRY } from '@/components/blockRegistry';
import { extractAttributes, AttributeDocSchema } from '@/lib/docs/schemaUtils';
import { getCategories } from '@/lib/docs/categoryUtils';
import { resolveSafeReadPath } from '@/lib/lofs/providers/file';
import { grammarInfo, PEG_CONTENT_EXTENSIONS } from '@/generated/parserRegistry';
import { extractMetadata } from '@/lib/docs/grammar';
import { OLXTagSchema, BlockGitStatusSchema } from '@/lib/types';
import type { LoBlock } from '@/lib/types';
import type { ToolRegistry } from '@/lib/mcp/registry';

// ===========================================================================
// get_blocks
// ===========================================================================

/** Optional heavy fields that callers can request via `include`. */
const IncludeField = z.enum([
  'attributes',  // Zod-extracted attribute docs
  'fields',      // State field names
  'template',    // Editor insert template (bare block)
  'demo',        // Docs marquee example (minimum working example with context)
  'readme',      // Full README content
  'examples',    // All example files with content
  'formats',     // Content format names used by this block
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
  formats: z.array(z.string()).optional().describe('Content format names used by this block (e.g. "chatpeg")'),
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
// get_blocks handler
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
    if (includeSet.has('formats')) {
      // Currently populated from block.grammars (PEG). Will expand to
      // include YAML+Zod and other content format identifiers.
      entry.formats = block.grammars ?? [];
    }
    if (includeSet.has('examples') && block.examples?.length) {
      const results = await Promise.all(
        block.examples.map(async (example) => {
          const content = await safeReadFile(example.path);
          if (content === null) return null;
          return {
            path: example.path,
            filename: path.basename(example.path),
            content,
            gitStatus: example.gitStatus ?? null,
          };
        }),
      );
      entry.examples = results.filter((r): r is NonNullable<typeof r> => r !== null);
    }

    blocks.push(entry);
  }

  return { blocks, total };
}

// ===========================================================================
// get_formats
// ===========================================================================

/** Format types. PEG grammars are auto-discovered; others will be registered
 *  as the format system grows. */
const FormatType = z.enum(['peg', 'yaml']);

const FormatIncludeField = z.enum([
  'readme',      // Full README content
  'spec',        // Format specification (PEG grammar source, Zod schema description, etc.)
  'preview',     // Preview OLX template
  'examples',    // Example content files
]);

const GetFormatsInput = z.object({
  filter: z.array(z.string()).optional().describe(
    'Format names, extensions, or block names to include (OR). ' +
    'Accepts grammar names ("chat"), extensions ("chatpeg"), or block names ("Chat"). ' +
    'Omit to return all formats.',
  ),
  include: z.array(FormatIncludeField).optional().describe(
    'Additional detail to include per format. ' +
    'Without this, only name/type/description/blocks are returned.',
  ),
  limit: z.number().int().min(0).max(100).optional().describe('Max formats to return (default 50)'),
  offset: z.number().int().min(0).optional().describe('Number of formats to skip (default 0)'),
});

const FormatResultSchema = z.object({
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
  examples: z.array(z.object({
    path: z.string(),
    filename: z.string(),
    content: z.string(),
  })).optional(),
});

const GetFormatsOutput = z.object({
  formats: z.array(FormatResultSchema),
  total: z.number().describe('Total matching formats (before pagination)'),
});

const FORMAT_DEFAULT_LIMIT = 50;

/** A discovered content format entry (internal, pre-filtering). */
type FormatEntry = {
  name: string;
  type: z.infer<typeof FormatType>;
  extension: string | null;
  dir: string | null;
  source: string | null;
  /** Explicit description — skips frontmatter extraction when set. */
  description?: string;
};

async function getFormats(
  args: z.infer<typeof GetFormatsInput>,
): Promise<z.infer<typeof GetFormatsOutput>> {
  const { filter, include, limit = FORMAT_DEFAULT_LIMIT, offset = 0 } = args;
  const includeSet = new Set(include ?? []);

  // -- Build block↔format reverse index (always — used for default blocks
  // field and for filter-by-block-name) ------------------------------------
  const formatToBlocks: Record<string, string[]> = {};
  for (const block of Object.values(BLOCK_REGISTRY) as LoBlock[]) {
    if (!block._isBlock || !block.grammars) continue;
    for (const g of block.grammars) {
      if (!formatToBlocks[g]) formatToBlocks[g] = [];
      formatToBlocks[g].push(block.name);
    }
  }

  // -- Collect all formats --------------------------------------------------
  const allEntries: FormatEntry[] = [];

  // PEG formats: auto-discovered from parser registry
  for (const ext of PEG_CONTENT_EXTENSIONS) {
    const info = grammarInfo[ext];
    if (!info) continue;
    const dir = info.grammarDir.replace(/^@\//, 'packages/shared/');
    const source = `${dir}/${info.grammarName}.pegjs`;
    allEntries.push({ name: info.grammarName, type: 'peg', extension: ext, dir, source });
  }

  // TODO: Non-PEG formats are hardcoded here. Move to a declarative
  // format registry (parallel to parserRegistry for PEG) so formats
  // can self-register from their own modules.
  // TODO: Cast has no format documentation (README, examples, preview).
  // Needs a cast.md or README.md in packages/shared/lib/avatar/.
  allEntries.push({
    name: 'cast',
    type: 'yaml',
    extension: 'cast',
    dir: 'packages/shared/lib/avatar',
    source: 'packages/shared/lib/avatar/types.ts',
    description: 'Character definitions for dialogue and scenario blocks (YAML)',
  });

  // -- Filter (matches format name, extension, OR block name) ---------------
  let matched: FormatEntry[];
  if (filter && filter.length > 0) {
    const filterSet = new Set(filter);
    matched = allEntries.filter((e) => {
      if (filterSet.has(e.name)) return true;
      if (e.extension && filterSet.has(e.extension)) return true;
      const key = e.extension ?? e.name;
      if ((formatToBlocks[key] ?? []).some((b) => filterSet.has(b))) return true;
      return false;
    });
  } else {
    matched = allEntries;
  }

  // -- Sort & paginate ------------------------------------------------------
  matched.sort((a, b) => a.name.localeCompare(b.name));
  const total = matched.length;
  const page = matched.slice(offset, offset + limit);

  // -- Build results --------------------------------------------------------
  const formats: z.infer<typeof FormatResultSchema>[] = [];

  for (const fmt of page) {
    const { name, type, extension, dir, source } = fmt;

    // Read spec source — used for frontmatter description (PEG) and
    // optionally returned via include: ['spec']
    const specContent = source ? await safeReadFile(source) : null;

    // Prefer explicit description (non-PEG formats), fall back to
    // frontmatter extraction (PEG grammars)
    let description = fmt.description ?? null;
    if (!description && specContent) {
      const metadata: Record<string, any> = extractMetadata(specContent);
      description = metadata.description || null;
    }

    const key = extension ?? name;
    const entry: z.infer<typeof FormatResultSchema> = {
      name,
      type,
      extension,
      description,
      source,
      blocks: formatToBlocks[key] ?? [],
    };

    if (includeSet.has('spec')) {
      entry.spec = specContent;
    }

    if (includeSet.has('readme') && dir) {
      // Try format-specific readme, then directory README
      const readmePaths = type === 'peg'
        ? [`${dir}/${name}.pegjs.md`, `${dir}/README.md`]
        : [`${dir}/${name}.md`, `${dir}/README.md`];
      entry.readme = null;
      for (const rp of readmePaths) {
        const content = await safeReadFile(rp);
        if (content) {
          entry.readme = { path: rp, content };
          break;
        }
      }
    }

    if (includeSet.has('preview') && dir) {
      // Preview template: {name}.pegjs.preview.olx (PEG) or {name}.preview.olx
      const previewPath = type === 'peg'
        ? `${dir}/${name}.pegjs.preview.olx`
        : `${dir}/${name}.preview.olx`;
      entry.preview = await safeReadFile(previewPath);
    }

    if (includeSet.has('examples') && dir && extension) {
      try {
        const fullDir = await resolveSafeReadPath(process.cwd(), dir);
        const files = await fs.readdir(fullDir);
        const exampleFiles = files.filter(f => f.endsWith(`.${extension}`));
        const results = await Promise.all(
          exampleFiles.map(async (filename) => {
            const filePath = `${dir}/${filename}`;
            const content = await safeReadFile(filePath);
            if (content === null) return null;
            return { path: filePath, filename, content };
          }),
        );
        entry.examples = results.filter((r): r is NonNullable<typeof r> => r !== null);
      } catch {
        // Directory not readable — skip examples
        entry.examples = [];
      }
    }

    formats.push(entry);
  }

  return { formats, total };
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

/**
 * Register docs tools with a ToolRegistry.
 *
 * Tools registered:
 *   get_blocks  — query block documentation with filtering, pagination,
 *                 and selectable detail level.
 *   get_formats — query content format documentation (PEG grammars, YAML
 *                 schemas, etc.) with filtering, pagination, and detail.
 */
export function registerDocsTools(registry: ToolRegistry): void {
  registry.register('get_blocks', {
    description:
      'Query OLX block types. Returns name, description, and categories by default. ' +
      'Use `filter` to select blocks by name or category (OR). ' +
      'Use `include` to add detail: attributes, fields, template, demo, readme, examples, formats.',
    input: GetBlocksInput,
    output: GetBlocksOutput,
    annotations: { readOnlyHint: true, idempotentHint: true },
  }, getBlocks);

  registry.register('get_formats', {
    description:
      'Query content format definitions (PEG grammars, YAML schemas, etc.). ' +
      'Returns name, type, description, and associated blocks by default. ' +
      'Use `filter` to select formats by name, extension, or block name. ' +
      'Use `include` to add detail: spec, readme, preview, examples.',
    input: GetFormatsInput,
    output: GetFormatsOutput,
    annotations: { readOnlyHint: true, idempotentHint: true },
  }, getFormats);
}
