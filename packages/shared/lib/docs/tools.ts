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
import { resolveSafeReadPath } from '@/lib/storage/lofs/providers/file';
import { grammarInfo, PEG_CONTENT_EXTENSIONS } from '@/generated/parserRegistry';
import { extractMetadata } from '@/lib/docs/grammar';
import { OLXTagSchema, BlockGitStatusSchema } from '@/lib/types';
import type { LoBlock, OLXTag } from '@/lib/types';
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
  internal: z.boolean().optional().describe(
    'Include internal/system blocks in unfiltered listings (default false). ' +
    'Explicit filter matches always include internal blocks.'),
  limit: z.number().int().min(0).max(500).optional().describe('Max blocks to return (default 300)'),
  offset: z.number().int().min(0).optional().describe('Number of blocks to skip (default 0)'),
});

// -- Output -----------------------------------------------------------------
//
// Wire schemas live in schema.ts (browser-safe — the client docs slice
// validates against them; this module reads files and must stay server-side).
import {
  FileContentSchema, ExampleSchema, BlockResultSchema, GetBlocksOutput,
  FormatType, FormatResultSchema, GetFormatsOutput,
} from './schema';
import { syncContentFromStorage } from '@/lib/content/syncContentFromStorage';

// ---------------------------------------------------------------------------
// Example root ids — the content index already has every example parsed
// ---------------------------------------------------------------------------

/** Root of the block source tree — must match DocsStorageProvider's default
 *  baseDir (lib/storage/lofs/providers/docs.ts), which mounts this tree under
 *  file:docs:// refs in the system content index. */
const BLOCKS_DIR = 'packages/shared/components/blocks';

/**
 * DefinitionKey of an example file's top-level block in the system content
 * index, or null if the file isn't indexed (parse errors, non-OLX).
 *
 * The index entry is the *parsed* example — src=/cast= companions resolved
 * at parse time with real provenance — so clients render examples by this
 * id through the standard olxjson pipeline instead of re-parsing the raw
 * content as an inline string (which has no file identity, so relative
 * src= cannot resolve).
 */
function exampleRootId(
  parsedFiles: Record<string, { blockIds: string[] }>,
  examplePath: string,
): string | null {
  if (!examplePath.startsWith(`${BLOCKS_DIR}/`)) return null;
  const rel = examplePath.slice(BLOCKS_DIR.length + 1);
  // blockIds are recorded in parse-completion (post-)order — kids before
  // parents — so the file's top-level block is the LAST entry.
  const ids = parsedFiles[`file:docs://${rel}`]?.blockIds;
  return ids?.length ? ids[ids.length - 1] : null;
}

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
  const { filter, include, internal = false, limit = DEFAULT_LIMIT, offset = 0 } = args;
  const includeSet = new Set(include ?? []);

  // -- Collect all blocks with their categories ----------------------------
  type Entry = { block: LoBlock; name: OLXTag; categories: string[] };
  const allEntries: Entry[] = [];
  for (const block of Object.values(BLOCK_REGISTRY) as LoBlock[]) {
    if (!block._isBlock) continue;
    const categories = getCategories(block);
    allEntries.push({ block, name: block.name, categories });
  }

  // -- Filter --------------------------------------------------------------
  // Matching is normalized (case- and punctuation-insensitive): categories
  // travel as display labels ('Input', 'Language Arts'), but callers —
  // authors writing categories="input", LLMs echoing directory names like
  // 'language-arts' — reasonably use other spellings, and an exact-match
  // miss is a silent empty result.
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  let matched: Entry[];
  if (filter && filter.length > 0) {
    const filterSet = new Set(filter.map(normalize));
    matched = allEntries.filter(
      (e) => filterSet.has(normalize(e.name)) || e.categories.some((c) => filterSet.has(normalize(c))),
    );
  } else {
    // No filter → all blocks, minus internal AND prototype unless asked
    // for (prototype = under development, hidden from authors until the
    // surface is committed to).
    matched = internal ? allEntries : allEntries.filter((e) => !e.block.internal && !e.block.prototype);
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
      source: block.source || null,
      namespace: block.namespace,
      isInput: block.isInput,
      isGrader: block.isGrader,
      internal: !!block.internal,
      ...(block.prototype ? { prototype: true } : {}),
    };

    if (includeSet.has('attributes')) {
      entry.attributes = extractAttributes(block.attributes);
    }
    if (includeSet.has('fields')) {
      // Open per-field shape — grows with the field system (see schema.ts).
      entry.fields = Object.keys(block.fields || {}).map(name => ({ name }));
    }
    if (includeSet.has('template')) {
      // block.template is a key into block.examples (set by generateBlockRegistry.js)
      const templateExample = block.template ? block.examples?.[block.template] : undefined;
      entry.template = templateExample ? await safeReadFile(templateExample.path) : null;
    }
    if (includeSet.has('demo')) {
      // block.demo is a key into block.examples (set by generateBlockRegistry.js)
      const demoExample = block.demo ? block.examples?.[block.demo] : undefined;
      entry.demo = demoExample ? await safeReadFile(demoExample.path) : null;
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
    if (includeSet.has('examples') && block.examples) {
      // Cached after the first call (module-level snapshot; the server's
      // olxjson route keeps it warm) — see exampleRootId above.
      const { parsed } = await syncContentFromStorage();
      const entries = Object.entries(block.examples);
      const results = await Promise.all(
        entries.map(async ([filename, example]) => {
          const content = await safeReadFile(example.path);
          if (content === null) return null;
          return [filename, {
            path: example.path,
            content,
            gitStatus: example.gitStatus ?? null,
            rootId: exampleRootId(parsed, example.path),
          }] as const;
        }),
      );
      entry.examples = Object.fromEntries(
        results.filter((r): r is NonNullable<typeof r> => r !== null),
      );
    }

    blocks.push(entry);
  }

  return { blocks, total };
}

// ===========================================================================
// get_formats
// ===========================================================================

// FormatType / FormatResultSchema / GetFormatsOutput live in schema.ts
// (browser-safe, shared with the client docs slice) — see the get_blocks
// schemas above.

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
            return [filename, { path: filePath, content }] as const;
          }),
        );
        entry.examples = Object.fromEntries(
          results.filter((r): r is NonNullable<typeof r> => r !== null),
        );
      } catch {
        // Directory not readable — skip examples
        entry.examples = {};
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
