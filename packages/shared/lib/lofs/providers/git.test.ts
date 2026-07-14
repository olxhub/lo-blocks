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
import { VersionConflictError } from '../../types/storage';
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

  // The "remote" IS repoVol, and applyCommit already wrote the commit + moved
  // the branch ref there — so push is a no-op. (Push rejection is exercised
  // separately by overriding this to throw.)
  protected async pushRemote(): Promise<void> {}
}

describe('GitStorageProvider', () => {
  let provider: LocalGitProvider;
  const URL = 'https://github.com/olxhub/edu.memphis.psych';
  // Refs are keyed by the canonical, ref-bearing origin (address.ts gitOrigin):
  // transport in the scheme, "//" dropped, branch after the last "@".
  const ORIGIN = 'git+https:github.com/olxhub/edu.memphis.psych@main';

  beforeAll(async () => {
    provider = new LocalGitProvider({ url: URL, ref: 'main', cooldownMs: 0 });
    await provider.initRepo();
    await provider.commitFiles({
      'manifest.yaml': 'namespace: gitcourse\ntitle: Git Course\n',
      'lesson1.olx': '<Markdown id="hello">Hi from git</Markdown>',
      'unit2/lesson2.olx': '<Markdown id="second">Part two</Markdown>',
    }, 'initial content');
  });

  it('enumerates the tree with blob-SHA versions', async () => {
    const files = await provider.listContent();
    const ids = files.map(f => String(f.id));
    expect(ids.some(id => id.startsWith(`${ORIGIN}://lesson1.olx#`))).toBe(true);
    expect(ids.some(id => id.startsWith(`${ORIGIN}://unit2/lesson2.olx#`))).toBe(true);
    // Versions are blob SHAs (40 hex chars)
    const lesson1 = files.find(f => String(f.id).startsWith(`${ORIGIN}://lesson1.olx#`))!;
    expect(String(lesson1.id)).toMatch(/#[0-9a-f]{40}$/);
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

  it('re-enumerates after new commits; blob SHAs stay stable for untouched files', async () => {
    const versions = (files: { id: unknown }[]) =>
      new Map(files.map(f => [String(f.id).split('#')[0], String(f.id)]));

    const before = versions(await provider.listContent());
    await provider.commitFiles({
      'lesson1.olx': '<Markdown id="hello">Hi from git, edited</Markdown>',
    }, 'edit lesson1');
    const after = versions(await provider.listContent());

    // The edited file's blob SHA moved; untouched files kept theirs.
    expect(after.get(`${ORIGIN}://lesson1.olx`)).not.toBe(before.get(`${ORIGIN}://lesson1.olx`));
    expect(after.get(`${ORIGIN}://unit2/lesson2.olx`)).toBe(before.get(`${ORIGIN}://unit2/lesson2.olx`));
    expect(after.get(`${ORIGIN}://manifest.yaml`)).toBe(before.get(`${ORIGIN}://manifest.yaml`));
  });

  it('single-flights concurrent refreshes regardless of cooldown', async () => {
    // cooldownMs:0 disables throttle coalescing, so only the singleFlight layer
    // prevents a second (state-mutating) refresh while the first is in flight.
    // Concurrent scans must therefore share ONE refresh — without single-flight
    // they would each clone into and swap this.vol, racing the shared state.
    const concurrent = new LocalGitProvider({ url: URL, ref: 'main', cooldownMs: 0 });
    concurrent.repoVol = provider.repoVol;
    const [a, b, c] = await Promise.all([
      concurrent.listContent(),
      concurrent.listContent(),
      concurrent.listContent(),
    ]);
    expect(concurrent.headChecks).toBe(1);
    // All three saw the same fully-built tree.
    const refs = (files: { id: unknown }[]) => files.map(f => String(f.id)).sort();
    expect(refs(a)).toEqual(refs(b));
    expect(refs(b)).toEqual(refs(c));
    expect(a.length).toBeGreaterThan(0);
  });

  it('respects the cooldown between remote head checks', async () => {
    const cooled = new LocalGitProvider({ url: URL, ref: 'main', cooldownMs: 60_000 });
    cooled.repoVol = provider.repoVol;
    await cooled.listContent();
    await cooled.listContent();
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

  // --- Writes (commit-on-write) -----------------------------------------

  // A fresh repo per write test, so commits don't perturb the shared `provider`.
  async function writableRepo(opts: Partial<GitProviderOptions> = {}) {
    const w = new LocalGitProvider({ url: URL, ref: 'main', cooldownMs: 0, ...opts });
    await w.initRepo();
    await w.commitFiles({
      'manifest.yaml': 'namespace: gitcourse\n',
      'a.olx': '<Markdown id="a">v1</Markdown>',
    }, 'init');
    return w;
  }

  /** The repo's current branch head, read straight from the in-memory store. */
  async function headCommit(w: LocalGitProvider) {
    const fs = { promises: w.repoVol.promises } as any;
    const head = await git.resolveRef({ fs, dir: REPO_DIR, ref: 'main' });
    return (await git.readCommit({ fs, dir: REPO_DIR, oid: head })).commit;
  }

  it('write commits with the given author and platform committer', async () => {
    const w = await writableRepo();
    const res = await w.commit(
      [{ path: 'a.olx' as OlxRelativePath, content: '<Markdown id="a">v2</Markdown>' }],
      { author: { name: 'Maggie Chen', email: 'mchen@example.edu' }, message: 'Edit a.olx' },
    );

    const commit = await headCommit(w);
    expect(commit.message.trim()).toBe('Edit a.olx');
    expect(commit.author.name).toBe('Maggie Chen');       // the teacher
    expect(commit.committer.name).toBe('Learning Observer'); // platform identity

    // The provider serves the new content immediately (no re-clone needed).
    expect((await w.read('a.olx' as OlxRelativePath)).content).toContain('v2');
    // CommitResult reports the new blob-oid token for the written path.
    expect((res.versions['a.olx'] as any).oid).toMatch(/^[0-9a-f]{40}$/);
  });

  it('write of a new nested path builds the intermediate trees', async () => {
    const w = await writableRepo();
    await w.commit([{ path: 'unit3/deep/lesson.olx' as OlxRelativePath, content: '<Markdown id="d">deep</Markdown>' }]);
    expect((await w.read('unit3/deep/lesson.olx' as OlxRelativePath)).content).toContain('deep');
    // Sibling untouched.
    expect((await w.read('a.olx' as OlxRelativePath)).content).toContain('v1');
  });

  it('delete removes a file via a commit', async () => {
    const w = await writableRepo();
    await w.commit([{ path: 'a.olx' as OlxRelativePath, delete: true }]);
    await expect(w.read('a.olx' as OlxRelativePath)).rejects.toThrow(/not found/i);
    await expect(w.commit([{ path: 'a.olx' as OlxRelativePath, delete: true }])).rejects.toThrow(/not found/i);
  });

  it('rename moves content in a single commit', async () => {
    const w = await writableRepo();
    await w.commit([{ path: 'a.olx' as OlxRelativePath, renameTo: 'b.olx' as OlxRelativePath }]);
    expect((await w.read('b.olx' as OlxRelativePath)).content).toContain('v1');
    await expect(w.read('a.olx' as OlxRelativePath)).rejects.toThrow(/not found/i);
    // One commit for the move (parent is the pre-rename head).
    const commit = await headCommit(w);
    expect(commit.message).toMatch(/Rename a\.olx → b\.olx/);
  });

  it('applies N adds + a delete + a rename as ONE atomic commit', async () => {
    const w = await writableRepo();
    const headBefore = await git.resolveRef({ fs: { promises: w.repoVol.promises } as any, dir: REPO_DIR, ref: 'main' });
    await w.commit([
      { path: 'new1.olx' as OlxRelativePath, content: '<Markdown id="n1">one</Markdown>' },
      { path: 'unit/new2.olx' as OlxRelativePath, content: '<Markdown id="n2">two</Markdown>' },
      { path: 'a.olx' as OlxRelativePath, renameTo: 'renamed.olx' as OlxRelativePath },
      { path: 'manifest.yaml' as OlxRelativePath, delete: true },
    ]);
    // All four intents landed…
    expect((await w.read('new1.olx' as OlxRelativePath)).content).toContain('one');
    expect((await w.read('unit/new2.olx' as OlxRelativePath)).content).toContain('two');
    expect((await w.read('renamed.olx' as OlxRelativePath)).content).toContain('v1');
    await expect(w.read('a.olx' as OlxRelativePath)).rejects.toThrow(/not found/i);
    await expect(w.read('manifest.yaml' as OlxRelativePath)).rejects.toThrow(/not found/i);
    // …in exactly ONE commit, parented on the pre-commit head.
    const head = await headCommit(w);
    expect(head.message).toMatch(/Update 4 files/);
    expect(head.parent).toEqual([headBefore]);  // one new commit atop the init commit
  });

  it('rejects a stale write (optimistic conflict), unless forced', async () => {
    const w = await writableRepo();
    const before = await w.read('a.olx' as OlxRelativePath);  // captures the v1 blob oid
    // Someone else edits the same path out-of-band.
    await w.commitFiles({ 'a.olx': '<Markdown id="a">v2 external</Markdown>' }, 'external edit');

    await expect(
      w.commit([{ path: 'a.olx' as OlxRelativePath, content: '<Markdown id="a">v3 mine</Markdown>' }],
        { base: [{ path: 'a.olx' as OlxRelativePath, version: before.metadata }] }),
    ).rejects.toThrow(VersionConflictError);

    // force overrides the optimistic check.
    await w.commit([{ path: 'a.olx' as OlxRelativePath, content: '<Markdown id="a">v3 forced</Markdown>' }],
      { base: [{ path: 'a.olx' as OlxRelativePath, version: before.metadata }], force: true });
    expect((await w.read('a.olx' as OlxRelativePath)).content).toContain('v3 forced');
  });

  it('surfaces a rejected push as a VersionConflictError', async () => {
    class RejectingPush extends LocalGitProvider {
      protected async pushRemote(): Promise<void> {
        const err: any = new Error('not a simple fast-forward');
        err.code = 'PushRejectedError';
        throw err;
      }
    }
    const w = new RejectingPush({ url: URL, ref: 'main', cooldownMs: 0 });
    await w.initRepo();
    await w.commitFiles({ 'a.olx': '<Markdown id="a">v1</Markdown>' }, 'init');
    await expect(w.commit([{ path: 'a.olx' as OlxRelativePath, content: '<Markdown id="a">v2</Markdown>' }]))
      .rejects.toThrow(VersionConflictError);
  });

  it('builds against its captured snapshot even if state is repointed mid-commit', async () => {
    // A concurrent refresh repoints this.state while a write is between commit
    // and push. The write must still build/commit against the snapshot it
    // captured (not the swapped-in one), and must NOT clobber the new state.
    let onPush: (() => void) | null = null;
    class Racer extends LocalGitProvider {
      protected async pushRemote(vol: Volume): Promise<void> {
        onPush?.();                 // simulate a refresh landing mid-write
        return super.pushRemote(vol);
      }
    }
    const w = new Racer({ url: URL, ref: 'main', cooldownMs: 0 });
    await w.initRepo();
    await w.commitFiles({ 'a.olx': '<Markdown id="a">v1</Markdown>' }, 'init');
    await w.listContent();  // establish the captured snapshot

    const foreign = { vol: new Volume(), head: 'deadbeef'.repeat(5), tree: new Map() };
    onPush = () => { (w as any).state = foreign; };

    await w.commit([{ path: 'a.olx' as OlxRelativePath, content: '<Markdown id="a">v2</Markdown>' }]);

    // The commit landed in the snapshot's own volume (repoVol)...
    const commit = await headCommit(w);
    expect(commit.message).toMatch(/Update a\.olx/);
    // ...and the local adopt was skipped (state !== captured snapshot), so the
    // concurrent refresh's snapshot is left intact rather than clobbered.
    expect((w as any).state).toBe(foreign);
  });

  it('passes resolved credentials to the transport via onAuth', async () => {
    const seen: any[] = [];
    class AuthSpy extends LocalGitProvider {
      protected async fetchRemoteHead(): Promise<string> {
        seen.push(await (this as any).onAuth());
        return super.fetchRemoteHead();
      }
    }
    const w = new AuthSpy({
      url: URL, ref: 'main', cooldownMs: 0,
      auth: () => ({ username: 'ghp_testtoken', password: 'x-oauth-basic' }),
    });
    await w.initRepo();
    await w.commitFiles({ 'a.olx': '<Markdown id="a">v1</Markdown>' }, 'init');
    await w.listContent();
    expect(seen[0]).toEqual({ username: 'ghp_testtoken', password: 'x-oauth-basic' });
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
