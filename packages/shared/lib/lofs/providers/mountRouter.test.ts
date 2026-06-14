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
    //   fallback/demos/  — baseline content remaining in ./content
    await fs.mkdir(path.join(base, 'psych-repo'), { recursive: true });
    await fs.writeFile(path.join(base, 'psych-repo', 'manifest.yaml'), 'namespace: psych\n');
    await fs.writeFile(path.join(base, 'psych-repo', 'lesson1.olx'), '<Markdown id="hello">Hi</Markdown>');
    await fs.mkdir(path.join(base, 'fallback', 'demos'), { recursive: true });
    await fs.writeFile(path.join(base, 'fallback', 'demos', 'demo.olx'), '<Markdown id="demo_intro">Demo</Markdown>');

    router = new MountRouterProvider(
      [{
        mount: 'psychology',
        provider: new FileStorageProvider(path.join(base, 'psych-repo'), 'content/psychology'),
        baseDir: path.join(base, 'psych-repo'),
      }],
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
});
