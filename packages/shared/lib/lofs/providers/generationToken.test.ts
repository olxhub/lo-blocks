// @vitest-environment node
// generationToken: the cheap "might anything have changed?" signal each sync
// source exposes. Memory bumps a write counter; file changes when the tree does.

import { test, expect } from 'vitest';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';
import { InMemoryStorageProvider } from './memory';
import { FileStorageProvider } from './file';

test('InMemoryStorageProvider: token bumps on write, stable otherwise', async () => {
  const provider = new InMemoryStorageProvider({ 'a.olx': '<Test/>' });
  const t1 = await provider.generationToken();
  expect(await provider.generationToken()).toBe(t1); // stable with no writes

  provider.setContent('b.olx', '<Other/>');
  const t2 = await provider.generationToken();
  expect(t2).not.toBe(t1);
});

test('FileStorageProvider: token changes after a write to the tree', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'gen-token-'));
  try {
    await fs.writeFile(path.join(dir, 'test.olx'), '<Test>one</Test>');
    const provider = new FileStorageProvider(dir);

    const t1 = await provider.generationToken();
    expect(await provider.generationToken()).toBe(t1); // stable, no change

    // Grow the file so the total-size component moves regardless of mtime
    // resolution.
    await fs.writeFile(path.join(dir, 'test.olx'), '<Test>one two three four</Test>');
    const t2 = await provider.generationToken();
    expect(t2).not.toBe(t1);

    // Adding a file moves the count/size too.
    await fs.writeFile(path.join(dir, 'more.olx'), '<More/>');
    const t3 = await provider.generationToken();
    expect(t3).not.toBe(t2);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
