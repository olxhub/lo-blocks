import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import git from 'isomorphic-git';
import fs from 'fs';
import { GitStorageProvider } from './git';
import type { OlxRelativePath, ProvenanceURI } from '../../types';

/**
 * Create a temporary git repository with some OLX files.
 */
async function createTestRepo(): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), 'git-provider-test-'));
  // Create a git repo
  await git.init({ fs, dir });
  // Add some content files
  writeFileSync(join(dir, 'hello.olx'), '<Vertical id="v1"><Markdown>Hello</Markdown></Vertical>');
  writeFileSync(join(dir, 'lesson.xml'), '<Vertical id="v2"><Markdown>Lesson</Markdown></Vertical>');
  mkdirSync(join(dir, 'subdir'));
  writeFileSync(join(dir, 'subdir', 'nested.olx'), '<Markdown>Nested</Markdown>');
  // Add a non-content file
  writeFileSync(join(dir, 'readme.txt'), 'This is not content');
  return dir;
}

describe('GitStorageProvider', () => {
  let repoDir: string;
  let provider: GitStorageProvider;

  beforeEach(async () => {
    repoDir = await createTestRepo();
    provider = new GitStorageProvider(repoDir, {
      namespace: 'test-repo',
      mountId: 'test-repo',
    });
  });

  afterEach(() => {
    rmSync(repoDir, { recursive: true, force: true });
  });

  it('has correct scheme and properties', () => {
    expect(provider.scheme).toBe('git');
    expect(provider.writable).toBe(false);
    expect(provider.namespace).toBe('test-repo');
  });

  // -- read --

  it('reads a file from the working tree', async () => {
    const result = await provider.read('hello.olx' as OlxRelativePath);
    expect(result.content).toContain('Hello');
    expect(result.provenance).toBe('git:test-repo://hello.olx');
    expect(result.metadata).toBeDefined();
  });

  it('reads a nested file', async () => {
    const result = await provider.read('subdir/nested.olx' as OlxRelativePath);
    expect(result.content).toContain('Nested');
  });

  it('throws on missing file', async () => {
    await expect(
      provider.read('nonexistent.olx' as OlxRelativePath)
    ).rejects.toThrow('File not found');
  });

  // -- loadXmlFilesWithStats --

  it('scans content files and detects additions', async () => {
    const { added, changed, unchanged, deleted } = await provider.loadXmlFilesWithStats();
    const addedIds = Object.keys(added);
    expect(addedIds.length).toBe(3); // hello.olx, lesson.xml, subdir/nested.olx
    expect(Object.keys(changed)).toHaveLength(0);
    expect(Object.keys(unchanged)).toHaveLength(0);
    expect(Object.keys(deleted)).toHaveLength(0);
    // readme.txt should NOT be included (not a content file)
    expect(addedIds.every((id) => !id.includes('readme'))).toBe(true);
  });

  it('detects unchanged files on second scan', async () => {
    const first = await provider.loadXmlFilesWithStats();
    const all = { ...first.added, ...first.unchanged };
    const second = await provider.loadXmlFilesWithStats(all);
    expect(Object.keys(second.added)).toHaveLength(0);
    expect(Object.keys(second.changed)).toHaveLength(0);
    expect(Object.keys(second.unchanged).length).toBe(3);
    expect(Object.keys(second.deleted)).toHaveLength(0);
  });

  it('detects changed files', async () => {
    const first = await provider.loadXmlFilesWithStats();
    const all = { ...first.added };
    // Modify a file
    writeFileSync(join(repoDir, 'hello.olx'), '<Markdown>Updated</Markdown>');
    const second = await provider.loadXmlFilesWithStats(all);
    expect(Object.keys(second.changed).length).toBe(1);
    const changedUri = Object.keys(second.changed)[0];
    expect(changedUri).toContain('hello.olx');
  });

  it('detects deleted files', async () => {
    const first = await provider.loadXmlFilesWithStats();
    const all = { ...first.added };
    rmSync(join(repoDir, 'hello.olx'));
    const second = await provider.loadXmlFilesWithStats(all);
    expect(Object.keys(second.deleted).length).toBe(1);
  });

  // -- listFiles --

  it('lists content files in tree structure', async () => {
    const tree = await provider.listFiles();
    expect(tree.uri).toBe('');
    expect(tree.children).toBeDefined();
    const uris = tree.children!.map((c) => c.uri);
    expect(uris).toContain('hello.olx');
    expect(uris).toContain('lesson.xml');
    // subdir should be a subtree
    const subdir = tree.children!.find((c) => c.uri === 'subdir');
    expect(subdir?.children).toBeDefined();
    expect(subdir!.children!.map((c) => c.uri)).toContain('subdir/nested.olx');
    // readme.txt should NOT be listed (not a content file)
    expect(uris).not.toContain('readme.txt');
  });

  // -- glob --

  it('globs for .olx files', async () => {
    const matches = await provider.glob('**/*.olx');
    expect(matches).toContain('hello.olx');
    expect(matches).toContain('subdir/nested.olx');
    expect(matches).not.toContain('lesson.xml');
  });

  // -- grep --

  it('greps for content', async () => {
    const matches = await provider.grep('Markdown');
    expect(matches.length).toBeGreaterThanOrEqual(3);
    expect(matches.some((m) => m.path === 'hello.olx')).toBe(true);
  });

  // -- resolveRelativePath --

  it('resolves relative path from provenance', () => {
    const base = 'git:test-repo://subdir/nested.olx' as ProvenanceURI;
    const resolved = provider.resolveRelativePath(base, 'image.png');
    expect(resolved).toBe('subdir/image.png');
  });

  it('resolves parent relative path', () => {
    const base = 'git:test-repo://subdir/nested.olx' as ProvenanceURI;
    const resolved = provider.resolveRelativePath(base, '../other.olx');
    expect(resolved).toBe('other.olx');
  });

  it('rejects paths that escape repo', () => {
    const base = 'git:test-repo://hello.olx' as ProvenanceURI;
    expect(() => provider.resolveRelativePath(base, '../../etc/passwd')).toThrow('escapes');
  });

  // -- toProvenanceURI --

  it('constructs provenance URI', () => {
    const uri = provider.toProvenanceURI('subdir/nested.olx' as any);
    expect(uri).toBe('git:test-repo://subdir/nested.olx');
  });

  // -- write operations throw --

  it('write throws read-only error', async () => {
    await expect(provider.write('x.olx' as OlxRelativePath, 'content')).rejects.toThrow('read-only');
  });

  it('delete throws read-only error', async () => {
    await expect(provider.delete('x.olx' as OlxRelativePath)).rejects.toThrow('read-only');
  });

  it('rename throws read-only error', async () => {
    await expect(
      provider.rename('a.olx' as OlxRelativePath, 'b.olx' as OlxRelativePath)
    ).rejects.toThrow('read-only');
  });
});
