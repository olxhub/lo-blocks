// packages/shared/lib/storage/lofs/providers/git.test.ts
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
import { syncContentFromStorage } from '../../../content/syncContentFromStorage';
import { asDefinitionKey } from '../../../types/id-grammar';
import { VersionConflictError } from '../../../types/storage';
import type { OlxRelativePath } from '../../../types';

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

  // The "remote" IS repoVol, and commitChange already wrote the commit + moved
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

  it('scans the tree with blob-SHA versions', async () => {
    const scan = await provider.loadXmlFilesWithStats();
    const keys = Object.keys(scan.added);
    expect(keys).toContain(`${ORIGIN}://lesson1.olx`);
    expect(keys).toContain(`${ORIGIN}://unit2/lesson2.olx`);
    // Versions are blob SHAs (40 hex chars)
    const info = scan.added[`${ORIGIN}://lesson1.olx` as any];
    expect(String(info.id).startsWith(`${ORIGIN}://lesson1.olx#`)).toBe(true);
    expect(String(info.id)).toMatch(/#[0-9a-f]{40}$/);
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
    expect(Object.keys(second.changed)).toEqual([`${ORIGIN}://lesson1.olx`]);
    // Blob SHAs are stable across commits for untouched files.
    expect(Object.keys(second.unchanged).sort()).toEqual([
      `${ORIGIN}://manifest.yaml`,
      `${ORIGIN}://unit2/lesson2.olx`,
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
    await w.save('a.olx' as OlxRelativePath, '<Markdown id="a">v2</Markdown>', {
      author: { name: 'Maggie Chen', email: 'mchen@example.edu' },
      message: 'Edit a.olx',
    });

    const commit = await headCommit(w);
    expect(commit.message.trim()).toBe('Edit a.olx');
    expect(commit.author.name).toBe('Maggie Chen');       // the teacher
    expect(commit.committer.name).toBe('Learning Observer'); // platform identity

    // The provider serves the new content immediately (no re-clone needed).
    expect((await w.read('a.olx' as OlxRelativePath)).content).toContain('v2');
  });

  it('write of a new nested path builds the intermediate trees', async () => {
    const w = await writableRepo();
    await w.save('unit3/deep/lesson.olx' as OlxRelativePath, '<Markdown id="d">deep</Markdown>');
    expect((await w.read('unit3/deep/lesson.olx' as OlxRelativePath)).content).toContain('deep');
    // Sibling untouched.
    expect((await w.read('a.olx' as OlxRelativePath)).content).toContain('v1');
  });

  it('delete removes a file via a commit', async () => {
    const w = await writableRepo();
    await w.remove('a.olx' as OlxRelativePath);
    await expect(w.read('a.olx' as OlxRelativePath)).rejects.toThrow(/not found/i);
    await expect(w.remove('a.olx' as OlxRelativePath)).rejects.toThrow(/not found/i);
  });

  it('rename moves content in a single commit', async () => {
    const w = await writableRepo();
    await w.move('a.olx' as OlxRelativePath, 'b.olx' as OlxRelativePath);
    expect((await w.read('b.olx' as OlxRelativePath)).content).toContain('v1');
    await expect(w.read('a.olx' as OlxRelativePath)).rejects.toThrow(/not found/i);
    // One commit for the move (parent is the pre-rename head).
    const commit = await headCommit(w);
    expect(commit.message).toMatch(/Rename a\.olx → b\.olx/);
  });

  it('rejects a stale write (optimistic conflict), unless forced', async () => {
    const w = await writableRepo();
    const before = await w.read('a.olx' as OlxRelativePath);  // captures the v1 blob oid
    // Someone else edits the same path out-of-band.
    await w.commitFiles({ 'a.olx': '<Markdown id="a">v2 external</Markdown>' }, 'external edit');

    await expect(
      w.save('a.olx' as OlxRelativePath, '<Markdown id="a">v3 mine</Markdown>', { previousMetadata: before.metadata }),
    ).rejects.toThrow(VersionConflictError);

    // force overrides the optimistic check.
    await w.save('a.olx' as OlxRelativePath, '<Markdown id="a">v3 forced</Markdown>', {
      previousMetadata: before.metadata, force: true,
    });
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
    await expect(w.save('a.olx' as OlxRelativePath, '<Markdown id="a">v2</Markdown>'))
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
    await w.loadXmlFilesWithStats();  // establish the captured snapshot

    const foreign = { vol: new Volume(), head: 'deadbeef'.repeat(5), tree: new Map() };
    onPush = () => { (w as any).state = foreign; };

    await w.save('a.olx' as OlxRelativePath, '<Markdown id="a">v2</Markdown>');

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
    await w.loadXmlFilesWithStats();
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
