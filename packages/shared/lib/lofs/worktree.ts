// packages/shared/lib/lofs/worktree.ts
//
// The WORKING TREE seam (git-storage-design §2.4/§2.6).
//
// A user's working tree is the in-memory checkout they edit against, BEFORE
// anything reaches git. It is a set of per-path ENTRIES, each a storage-scope
// fields bucket keyed by the file's source LofsRef (`makeAddress(origin, path)`)
// in that user's server-side materialization (state-library-design). The MCP
// file tools (Write/Edit/Delete/Move) stage into it; Commit materializes it
// into a provider commit; Status/Discard inspect and drop it.
//
// This module defines the SEAM ONLY — the interface the tools depend on and
// the entry shape they exchange. The production backing lives server-side
// (apps/server: it reads/writes the UserStateRegistry materialization, so the
// content field is literally editorFields.content — the same buffer Studio's
// editor edits). Tests inject a fake in-memory Worktree.
//
// Client-safe: pure types, no Node/server imports (McpStorageProvider pulls
// lib/lofs into the browser bundle).

import type { LofsCanonical } from '../types/address';
import type { ToolContext } from '../mcp/registry';

/**
 * One working-tree entry — the staged state of a single path (§2.4). Exactly
 * one intent is expressed at a time:
 *   - `content` present  → a staged add/overwrite (Write/Edit)
 *   - `deleted`          → a staged tombstone (Delete)
 *   - `renamedTo`        → a staged rename (Move)
 *
 * `base` is the source version the entry was OPENED from (its provenance
 * canonical, `source://path#version`) — undefined for a brand-new file that
 * did not exist in the source. `baseMeta` is the opaque provider metadata from
 * that same read (git blob oid / file mtime), carried so Commit can pass it as
 * the optimistic-concurrency token (CommitBase.version) exactly as Write's
 * `previous_metadata` did before this step.
 */
export interface WorktreeEntry {
  content?: string;
  deleted?: boolean;
  renamedTo?: string;
  base?: LofsCanonical;
  baseMeta?: unknown;
}

/**
 * A caller's working tree for ONE content source. Paths are repo-relative
 * (the same paths the file tools take). Obtained via `LofsToolDeps.worktree`
 * from a ToolContext user + source origin — per-user by construction (each
 * user's own materialization instance); a guest session gets its own.
 */
export interface Worktree {
  /** The staged entry for a path, or undefined when the path is not staged. */
  get(path: string): Promise<WorktreeEntry | undefined>;
  /** Every staged entry in this source's working tree (dirty set). */
  list(): Promise<Array<{ path: string; entry: WorktreeEntry }>>;
  /** Stage (create or replace) the entry for a path. */
  set(path: string, entry: WorktreeEntry): Promise<void>;
  /** Drop the staged entries for these paths (`git checkout --`). */
  drop(paths: string[]): Promise<void>;
}

/**
 * Resolve the working tree for a caller (ToolContext user) and content source
 * origin. Injected into the LOFS tools via LofsToolDeps; apps/server wires the
 * materialization-backed implementation, tests a fake.
 */
export type WorktreeResolver = (ctx: ToolContext | undefined, origin: string) => Promise<Worktree>;
