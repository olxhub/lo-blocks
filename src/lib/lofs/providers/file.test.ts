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
import { toOlxRelativePath } from '../types';
import type { OlxRelativePath } from '../../types';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';

describe('FileStorageProvider security', () => {
  let provider: FileStorageProvider;
  let tempDir: string;

  beforeAll(async () => {
    // Create a temp directory for tests
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lo-blocks-test-'));
    // Set OLX_CONTENT_DIR so our temp dir is in the allowed list
    process.env.OLX_CONTENT_DIR = tempDir;
    provider = new FileStorageProvider(tempDir);

    // Create a test file
    await fs.writeFile(path.join(tempDir, 'test.olx'), '<Test>content</Test>');
  });

  afterAll(async () => {
    // Cleanup
    delete process.env.OLX_CONTENT_DIR;
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('path traversal attacks', () => {
    // toOlxRelativePath allows ".." — traversal security is the provider's job
    test('rejects ../../../etc/passwd', async () => {
      await expect(provider.read(toOlxRelativePath('../../../etc/passwd')))
        .rejects.toThrow(/escapes base directory/);
    });

    test('rejects ../../etc/passwd', async () => {
      await expect(provider.read(toOlxRelativePath('../../etc/passwd')))
        .rejects.toThrow(/escapes base directory/);
    });

    test('rejects ..\\..\\etc\\passwd (Windows-style)', async () => {
      await expect(provider.read(toOlxRelativePath('..\\..\\etc\\passwd')))
        .rejects.toThrow(/escapes base directory/);
    });

    test('rejects subdir/../../../etc/passwd', async () => {
      await expect(provider.read(toOlxRelativePath('subdir/../../../etc/passwd')))
        .rejects.toThrow(/escapes base directory/);
    });

    test('rejects foo/bar/../../../etc/passwd', async () => {
      await expect(provider.read(toOlxRelativePath('foo/bar/../../../etc/passwd')))
        .rejects.toThrow(/escapes base directory/);
    });

    test('rejects write with path traversal', async () => {
      await expect(provider.write(toOlxRelativePath('../../../tmp/evil.txt'), 'malicious'))
        .rejects.toThrow(/escapes base directory/);
    });
  });

  describe('null byte injection', () => {
    // Null bytes are rejected by toOlxRelativePath, so we use `as OlxRelativePath`
    // to test the provider's own defense-in-depth null byte checks.
    test('rejects path with null byte', async () => {
      await expect(provider.read('file.olx\0.jpg' as OlxRelativePath))
        .rejects.toThrow(/null bytes not allowed/);
    });

    test('rejects path with embedded null byte', async () => {
      await expect(provider.read('path/to\0/file.olx' as OlxRelativePath))
        .rejects.toThrow(/null bytes not allowed/);
    });

    test('rejects write with null byte', async () => {
      await expect(provider.write('file\0.olx' as OlxRelativePath, 'content'))
        .rejects.toThrow(/null bytes not allowed/);
    });
  });

  describe('absolute path attempts', () => {
    // Absolute paths are rejected by toOlxRelativePath, so we use `as OlxRelativePath`
    // to test the provider's own defense-in-depth absolute path checks.
    test('rejects /etc/passwd', async () => {
      await expect(provider.read('/etc/passwd' as OlxRelativePath))
        .rejects.toThrow(/escapes base directory|outside allowed/);
    });

    test('rejects /tmp/evil.txt write', async () => {
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
      // a/b/../b/file.olx should resolve to a/b/file.olx
      const result = await provider.read(toOlxRelativePath('a/b/../b/file.olx'));
      expect(result.content).toBe('<AB/>');
    });
  });

  describe('edge cases', () => {
    // Empty path is rejected by toOlxRelativePath, so use `as OlxRelativePath`
    // to test provider defense-in-depth.
    test('rejects empty path', async () => {
      await expect(provider.read('' as OlxRelativePath))
        .rejects.toThrow();
    });

    test('rejects path with only dots', async () => {
      await expect(provider.read(toOlxRelativePath('..')))
        .rejects.toThrow(/escapes base directory/);
    });

    test('rejects path starting with ./', async () => {
      // ./../../etc/passwd
      await expect(provider.read(toOlxRelativePath('./../../etc/passwd')))
        .rejects.toThrow(/escapes base directory/);
    });
  });
});
