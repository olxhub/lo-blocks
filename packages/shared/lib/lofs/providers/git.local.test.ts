// @vitest-environment node
//
// GitStorageProvider LOCAL mode: serve a git repo already on disk through its
// .git object store (no clone, no memfs, no network), scoped to a subpath.
//
// Every fixture is a THROWAWAY repo built in the test over the real filesystem
// (git.init + programmatic commits) — never the working repo's own .git. The
// subpath case mirrors the bundled ./content fallback, which is NOT its own
// repo but a subtree of the parent lo-blocks repo: the provider reads the
// parent HEAD scoped under content/ and commits tree deltas under that prefix.

import { describe, it, expect, beforeEach } from 'vitest';
import git from 'isomorphic-git';
import * as fs from 'fs/promises';
import * as fsc from 'fs';
import * as path from 'path';
import * as os from 'os';
import { GitStorageProvider } from './git';
import type { OlxRelativePath } from '../../types';

const AUTHOR = { name: 'Test', email: 'test@example.edu' };
const fsEnv = { fs: fsc } as any;

/** Build a throwaway on-disk repo; commit `files` (repo-relative). */
async function makeRepo(files: Record<string, string>): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lo-local-git-'));
  await git.init({ ...fsEnv, dir, defaultBranch: 'main' });
  await commitFiles(dir, files, 'init');
  return dir;
}

async function commitFiles(dir: string, files: Record<string, string>, message: string): Promise<string> {
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(dir, rel);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, content);
    await git.add({ ...fsEnv, dir, filepath: rel });
  }
  return git.commit({ ...fsEnv, dir, message, author: AUTHOR });
}

const headOf = (dir: string) => git.resolveRef({ ...fsEnv, dir, ref: 'main' });

describe('GitStorageProvider local mode (whole repo)', () => {
  let dir: string;
  let provider: GitStorageProvider;

  beforeEach(async () => {
    dir = await makeRepo({
      'manifest.yaml': 'namespace: course\n',
      'lesson1.olx': '<Markdown id="a">HEAD content</Markdown>',
      'unit2/lesson2.olx': '<Markdown id="b">two</Markdown>',
    });
    provider = new GitStorageProvider({ local: { dir, mount: 'course' }, ref: 'main' });
  });

  it('emits file: origins and reads committed HEAD content', async () => {
    expect(String(provider.origin)).toBe('file:course');
    const r = await provider.read('lesson1.olx' as OlxRelativePath);
    expect(r.content).toContain('HEAD content');
    expect(String(r.provenance)).toContain('file:course://lesson1.olx#');
    expect(r.ns).toBe('course');
  });

  it('enumerates the tree with blob-SHA versions and no forge link', async () => {
    const ids = (await provider.listContent()).map(f => String(f.id));
    expect(ids.some(id => id.startsWith('file:course://lesson1.olx#'))).toBe(true);
    expect(ids.some(id => id.startsWith('file:course://unit2/lesson2.olx#'))).toBe(true);
    expect(provider.forgeLink()).toBeNull();
  });

  it('generationToken is the current HEAD oid, moving after a commit', async () => {
    const t1 = await provider.generationToken();
    expect(t1).toBe(await headOf(dir));
    await commitFiles(dir, { 'lesson3.olx': '<Markdown id="c">three</Markdown>' }, 'add lesson3');
    const t2 = await provider.generationToken();
    expect(t2).not.toBe(t1);
    expect(t2).toBe(await headOf(dir));
  });

  it('commits to the local repo (no push) and serves the new content immediately', async () => {
    const before = await headOf(dir);
    const res = await provider.commit(
      [{ path: 'lesson1.olx' as OlxRelativePath, content: '<Markdown id="a">edited</Markdown>' }],
      { author: { name: 'Teacher', email: 't@example.edu' }, message: 'Edit lesson1' },
    );
    // The on-disk branch advanced by exactly one commit, authored by the teacher.
    const after = await headOf(dir);
    expect(after).not.toBe(before);
    const commit = (await git.readCommit({ ...fsEnv, dir, oid: after })).commit;
    expect(commit.parent).toEqual([before]);
    expect(commit.author.name).toBe('Teacher');
    expect(commit.committer.name).toBe('Learning Observer');
    expect(commit.message.trim()).toBe('Edit lesson1');
    // Provider serves the edit without a reload, and reports the new blob oid.
    expect((await provider.read('lesson1.olx' as OlxRelativePath)).content).toContain('edited');
    expect((res.versions['lesson1.olx'] as any).oid).toMatch(/^[0-9a-f]{40}$/);
  });

  it('applies adds, a delete, and a rename as one commit', async () => {
    await provider.commit([
      { path: 'new.olx' as OlxRelativePath, content: '<Markdown id="n">new</Markdown>' },
      { path: 'lesson1.olx' as OlxRelativePath, renameTo: 'renamed.olx' as OlxRelativePath },
      { path: 'unit2/lesson2.olx' as OlxRelativePath, delete: true },
    ]);
    expect((await provider.read('new.olx' as OlxRelativePath)).content).toContain('new');
    expect((await provider.read('renamed.olx' as OlxRelativePath)).content).toContain('HEAD content');
    await expect(provider.read('lesson1.olx' as OlxRelativePath)).rejects.toThrow(/not found/i);
    await expect(provider.read('unit2/lesson2.olx' as OlxRelativePath)).rejects.toThrow(/not found/i);
  });
});

describe('GitStorageProvider local mode (parent-repo subpath — the ./content fallback)', () => {
  let dir: string;
  let provider: GitStorageProvider;

  beforeEach(async () => {
    // A parent repo holding files both OUTSIDE and INSIDE the served subpath.
    dir = await makeRepo({
      'package.json': '{"name":"parent"}',
      'src/index.ts': 'export const x = 1;',
      'content/manifest.yaml': 'namespace: bundled\n',
      'content/demos/hello.olx': '<Markdown id="h">bundled hello</Markdown>',
    });
    provider = new GitStorageProvider({ local: { dir, subpath: 'content', mount: 'content' }, ref: 'main' });
  });

  it('reads HEAD scoped to the subpath, with subpath-stripped LOFS paths', async () => {
    const r = await provider.read('demos/hello.olx' as OlxRelativePath);
    expect(r.content).toContain('bundled hello');
    expect(String(r.provenance)).toContain('file:content://demos/hello.olx#');
    expect(r.ns).toBe('bundled');
  });

  it('enumerates ONLY files under the subpath (parent-repo files excluded)', async () => {
    const ids = (await provider.listContent()).map(f => String(f.id));
    expect(ids.some(id => id.includes('demos/hello.olx'))).toBe(true);
    expect(ids.some(id => id.includes('package.json'))).toBe(false);
    expect(ids.some(id => id.includes('src/index.ts'))).toBe(false);
  });

  it('commits a subpath tree delta, leaving parent-repo files intact', async () => {
    await provider.commit([{ path: 'demos/world.olx' as OlxRelativePath, content: '<Markdown id="w">world</Markdown>' }]);
    // The new file landed under content/ in the repo tree...
    const head = await headOf(dir);
    const { blob } = await git.readBlob({ ...fsEnv, dir, oid: head, filepath: 'content/demos/world.olx' });
    expect(new TextDecoder().decode(blob)).toContain('world');
    // ...and the parent-repo file outside the subpath is still present.
    const pkg = await git.readBlob({ ...fsEnv, dir, oid: head, filepath: 'package.json' });
    expect(new TextDecoder().decode(pkg.blob)).toContain('parent');
    // Provider serves the new file at its subpath-relative LOFS path.
    expect((await provider.read('demos/world.olx' as OlxRelativePath)).content).toContain('world');
  });
});
