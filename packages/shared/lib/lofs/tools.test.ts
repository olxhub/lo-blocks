// packages/shared/lib/lofs/tools.test.ts
//
// LOFS tool semantics on the WORKING TREE (git-storage-design §2.6):
// Write/Edit/Delete/Move STAGE into the caller's working tree (they no longer
// hit the provider), Read overlays the working tree over the source,
// Status/Commit/Discard inspect/publish/drop it. Providers are injected over a
// FileStorageProvider on a temp dir; the working tree is a FAKE in-memory
// Worktree (the production materialization backing is exercised by the server
// live-verify, not here).
//
// Edit's OLX validation path is NOT covered here: it dynamically imports
// parseOLX + BLOCK_REGISTRY (the whole block tree). Content files here use a
// non-validated extension (.md) to keep the test on the tool logic.

import { createToolRegistry, type ToolRegistry, type ToolContext } from '../mcp/registry';
import { registerLofsTools, type LofsToolDeps } from './tools';
import { FileStorageProvider } from './providers/file';
import type { StorageProvider, CommitOptions } from '../types/storage';
import type { Worktree, WorktreeEntry, WorktreeResolver } from './worktree';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';

const SRC = 'file:test';

/** An in-memory working tree per (user, origin) — the fake seam. */
class FakeWorktree implements Worktree {
  entries = new Map<string, WorktreeEntry>();
  async get(p: string) { return this.entries.get(p); }
  async list() { return [...this.entries].map(([p, entry]) => ({ path: p, entry })); }
  async set(p: string, entry: WorktreeEntry) { this.entries.set(p, entry); }
  // A dropped entry is gone (the materialization backing empties the bucket,
  // which its `list()` then filters out — same observable result).
  async drop(paths: string[]) { for (const p of paths) this.entries.delete(p); }
}

/** Route (user, origin) → its own working tree (per-user by construction). */
function makeWorktrees(): { resolver: WorktreeResolver; treeFor: (user: string, origin: string) => FakeWorktree } {
  const trees = new Map<string, FakeWorktree>();
  const keyOf = (user: string, origin: string) => `${user}|${origin}`;
  const treeFor = (user: string, origin: string) => {
    const k = keyOf(user, origin);
    let t = trees.get(k);
    if (!t) { t = new FakeWorktree(); trees.set(k, t); }
    return t;
  };
  const resolver: WorktreeResolver = async (ctx, origin) =>
    treeFor(ctx?.user?.safe_user_id ?? '_local', origin);
  return { resolver, treeFor };
}

describe('LOFS tools — working tree', () => {
  let registry: ToolRegistry;
  let tempDir: string;
  let treeFor: (user: string, origin: string) => FakeWorktree;
  const CTX: ToolContext = { user: { user_id: 'author', safe_user_id: 'nginx-author' } };

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lofs-tools-test-'));
    const provider = new FileStorageProvider(tempDir);
    const wt = makeWorktrees();
    treeFor = wt.treeFor;
    const deps: LofsToolDeps = {
      readableProviders: async () => [provider],
      writableSourceProvider: async () => provider,
      sources: async () => [{ origin: SRC, label: 'test', writable: true }],
      worktree: wt.resolver,
    };
    registry = createToolRegistry();
    registerLofsTools(registry, deps);
    await fs.mkdir(path.join(tempDir, 'unit'));
    await fs.writeFile(path.join(tempDir, 'unit/notes.md'), 'alpha beta alpha\n');
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  test('Read returns source content when nothing is staged (staged: false)', async () => {
    const r: any = await registry.callTool('Read', { path: 'unit/notes.md', source: SRC }, CTX);
    expect(r.content).toBe('alpha beta alpha\n');
    expect(r.staged).toBe(false);
    expect(r.provenance).toContain('unit/notes.md');
  });

  test('Write stages (does not touch the source); base seeded on first touch', async () => {
    const w: any = await registry.callTool('Write', { path: 'unit/notes.md', source: SRC, content: 'mine\n' }, CTX);
    expect(w).toEqual({ ok: true, staged: true });
    // Source file on disk is UNCHANGED — nothing committed.
    expect(await fs.readFile(path.join(tempDir, 'unit/notes.md'), 'utf-8')).toBe('alpha beta alpha\n');
    // The working-tree entry recorded a base from the source (first touch).
    const entry = treeFor('nginx-author', SRC).entries.get('unit/notes.md')!;
    expect(entry.content).toBe('mine\n');
    expect(entry.base).toBeDefined();
    expect(entry.baseMeta).toBeDefined();
  });

  test('Read overlays the working tree: staged content wins (staged: true)', async () => {
    await registry.callTool('Write', { path: 'unit/notes.md', source: SRC, content: 'mine\n' }, CTX);
    const r: any = await registry.callTool('Read', { path: 'unit/notes.md', source: SRC }, CTX);
    expect(r.content).toBe('mine\n');
    expect(r.staged).toBe(true);
  });

  test('Edit anchors on the working-tree content (prior staged edit), not the source', async () => {
    await registry.callTool('Write', { path: 'unit/notes.md', source: SRC, content: 'one two one\n' }, CTX);
    // 'alpha' no longer matches (source), but 'one' does (working tree).
    await expect(
      registry.callTool('Edit', { path: 'unit/notes.md', source: SRC, old_string: 'alpha', new_string: 'x' }, CTX),
    ).rejects.toThrow(/Could not find/);
    const all: any = await registry.callTool('Edit', {
      path: 'unit/notes.md', source: SRC, old_string: 'one', new_string: 'three', replace_all: true,
    }, CTX);
    expect(all).toEqual({ ok: true, staged: true, occurrences: 2 });
    const r: any = await registry.callTool('Read', { path: 'unit/notes.md', source: SRC }, CTX);
    expect(r.content).toBe('three two three\n');
  });

  test('Edit seeds from the source on first touch and stages the result', async () => {
    const e: any = await registry.callTool('Edit', {
      path: 'unit/notes.md', source: SRC, old_string: 'beta', new_string: 'gamma',
    }, CTX);
    expect(e).toEqual({ ok: true, staged: true, occurrences: 1 });
    expect(await fs.readFile(path.join(tempDir, 'unit/notes.md'), 'utf-8')).toBe('alpha beta alpha\n'); // untouched
    const r: any = await registry.callTool('Read', { path: 'unit/notes.md', source: SRC }, CTX);
    expect(r.content).toBe('alpha gamma alpha\n');
  });

  test('Status reports the dirty set with change kinds and staleness', async () => {
    await registry.callTool('Write', { path: 'unit/notes.md', source: SRC, content: 'mine\n' }, CTX);
    await registry.callTool('Write', { path: 'unit/new.md', source: SRC, content: 'fresh\n', create: true }, CTX);
    await registry.callTool('Delete', { path: 'unit/notes.md', source: SRC }, CTX); // overrides to delete
    await registry.callTool('Write', { path: 'unit/mod.md', source: SRC, content: 'x\n' }, CTX);
    // seed a real source file so 'mod.md' is a modify, not an add
    await fs.writeFile(path.join(tempDir, 'unit/mod.md'), 'orig\n');
    await registry.callTool('Move', { path: 'unit/mod.md', new_path: 'unit/moved.md', source: SRC }, CTX);

    const s: any = await registry.callTool('Status', { source: SRC }, CTX);
    const byPath = Object.fromEntries(s.entries.map((e: any) => [e.path, e]));
    expect(byPath['unit/notes.md'].change).toBe('deleted');
    expect(byPath['unit/new.md'].change).toBe('added');
    expect(byPath['unit/moved.md'] ?? byPath['unit/mod.md']).toBeDefined();
    // A brand-new file has no base and is never stale.
    expect(byPath['unit/new.md'].stale).toBe(false);
  });

  test('Commit publishes dirty entries to the provider and DROPS them', async () => {
    await registry.callTool('Write', { path: 'unit/notes.md', source: SRC, content: 'published\n' }, CTX);
    const c: any = await registry.callTool('Commit', { source: SRC, message: 'test' }, CTX);
    expect(c.ok).toBe(true);
    expect(c.committed).toContain('unit/notes.md');
    // Landed on disk.
    expect(await fs.readFile(path.join(tempDir, 'unit/notes.md'), 'utf-8')).toBe('published\n');
    // Entry dropped → Status clean, Read falls through to source.
    const s: any = await registry.callTool('Status', { source: SRC }, CTX);
    expect(s.entries.filter((e: any) => e.path === 'unit/notes.md')).toHaveLength(0);
    const r: any = await registry.callTool('Read', { path: 'unit/notes.md', source: SRC }, CTX);
    expect(r.staged).toBe(false);
    expect(r.content).toBe('published\n');
  });

  test('Commit(paths) publishes only the named subset', async () => {
    await registry.callTool('Write', { path: 'unit/notes.md', source: SRC, content: 'A\n' }, CTX);
    await registry.callTool('Write', { path: 'unit/other.md', source: SRC, content: 'B\n', create: true }, CTX);
    const c: any = await registry.callTool('Commit', { source: SRC, paths: ['unit/notes.md'] }, CTX);
    expect(c.committed).toEqual(['unit/notes.md']);
    // other.md still dirty.
    const s: any = await registry.callTool('Status', { source: SRC }, CTX);
    expect(s.entries.map((e: any) => e.path)).toContain('unit/other.md');
  });

  test('Commit returns a structured conflict on a stale base (source moved)', async () => {
    // Stage an edit based on the current version…
    await registry.callTool('Write', { path: 'unit/notes.md', source: SRC, content: 'mine\n' }, CTX);
    // …then the source moves under it (another writer commits).
    const provider = new FileStorageProvider(tempDir);
    await provider.commit([{ path: 'unit/notes.md' as any, content: 'theirs\n' }]);
    const c: any = await registry.callTool('Commit', { source: SRC }, CTX);
    expect(c).toMatchObject({ ok: false, conflict: true });
    expect(c.metadata).toBeDefined();
    expect(c.conflicts[0].path).toBe('unit/notes.md');
    // The entry is NOT dropped on conflict — still dirty for a retry.
    const s: any = await registry.callTool('Status', { source: SRC }, CTX);
    expect(s.entries.map((e: any) => e.path)).toContain('unit/notes.md');
    // force publishes (last write wins).
    const forced: any = await registry.callTool('Commit', { source: SRC, force: true }, CTX);
    expect(forced.ok).toBe(true);
    expect(await fs.readFile(path.join(tempDir, 'unit/notes.md'), 'utf-8')).toBe('mine\n');
  });

  test('Discard drops working-tree entries (source untouched)', async () => {
    await registry.callTool('Write', { path: 'unit/notes.md', source: SRC, content: 'scratch\n' }, CTX);
    const d: any = await registry.callTool('Discard', { source: SRC }, CTX);
    expect(d.discarded).toContain('unit/notes.md');
    const s: any = await registry.callTool('Status', { source: SRC }, CTX);
    expect(s.entries.filter((e: any) => e.path === 'unit/notes.md')).toHaveLength(0);
    const r: any = await registry.callTool('Read', { path: 'unit/notes.md', source: SRC }, CTX);
    expect(r.content).toBe('alpha beta alpha\n'); // back to source
  });

  test('Read of a staged deletion is not-found (authoring view)', async () => {
    await registry.callTool('Delete', { path: 'unit/notes.md', source: SRC }, CTX);
    await expect(
      registry.callTool('Read', { path: 'unit/notes.md', source: SRC }, CTX),
    ).rejects.toThrow(/not found/);
  });

  test('Write create refuses to clobber an existing source file', async () => {
    const w: any = await registry.callTool('Write', { path: 'unit/notes.md', source: SRC, content: 'x', create: true }, CTX);
    expect(w).toMatchObject({ ok: false, conflict: true });
  });

  test('working trees are per-user: one user does not see another\'s staged edits', async () => {
    const OTHER: ToolContext = { user: { user_id: 'other', safe_user_id: 'nginx-other' } };
    await registry.callTool('Write', { path: 'unit/notes.md', source: SRC, content: 'mine\n' }, CTX);
    const r: any = await registry.callTool('Read', { path: 'unit/notes.md', source: SRC }, OTHER);
    expect(r.staged).toBe(false);
    expect(r.content).toBe('alpha beta alpha\n');
  });

  test('Glob and Grep span the source (read views)', async () => {
    const g: any = await registry.callTool('Glob', { pattern: '**/*.md', source: SRC });
    expect(g.files).toContain('unit/notes.md');
    const m: any = await registry.callTool('Grep', { pattern: 'beta', source: SRC, limit: 10 });
    expect(m.matches).toEqual([{ path: 'unit/notes.md', line: 1, content: 'alpha beta alpha' }]);
  });

  test('get_sources reports the injected source list', async () => {
    const s: any = await registry.callTool('get_sources', {});
    expect(s.sources).toEqual([{ origin: SRC, label: 'test', writable: true }]);
  });
});

// Attribution: the ToolContext user becomes the commit author (the teacher the
// platform commits on behalf of). Commit — not Write — now carries the author,
// since Write only stages. A spy provider records the CommitOptions.
describe('LOFS tools — commit attribution', () => {
  let registry: ToolRegistry;
  let lastOptions: CommitOptions | undefined;

  beforeEach(() => {
    lastOptions = undefined;
    const spy = {
      read: async () => { const e: any = new Error('not found'); e.code = 'ENOENT'; throw e; },
      commit: async (_changes: unknown, options?: CommitOptions) => {
        lastOptions = options;
        return { versions: {} } as unknown;
      },
    } as unknown as StorageProvider;
    const wt = makeWorktrees();
    const deps: LofsToolDeps = {
      readableProviders: async () => [spy],
      writableSourceProvider: async () => spy,
      sources: async () => [{ origin: SRC, label: 'test', writable: true }],
      worktree: wt.resolver,
    };
    registry = createToolRegistry();
    registerLofsTools(registry, deps);
  });

  const nginxCtx: ToolContext = { user: { user_id: 'testauthor', safe_user_id: 'nginx-testauthor' } };
  const guestCtx: ToolContext = { user: { user_id: 'Merry Meadow', safe_user_id: 'guest-Merry+Meadow' } };

  test('Commit attributes the commit to the ctx user', async () => {
    await registry.callTool('Write', { path: 'unit/notes.md', source: SRC, content: 'x' }, nginxCtx);
    await registry.callTool('Commit', { source: SRC }, nginxCtx);
    expect(lastOptions?.author).toEqual({ name: 'testauthor', email: 'nginx-testauthor@users.lo' });
  });

  test('guest sessions attribute as the guest id', async () => {
    await registry.callTool('Write', { path: 'unit/notes.md', source: SRC, content: 'x' }, guestCtx);
    await registry.callTool('Commit', { source: SRC }, guestCtx);
    expect(lastOptions?.author).toEqual({ name: 'Merry Meadow', email: 'guest-Merry+Meadow@users.lo' });
  });
});
