// packages/shared/lib/lofs/tools.test.ts
//
// LOFS tool semantics: the concurrency contract (content-anchored Edit,
// version-token Write conflicts) and the write guards. Providers are
// injected (LofsToolDeps) over a FileStorageProvider on a temp dir — the
// production wiring through contentSources is config-driven and exercised
// by the server smoke tests.
//
// Edit's OLX validation path is NOT covered here: it dynamically imports
// parseOLX + BLOCK_REGISTRY (the whole block tree). Content files here use
// a non-validated extension (.md) to keep the test on the tool logic.

import { createToolRegistry, type ToolRegistry, type ToolContext } from '../mcp/registry';
import { registerLofsTools, type LofsToolDeps } from './tools';
import { FileStorageProvider } from './providers/file';
import type { StorageProvider, CommitOptions } from '../types/storage';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';

const SRC = 'file:test';

describe('LOFS tools', () => {
  let registry: ToolRegistry;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lofs-tools-test-'));
    const provider = new FileStorageProvider(tempDir);
    const deps: LofsToolDeps = {
      readableProviders: async () => [provider],
      writableSourceProvider: async () => provider,
      sources: async () => [{ origin: SRC, label: 'test', writable: true }],
    };
    registry = createToolRegistry();
    registerLofsTools(registry, deps);
    await fs.mkdir(path.join(tempDir, 'unit'));
    await fs.writeFile(path.join(tempDir, 'unit/notes.md'), 'alpha beta alpha\n');
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  test('Read returns content, version token, and provenance', async () => {
    const r: any = await registry.callTool('Read', { path: 'unit/notes.md' });
    expect(r.content).toBe('alpha beta alpha\n');
    expect(r.metadata).toBeDefined();
    expect(r.provenance).toContain('unit/notes.md');
  });

  test('Write with a stale token returns a structured conflict; force overrides', async () => {
    const { metadata }: any = await registry.callTool('Read', { path: 'unit/notes.md' });
    // Someone else writes in between…
    await registry.callTool('Write', { path: 'unit/notes.md', source: SRC, content: 'changed\n' });
    // …so the stale-token write conflicts, carrying the CURRENT token.
    const conflict: any = await registry.callTool('Write', {
      path: 'unit/notes.md', source: SRC, content: 'mine\n', previous_metadata: metadata,
    });
    expect(conflict).toMatchObject({ ok: false, conflict: true });
    expect(conflict.metadata).toBeDefined();
    // Force = last write wins.
    const forced: any = await registry.callTool('Write', {
      path: 'unit/notes.md', source: SRC, content: 'mine\n', previous_metadata: metadata, force: true,
    });
    expect(forced).toEqual({ ok: true });
    const after: any = await registry.callTool('Read', { path: 'unit/notes.md' });
    expect(after.content).toBe('mine\n');
  });

  test('Write create refuses to clobber an existing file', async () => {
    await expect(
      registry.callTool('Write', { path: 'unit/notes.md', source: SRC, content: 'x', create: true }),
    ).rejects.toThrow(/already exists/);
  });

  test('Edit is content-anchored: ambiguous match rejected, replace_all replaces every occurrence', async () => {
    await expect(
      registry.callTool('Edit', { path: 'unit/notes.md', source: SRC, old_string: 'alpha', new_string: 'gamma' }),
    ).rejects.toThrow(/2 occurrences/);
    const all: any = await registry.callTool('Edit', {
      path: 'unit/notes.md', source: SRC, old_string: 'alpha', new_string: 'gamma', replace_all: true,
    });
    expect(all).toEqual({ ok: true, occurrences: 2 });
    const after: any = await registry.callTool('Read', { path: 'unit/notes.md' });
    expect(after.content).toBe('gamma beta gamma\n');
  });

  test('Edit fails loudly when the anchor text is missing', async () => {
    await expect(
      registry.callTool('Edit', { path: 'unit/notes.md', source: SRC, old_string: 'no such text', new_string: 'x' }),
    ).rejects.toThrow(/Could not find/);
  });

  test('Move and Delete', async () => {
    await registry.callTool('Move', { path: 'unit/notes.md', new_path: 'unit/renamed.md', source: SRC });
    const moved: any = await registry.callTool('Read', { path: 'unit/renamed.md' });
    expect(moved.content).toContain('alpha');
    await registry.callTool('Delete', { path: 'unit/renamed.md', source: SRC });
    await expect(registry.callTool('Read', { path: 'unit/renamed.md' })).rejects.toThrow();
  });

  test('Glob and Grep', async () => {
    const g: any = await registry.callTool('Glob', { pattern: '**/*.md' });
    expect(g.files).toContain('unit/notes.md');
    const m: any = await registry.callTool('Grep', { pattern: 'beta', limit: 10 });
    expect(m.matches).toEqual([{ path: 'unit/notes.md', line: 1, content: 'alpha beta alpha' }]);
  });

  test('get_sources reports the injected source list', async () => {
    const s: any = await registry.callTool('get_sources', {});
    expect(s.sources).toEqual([{ origin: SRC, label: 'test', writable: true }]);
  });
});

// Attribution: the ToolContext user becomes the commit author (the teacher the
// platform commits on behalf of). A spy provider records the CommitOptions the
// write tools pass; only read + commit are exercised, so the spy implements
// just those and is cast to StorageProvider.
describe('LOFS tools — commit attribution', () => {
  let registry: ToolRegistry;
  let lastOptions: CommitOptions | undefined;

  beforeEach(() => {
    lastOptions = undefined;
    const spy = {
      read: async () => ({ content: 'alpha beta alpha\n', metadata: { v: 1 }, ns: 'test' }),
      commit: async (_changes: unknown, options?: CommitOptions) => {
        lastOptions = options;
        return { ok: true } as unknown;
      },
    } as unknown as StorageProvider;
    const deps: LofsToolDeps = {
      readableProviders: async () => [spy],
      writableSourceProvider: async () => spy,
      sources: async () => [{ origin: SRC, label: 'test', writable: true }],
    };
    registry = createToolRegistry();
    registerLofsTools(registry, deps);
  });

  const nginxCtx: ToolContext = { user: { user_id: 'testauthor', safe_user_id: 'nginx-testauthor' } };
  const guestCtx: ToolContext = { user: { user_id: 'Merry Meadow', safe_user_id: 'guest-Merry+Meadow' } };

  test('Write attributes the commit to the ctx user', async () => {
    await registry.callTool('Write', { path: 'unit/notes.md', source: SRC, content: 'x' }, nginxCtx);
    expect(lastOptions?.author).toEqual({ name: 'testauthor', email: 'nginx-testauthor@users.lo' });
  });

  test('Delete and Move carry the author too', async () => {
    await registry.callTool('Delete', { path: 'unit/notes.md', source: SRC }, nginxCtx);
    expect(lastOptions?.author).toEqual({ name: 'testauthor', email: 'nginx-testauthor@users.lo' });
    await registry.callTool('Move', { path: 'unit/notes.md', new_path: 'unit/renamed.md', source: SRC }, nginxCtx);
    expect(lastOptions?.author).toEqual({ name: 'testauthor', email: 'nginx-testauthor@users.lo' });
  });

  test('guest sessions attribute as the guest id', async () => {
    await registry.callTool('Write', { path: 'unit/notes.md', source: SRC, content: 'x' }, guestCtx);
    expect(lastOptions?.author).toEqual({ name: 'Merry Meadow', email: 'guest-Merry+Meadow@users.lo' });
  });

  test('no ctx → no author (provider falls back to the platform identity)', async () => {
    await registry.callTool('Write', { path: 'unit/notes.md', source: SRC, content: 'x' });
    expect(lastOptions?.author).toBeUndefined();
  });
});
