// src/lib/lofs/providers/file.test.ts
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
import type { OlxRelativePath } from '../../types';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';

describe('FileStorageProvider security', () => {
  let provider: FileStorageProvider;
  let tempDir: string;

  beforeAll(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lo-blocks-test-'));
    process.env.OLX_CONTENT_DIR = tempDir;
    provider = new FileStorageProvider(tempDir);
    await fs.writeFile(path.join(tempDir, 'test.olx'), '<Test>content</Test>');
  });

  afterAll(async () => {
    delete process.env.OLX_CONTENT_DIR;
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
      await expect(provider.write(toOlxRelativePath('../../../tmp/evil.txt'), 'malicious'))
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
        await expect(provider.write(attackPath as OlxRelativePath, 'content'))
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
      await expect(provider.write('/tmp/evil.txt' as OlxRelativePath, 'malicious'))
        .rejects.toThrow(/escapes base directory|outside allowed/);
    });
  });

  describe('valid paths work correctly', () => {
    test('can read file in base directory', async () => {
      const result = await provider.read(toOlxRelativePath('test.olx'));
      expect(result.content).toBe('<Test>content</Test>');
    });

    test('can write and read file', async () => {
      await provider.write(toOlxRelativePath('new-file.olx'), '<New>data</New>');
      const result = await provider.read(toOlxRelativePath('new-file.olx'));
      expect(result.content).toBe('<New>data</New>');
    });

    test('can handle subdirectory paths', async () => {
      await fs.mkdir(path.join(tempDir, 'subdir'), { recursive: true });
      await provider.write(toOlxRelativePath('subdir/nested.olx'), '<Nested/>');
      const result = await provider.read(toOlxRelativePath('subdir/nested.olx'));
      expect(result.content).toBe('<Nested/>');
    });

    test('allows .. that stays within base directory', async () => {
      await fs.mkdir(path.join(tempDir, 'a', 'b'), { recursive: true });
      await provider.write(toOlxRelativePath('a/b/file.olx'), '<AB/>');
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
