// @vitest-environment node
//
// contentSources: directory-form sources, worktree flag semantics.
//
// A bare-string directory source reads the WORKTREE via FileStorageProvider
// (today's exact behavior). The object form { dir, worktree: false } serves the
// checkout's git HEAD via a local-mode GitStorageProvider — committed content
// only, generationToken = the HEAD oid. Exercised end-to-end through
// configuredSources with an explicit config (production reads the same path
// from config/content-sources.yaml).
//
// Fixtures are THROWAWAY temp git repos built here — never the working repo.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import git from 'isomorphic-git';
import * as fs from 'fs/promises';
import * as fsc from 'fs';
import * as path from 'path';
import * as os from 'os';
import { configuredSources, type ContentSourcesConfig } from './contentSources';
import { FileStorageProvider } from './providers/file';
import { GitStorageProvider } from './providers/git';
import type { OlxRelativePath } from '../types';

const fsEnv = { fs: fsc } as any;
const AUTHOR = { name: 'Test', email: 'test@example.edu' };

const cfg = (sources: ContentSourcesConfig['sources']): ContentSourcesConfig => ({
  sources,
  fallback: './content',
  fallbackWritable: false,
});

describe('contentSources directory-form worktree flag', () => {
  let dir: string;

  beforeAll(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lo-content-sources-'));
    await git.init({ ...fsEnv, dir, defaultBranch: 'main' });
    await fs.writeFile(path.join(dir, 'lesson.olx'), '<Markdown id="l">committed v1</Markdown>');
    await git.add({ ...fsEnv, dir, filepath: 'lesson.olx' });
    await git.commit({ ...fsEnv, dir, message: 'init', author: AUTHOR });
    // A worktree-only edit, NOT committed: visible to worktree mode, invisible
    // to HEAD mode.
    await fs.writeFile(path.join(dir, 'lesson.olx'), '<Markdown id="l">worktree v2</Markdown>');
  });

  afterAll(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('bare string constructs a FileStorageProvider over the worktree (unchanged behavior)', async () => {
    const { sources } = await configuredSources(cfg({ mycourse: dir }));
    expect(sources).toHaveLength(1);
    const s = sources[0];
    expect(s.provider).toBeInstanceOf(FileStorageProvider);
    expect(String(s.origin)).toBe('file:content/mycourse');
    expect(s.writable).toBe(true);
    // Worktree read: sees the uncommitted edit.
    expect((await s.provider.read('lesson.olx' as OlxRelativePath)).content).toContain('worktree v2');
  });

  it('{ dir, worktree: true } is identical to the bare string', async () => {
    const { sources } = await configuredSources(cfg({ mycourse: { dir, worktree: true } }));
    const s = sources[0];
    expect(s.provider).toBeInstanceOf(FileStorageProvider);
    expect(String(s.origin)).toBe('file:content/mycourse');
    expect((await s.provider.read('lesson.olx' as OlxRelativePath)).content).toContain('worktree v2');
  });

  it('{ dir, worktree: false } constructs a local-mode git provider reading HEAD', async () => {
    const { sources } = await configuredSources(cfg({ mycourse: { dir, worktree: false } }));
    expect(sources).toHaveLength(1);
    const s = sources[0];
    // Same identity as the worktree form — flipping the flag changes WHAT is
    // served, never the origin/label/writability.
    expect(String(s.origin)).toBe('file:content/mycourse');
    expect(s.writable).toBe(true);
    const p = s.provider as GitStorageProvider;
    expect(p).toBeInstanceOf(GitStorageProvider);
    expect(p.mode).toBe('local');

    // Reads at HEAD: the committed content, NOT the uncommitted worktree edit.
    const r = await p.read('lesson.olx' as OlxRelativePath);
    expect(r.content).toContain('committed v1');
    expect(r.content).not.toContain('worktree v2');
    expect(String(r.provenance)).toContain('file:content/mycourse://lesson.olx#');

    // generationToken = the current HEAD oid.
    const head = await git.resolveRef({ ...fsEnv, dir, ref: 'HEAD' });
    expect(await p.generationToken()).toBe(head);

    // Default namespace: the mount name (mirrors the worktree form's defaultNs).
    expect(r.ns).toBe('mycourse');
  });

  it('worktree: false on a non-git directory fails with an author-friendly error naming the fix', async () => {
    const plain = await fs.mkdtemp(path.join(os.tmpdir(), 'lo-not-a-repo-'));
    try {
      await expect(configuredSources(cfg({ mycourse: { dir: plain, worktree: false } })))
        .rejects.toThrow(/worktree: false.*no \.git.*git init|no \.git/s);
    } finally {
      await fs.rm(plain, { recursive: true, force: true });
    }
  });
});
