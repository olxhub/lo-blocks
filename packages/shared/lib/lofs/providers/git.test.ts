// packages/shared/lib/lofs/providers/git.test.ts
//
// GitStorageProvider: scan/read/namespace semantics against an in-memory
// git repo. No network: the test subclass overrides the two remote
// operations (fetchRemoteHead, cloneRemote) to share a locally-built
// repository — everything else (tree walks, blob reads, SHA versions,
// cooldown logic) runs the real code paths.

import { describe, it, expect, beforeAll } from 'vitest';
import git from 'isomorphic-git';
import { Volume } from 'memfs';
import { GitStorageProvider, type GitProviderOptions } from './git';
import { syncContentFromStorage } from '../../content/syncContentFromStorage';
import { asDefinitionKey } from '../../types/id-grammar';
import type { OlxRelativePath } from '../../types';

const REPO_DIR = '/repo';
const AUTHOR = { name: 'Test Teacher', email: 'teacher@test.example' };

/** A git provider whose "remote" is a locally-built in-memory repo. */
class LocalGitProvider extends GitStorageProvider {
  repoVol = new Volume();
  headChecks = 0;

  constructor(options: GitProviderOptions) {
    super(options);
  }

  private get gitOpts() {
    return { fs: { promises: this.repoVol.promises } as any, dir: REPO_DIR };
  }

  async initRepo() {
    await this.repoVol.promises.mkdir(REPO_DIR, { recursive: true });
    await git.init({ ...this.gitOpts, defaultBranch: this.ref });
  }

  async commitFiles(files: Record<string, string>, message: string) {
    for (const [filepath, content] of Object.entries(files)) {
      const full = `${REPO_DIR}/${filepath}`;
      const dir = full.slice(0, full.lastIndexOf('/'));
      await this.repoVol.promises.mkdir(dir, { recursive: true });
      await this.repoVol.promises.writeFile(full, content);
      await git.add({ ...this.gitOpts, filepath });
    }
    return git.commit({ ...this.gitOpts, message, author: AUTHOR });
  }

  protected async fetchRemoteHead(): Promise<string> {
    this.headChecks++;
    return git.resolveRef({ ...this.gitOpts, ref: this.ref });
  }

  protected async cloneRemote(): Promise<Volume> {
    // Share the local repo's object store directly.
    return this.repoVol;
  }
}

describe('GitStorageProvider', () => {
  let provider: LocalGitProvider;
  const URL = 'https://github.com/olxhub/edu.memphis.psych';

  beforeAll(async () => {
    provider = new LocalGitProvider({ url: URL, ref: 'main', cooldownMs: 0 });
    await provider.initRepo();
    await provider.commitFiles({
      'manifest.yaml': 'namespace: gitcourse\ntitle: Git Course\n',
      'lesson1.olx': '<Markdown id="hello">Hi from git</Markdown>',
      'unit2/lesson2.olx': '<Markdown id="second">Part two</Markdown>',
    }, 'initial content');
  });

  it('scans the tree with blob-SHA versions', async () => {
    const scan = await provider.loadXmlFilesWithStats();
    const keys = Object.keys(scan.added);
    expect(keys).toContain(`${URL}://lesson1.olx`);
    expect(keys).toContain(`${URL}://unit2/lesson2.olx`);
    // Versions are blob SHAs (40 hex chars)
    const info = scan.added[`${URL}://lesson1.olx` as any];
    expect(String(info.id)).toMatch(new RegExp(`^${URL}://lesson1\\.olx#[0-9a-f]{40}$`));
  });

  it('reads content with honest provenance', async () => {
    const result = await provider.read('lesson1.olx' as OlxRelativePath);
    expect(result.content).toContain('Hi from git');
    expect(String(result.provenance)).toMatch(/lesson1\.olx#[0-9a-f]{40}$/);
    expect(result.ns).toBe('gitcourse');
  });

  it('resolves namespaces from the repo manifest, with provenance', async () => {
    const resolved = await provider.namespaceFor(provider.toLofsRef('unit2/lesson2.olx' as any));
    expect(resolved.ns).toBe('gitcourse');
    expect(String(resolved.manifest)).toMatch(/manifest\.yaml#[0-9a-f]{40}$/);
  });

  it('detects new commits, leaving untouched files "unchanged"', async () => {
    const first = await provider.loadXmlFilesWithStats();
    const prev = { ...first.added, ...first.changed, ...first.unchanged };

    await provider.commitFiles({
      'lesson1.olx': '<Markdown id="hello">Hi from git, edited</Markdown>',
    }, 'edit lesson1');

    const second = await provider.loadXmlFilesWithStats(prev);
    expect(Object.keys(second.changed)).toEqual([`${URL}://lesson1.olx`]);
    // Blob SHAs are stable across commits for untouched files.
    expect(Object.keys(second.unchanged).sort()).toEqual([
      `${URL}://manifest.yaml`,
      `${URL}://unit2/lesson2.olx`,
    ]);
    expect(Object.keys(second.deleted)).toEqual([]);
  });

  it('single-flights concurrent refreshes regardless of cooldown', async () => {
    // cooldownMs:0 disables throttle coalescing, so only the singleFlight layer
    // prevents a second (state-mutating) refresh while the first is in flight.
    // Concurrent scans must therefore share ONE refresh — without single-flight
    // they would each clone into and swap this.vol, racing the shared state.
    const concurrent = new LocalGitProvider({ url: URL, ref: 'main', cooldownMs: 0 });
    concurrent.repoVol = provider.repoVol;
    const [a, b, c] = await Promise.all([
      concurrent.loadXmlFilesWithStats(),
      concurrent.loadXmlFilesWithStats(),
      concurrent.loadXmlFilesWithStats(),
    ]);
    expect(concurrent.headChecks).toBe(1);
    // All three saw the same fully-built tree.
    expect(Object.keys(a.added)).toEqual(Object.keys(b.added));
    expect(Object.keys(b.added)).toEqual(Object.keys(c.added));
    expect(Object.keys(a.added).length).toBeGreaterThan(0);
  });

  it('respects the cooldown between remote head checks', async () => {
    const cooled = new LocalGitProvider({ url: URL, ref: 'main', cooldownMs: 60_000 });
    cooled.repoVol = provider.repoVol;
    await cooled.loadXmlFilesWithStats();
    await cooled.loadXmlFilesWithStats();
    await cooled.read('lesson1.olx' as OlxRelativePath);
    expect(cooled.headChecks).toBe(1);
  });

  it('syncs into the content index under the manifest namespace', async () => {
    const { idMap, errors } = await syncContentFromStorage(provider);
    expect(errors).toEqual([]);
    expect(idMap[asDefinitionKey('gitcourse/hello')]).toBeDefined();
    expect(idMap[asDefinitionKey('gitcourse/second')]).toBeDefined();
    // Namespace provenance points at the repo's manifest blob.
    const olx = Object.values(idMap[asDefinitionKey('gitcourse/hello')])[0] as any;
    expect(String(olx.manifest)).toMatch(/manifest\.yaml#[0-9a-f]{40}$/);
  });

  it('is read-only', async () => {
    await expect(provider.write('new.olx' as OlxRelativePath, '<X/>'))
      .rejects.toThrow(/read-only/);
  });

  it('serves only the listed subtree, paths repo-relative (no stripping)', async () => {
    const sub = new LocalGitProvider({ url: URL, ref: 'main', dir: 'unit2', cooldownMs: 0 });
    sub.repoVol = provider.repoVol;
    const scan = await sub.loadXmlFilesWithStats();
    expect(Object.keys(scan.added)).toEqual([`${URL}://unit2/lesson2.olx`]);
    // Path is repo-relative — NOT stripped to "lesson2.olx".
    const result = await sub.read('unit2/lesson2.olx' as OlxRelativePath);
    expect(result.content).toContain('Part two');
    // A read outside the configured subtree is denied, even though the whole
    // repo is in memfs and lesson1.olx exists at the root (Finding 3).
    await expect(sub.read('lesson1.olx' as OlxRelativePath)).rejects.toThrow(/not found/i);
  });

  it('accepts a list of subtrees and excludes the rest', async () => {
    const multi = new LocalGitProvider({ url: URL, ref: 'main', dir: ['a', 'b'], cooldownMs: 0 });
    await multi.initRepo();
    await multi.commitFiles({
      'a/one.olx': '<Markdown id="one">1</Markdown>',
      'b/two.olx': '<Markdown id="two">2</Markdown>',
      'c/three.olx': '<Markdown id="three">3</Markdown>',  // outside dir list → excluded
    }, 'multi-subtree');
    const scan = await multi.loadXmlFilesWithStats();
    expect(Object.keys(scan.added).sort()).toEqual([`${URL}://a/one.olx`, `${URL}://b/two.olx`]);
    const r = await multi.read('a/one.olx' as OlxRelativePath);
    expect(r.content).toContain('1');
  });

  it('defaults the namespace to the repo name when no manifest declares one', async () => {
    // The key git-vs-filesystem difference: no directory-name fallback.
    // A repo with content but no manifest takes its namespace from its URL.
    const noManifest = new LocalGitProvider({ url: URL, ref: 'main', cooldownMs: 0 });
    await noManifest.initRepo();
    await noManifest.commitFiles({ 'lesson.olx': '<Markdown id="x">X</Markdown>' }, 'no manifest');
    const resolved = await noManifest.namespaceFor(noManifest.toLofsRef('lesson.olx' as any));
    expect(resolved.ns).toBe('edu.memphis.psych');   // defaultNamespace(URL)
    expect(resolved.manifest).toBeUndefined();        // no manifest provenance
  });

  it('errors when the repo basename is not a valid namespace and no manifest exists', async () => {
    const bad = new LocalGitProvider({ url: 'https://github.com/olxhub/lo-blocks', ref: 'main', cooldownMs: 0 });
    await bad.initRepo();
    await bad.commitFiles({ 'lesson.olx': '<Markdown id="x">X</Markdown>' }, 'hyphenated repo');
    await expect(bad.namespaceFor(bad.toLofsRef('lesson.olx' as any)))
      .rejects.toThrow(/Cannot derive a namespace/);
  });
});
