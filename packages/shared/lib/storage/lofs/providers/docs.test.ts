// packages/shared/lib/storage/lofs/providers/docs.test.ts
//
// DocsStorageProvider: per-block namespace derivation via basename prefix
// match, directory fallback, and _test/ exclusion.

import { DocsStorageProvider } from './docs';
import type { SafeRelativePath } from '../../../types';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';

describe('DocsStorageProvider', () => {
  let dir: string;
  let provider: DocsStorageProvider;

  const ref = (p: string) => provider.toLofsRef(p as SafeRelativePath);

  beforeAll(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lo-blocks-docs-test-'));
    provider = new DocsStorageProvider(['Foo', 'FooGrader', 'ActionButton'], dir);

    await fs.mkdir(path.join(dir, 'action'), { recursive: true });
    await fs.writeFile(path.join(dir, 'action', 'ActionButton.olx'), '<Test/>');
    await fs.mkdir(path.join(dir, 'input', 'Matching'), { recursive: true });
    await fs.writeFile(path.join(dir, 'input', 'Matching', 'matching.pegjs.preview.olx'), '<Test/>');
    await fs.mkdir(path.join(dir, '_test'), { recursive: true });
    await fs.writeFile(path.join(dir, '_test', 'Broken.olx'), '<Unclosed>');
  });

  afterAll(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  test('namespace is docs.<Block> by basename prefix match', async () => {
    expect((await provider.namespaceFor(ref('action/ActionButton.olx'))).ns).toBe('docs.ActionButton');
    expect((await provider.namespaceFor(ref('action/ActionButtonLLM.olx'))).ns).toBe('docs.ActionButton');
  });

  test('includes files share the block namespace', async () => {
    expect((await provider.namespaceFor(ref('action/ActionButtonEssays.includes.olx'))).ns).toBe('docs.ActionButton');
  });

  test('longest block-name prefix wins (Foo vs FooGrader)', async () => {
    expect((await provider.namespaceFor(ref('grading/FooGrader.olx'))).ns).toBe('docs.FooGrader');
    expect((await provider.namespaceFor(ref('grading/FooExtra.olx'))).ns).toBe('docs.Foo');
  });

  test('unmatched files fall back to the containing directory', async () => {
    expect((await provider.namespaceFor(ref('input/Matching/matching.pegjs.preview.olx'))).ns).toBe('docs.Matching');
  });

  test('unmatched files at the provider root are rejected', async () => {
    await expect(provider.namespaceFor(ref('mystery.olx')))
      .rejects.toThrow(/matches no registered block name/);
  });

  test('scan excludes _test/ fixtures', async () => {
    const scan = await provider.loadXmlFilesWithStats();
    const paths = Object.keys(scan.added);
    expect(paths.some(p => p.includes('ActionButton.olx'))).toBe(true);
    expect(paths.some(p => p.includes('_test/'))).toBe(false);
  });
});
