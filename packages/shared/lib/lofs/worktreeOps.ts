// packages/shared/lib/lofs/worktreeOps.ts
//
// The working-tree SEMANTICS behind the LOFS file tools (git-storage-design
// §2.6). tools.ts owns the WIRE surface — zod schemas, tool registration, MCP
// response shaping, error translation, identity → git author mapping. This
// module owns what each verb MEANS against a caller's working tree: seed a base
// from the source, resolve staged renames, stage writes/edits/deletes/moves,
// orient (Status), publish (Commit), and drop (Discard).
//
// Each operation takes its collaborators (the resolved Worktree + the source's
// provider(s)) and plain args, and returns plain data — no zod, no MCP shapes,
// no ToolContext. tools.ts resolves the collaborators from its deps and shapes
// the results onto the tool contract.
//
// Content validation lives HERE, not in tools.ts: "stage an edit" MEANS
// "reject content that no longer parses", so the parse-validate step is part of
// the edit semantics, not a wire concern.
//
// SERVER-ONLY (the ops read/commit through real storage providers, and
// validateContent dynamically pulls the full BLOCK_REGISTRY).

import { minimatch } from 'minimatch';
import { VersionConflictError } from '../types/storage';
import type { StorageProvider, ReadResult, FileChange, CommitBase, ParseResolver, GrepOptions, GrepMatch } from '../types/storage';
import { readFirst } from './sourceSet';
import { toRepoRelativePath } from './repoPath';
import { toLofsRef, version } from '../types/address';
import { asContentNamespace } from '../types/id-grammar';
import type { Worktree, WorktreeEntry } from './worktree';

/** Max content size for writes — matches the historical /api/file limit. */
export const MAX_WRITE_BYTES = 100_000;

/** Synthetic namespace for validation-only parses (Edit) when the provider
 *  resolves none — nothing from these parses is stored or rendered. */
const VALIDATION_NS = asContentNamespace('studio');

// ---------------------------------------------------------------------------
// Base seeding + staged-rename resolution
// ---------------------------------------------------------------------------

/**
 * Seed a working-tree base from the source: read the file to capture its
 * provenance canonical (base) and opaque version token (baseMeta). A file that
 * does not exist in the source yields an empty seed (a brand-new file — no
 * base, no conflict check).
 */
async function seedBase(provider: ParseResolver, p: string): Promise<{ base?: WorktreeEntry['base']; baseMeta?: unknown }> {
  try {
    const r = await provider.read(p as any);
    return { base: r.provenance, baseMeta: r.metadata };
  } catch (err: any) {
    const notFound = err?.code === 'ENOENT' || String(err?.message).includes('not found');
    if (notFound) return {};
    throw err;
  }
}

/** Reuse the entry's recorded base, else seed one from the source (first touch). */
async function baseFor(
  provider: ParseResolver, p: string, existing?: WorktreeEntry,
): Promise<{ base?: WorktreeEntry['base']; baseMeta?: unknown }> {
  if (existing && (existing.base !== undefined || existing.baseMeta !== undefined)) {
    return { base: existing.base, baseMeta: existing.baseMeta };
  }
  return seedBase(provider, p);
}

/**
 * Resolve a path through the caller's staged renames, following rename CHAINS
 * (A→B→C) transitively in BOTH directions with a cycle guard:
 *
 *  - movedAway: `p` is the OLD side of a rename — the file moved away. The value
 *    is the FINAL destination name (follow A→B→C to C). Reading/editing `p` is
 *    then not-found.
 *  - movedHere: `p` is the NEW side of a rename — a moved file now lives here.
 *    Resolves back to the ORIGINAL source entry (follow C←B←A to A), whose
 *    `entry` carries the moved file's base and any staged content.
 *
 * Returns null when no staged rename involves `p`. (Move collapses chains onto
 * a single entry, so in practice these loops take one hop; the transitive walk
 * + cycle guard keep resolution correct for any residual chain and safe against
 * a self/loop rename.)
 */
async function resolveStagedRename(
  wt: Worktree, p: string,
): Promise<{ movedAway?: string; movedHere?: { from: string; entry: WorktreeEntry } } | null> {
  const list = await wt.list();
  const byOld = new Map<string, WorktreeEntry>();
  const byNew = new Map<string, { from: string; entry: WorktreeEntry }>();
  for (const { path: from, entry } of list) {
    if (entry.renamedTo !== undefined) {
      byOld.set(from, entry);
      byNew.set(String(entry.renamedTo), { from, entry });
    }
  }

  // Forward: p is an old path → walk to the final destination.
  if (byOld.has(p)) {
    const seen = new Set<string>([p]);
    let dest = String(byOld.get(p)!.renamedTo);
    while (byOld.has(dest) && !seen.has(dest)) {
      seen.add(dest);
      dest = String(byOld.get(dest)!.renamedTo);
    }
    return { movedAway: dest };
  }

  // Backward: p is a rename target → walk back to the original source entry.
  if (byNew.has(p)) {
    const seen = new Set<string>([p]);
    let node = byNew.get(p)!;
    while (byNew.has(node.from) && !seen.has(node.from)) {
      seen.add(node.from);
      node = byNew.get(node.from)!;
    }
    return { movedHere: node };
  }
  return null;
}

/** Does repo-relative path P fall under basePath and match the glob pattern?
 *  Mirrors the file provider's glob (cwd = basePath, dot:false). */
function matchesGlob(p: string, pattern: string, basePath?: string): boolean {
  let rel = p;
  if (basePath) {
    const prefix = basePath.endsWith('/') ? basePath : basePath + '/';
    if (!p.startsWith(prefix)) return false;
    rel = p.slice(prefix.length);
  }
  return minimatch(rel, pattern, { dot: false });
}

// ---------------------------------------------------------------------------
// Content validation (the parse-validate step of stageEdit)
// ---------------------------------------------------------------------------

/**
 * Validate content by parsing it, keyed on file extension: OLX/XML through
 * parseOLX, PEG-defined formats through their generated parser. Returns an
 * author-friendly error string, or null when the content is valid (or has no
 * validator).
 *
 * Dynamic imports, deliberately: parseOLX pulls the full BLOCK_REGISTRY
 * (every block's component module). Loading it belongs to the first Edit,
 * not to server boot.
 */
export async function validateContent(pathStr: string, content: string, ns?: string): Promise<string | null> {
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

// ---------------------------------------------------------------------------
// Operations — each takes (worktree/provider(s), plain args) → plain data
// ---------------------------------------------------------------------------

/** A read/status result entry as plain data (tools.ts shapes it onto the wire). */
export interface AuthoringView {
  content: string;
  metadata: unknown;
  ns?: ReadResult['ns'];
  provenance: string;
  staged: true;
}

/**
 * The caller's AUTHORING VIEW for a staged path: staged content overlaid over
 * the source. Returns the staged view, or null when the path is not staged (so
 * the caller reads from the source). Throws when the path is staged as
 * deleted/moved-away (reads as not-found).
 */
export async function readAuthoringView(
  wt: Worktree, readable: ParseResolver[], source: string, p: string,
): Promise<AuthoringView | null> {
  const entry = await wt.get(p);
  if (entry?.deleted) {
    throw new Error(`File not found: ${p} (staged for deletion in your working tree)`);
  }
  const rename = await resolveStagedRename(wt, p);
  if (rename?.movedAway) {
    throw new Error(`File not found: ${p} (staged as renamed to ${rename.movedAway} in your working tree)`);
  }
  if (rename?.movedHere) {
    const orig = rename.movedHere.entry;
    // The moved file's authoring content: its own staged edits if any, else the
    // source at the ORIGINAL path (where the moved-from bytes still live).
    if (orig.content !== undefined) {
      return {
        content: orig.content,
        metadata: orig.baseMeta,
        ns: undefined,
        provenance: orig.base ? String(orig.base) : `${source}://${p}`,
        staged: true,
      };
    }
    const src = await readFirst(readable, toRepoRelativePath(rename.movedHere.from) as any);
    return {
      content: src.content,
      metadata: orig.baseMeta,
      ns: src.ns,
      provenance: String(src.provenance),
      staged: true,
    };
  }
  if (entry?.content !== undefined) {
    return {
      content: entry.content,
      metadata: entry.baseMeta,
      ns: undefined,
      provenance: entry.base ? String(entry.base) : `${source}://${p}`,
      staged: true,
    };
  }
  return null;
}

export type StageConflict = { ok: false; conflict: true; error: string; metadata: unknown };

/**
 * Stage a create/overwrite. Records the base on FIRST TOUCH (its source
 * provenance canonical), preferring the caller's previous_metadata token for
 * the conflict check. `create` fails when the file already exists in the source.
 */
export async function stageWrite(
  provider: StorageProvider, wt: Worktree,
  args: { p: string; content: string; previousMetadata?: unknown; create?: boolean },
): Promise<{ ok: true; staged: true } | StageConflict> {
  const { p, content, previousMetadata, create } = args;
  if (content.length > MAX_WRITE_BYTES) {
    throw new Error(`File too large (max ${MAX_WRITE_BYTES / 1000}KB)`);
  }

  // Writing through a staged rename: the OLD path is gone (fail like Read); the
  // NEW path overwrites the moved file's content, PRESERVING the rename entry.
  const rename = await resolveStagedRename(wt, p);
  if (rename?.movedAway) {
    throw new Error(`Cannot write ${p}: it is staged as renamed to ${rename.movedAway}. Write the new path instead, or Discard the rename first.`);
  }
  if (rename?.movedHere) {
    const orig = rename.movedHere.entry;
    await wt.set(rename.movedHere.from, {
      renamedTo: orig.renamedTo, content, base: orig.base, baseMeta: orig.baseMeta,
    });
    return { ok: true, staged: true };
  }

  const existing = await wt.get(p);

  let base = existing?.base;
  let baseMeta = existing?.baseMeta;
  if (existing === undefined || (existing.base === undefined && existing.baseMeta === undefined)) {
    const seed = await seedBase(provider, p);
    if (create && seed.base !== undefined) {
      // create must not clobber an existing source file (TOCTOU acceptable;
      // the commit base check is the authoritative guard).
      return { ok: false, conflict: true, error: `File already exists: ${p}`, metadata: seed.baseMeta };
    }
    base = seed.base;
    baseMeta = previousMetadata !== undefined ? previousMetadata : seed.baseMeta;
  }
  await wt.set(p, { content, base, baseMeta });
  return { ok: true, staged: true };
}

/**
 * Stage a search-and-replace, anchored on the working-tree content (prior
 * staged edits, else the source). The result is parse-validated before staging
 * (invalid edits are rejected). Returns the occurrence count.
 */
export async function stageEdit(
  provider: StorageProvider, wt: Worktree,
  args: { p: string; rawPath: string; oldString: string; newString: string; replaceAll: boolean },
): Promise<{ occurrences: number }> {
  const { p, rawPath, oldString, newString, replaceAll } = args;
  if (!oldString || oldString.trim() === '') {
    throw new Error('old_string cannot be empty');
  }

  // Editing through a staged rename: the OLD path is gone (fail like Read); the
  // NEW path resolves to the ORIGINAL entry, so the edit updates it in place
  // and PRESERVES the rename (renamedTo/base kept).
  const rename = await resolveStagedRename(wt, p);
  if (rename?.movedAway) {
    throw new Error(`Cannot edit ${p}: it is staged as renamed to ${rename.movedAway}. Edit the new path instead.`);
  }

  // The entry we update and the content we anchor on.
  let entryPath = p;
  let renamedTo: WorktreeEntry['renamedTo'];
  let base: WorktreeEntry['base'];
  let baseMeta: unknown;
  let current: string;
  if (rename?.movedHere) {
    const orig = rename.movedHere.entry;
    entryPath = rename.movedHere.from;
    renamedTo = orig.renamedTo;
    base = orig.base;
    baseMeta = orig.baseMeta;
    // Seed content from the moved file's own staged edits, else the source at
    // the moved-from path (where its bytes still live).
    current = orig.content !== undefined ? orig.content : (await provider.read(entryPath as any)).content;
  } else {
    const existing = await wt.get(p);
    if (existing?.deleted) {
      throw new Error(`Cannot edit ${p}: it is staged for deletion. Discard first, or Write fresh content.`);
    }
    // Anchor on the working-tree content when present, else the source.
    if (existing?.content !== undefined) {
      current = existing.content;
      base = existing.base;
      baseMeta = existing.baseMeta;
    } else {
      const r = await provider.read(p as any);
      current = r.content;
      base = r.provenance;
      baseMeta = r.metadata;
    }
  }

  const occurrences = current.split(oldString).length - 1;
  if (occurrences === 0) {
    throw new Error('Could not find text to replace. Ensure old_string exactly matches (re-Read the file if it may have changed).');
  }
  if (occurrences > 1 && !replaceAll) {
    throw new Error(`Found ${occurrences} occurrences. Include more context to make old_string unique, or set replace_all: true.`);
  }

  const newContent = replaceAll
    ? current.replaceAll(oldString, newString)
    : current.replace(oldString, newString);
  if (newContent.length > MAX_WRITE_BYTES) {
    throw new Error(`Edited file too large (max ${MAX_WRITE_BYTES / 1000}KB)`);
  }

  const invalid = await validateContent(rawPath, newContent);
  if (invalid) throw new Error(invalid);

  await wt.set(entryPath, {
    content: newContent, base, baseMeta, ...(renamedTo !== undefined ? { renamedTo } : {}),
  });
  return { occurrences };
}

/** Stage a delete (tombstone), seeding the base from the source on first touch. */
export async function stageDelete(provider: StorageProvider, wt: Worktree, p: string): Promise<void> {
  const existing = await wt.get(p);
  const seed = await baseFor(provider, p, existing);
  await wt.set(p, { deleted: true, base: seed.base, baseMeta: seed.baseMeta });
}

/**
 * Stage a rename/move. Seeds the base from the source on first touch, and
 * COMPOSES with any staged content so an edited-then-moved file carries its
 * edits to the new path (bug: Move must not discard staged content). Moving a
 * file that is itself a rename target COLLAPSES the chain onto the original
 * entry (A→B then B→C becomes A→C); moving back onto the original name cancels
 * the rename.
 */
export async function stageMove(provider: StorageProvider, wt: Worktree, from: string, to: string): Promise<void> {
  const rename = await resolveStagedRename(wt, from);
  if (rename?.movedAway) {
    throw new Error(`Cannot move ${from}: it is staged as renamed to ${rename.movedAway}. Move the new path instead, or Discard the rename first.`);
  }

  let oldPath = from;
  let content: string | undefined;
  let base: WorktreeEntry['base'];
  let baseMeta: unknown;
  if (rename?.movedHere) {
    // `from` is the NEW path of an existing rename O→from: retarget O→to,
    // carrying O's content/base (chain collapse).
    const orig = rename.movedHere.entry;
    oldPath = rename.movedHere.from;
    content = orig.content;
    base = orig.base;
    baseMeta = orig.baseMeta;
  } else {
    const existing = await wt.get(from);
    content = existing?.content;
    const seed = await baseFor(provider, from, existing);
    base = seed.base;
    baseMeta = seed.baseMeta;
  }

  // Renaming back onto the original name cancels the rename: keep any staged
  // content as a plain write, else drop the entry entirely.
  if (String(to) === String(oldPath)) {
    if (content !== undefined) await wt.set(oldPath, { content, base, baseMeta });
    else await wt.drop([oldPath]);
    return;
  }

  await wt.set(oldPath, { renamedTo: to, ...(content !== undefined ? { content } : {}), base, baseMeta });
}

export interface StatusEntry {
  path: string;
  change: 'modified' | 'added' | 'deleted' | 'renamed';
  renamedTo?: string;
  base?: string;
  stale: boolean;
}

/**
 * The caller's working tree for a source: the dirty entries plus, per entry,
 * whether the source moved past its base since it was opened (`stale`).
 */
export async function worktreeStatus(
  provider: StorageProvider, wt: Worktree, source: string,
): Promise<{ source: string; entries: StatusEntry[] }> {
  const list = await wt.list();
  const entries = await Promise.all(list.map(async ({ path: p, entry }): Promise<StatusEntry> => {
    const change = entry.deleted ? 'deleted' as const
      : entry.renamedTo !== undefined ? 'renamed' as const
      : entry.base === undefined ? 'added' as const
      : 'modified' as const;
    // Staleness: the source moved past `base` (compare the base's #version
    // against the source's current provenance version). No base (a new file)
    // is never stale.
    let stale = false;
    if (entry.base !== undefined) {
      try {
        const cur = await provider.read(p as any);
        stale = version(toLofsRef(String(entry.base))) !== version(cur.provenance);
      } catch { stale = true; }  // base recorded, source gone → stale
    }
    return {
      path: p,
      change,
      ...(entry.renamedTo !== undefined ? { renamedTo: entry.renamedTo } : {}),
      ...(entry.base !== undefined ? { base: String(entry.base) } : {}),
      stale,
    };
  }));
  return { source, entries };
}

export type CommitConflict = {
  ok: false; conflict: true; error: string; metadata: unknown;
  conflicts: Array<{ path: string; error: string; metadata: unknown }>;
};

/**
 * Publish the dirty working-tree entries (all, or the `paths` subset) as ONE
 * provider commit, dropping the published entries on success. A concurrent
 * change since an entry's base returns a structured conflict (the working-tree
 * entries survive for a force retry). `author` is the caller's git identity.
 */
export async function commitWorktree(
  provider: StorageProvider, wt: Worktree,
  args: {
    paths?: string[];
    message?: string;
    force?: boolean;
    bases?: Array<{ path: string; version?: unknown }>;
    author?: { name: string; email: string };
  },
): Promise<{ ok: true; committed: string[]; nothing?: true } | CommitConflict> {
  const { paths, message, force, bases, author } = args;
  const all = await wt.list();
  const want = paths ? new Set(paths.map(p => String(toRepoRelativePath(p)))) : undefined;
  const selected = want ? all.filter(e => want.has(e.path)) : all;
  if (selected.length === 0) {
    return { ok: true, committed: [], nothing: true };
  }

  const overrides = new Map((bases ?? []).map(b => [String(toRepoRelativePath(b.path)), b.version]));
  // Renames must land BEFORE content writes: the file provider's fs.rename needs
  // the destination free, and the git provider's staged-edit write must overwrite
  // AFTER the rename delta. So bucket them and concatenate renames-first.
  const renameChanges: FileChange[] = [];
  const writeChanges: FileChange[] = [];
  const base: CommitBase[] = [];
  for (const { path: p, entry } of selected) {
    if (entry.deleted) {
      writeChanges.push({ path: p as any, delete: true });
    } else if (entry.renamedTo !== undefined) {
      if (entry.base !== undefined) {
        // Rename an existing source file (preserves git history). Staged edits,
        // if any, are written at the NEW path after the rename.
        renameChanges.push({ path: p as any, renameTo: entry.renamedTo as any });
        if (entry.content !== undefined) {
          writeChanges.push({ path: entry.renamedTo as any, content: entry.content });
        }
      } else if (entry.content !== undefined) {
        // A brand-new staged file that was then moved — nothing in the source to
        // rename, so just create it at the destination.
        writeChanges.push({ path: entry.renamedTo as any, content: entry.content });
      }
    } else if (entry.content !== undefined) {
      writeChanges.push({ path: p as any, content: entry.content });
    } else {
      continue;  // empty entry — nothing to publish
    }
    const baseVersion = overrides.has(p) ? overrides.get(p) : entry.baseMeta;
    if (baseVersion !== undefined) base.push({ path: p as any, version: baseVersion });
  }
  const changes: FileChange[] = [...renameChanges, ...writeChanges];

  try {
    await provider.commit(changes, {
      message,
      force,
      base: base.length > 0 ? base : undefined,
      author,
    });
  } catch (err: any) {
    if (err instanceof VersionConflictError || err.name === 'VersionConflictError') {
      // The provider reports the first offending path's current token; a
      // per-path list keeps the door open for multi-file conflict UX.
      const conflicts = [{ path: selected[0].path, error: err.message, metadata: err.currentMetadata }];
      return { ok: false, conflict: true, error: err.message, metadata: err.currentMetadata, conflicts };
    }
    throw err;
  }

  const committed = selected.map(e => e.path);
  await wt.drop(committed);
  return { ok: true, committed };
}

/** Drop working-tree entries (`git checkout --`): all, or the `paths` subset. */
export async function discardWorktree(wt: Worktree, paths?: string[]): Promise<{ discarded: string[] }> {
  const targets = paths
    ? paths.map(p => String(toRepoRelativePath(p)))
    : (await wt.list()).map(e => e.path);
  await wt.drop(targets);
  return { discarded: targets };
}

// ---------------------------------------------------------------------------
// Authoring-view overlays for the search surfaces (§2.6: Read/Glob/Grep are the
// caller's authoring view). When a source is named, Glob/Grep apply these over
// the source query so results reflect staged state. (list_files stays
// source-only — it is the provider-facing file tree, not an authoring view.)
// ---------------------------------------------------------------------------

/**
 * Overlay a source glob result with the caller's working tree: staged-deleted
 * paths drop out, staged renames appear at their NEW name (old name drops),
 * staged-created files are added. Modified files are already in the source list.
 */
export async function globOverlay(
  wt: Worktree, sourceFiles: string[], pattern: string, basePath?: string,
): Promise<string[]> {
  const result = new Set(sourceFiles);
  for (const { path: p, entry } of await wt.list()) {
    if (entry.deleted) {
      result.delete(p);
    } else if (entry.renamedTo !== undefined) {
      result.delete(p);
      const to = String(entry.renamedTo);
      if (matchesGlob(to, pattern, basePath)) result.add(to);
    } else if (entry.content !== undefined && entry.base === undefined) {
      // Staged-created file (no source base) — include it if it matches.
      if (matchesGlob(p, pattern, basePath)) result.add(p);
    }
    // Modified (content + base) is already present in the source result.
  }
  return [...result];
}

/**
 * Overlay a source grep result with the caller's working tree: matches from
 * staged content supersede the source at that path, staged-deleted paths drop
 * out, and staged renames relabel matches to the NEW name. Dirty entries are
 * searched against `pattern` (respecting basePath/include), so staged edits and
 * newly-created files are grep-visible; the merged result honors `limit`.
 */
export async function grepOverlay(
  wt: Worktree, sourceMatches: GrepMatch[], pattern: string, options: GrepOptions = {},
): Promise<GrepMatch[]> {
  const { basePath, include, limit } = options;
  const regex = new RegExp(pattern);
  const entries = await wt.list();

  // Source matches at a dirty OLD path are superseded (content changed or moved).
  const superseded = new Set<string>();
  for (const { path: p, entry } of entries) {
    if (entry.deleted || entry.renamedTo !== undefined || entry.content !== undefined) {
      superseded.add(p);
    }
  }
  const result: GrepMatch[] = sourceMatches.filter(m => !superseded.has(String(m.path)));

  const underBase = (p: string) =>
    !basePath || p === basePath || p.startsWith(basePath.endsWith('/') ? basePath : basePath + '/');
  const searchStaged = (at: string, content: string) => {
    if (!underBase(at)) return;
    if (include && !matchesGlob(at, include, basePath)) return;
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (regex.test(lines[i])) result.push({ path: at as any, line: i + 1, content: lines[i].trim() });
    }
  };

  for (const { path: p, entry } of entries) {
    if (entry.deleted) continue;  // dropped from the view
    if (entry.content !== undefined) {
      // Modified/added/renamed-with-edits: search the staged content at its
      // effective (post-rename) path.
      searchStaged(entry.renamedTo !== undefined ? String(entry.renamedTo) : p, entry.content);
    } else if (entry.renamedTo !== undefined) {
      // Pure rename (no content edit): relabel the source matches old → new.
      const to = String(entry.renamedTo);
      for (const m of sourceMatches) {
        if (String(m.path) === p) result.push({ ...m, path: to as any });
      }
    }
  }

  result.sort((a, b) => {
    const c = String(a.path).localeCompare(String(b.path));
    return c !== 0 ? c : a.line - b.line;
  });
  return limit !== undefined ? result.slice(0, limit) : result;
}
