// src/lib/storage/contentPaths.test.ts
//
// Security tests for content path validation.
// This is the first line of defense at the API route level.
//

import { validateContentPath, getEditPathFromProvenance } from './contentPaths';

describe('validateContentPath security', () => {
  describe('path traversal attacks', () => {
    test('rejects ../../../etc/passwd', () => {
      const result = validateContentPath('../../../etc/passwd');
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/escapes content directory/i);
    });

    test('rejects ../../etc/passwd.olx', () => {
      // Even with valid extension, traversal should be blocked
      const result = validateContentPath('../../etc/passwd.olx');
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/escapes content directory/i);
    });

    test('rejects subdir/../../../etc/passwd.olx', () => {
      const result = validateContentPath('subdir/../../../etc/passwd.olx');
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/escapes content directory/i);
    });

    test('rejects ..', () => {
      const result = validateContentPath('..');
      expect(result.valid).toBe(false);
    });

    test('rejects path with embedded ..', () => {
      const result = validateContentPath('foo/../../bar.olx');
      expect(result.valid).toBe(false);
    });
  });

  describe('absolute path attempts', () => {
    test('rejects /etc/passwd', () => {
      const result = validateContentPath('/etc/passwd');
      expect(result.valid).toBe(false);
    });

    test('rejects /etc/passwd.olx', () => {
      // Even with valid extension
      const result = validateContentPath('/etc/passwd.olx');
      expect(result.valid).toBe(false);
    });

    test('rejects /tmp/evil.olx', () => {
      const result = validateContentPath('/tmp/evil.olx');
      expect(result.valid).toBe(false);
    });
  });

  describe('extension validation', () => {
    test('rejects .exe files', () => {
      const result = validateContentPath('malware.exe');
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/invalid file type/i);
    });

    test('rejects .sh files', () => {
      const result = validateContentPath('script.sh');
      expect(result.valid).toBe(false);
    });

    test('rejects files with no extension', () => {
      const result = validateContentPath('passwd');
      expect(result.valid).toBe(false);
    });

    test('rejects .js files', () => {
      // Even though .js is in EXT.code, it's not in CATEGORY.content
      const result = validateContentPath('evil.js');
      expect(result.valid).toBe(false);
    });
  });

  describe('valid paths', () => {
    test('accepts .olx files', () => {
      const result = validateContentPath('demo.olx');
      expect(result.valid).toBe(true);
      expect(result.relativePath).toBe('demo.olx');
    });

    test('accepts .xml files', () => {
      const result = validateContentPath('course.xml');
      expect(result.valid).toBe(true);
    });

    test('accepts .md files', () => {
      const result = validateContentPath('readme.md');
      expect(result.valid).toBe(true);
    });

    test('accepts .chatpeg files', () => {
      const result = validateContentPath('dialogue.chatpeg');
      expect(result.valid).toBe(true);
    });

    test('accepts nested paths', () => {
      const result = validateContentPath('demos/intro/lesson1.olx');
      expect(result.valid).toBe(true);
      expect(result.relativePath).toBe('demos/intro/lesson1.olx');
    });

    test('normalizes paths', () => {
      const result = validateContentPath('demos/./intro/../intro/lesson.olx');
      expect(result.valid).toBe(true);
      expect(result.relativePath).toBe('demos/intro/lesson.olx');
    });
  });

  describe('edge cases', () => {
    test('rejects empty path', () => {
      const result = validateContentPath('');
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/missing path/i);
    });

    test('rejects null-ish values', () => {
      expect(validateContentPath(null as any).valid).toBe(false);
      expect(validateContentPath(undefined as any).valid).toBe(false);
    });
  });
});

describe('getEditPathFromProvenance security', () => {
  test('rejects provenance outside content directory', () => {
    const result = getEditPathFromProvenance(['file:///etc/passwd']);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/outside content directory/i);
  });

  test('rejects provenance with traversal', () => {
    const result = getEditPathFromProvenance(['file:///home/user/content/../../../etc/passwd']);
    expect(result.valid).toBe(false);
  });

  test('rejects empty provenance', () => {
    expect(getEditPathFromProvenance([]).valid).toBe(false);
    expect(getEditPathFromProvenance(undefined).valid).toBe(false);
  });

  test('rejects non-file provenance', () => {
    const result = getEditPathFromProvenance(['http://example.com/file.olx']);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/no file provenance/i);
  });
});
