import { describe, it, expect, beforeEach } from 'vitest';
import { PostgresStorageProvider } from './postgres';
import { VersionConflictError } from '../../types/storage';
import type { OlxRelativePath, ProvenanceURI } from '../../types';

/**
 * In-memory mock of pg.Pool that simulates the lofs_files table.
 * Supports the exact SQL patterns used by PostgresStorageProvider.
 */
function createMockPool() {
  const table: Record<string, { tenant: string; path: string; content: string; version: number; updated_at: Date }> = {};

  function key(tenant: string, path: string) {
    return `${tenant}:${path}`;
  }

  return {
    _table: table,
    async query(sql: string, params?: any[]) {
      const text = sql.replace(/\s+/g, ' ').trim();

      // CREATE TABLE
      if (text.startsWith('CREATE TABLE')) {
        return { rows: [], rowCount: 0 };
      }

      // SELECT ... FROM lofs_files WHERE tenant = $1 AND path = $2
      if (text.includes('SELECT') && text.includes('path = $2')) {
        const [tenant, path] = params!;
        const k = key(tenant, path);
        const row = table[k];
        return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
      }

      // SELECT path FROM lofs_files WHERE tenant = $1 ORDER BY path
      if (text.includes('SELECT path') && text.includes('ORDER BY path')) {
        const [tenant] = params!;
        const rows = Object.values(table)
          .filter((r) => r.tenant === tenant)
          .sort((a, b) => a.path.localeCompare(b.path))
          .map((r) => ({ path: r.path }));
        return { rows, rowCount: rows.length };
      }

      // SELECT path, content, version, updated_at FROM lofs_files WHERE tenant = $1
      if (text.includes('SELECT path, content, version') && !text.includes('path = $2')) {
        const [tenant] = params!;
        const rows = Object.values(table)
          .filter((r) => r.tenant === tenant)
          .map((r) => ({ ...r }));
        return { rows, rowCount: rows.length };
      }

      // SELECT path, content FROM lofs_files WHERE tenant = $1
      if (text.includes('SELECT path, content') && !text.includes('version')) {
        const [tenant] = params!;
        const rows = Object.values(table)
          .filter((r) => r.tenant === tenant)
          .map((r) => ({ path: r.path, content: r.content }));
        return { rows, rowCount: rows.length };
      }

      // SELECT 1 FROM lofs_files WHERE tenant = $1 AND path = $2
      if (text.includes('SELECT 1')) {
        const [tenant, path] = params!;
        const exists = !!table[key(tenant, path)];
        return { rows: exists ? [{ '?column?': 1 }] : [], rowCount: exists ? 1 : 0 };
      }

      // INSERT ... ON CONFLICT DO UPDATE
      if (text.includes('INSERT INTO lofs_files')) {
        const [tenant, path, content] = params!;
        const k = key(tenant, path);
        if (table[k]) {
          table[k].content = content;
          table[k].version += 1;
          table[k].updated_at = new Date();
        } else {
          table[k] = { tenant, path, content, version: 1, updated_at: new Date() };
        }
        return { rows: [], rowCount: 1 };
      }

      // UPDATE ... AND version = $3 (optimistic concurrency)
      if (text.includes('UPDATE lofs_files') && text.includes('AND version =')) {
        const [tenant, path, version] = params!;
        const k = key(tenant, path);
        const row = table[k];
        if (row && row.version === version) {
          row.version += 1;
          row.updated_at = new Date();
          return { rows: [], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      }

      // UPDATE lofs_files SET path = $3 (rename)
      if (text.includes('SET path =')) {
        const [tenant, oldPath, newPath] = params!;
        const k = key(tenant, oldPath);
        const row = table[k];
        if (row) {
          delete table[k];
          row.path = newPath;
          row.updated_at = new Date();
          table[key(tenant, newPath)] = row;
          return { rows: [], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      }

      // DELETE
      if (text.includes('DELETE')) {
        const [tenant, path] = params!;
        const k = key(tenant, path);
        if (table[k]) {
          delete table[k];
          return { rows: [], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      }

      // SELECT version, updated_at (for conflict detection)
      if (text.includes('SELECT version')) {
        const [tenant, path] = params!;
        const k = key(tenant, path);
        const row = table[k];
        return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
      }

      throw new Error(`Unhandled SQL: ${text}`);
    },
  } as any;
}

describe('PostgresStorageProvider', () => {
  let pool: ReturnType<typeof createMockPool>;
  let provider: PostgresStorageProvider;

  beforeEach(() => {
    pool = createMockPool();
    provider = new PostgresStorageProvider(pool, 'test-tenant', {
      autoCreateTable: true,
    });
  });

  it('has correct scheme and properties', () => {
    expect(provider.scheme).toBe('postgres');
    expect(provider.writable).toBe(true);
    expect(provider.namespace).toBe('test-tenant');
  });

  // -- write + read --

  it('writes and reads a file', async () => {
    await provider.write('hello.olx' as OlxRelativePath, '<Markdown>Hello</Markdown>');
    const result = await provider.read('hello.olx' as OlxRelativePath);
    expect(result.content).toBe('<Markdown>Hello</Markdown>');
    expect(result.provenance).toBe('postgres:test-tenant://hello.olx');
    expect((result.metadata as any).version).toBe(1);
  });

  it('throws on reading non-existent file', async () => {
    await expect(
      provider.read('nonexistent.olx' as OlxRelativePath)
    ).rejects.toThrow('File not found');
  });

  it('upserts on second write', async () => {
    await provider.write('hello.olx' as OlxRelativePath, 'v1');
    await provider.write('hello.olx' as OlxRelativePath, 'v2');
    const result = await provider.read('hello.olx' as OlxRelativePath);
    expect(result.content).toBe('v2');
    expect((result.metadata as any).version).toBe(2);
  });

  // -- optimistic concurrency --

  it('detects version conflict on write', async () => {
    await provider.write('hello.olx' as OlxRelativePath, 'v1');
    // Simulate someone else updating
    await provider.write('hello.olx' as OlxRelativePath, 'v2');
    // Now try to write with stale version
    await expect(
      provider.write('hello.olx' as OlxRelativePath, 'v3', {
        previousMetadata: { version: 1 },
      })
    ).rejects.toThrow(VersionConflictError);
  });

  // -- delete --

  it('deletes a file', async () => {
    await provider.write('hello.olx' as OlxRelativePath, 'content');
    await provider.delete('hello.olx' as OlxRelativePath);
    await expect(provider.read('hello.olx' as OlxRelativePath)).rejects.toThrow('File not found');
  });

  it('throws on deleting non-existent file', async () => {
    await expect(
      provider.delete('nope.olx' as OlxRelativePath)
    ).rejects.toThrow('File not found');
  });

  // -- rename --

  it('renames a file', async () => {
    await provider.write('old.olx' as OlxRelativePath, 'content');
    await provider.rename('old.olx' as OlxRelativePath, 'new.olx' as OlxRelativePath);
    const result = await provider.read('new.olx' as OlxRelativePath);
    expect(result.content).toBe('content');
    await expect(provider.read('old.olx' as OlxRelativePath)).rejects.toThrow('File not found');
  });

  // -- loadXmlFilesWithStats --

  it('scans content files', async () => {
    await provider.write('hello.olx' as OlxRelativePath, '<Markdown>Hello</Markdown>');
    await provider.write('lesson.xml' as OlxRelativePath, '<Vertical/>');
    await provider.write('readme.txt' as OlxRelativePath, 'not content');

    const { added } = await provider.loadXmlFilesWithStats();
    const addedPaths = Object.keys(added);
    expect(addedPaths.length).toBe(2); // .olx and .xml only
    expect(addedPaths.some((p) => p.includes('readme'))).toBe(false);
  });

  it('detects unchanged on second scan', async () => {
    await provider.write('hello.olx' as OlxRelativePath, 'content');
    const first = await provider.loadXmlFilesWithStats();
    const all = { ...first.added };
    const second = await provider.loadXmlFilesWithStats(all);
    expect(Object.keys(second.unchanged).length).toBe(1);
    expect(Object.keys(second.added).length).toBe(0);
    expect(Object.keys(second.changed).length).toBe(0);
  });

  it('detects changed files', async () => {
    await provider.write('hello.olx' as OlxRelativePath, 'v1');
    const first = await provider.loadXmlFilesWithStats();
    const all = { ...first.added };
    await provider.write('hello.olx' as OlxRelativePath, 'v2');
    const second = await provider.loadXmlFilesWithStats(all);
    expect(Object.keys(second.changed).length).toBe(1);
  });

  it('detects deleted files', async () => {
    await provider.write('hello.olx' as OlxRelativePath, 'content');
    const first = await provider.loadXmlFilesWithStats();
    const all = { ...first.added };
    await provider.delete('hello.olx' as OlxRelativePath);
    const second = await provider.loadXmlFilesWithStats(all);
    expect(Object.keys(second.deleted).length).toBe(1);
  });

  // -- listFiles --

  it('lists files as tree', async () => {
    await provider.write('hello.olx' as OlxRelativePath, 'content');
    await provider.write('sub/nested.olx' as OlxRelativePath, 'content');
    const tree = await provider.listFiles();
    expect(tree.uri).toBe('');
    expect(tree.children!.some((c) => c.uri === 'hello.olx')).toBe(true);
    const sub = tree.children!.find((c) => c.uri === 'sub');
    expect(sub?.children!.some((c) => c.uri === 'sub/nested.olx')).toBe(true);
  });

  // -- glob --

  it('globs for files', async () => {
    await provider.write('hello.olx' as OlxRelativePath, 'content');
    await provider.write('lesson.xml' as OlxRelativePath, 'content');
    const matches = await provider.glob('*.olx');
    expect(matches).toContain('hello.olx');
    expect(matches).not.toContain('lesson.xml');
  });

  // -- grep --

  it('greps for content', async () => {
    await provider.write('hello.olx' as OlxRelativePath, '<Markdown>Hello World</Markdown>');
    await provider.write('other.olx' as OlxRelativePath, '<Vertical/>');
    const matches = await provider.grep('Hello');
    expect(matches.length).toBe(1);
    expect(matches[0].path).toBe('hello.olx');
  });

  // -- resolveRelativePath --

  it('resolves relative path', () => {
    const base = 'postgres:test-tenant://sub/lesson.olx' as ProvenanceURI;
    const resolved = provider.resolveRelativePath(base, 'image.png');
    expect(resolved).toBe('sub/image.png');
  });

  it('resolves parent path', () => {
    const base = 'postgres:test-tenant://sub/lesson.olx' as ProvenanceURI;
    const resolved = provider.resolveRelativePath(base, '../other.olx');
    expect(resolved).toBe('other.olx');
  });

  // -- toProvenanceURI --

  it('constructs provenance URI', () => {
    const uri = provider.toProvenanceURI('sub/file.olx' as any);
    expect(uri).toBe('postgres:test-tenant://sub/file.olx');
  });
});
