// packages/shared/lib/lofs/providers/file.test.ts
//
// Security tests for FileStorageProvider.
// Ensures path traversal, null byte injection, and other attacks are blocked.
//
// Tests use two patterns for branded paths:
// - toOlxRelativePath(): for valid paths and attack strings it accepts (e.g., ".." traversal)
// - `as OlxRelativePath`: bypass branding to test provider defense-in-depth against
//   inputs that the branding function itself would reject (absolute paths, null bytes, empty)
//

import { FileStorageProvider } from './file';
import { toOlxRelativePath } from '../../types/storage';
import type { OlxRelativePath, SafeRelativePath, LofsRef, ContentNamespace } from '../../types';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';

describe('FileStorageProvider security', () => {
  let provider: FileStorageProvider;
  let tempDir: string;

  beforeAll(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lo-blocks-test-'));
    provider = new FileStorageProvider(tempDir);
    await fs.writeFile(path.join(tempDir, 'test.olx'), '<Test>content</Test>');
  });

  afterAll(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('path traversal attacks', () => {
    test.each([
      '../../../etc/passwd',
      '../../etc/passwd',
      'subdir/../../../etc/passwd',
      'foo/bar/../../../etc/passwd',
    ])('rejects read of %s', async (attackPath) => {
      await expect(provider.read(toOlxRelativePath(attackPath)))
        .rejects.toThrow(/escapes base directory/);
    });

    test('rejects Windows-style backslash traversal at type boundary', () => {
      expect(() => toOlxRelativePath('..\\..\\etc\\passwd'))
        .toThrow(/not allowed|Hidden/);
    });

    test('rejects write with path traversal', async () => {
      await expect(provider.commit([{ path: toOlxRelativePath('../../../tmp/evil.txt'), content: 'malicious' }]))
        .rejects.toThrow(/escapes base directory/);
    });
  });

  describe('null byte injection', () => {
    // Null bytes are rejected by toOlxRelativePath, so we use `as OlxRelativePath`
    // to test the provider's own defense-in-depth checks.
    test.each([
      ['read', 'file.olx\0.jpg'],
      ['read', 'path/to\0/file.olx'],
      ['write', 'file\0.olx'],
    ])('rejects %s with null byte in: %s', async (op, attackPath) => {
      if (op === 'read') {
        await expect(provider.read(attackPath as OlxRelativePath))
          .rejects.toThrow(/null bytes not allowed/);
      } else {
        await expect(provider.commit([{ path: attackPath as OlxRelativePath, content: 'content' }]))
          .rejects.toThrow(/null bytes not allowed/);
      }
    });
  });

  describe('absolute path attempts', () => {
    // Absolute paths are rejected by toOlxRelativePath, so we use `as OlxRelativePath`
    // to test provider defense-in-depth.
    test('rejects absolute path read and write', async () => {
      await expect(provider.read('/etc/passwd' as OlxRelativePath))
        .rejects.toThrow(/escapes base directory|outside allowed/);
      await expect(provider.commit([{ path: '/tmp/evil.txt' as OlxRelativePath, content: 'malicious' }]))
        .rejects.toThrow(/escapes base directory|outside allowed/);
    });
  });

  describe('valid paths work correctly', () => {
    test('can read file in base directory', async () => {
      const result = await provider.read(toOlxRelativePath('test.olx'));
      expect(result.content).toBe('<Test>content</Test>');
    });

    test('can write and read file', async () => {
      await provider.commit([{ path: toOlxRelativePath('new-file.olx'), content: '<New>data</New>' }]);
      const result = await provider.read(toOlxRelativePath('new-file.olx'));
      expect(result.content).toBe('<New>data</New>');
    });

    test('can handle subdirectory paths', async () => {
      await fs.mkdir(path.join(tempDir, 'subdir'), { recursive: true });
      await provider.commit([{ path: toOlxRelativePath('subdir/nested.olx'), content: '<Nested/>' }]);
      const result = await provider.read(toOlxRelativePath('subdir/nested.olx'));
      expect(result.content).toBe('<Nested/>');
    });

    test('allows .. that stays within base directory', async () => {
      await fs.mkdir(path.join(tempDir, 'a', 'b'), { recursive: true });
      await provider.commit([{ path: toOlxRelativePath('a/b/file.olx'), content: '<AB/>' }]);
      const result = await provider.read(toOlxRelativePath('a/b/../b/file.olx'));
      expect(result.content).toBe('<AB/>');
    });
  });

  describe('edge cases', () => {
    test.each([
      ['empty path', '' as OlxRelativePath],
      ['only dots', toOlxRelativePath('..')],
      ['dot-slash traversal', toOlxRelativePath('./../../etc/passwd')],
    ])('rejects %s', async (_label, attackPath) => {
      await expect(provider.read(attackPath)).rejects.toThrow();
    });
  });
});

describe('FileStorageProvider.namespaceFor', () => {
  let nsDir: string;
  let provider: FileStorageProvider;

  const ref = (p: string) => provider.toLofsRef(p as SafeRelativePath);

  beforeAll(async () => {
    nsDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lo-blocks-ns-test-'));
    provider = new FileStorageProvider(nsDir, 'content');

    // Directory-fallback namespace
    await fs.mkdir(path.join(nsDir, 'demos'), { recursive: true });
    await fs.writeFile(path.join(nsDir, 'demos', 'foo.olx'), '<Test/>');

    // Manifest-governed subtree (namespace differs from directory name)
    await fs.mkdir(path.join(nsDir, 'psychology', 'unit1'), { recursive: true });
    await fs.writeFile(path.join(nsDir, 'psychology', 'manifest.yaml'), 'namespace: psych\n');
    await fs.writeFile(path.join(nsDir, 'psychology', 'unit1', 'lesson.olx'), '<Test/>');

    // Manifest WITHOUT a namespace field — falls through to directory name
    await fs.mkdir(path.join(nsDir, 'writing'), { recursive: true });
    await fs.writeFile(path.join(nsDir, 'writing', 'manifest.yaml'), 'title: Writing\n');
    await fs.writeFile(path.join(nsDir, 'writing', 'essay.olx'), '<Test/>');

    // Invalid directory name (hyphen is not allowed in namespaces)
    await fs.mkdir(path.join(nsDir, 'bad-name'), { recursive: true });
    await fs.writeFile(path.join(nsDir, 'bad-name', 'foo.olx'), '<Test/>');

    // File at the provider root — no namespace
    await fs.writeFile(path.join(nsDir, 'root.olx'), '<Test/>');
  });

  afterAll(async () => {
    await fs.rm(nsDir, { recursive: true, force: true });
  });

  test('falls back to the top-level directory name', async () => {
    expect((await provider.namespaceFor(ref('demos/foo.olx'))).ns).toBe('demos');
  });

  test('manifest.yaml namespace overrides the directory, including nested files', async () => {
    const resolved = await provider.namespaceFor(ref('psychology/unit1/lesson.olx'));
    expect(resolved.ns).toBe('psych');
    // Namespace provenance: the declaring manifest, versioned.
    expect(String(resolved.manifest)).toMatch(/psychology\/manifest\.yaml#/);
  });

  test('directory-derived namespaces carry no manifest provenance', async () => {
    expect((await provider.namespaceFor(ref('demos/foo.olx'))).manifest).toBeUndefined();
  });

  test('constructor ns override wins over manifests and directories', async () => {
    // Special-case API for tests and other wonky mounts — see constructor docs.
    const overridden = new FileStorageProvider(nsDir, 'content', { ns: 'scratch' as ContentNamespace });
    expect((await overridden.namespaceFor(ref('psychology/unit1/lesson.olx'))).ns).toBe('scratch');
    expect((await overridden.namespaceFor(ref('root.olx'))).ns).toBe('scratch');
  });

  test('manifest without a namespace field falls through to the directory name', async () => {
    expect((await provider.namespaceFor(ref('writing/essay.olx'))).ns).toBe('writing');
  });

  test('versioned refs resolve the same as unversioned', async () => {
    const versioned = `${ref('demos/foo.olx')}#12345-99` as LofsRef;
    expect((await provider.namespaceFor(versioned)).ns).toBe('demos');
  });

  test('rejects files at the provider root with a move-it message', async () => {
    await expect(provider.namespaceFor(ref('root.olx')))
      .rejects.toThrow(/namespace directory|manifest\.yaml/);
  });

  test('rejects directory names the namespace grammar forbids', async () => {
    await expect(provider.namespaceFor(ref('bad-name/foo.olx')))
      .rejects.toThrow(/cannot be used as a content namespace/);
  });

});

describe('commit base checks on destructive intents (review 2026-07-13)', () => {
  test('stale delete and stale rename conflict; rename refuses existing destination', async () => {
    const fsp = await import('fs/promises');
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'file-commit-base-'));
    const prov = new FileStorageProvider(dir);
    try {
      await fsp.writeFile(path.join(dir, 'victim.md'), 'v1');
      const staleBase = { mtime: (await fsp.stat(path.join(dir, 'victim.md'))).mtimeMs - 5000, size: 2 };

      await expect(prov.commit([{ path: 'victim.md' as OlxRelativePath, delete: true }],
        { base: [{ path: 'victim.md' as OlxRelativePath, version: staleBase }] }),
      ).rejects.toThrow(/modified/);

      await expect(prov.commit([{ path: 'victim.md' as OlxRelativePath, renameTo: 'moved.md' as OlxRelativePath }],
        { base: [{ path: 'victim.md' as OlxRelativePath, version: staleBase }] }),
      ).rejects.toThrow(/modified/);

      await fsp.writeFile(path.join(dir, 'occupied.md'), 'here first');
      await expect(prov.commit([{ path: 'victim.md' as OlxRelativePath, renameTo: 'occupied.md' as OlxRelativePath }]),
      ).rejects.toThrow(/already exists/);
      // force overrides the destination guard
      await prov.commit([{ path: 'victim.md' as OlxRelativePath, renameTo: 'occupied.md' as OlxRelativePath }], { force: true });
      expect(await fsp.readFile(path.join(dir, 'occupied.md'), 'utf-8')).toBe('v1');
    } finally {
      await fsp.rm(dir, { recursive: true, force: true });
    }
  });
});
