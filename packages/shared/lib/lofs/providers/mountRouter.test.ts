// packages/shared/lib/lofs/providers/mountRouter.test.ts
//
// MountRouterProvider: path routing, scan union, namespace resolution, and
// the invariant that matters most — a source moved from a subdirectory of
// ./content into its own checkout produces IDENTICAL paths, refs, and keys.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MountRouterProvider } from './mountRouter';
import { FileStorageProvider } from './file';
import { syncContentFromStorage } from '../../content/syncContentFromStorage';
import { asDefinitionKey } from '../../types/id-grammar';
import type { OlxRelativePath, SafeRelativePath } from '../../types';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';

describe('MountRouterProvider', () => {
  let base: string;
  let router: MountRouterProvider;

  beforeAll(async () => {
    base = await fs.mkdtemp(path.join(os.tmpdir(), 'lo-mounts-'));
    process.env.OLX_CONTENT_DIR = base;

    // Simulated layout after the repo split:
    //   psych-repo/      — own checkout, manifest declares namespace
    //   writing-repo/    — own checkout, NO manifest (relies on mount default)
    //   fallback/demos/  — baseline content remaining in ./content
    await fs.mkdir(path.join(base, 'psych-repo'), { recursive: true });
    await fs.writeFile(path.join(base, 'psych-repo', 'manifest.yaml'), 'namespace: psych\n');
    await fs.writeFile(path.join(base, 'psych-repo', 'lesson1.olx'), '<Markdown id="hello">Hi</Markdown>');
    // No manifest here: a root file and a subdir file must both resolve to the
    // mount namespace ("writing"), not throw and not take an inner dir name.
    await fs.mkdir(path.join(base, 'writing-repo', 'unit1'), { recursive: true });
    await fs.writeFile(path.join(base, 'writing-repo', 'intro.olx'), '<Markdown id="w_intro">Write</Markdown>');
    await fs.writeFile(path.join(base, 'writing-repo', 'unit1', 'essay.olx'), '<Markdown id="w_essay">Essay</Markdown>');
    await fs.mkdir(path.join(base, 'fallback', 'demos'), { recursive: true });
    await fs.writeFile(path.join(base, 'fallback', 'demos', 'demo.olx'), '<Markdown id="demo_intro">Demo</Markdown>');

    router = new MountRouterProvider(
      [
        {
          mount: 'psychology',
          provider: new FileStorageProvider(path.join(base, 'psych-repo'), 'content/psychology'),
          baseDir: path.join(base, 'psych-repo'),
        },
        {
          mount: 'writing',
          provider: new FileStorageProvider(path.join(base, 'writing-repo'), 'content/writing', { defaultNs: 'writing' }),
          baseDir: path.join(base, 'writing-repo'),
        },
      ],
      new FileStorageProvider(path.join(base, 'fallback'), 'content'),
    );
  });

  afterAll(async () => {
    delete process.env.OLX_CONTENT_DIR;
    await fs.rm(base, { recursive: true, force: true });
  });

  it('routes mounted paths to the source, stripping the mount prefix', async () => {
    const result = await router.read('psychology/lesson1.olx' as OlxRelativePath);
    expect(result.content).toContain('hello');
    // Provenance carries the mounted source
    expect(String(result.provenance)).toMatch(/^file:content\/psychology:\/\/lesson1\.olx#/);
    // Namespace resolved by the source's own manifest
    expect(result.ns).toBe('psych');
  });

  it('routes unmounted paths to the fallback unchanged', async () => {
    const result = await router.read('demos/demo.olx' as OlxRelativePath);
    expect(result.content).toContain('demo_intro');
    expect(String(result.provenance)).toMatch(/^file:content:\/\/demos\/demo\.olx#/);
  });

  it('round-trips refs through toLofsRef/toRelativePath', () => {
    const ref = router.toLofsRef('psychology/lesson1.olx' as SafeRelativePath);
    expect(String(ref)).toBe('file:content/psychology://lesson1.olx');
    expect(router.toRelativePath(ref)).toBe('psychology/lesson1.olx');
  });

  it('lists mounted sources as top-level directories', async () => {
    const tree = await router.listFiles();
    const uris = (tree.children ?? []).map(c => c.uri);
    expect(uris).toContain('psychology');
    expect(uris).toContain('demos');
    const psych = (tree.children ?? []).find(c => c.uri === 'psychology');
    expect((psych?.children ?? []).map(c => c.uri)).toContain('psychology/lesson1.olx');
  });

  it('syncs all sources into one index with stable re-scans', async () => {
    const first = await syncContentFromStorage(router);
    expect(first.errors).toEqual([]);
    // Keys are exactly what the pre-split layout produced: namespace from
    // the source's manifest, not from its new location.
    expect(first.idMap[asDefinitionKey('psych/hello')]).toBeDefined();
    expect(first.idMap[asDefinitionKey('demos/demo_intro')]).toBeDefined();

    // Re-sync: no churn, no cross-mount false deletions.
    const second = await syncContentFromStorage(router);
    expect(second.errors).toEqual([]);
    expect(Object.keys(second.idMap).sort()).toEqual(Object.keys(first.idMap).sort());
  });

  it('writes route to the owning source', async () => {
    await router.write('psychology/new.olx' as OlxRelativePath, '<Markdown id="brand_new">New</Markdown>');
    const onDisk = await fs.readFile(path.join(base, 'psych-repo', 'new.olx'), 'utf-8');
    expect(onDisk).toContain('brand_new');
  });

  it('rejects cross-source renames', async () => {
    await expect(
      router.rename('psychology/new.olx' as OlxRelativePath, 'demos/new.olx' as OlxRelativePath)
    ).rejects.toThrow(/across content sources/);
  });

  // Finding 1: a collection that moved out of ./content/<dir> into its own
  // manifest-less checkout keeps <dir> as its namespace — for root files AND
  // subdir files — instead of throwing or taking an inner directory name.
  it('falls back to the mount name as namespace when there is no manifest', async () => {
    const root = await router.read('writing/intro.olx' as OlxRelativePath);
    expect(root.ns).toBe('writing');
    const nested = await router.read('writing/unit1/essay.olx' as OlxRelativePath);
    expect(nested.ns).toBe('writing'); // NOT "unit1"

    const { idMap, errors } = await syncContentFromStorage(router);
    expect(errors).toEqual([]);
    expect(idMap[asDefinitionKey('writing/w_intro')]).toBeDefined();
    expect(idMap[asDefinitionKey('writing/w_essay')]).toBeDefined();
  });

  // Finding 2: a stale ./content/<mount> copy in the fallback must not
  // double-index the same router path under a second ref.
  it('shadows fallback content that overlaps a mount prefix', async () => {
    const stale = path.join(base, 'fallback', 'psychology');
    await fs.mkdir(stale, { recursive: true });
    await fs.writeFile(path.join(stale, 'lesson1.olx'), '<Markdown id="hello">Stale</Markdown>');
    try {
      // Scan must not report the overlapping path from both the mount and the
      // fallback (distinct refs, same router path → duplicate blocks).
      const scan = await router.loadXmlFilesWithStats();
      const all = { ...scan.added, ...scan.changed, ...scan.unchanged };
      const fromFallback = Object.keys(all).filter(r => r === 'file:content://psychology/lesson1.olx');
      expect(fromFallback).toEqual([]);
      expect(all['file:content/psychology://lesson1.olx' as keyof typeof all]).toBeDefined();

      // glob/listFiles likewise list the mount, not the shadowed fallback copy.
      const hits = await router.glob('**/lesson1.olx');
      expect(hits).toContain('psychology/lesson1.olx');
      expect(hits.filter(h => h === 'psychology/lesson1.olx')).toHaveLength(1);

      const tree = await router.listFiles();
      const psychDirs = (tree.children ?? []).filter(c => c.uri === 'psychology');
      expect(psychDirs).toHaveLength(1);

      // The mount, not the stale copy, serves the content.
      const result = await router.read('psychology/lesson1.olx' as OlxRelativePath);
      expect(result.content).toContain('Hi'); // mount's version, not "Stale"
    } finally {
      await fs.rm(stale, { recursive: true, force: true });
    }
  });
});
