// packages/shared/lib/lofs/tools.ts
//
// LOFS content tools for the ToolRegistry — file operations over the
// configured content sources, served to every editing surface through one
// definition: the MCP endpoint (Claude Code / Claude Desktop / the browser
// client), the in-browser LLM tool loop, and direct in-process calls.
//
// SERVER-ONLY (wraps contentSources, which reads the filesystem).
//
// THE WORKING TREE (git-storage-design §2.6). The file verbs deliberately
// clone Claude Code's tool surface, and in Claude Code Edit/Write are WORKING-
// TREE operations: they mutate the checkout; committing is a separate act. The
// LOFS tools keep exactly that — the working tree is just fields-backed (a
// per-user materialization bucket keyed by LofsRef) instead of disk-backed:
//
//   - Read/Glob/Grep : the caller's AUTHORING VIEW — the working-tree overlay
//     over the source (Read returns your uncommitted staged edits).
//   - Write/Edit/Delete/Move : STAGE into the caller's working tree. First
//     touch of a path seeds an entry from the source (recording `base`); Edit
//     anchors against the working-tree content; Delete/Move stage a
//     tombstone/rename. NOTHING reaches git — Commit publishes.
//   - Status/Commit/Discard : orient (dirty set + staleness), publish dirty
//     entries as one provider commit (dropping them on success), and drop
//     entries (`git checkout --`).
//
// These verbs are PERMANENT — the git userspace, no-index dialect: the working
// copy IS the proposed commit, file-granular Commit(paths?) answers "commit
// part of my changes" without per-session index state.
//
// TOOL SUMMARY
// ------------
// Read         - Read a file (authoring view: working-tree overlay over source)
// Write        - Stage a create/overwrite in the working tree
// Edit         - Stage a search-and-replace (anchored on working-tree content)
// Delete       - Stage a delete in the working tree
// Move         - Stage a rename/move in the working tree
// Status       - Dirty working-tree entries + base-vs-source staleness
// Commit       - Publish dirty working-tree entries as one commit (all or a subset)
// Discard      - Drop working-tree entries
// Glob         - Find files by pattern
// Grep         - Search file contents
// list_files   - Full file tree (the Studio file-browser view)
// get_sources  - The configured content sources (Studio's repo picker)

import { z } from 'zod';
import type { ToolRegistry, ToolContext } from '../mcp/registry';
import { readableProviders, writableSourceProvider, sources } from './contentSources';
import { readFirst, globAll, grepAll, listFilesAll } from './sourceSet';
import { toOlxRelativePath } from '../types/storage';
import type { StorageProvider, ReadResult } from '../types/storage';
import { toRepoRelativePath } from './repoPath';
import type { WorktreeResolver } from './worktree';
import {
  readAuthoringView, stageWrite, stageEdit, stageDelete, stageMove,
  worktreeStatus, commitWorktree, discardWorktree, globOverlay, grepOverlay,
} from './worktreeOps';

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
    'Opaque version token (mtime, git hash, …). Carried through your working-tree edits and used by Commit for conflict detection.'),
  ns: z.string().optional().describe('Content namespace of the file'),
  provenance: z.string().describe('Canonical LOFS address of what was read (source://path#version)'),
  staged: z.boolean().optional().describe('True when the content is your uncommitted working-tree edit rather than the committed source.'),
});

const WriteInput = z.object({
  path,
  source: writeSource,
  content: z.string(),
  previous_metadata: z.unknown().optional().describe(
    'Version token from the prior Read, recorded as the working-tree base for this path on first touch. Commit uses it to detect a concurrent change; a later Read of the same path keeps the first-recorded base.'),
  create: z.boolean().optional().describe(
    'This write creates a new file and must not clobber an existing one in the source.'),
});
const WriteOutput = z.union([
  z.object({ ok: z.literal(true), staged: z.literal(true) }),
  z.object({
    ok: z.literal(false),
    conflict: z.literal(true),
    error: z.string(),
    metadata: z.unknown().describe('Current version token — Read again'),
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
const EditOutput = z.object({ ok: z.literal(true), staged: z.literal(true), occurrences: z.number() });

const DeleteInput = z.object({ path, source: writeSource });
const MoveInput = z.object({
  path,
  new_path: z.string().describe('New repo-relative path'),
  source: writeSource,
});
const StagedOutput = z.object({ ok: z.literal(true), staged: z.literal(true) });

const StatusInput = z.object({ source: writeSource });
const StatusOutput = z.object({
  source: z.string(),
  entries: z.array(z.object({
    path: z.string(),
    change: z.enum(['modified', 'added', 'deleted', 'renamed']),
    renamedTo: z.string().optional(),
    base: z.string().optional().describe('Source version this entry was opened from (source://path#version)'),
    stale: z.boolean().describe('True when the source moved past `base` since this entry was opened — Commit will conflict unless forced.'),
  })),
});

const CommitInput = z.object({
  source: writeSource,
  message: z.string().optional().describe('Commit message (auto-generated when omitted).'),
  paths: z.array(z.string()).optional().describe(
    'Repo-relative paths to commit (a subset of the dirty working tree). Omit to commit ALL dirty entries for the source.'),
  force: z.boolean().optional().describe(
    'Commit despite a stale base (last write wins; the overwritten version stays in git history).'),
  bases: z.array(z.object({ path: z.string(), version: z.unknown() })).optional().describe(
    'Optional per-path base version tokens overriding the recorded working-tree base (Studio supplies its tracked read metadata here).'),
});
const CommitConflict = z.object({
  path: z.string(),
  error: z.string(),
  metadata: z.unknown().describe('Current source version token for the conflicting path'),
});
const CommitOutput = z.union([
  z.object({
    ok: z.literal(true),
    committed: z.array(z.string()).describe('Paths published by this commit.'),
    nothing: z.boolean().optional().describe('True when there was nothing dirty to commit.'),
  }),
  z.object({
    ok: z.literal(false),
    conflict: z.literal(true),
    error: z.string(),
    metadata: z.unknown().describe('Current version token of the first conflicting path (Studio reads this).'),
    conflicts: z.array(CommitConflict),
  }),
]);

const DiscardInput = z.object({
  source: writeSource,
  paths: z.array(z.string()).optional().describe(
    'Repo-relative paths to discard. Omit to discard ALL working-tree entries for the source.'),
});
const DiscardOutput = z.object({ ok: z.literal(true), discarded: z.array(z.string()) });

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
 * Git commit authorship from the calling user's identity.
 *
 * The platform commits ON THE AUTHOR'S BEHALF (git.ts): committer = the
 * platform service identity, author = the teacher who made the edit. We map
 * the resolved user to that git author here.
 *
 * Email convention: `${safe_user_id}@users.lo`. safe_user_id is the
 * provenance-prefixed, URL-safe id (e.g. `nginx-testauthor`, `guest-Foo`), so
 * this is a stable, honest, non-deliverable placeholder — NOT a claim of a
 * real inbox. A linked real email arrives with identity linking (a later
 * phase); until then guests attribute as their guest id, same shape.
 *
 * Returns undefined when there's no user context (in-process/browser calls),
 * so the provider falls back to the platform identity as before.
 */
function authorFrom(ctx?: ToolContext): { name: string; email: string } | undefined {
  const user = ctx?.user;
  if (!user) return undefined;
  const email = user.email ?? `${user.safe_user_id ?? user.user_id}@users.lo`;
  return { name: user.user_id, email };
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

/**
 * Provider + working-tree resolution, injectable for tests. Production wiring
 * (apps/server): the read/write source handles come from contentSources.ts,
 * and `worktree` is the UserStateRegistry-backed accessor. Tests inject fakes.
 */
export interface LofsToolDeps {
  /** The providers a read-shaped op spans: one named source, or the whole
   *  union when `source` is omitted (see contentSources.readableProviders). */
  readableProviders: (source?: string) => Promise<StorageProvider[]>;
  writableSourceProvider: (source: string) => Promise<StorageProvider>;
  sources: () => Promise<Array<{ origin: string; label: string; writable: boolean }>>;
  /** The caller's working tree for a source (git-storage-design §2.4). */
  worktree: WorktreeResolver;
}

const defaultDeps: Omit<LofsToolDeps, 'worktree'> = {
  readableProviders,
  writableSourceProvider,
  sources: async () => (await sources()).map(s => ({ ...s, origin: String(s.origin) })),
};

/**
 * The default read/write/sources wiring, WITHOUT a worktree resolver — the
 * server must supply one (it owns the UserStateRegistry). Kept separate so a
 * caller can spread the defaults and add the backing.
 */
export function defaultProviderDeps(): Omit<LofsToolDeps, 'worktree'> {
  return defaultDeps;
}

/**
 * Register LOFS content tools with a ToolRegistry.
 */
export function registerLofsTools(registry: ToolRegistry, deps: LofsToolDeps): void {
  registry.register('Read', {
    description:
      'Read a file — your AUTHORING VIEW: the working-tree overlay over the content source, so a Read ' +
      'after Write/Edit returns your uncommitted staged content (as a local `git` checkout would). Returns ' +
      'content, an opaque version token, the namespace, and `staged` (true when the content is your ' +
      'uncommitted working-tree edit).',
    input: ReadInput,
    output: ReadOutput,
    annotations: { readOnlyHint: true, idempotentHint: true },
  }, async ({ path: rawPath, source }, ctx) => {
    const p = String(toRepoRelativePath(rawPath));
    const readable = await deps.readableProviders(source);
    // Authoring-view overlay only when a source is named (a union read has no
    // single working tree). readAuthoringView returns the staged view or null
    // (fall through to the source); a staged delete/move reads as not-found.
    if (source) {
      const staged = await readAuthoringView(await deps.worktree(ctx, source), readable, source, p);
      if (staged) return staged;
    }
    const result: ReadResult = await readFirst(readable, p as any);
    return {
      content: result.content,
      metadata: result.metadata,
      ns: result.ns,
      provenance: String(result.provenance),
      staged: false,
    };
  });

  registry.register('Write', {
    description:
      'Stage a create/overwrite in your working tree — like `Write` in a local checkout, this does NOT ' +
      'commit. First touch of a path records its source version as the base (pass previous_metadata from a ' +
      'prior Read; otherwise the current source version is recorded). Publish with Commit. Set create: true ' +
      'when the file must not already exist in the source.',
    input: WriteInput,
    output: WriteOutput,
    annotations: {},
  }, async ({ path: rawPath, source, content, previous_metadata, create }, ctx) => {
    const p = String(toRepoRelativePath(rawPath));
    const provider = await deps.writableSourceProvider(source);
    const wt = await deps.worktree(ctx, source);
    return stageWrite(provider, wt, { p, content, previousMetadata: previous_metadata, create });
  });

  registry.register('Edit', {
    description:
      'Stage a search-and-replace in your working tree (does NOT commit). old_string is anchored against the ' +
      'WORKING-TREE content (your prior staged edits, else the source) and must be unique unless replace_all ' +
      'is true. The result is validated (OLX/format parse) before staging — invalid edits are rejected. ' +
      'Publish with Commit.',
    input: EditInput,
    output: EditOutput,
    annotations: {},
  }, async ({ path: rawPath, source, old_string, new_string, replace_all = false }, ctx) => {
    const p = String(toRepoRelativePath(rawPath));
    const provider = await deps.writableSourceProvider(source);
    const wt = await deps.worktree(ctx, source);
    const { occurrences } = await stageEdit(provider, wt, {
      p, rawPath, oldString: old_string, newString: new_string, replaceAll: replace_all,
    });
    return { ok: true as const, staged: true as const, occurrences };
  });

  registry.register('Delete', {
    description: 'Stage a delete in your working tree (does NOT commit — publish with Commit).',
    input: DeleteInput,
    output: StagedOutput,
    annotations: {},
  }, async ({ path: rawPath, source }, ctx) => {
    const p = String(toRepoRelativePath(rawPath));
    const provider = await deps.writableSourceProvider(source);
    await stageDelete(provider, await deps.worktree(ctx, source), p);
    return { ok: true as const, staged: true as const };
  });

  registry.register('Move', {
    description: 'Stage a rename/move in your working tree (does NOT commit — publish with Commit).',
    input: MoveInput,
    output: StagedOutput,
    annotations: {},
  }, async ({ path: rawPath, new_path, source }, ctx) => {
    const p = String(toRepoRelativePath(rawPath));
    const to = String(toRepoRelativePath(new_path));
    const provider = await deps.writableSourceProvider(source);
    await stageMove(provider, await deps.worktree(ctx, source), p, to);
    return { ok: true as const, staged: true as const };
  });

  registry.register('Status', {
    description:
      'Your working tree for a source: the dirty entries (staged modified/added/deleted/renamed files) and, ' +
      'per entry, whether the source moved past its base since it was opened (`stale` — Commit will conflict ' +
      'unless forced). Agents orient with it; Studio reads it for dirty indicators.',
    input: StatusInput,
    output: StatusOutput,
    annotations: { readOnlyHint: true },
  }, async ({ source }, ctx) => {
    const provider = await deps.writableSourceProvider(source);
    return worktreeStatus(provider, await deps.worktree(ctx, source), source);
  });

  registry.register('Commit', {
    description:
      'Publish your dirty working-tree entries for a source as ONE commit — the changeset IS the working tree, ' +
      'there is no changes payload. Commit ALL dirty entries, or a subset via `paths`. Author is your session ' +
      'identity; the platform commits on your behalf. On success the entries are DROPPED (absence = clean). A ' +
      'concurrent change since an entry\'s base returns a structured conflict (Read again, then retry or force).',
    input: CommitInput,
    output: CommitOutput,
    annotations: { destructiveHint: true },
  }, async ({ source, message, paths, force, bases }, ctx) => {
    const provider = await deps.writableSourceProvider(source);
    return commitWorktree(provider, await deps.worktree(ctx, source), {
      paths, message, force, bases, author: authorFrom(ctx),
    });
  });

  registry.register('Discard', {
    description:
      'Drop working-tree entries for a source (`git checkout --`): the undo that makes draft scope safe. Discard ' +
      'a subset via `paths`, or omit to discard everything staged for the source. Committed history is untouched.',
    input: DiscardInput,
    output: DiscardOutput,
    annotations: { destructiveHint: true },
  }, async ({ source, paths }, ctx) => {
    const { discarded } = await discardWorktree(await deps.worktree(ctx, source), paths);
    return { ok: true as const, discarded };
  });

  registry.register('Glob', {
    description:
      'Find files matching a glob pattern (your AUTHORING VIEW when a source is named: staged renames appear ' +
      'at their new name, staged-created files are included, staged-deleted files drop out). Use to discover content structure.',
    input: GlobInput,
    output: GlobOutput,
    annotations: { readOnlyHint: true, idempotentHint: true },
  }, async ({ pattern, path: base, source }, ctx) => {
    let files = await globAll(await deps.readableProviders(source), pattern, basePathOf(base));
    if (source) {
      files = (await globOverlay(await deps.worktree(ctx, source), files as string[], pattern, base)) as typeof files;
    }
    return { files: files as string[] };
  });

  registry.register('Grep', {
    description:
      'Search file contents for a pattern (regex supported; your AUTHORING VIEW when a source is named — staged ' +
      'content is searched, renames report at their new name, staged-deleted files drop out). Returns matches with path, line number, and line content.',
    input: GrepInput,
    output: GrepOutput,
    annotations: { readOnlyHint: true, idempotentHint: true },
  }, async ({ pattern, path: base, include, limit, source }, ctx) => {
    const options = { basePath: basePathOf(base), include, limit };
    let matches = await grepAll(await deps.readableProviders(source), pattern, options);
    if (source) {
      matches = await grepOverlay(await deps.worktree(ctx, source), matches, pattern, options);
    }
    return { matches: matches as Array<{ path: string; line: number; content: string }> };
  });

  registry.register('list_files', {
    description:
      'Full file tree of a content source (or the union) — the PROVIDER-FACING committed tree, NOT an authoring ' +
      'view (staged working-tree changes are not reflected; use Glob/Grep/Read for those). The Studio file-browser view; agents usually want Glob instead.',
    input: ListFilesInput,
    output: ListFilesOutput,
    annotations: { readOnlyHint: true, idempotentHint: true },
  }, async ({ source }) => {
    return { tree: await listFilesAll(await deps.readableProviders(source)) };
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
