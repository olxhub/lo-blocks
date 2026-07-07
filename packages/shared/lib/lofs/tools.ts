// packages/shared/lib/lofs/tools.ts
//
// LOFS content tools for the ToolRegistry — file operations over the
// configured content sources, served to every editing surface through one
// definition: the MCP endpoint (Claude Code / Claude Desktop / the browser
// client), the in-browser LLM tool loop, and direct in-process calls.
//
// SERVER-ONLY (wraps contentSources, which reads the filesystem).
//
// Naming: LOFS is deliberately a clone of Claude's tools, so the file-op
// verbs keep Claude-tool names and semantics (Read, Write, Edit, Delete,
// Move, Glob, Grep — the same conventions Studio's client tools already
// mimic). Query-shaped tools follow the registry's snake_case convention
// (get_sources, list_files — alongside get_blocks, get_repositories).
//
// Concurrency model (multiple writers — Studio, the chat agent, external
// MCP clients — may edit the same file):
//   - Edit is content-anchored: if another writer changed the region, the
//     old string no longer matches and the edit fails loudly; re-Read to
//     recover. The save carries the read's metadata, so even a same-region
//     race between Edit's read and its save surfaces as a conflict.
//   - Write carries a token of the previous version (`previous_metadata`,
//     from Read). On mismatch the caller gets a structured conflict —
//     do nothing (first write wins) or retry with force (last write wins;
//     the overwritten version survives in git history where the source is
//     version-controlled).
//
// TOOL SUMMARY
// ------------
// Read         - Read a file (content + version metadata + namespace)
// Write        - Create or overwrite a file (version-token conflict check)
// Edit         - Search-and-replace within a file, with content validation
// Delete       - Delete a file
// Move         - Rename/move a file
// Glob         - Find files by pattern
// Grep         - Search file contents
// list_files   - Full file tree (the Studio file-browser view)
// get_sources  - The configured content sources (Studio's repo picker)

import { z } from 'zod';
import type { ToolRegistry } from '../mcp/registry';
import { readProvider, writableSourceProvider, sources } from './contentSources';
import { VersionConflictError, toOlxRelativePath } from '../types/storage';
import type { StorageProvider } from '../types/storage';
import { toRepoRelativePath } from './repoPath';
import { toLofsRef } from '../types/address';
import { asContentNamespace } from '../types/id-grammar';

/** Max content size for writes — matches the historical /api/file limit. */
const MAX_WRITE_BYTES = 100_000;

/** Synthetic namespace for validation-only parses (Edit) when the provider
 *  resolves none — nothing from these parses is stored or rendered. */
const VALIDATION_NS = asContentNamespace('studio');

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const path = z.string().describe(
  "Repo-relative file path, e.g. 'psychology/psychology_sba.olx'");

/** Read-shaped ops span the union of all sources when `source` is omitted. */
const readSource = z.string().optional().describe(
  'Content source origin (from get_sources). Omit to span all sources.');

/** Writes REQUIRE a source — a union write has no defined target. */
const writeSource = z.string().describe(
  'Content source origin to write to (from get_sources). Required: a write must name its target repo.');

const ReadInput = z.object({ path, source: readSource });
const ReadOutput = z.object({
  content: z.string(),
  metadata: z.unknown().describe(
    'Opaque version token (mtime, git hash, …). Pass back as previous_metadata on Write to detect conflicts.'),
  ns: z.string().optional().describe('Content namespace of the file'),
  provenance: z.string().describe('Canonical LOFS address of what was read (source://path#version)'),
});

const WriteInput = z.object({
  path,
  source: writeSource,
  content: z.string(),
  previous_metadata: z.unknown().optional().describe(
    'Version token from the prior Read. If the file changed since, the write returns a conflict instead of clobbering.'),
  force: z.boolean().optional().describe(
    'Overwrite despite a version conflict (last write wins; the previous version stays in git history).'),
  create: z.boolean().optional().describe(
    'This write creates a new file and must not clobber an existing one.'),
});
const WriteOutput = z.union([
  z.object({ ok: z.literal(true) }),
  z.object({
    ok: z.literal(false),
    conflict: z.literal(true),
    error: z.string(),
    metadata: z.unknown().describe('Current version token — Read again or retry with force'),
  }),
]);

const EditInput = z.object({
  path,
  source: writeSource,
  old_string: z.string().describe(
    'Exact text to find. Must be unique in the file unless replace_all is true — include surrounding context to disambiguate.'),
  new_string: z.string().describe('Replacement text'),
  replace_all: z.boolean().optional().describe('Replace ALL occurrences (default: false)'),
});
const EditOutput = z.object({ ok: z.literal(true), occurrences: z.number() });

const DeleteInput = z.object({ path, source: writeSource });
const MoveInput = z.object({
  path,
  new_path: z.string().describe('New repo-relative path'),
  source: writeSource,
});
const OkOutput = z.object({ ok: z.literal(true) });

const GlobInput = z.object({
  pattern: z.string().describe("Glob pattern, e.g. '**/*.olx', 'psychology/**/*psychology*'"),
  path: z.string().optional().describe('Base directory to search from (default: source root)'),
  source: readSource,
});
const GlobOutput = z.object({ files: z.array(z.string()) });

const GrepInput = z.object({
  pattern: z.string().describe('Search pattern (regex supported)'),
  path: z.string().optional().describe('Base directory to search from (default: source root)'),
  include: z.string().optional().describe("Glob filter for files to search, e.g. '*.olx'"),
  limit: z.number().int().positive().optional().describe('Maximum number of matches'),
  source: readSource,
});
const GrepOutput = z.object({
  matches: z.array(z.object({ path: z.string(), line: z.number(), content: z.string() })),
});

const ListFilesInput = z.object({ source: readSource });
// UriNode is recursive; keep the wire schema permissive.
const ListFilesOutput = z.object({ tree: z.unknown() });

const GetSourcesInput = z.object({});
const GetSourcesOutput = z.object({
  sources: z.array(z.object({
    origin: z.string(),
    label: z.string(),
    writable: z.boolean(),
  })),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Search-base paths are directories (structural), not content files —
 *  toOlxRelativePath, not toRepoRelativePath. Same split as the routes. */
const basePathOf = (p?: string) => (p ? toOlxRelativePath(p) : undefined);

/**
 * Validate content by parsing it, keyed on file extension: OLX/XML through
 * parseOLX, PEG-defined formats through their generated parser. Returns an
 * author-friendly error string, or null when the content is valid (or has no
 * validator). Shared by Edit today; Write validation is a candidate follow-up.
 *
 * Dynamic imports, deliberately: parseOLX pulls the full BLOCK_REGISTRY
 * (every block's component module). Loading it belongs to the first Edit,
 * not to server boot — same rationale as readProvider's docs branch.
 */
async function validateContent(pathStr: string, content: string, ns?: string): Promise<string | null> {
  const ext = pathStr.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'olx' || ext === 'xml') {
    const { parseOLX } = await import('../content/parseOLX');
    const namespace = ns ? asContentNamespace(ns) : VALIDATION_NS;
    const { errors } = await parseOLX(content, [toLofsRef('editor://')], undefined, namespace);
    if (errors.length > 0) {
      const messages = errors.map((e: { message: string }) => e.message).join('\n\n---\n\n');
      return `${errors.length} issue${errors.length > 1 ? 's' : ''}:\n\n${messages}`;
    }
    return null;
  }
  const { isPEGContentExtension, getParserForExtension } = await import('../../generated/parserRegistry');
  if (isPEGContentExtension(ext)) {
    const parser = getParserForExtension(ext);
    if (parser) {
      try {
        parser.parse(content);
      } catch (err: any) {
        const loc = err.location?.start;
        const locStr = loc ? ` (line ${loc.line}, col ${loc.column})` : '';
        return `Parse error${locStr}: ${err.message}`;
      }
    }
  }
  return null;
}

/** The create existence pre-check (a TOCTOU race is acceptable for now;
 *  atomic create — lofs-api lease:'absent' — is a follow-up). */
async function assertAbsent(provider: StorageProvider, p: ReturnType<typeof toRepoRelativePath>): Promise<void> {
  let exists = true;
  try {
    await provider.read(p);
  } catch (err: any) {
    if (err.code === 'ENOENT' || String(err.message).includes('not found')) exists = false;
    else throw err;  // a real read failure — surface it, don't create over it
  }
  if (exists) throw new Error(`File already exists: ${p}`);
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

/**
 * Provider resolution, injectable for tests. Defaults to the deployment's
 * configured content sources (contentSources.ts) — the only production wiring.
 */
export interface LofsToolDeps {
  readProvider: (source?: string) => Promise<StorageProvider>;
  writableSourceProvider: (source: string) => Promise<StorageProvider>;
  sources: () => Promise<Array<{ origin: string; label: string; writable: boolean }>>;
}

const defaultDeps: LofsToolDeps = {
  readProvider,
  writableSourceProvider,
  sources: async () => (await sources()).map(s => ({ ...s, origin: String(s.origin) })),
};

/**
 * Register LOFS content tools with a ToolRegistry.
 */
export function registerLofsTools(registry: ToolRegistry, deps: LofsToolDeps = defaultDeps): void {
  registry.register('Read', {
    description:
      'Read a file from the content library. Returns content, an opaque version token ' +
      '(pass back as previous_metadata on Write), and the file\'s content namespace.',
    input: ReadInput,
    output: ReadOutput,
    annotations: { readOnlyHint: true, idempotentHint: true },
  }, async ({ path: rawPath, source }) => {
    const p = toRepoRelativePath(rawPath);
    const provider = await deps.readProvider(source);
    const result = await provider.read(p);
    return {
      content: result.content,
      metadata: result.metadata,
      ns: result.ns,
      provenance: String(result.provenance),
    };
  });

  registry.register('Write', {
    description:
      'Create or overwrite a file in a content source. Pass previous_metadata (from Read) so a ' +
      'concurrent change surfaces as a conflict instead of being clobbered; on conflict, Read again ' +
      'or retry with force. Set create: true when the file must not already exist.',
    input: WriteInput,
    output: WriteOutput,
    annotations: { destructiveHint: true },
  }, async ({ path: rawPath, source, content, previous_metadata, force, create }) => {
    if (content.length > MAX_WRITE_BYTES) {
      throw new Error(`File too large (max ${MAX_WRITE_BYTES / 1000}KB)`);
    }
    const p = toRepoRelativePath(rawPath);
    const provider = await deps.writableSourceProvider(source);
    if (create) await assertAbsent(provider, p);
    try {
      await provider.save(p, content, { previousMetadata: previous_metadata, force });
    } catch (err: any) {
      if (err instanceof VersionConflictError || err.name === 'VersionConflictError') {
        // Structured, not thrown: the caller needs the current token to offer
        // "file changed — overwrite?" (Studio) or to force (an agent).
        return { ok: false as const, conflict: true as const, error: err.message, metadata: err.currentMetadata };
      }
      throw err;
    }
    return { ok: true as const };
  });

  registry.register('Edit', {
    description:
      'Edit a file using search-and-replace. old_string must be unique in the file (include ' +
      'surrounding context), or set replace_all: true for global renames. The result is validated ' +
      '(OLX/format parse) before saving — invalid edits are rejected with the parse errors.',
    input: EditInput,
    output: EditOutput,
    annotations: {},
  }, async ({ path: rawPath, source, old_string, new_string, replace_all = false }) => {
    if (!old_string || old_string.trim() === '') {
      throw new Error('old_string cannot be empty');
    }
    const p = toRepoRelativePath(rawPath);
    const provider = await deps.writableSourceProvider(source);
    const current = await provider.read(p);

    const occurrences = current.content.split(old_string).length - 1;
    if (occurrences === 0) {
      throw new Error('Could not find text to replace. Ensure old_string exactly matches (re-Read the file if it may have changed).');
    }
    if (occurrences > 1 && !replace_all) {
      throw new Error(`Found ${occurrences} occurrences. Include more context to make old_string unique, or set replace_all: true.`);
    }

    const newContent = replace_all
      ? current.content.replaceAll(old_string, new_string)
      : current.content.replace(old_string, new_string);
    if (newContent.length > MAX_WRITE_BYTES) {
      throw new Error(`Edited file too large (max ${MAX_WRITE_BYTES / 1000}KB)`);
    }

    const invalid = await validateContent(rawPath, newContent, current.ns);
    if (invalid) throw new Error(invalid);

    // Anchored save: carrying the read's token means a same-window write by
    // someone else conflicts instead of being silently overwritten.
    await provider.save(p, newContent, { previousMetadata: current.metadata });
    return { ok: true as const, occurrences };
  });

  registry.register('Delete', {
    description: 'Delete a file from a content source.',
    input: DeleteInput,
    output: OkOutput,
    annotations: { destructiveHint: true },
  }, async ({ path: rawPath, source }) => {
    const provider = await deps.writableSourceProvider(source);
    await provider.remove(toRepoRelativePath(rawPath));
    return { ok: true as const };
  });

  registry.register('Move', {
    description: 'Rename or move a file within a content source.',
    input: MoveInput,
    output: OkOutput,
    annotations: {},
  }, async ({ path: rawPath, new_path, source }) => {
    const provider = await deps.writableSourceProvider(source);
    await provider.move(toRepoRelativePath(rawPath), toRepoRelativePath(new_path));
    return { ok: true as const };
  });

  registry.register('Glob', {
    description: 'Find files matching a glob pattern. Use to discover content structure.',
    input: GlobInput,
    output: GlobOutput,
    annotations: { readOnlyHint: true, idempotentHint: true },
  }, async ({ pattern, path: base, source }) => {
    const provider = await deps.readProvider(source);
    const files = await provider.glob(pattern, basePathOf(base));
    return { files: files as string[] };
  });

  registry.register('Grep', {
    description: 'Search file contents for a pattern (regex supported). Returns matches with path, line number, and line content.',
    input: GrepInput,
    output: GrepOutput,
    annotations: { readOnlyHint: true, idempotentHint: true },
  }, async ({ pattern, path: base, include, limit, source }) => {
    const provider = await deps.readProvider(source);
    const matches = await provider.grep(pattern, { basePath: basePathOf(base), include, limit });
    return { matches: matches as Array<{ path: string; line: number; content: string }> };
  });

  registry.register('list_files', {
    description: 'Full file tree of a content source (or the union). The Studio file-browser view; agents usually want Glob instead.',
    input: ListFilesInput,
    output: ListFilesOutput,
    annotations: { readOnlyHint: true, idempotentHint: true },
  }, async ({ source }) => {
    const provider = await deps.readProvider(source);
    return { tree: await provider.listFiles() };
  });

  registry.register('get_sources', {
    description:
      'The configured content sources: origin (pass as `source` to file tools), human label, and ' +
      'writability. Writable sources first.',
    input: GetSourcesInput,
    output: GetSourcesOutput,
    annotations: { readOnlyHint: true, idempotentHint: true },
  }, async () => {
    return { sources: await deps.sources() };
  });
}
