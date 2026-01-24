// src/lib/lofs/providers/file.test.ts
//
// Security tests for FileStorageProvider.
// Ensures path traversal, null byte injection, and other attacks are blocked.
//

import { FileStorageProvider } from './file';
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
    test('rejects ../../../etc/passwd', async () => {
      await expect(provider.read('../../../etc/passwd'))
        .rejects.toThrow(/escapes base directory/);
    });

    test('rejects ../../etc/passwd', async () => {
      await expect(provider.read('../../etc/passwd'))
        .rejects.toThrow(/escapes base directory/);
    });

    test('rejects ..\\..\\etc\\passwd (Windows-style)', async () => {
      await expect(provider.read('..\\..\\etc\\passwd'))
        .rejects.toThrow(/escapes base directory/);
    });

    test('rejects subdir/../../../etc/passwd', async () => {
      await expect(provider.read('subdir/../../../etc/passwd'))
        .rejects.toThrow(/escapes base directory/);
    });

    test('rejects foo/bar/../../../etc/passwd', async () => {
      await expect(provider.read('foo/bar/../../../etc/passwd'))
        .rejects.toThrow(/escapes base directory/);
    });

    test('rejects write with path traversal', async () => {
      await expect(provider.write('../../../tmp/evil.txt', 'malicious'))
        .rejects.toThrow(/escapes base directory/);
    });
  });

  describe('null byte injection', () => {
    test('rejects path with null byte', async () => {
      await expect(provider.read('file.olx\0.jpg'))
        .rejects.toThrow(/null bytes not allowed/);
    });

    test('rejects path with embedded null byte', async () => {
      await expect(provider.read('path/to\0/file.olx'))
        .rejects.toThrow(/null bytes not allowed/);
    });

    test('rejects write with null byte', async () => {
      await expect(provider.write('file\0.olx', 'content'))
        .rejects.toThrow(/null bytes not allowed/);
    });
  });

  describe('absolute path attempts', () => {
    test('rejects /etc/passwd', async () => {
      await expect(provider.read('/etc/passwd'))
        .rejects.toThrow(/escapes base directory|outside allowed/);
    });

    test('rejects /tmp/evil.txt write', async () => {
      await expect(provider.write('/tmp/evil.txt', 'malicious'))
        .rejects.toThrow(/escapes base directory|outside allowed/);
    });
  });

  describe('valid paths work correctly', () => {
    test('can read file in base directory', async () => {
      const result = await provider.read('test.olx');
      expect(result.content).toBe('<Test>content</Test>');
    });

    test('can write and read file', async () => {
      await provider.write('new-file.olx', '<New>data</New>');
      const result = await provider.read('new-file.olx');
      expect(result.content).toBe('<New>data</New>');
    });

    test('can handle subdirectory paths', async () => {
      await fs.mkdir(path.join(tempDir, 'subdir'), { recursive: true });
      await provider.write('subdir/nested.olx', '<Nested/>');
      const result = await provider.read('subdir/nested.olx');
      expect(result.content).toBe('<Nested/>');
    });

    test('allows .. that stays within base directory', async () => {
      await fs.mkdir(path.join(tempDir, 'a', 'b'), { recursive: true });
      await provider.write('a/b/file.olx', '<AB/>');
      // a/b/../b/file.olx should resolve to a/b/file.olx
      const result = await provider.read('a/b/../b/file.olx');
      expect(result.content).toBe('<AB/>');
    });
  });

  describe('edge cases', () => {
    test('rejects empty path', async () => {
      await expect(provider.read(''))
        .rejects.toThrow();
    });

    test('rejects path with only dots', async () => {
      await expect(provider.read('..'))
        .rejects.toThrow(/escapes base directory/);
    });

    test('rejects path starting with ./', async () => {
      // ./../../etc/passwd
      await expect(provider.read('./../../etc/passwd'))
        .rejects.toThrow(/escapes base directory/);
    });
  });
});
