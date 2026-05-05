// src/lib/lofs/contentPaths.test.ts
//
// Security tests for content path validation.
// This is the first line of defense at the API route level.
//

import { validateContentPath, getEditPathFromProvenance } from './contentPaths';

describe('validateContentPath security', () => {
  test.each([
    'content/../../../etc/passwd',
    'content/../../etc/passwd.olx',
    'content/subdir/../../../etc/passwd.olx',
    'content/..',
    'content/foo/../../bar.olx',
  ])('rejects traversal: %s', (path) => {
    expect(validateContentPath(path).valid).toBe(false);
  });

  test.each([
    '/etc/passwd',
    '/etc/passwd.olx',
    '/tmp/evil.olx',
  ])('rejects absolute path: %s', (path) => {
    expect(validateContentPath(path).valid).toBe(false);
  });

  test.each([
    ['content/malware.exe', /invalid file type/i],
    ['content/script.sh', /invalid file type/i],
    ['content/passwd', /invalid file type/i],
    ['content/evil.js', /invalid file type/i],
  ])('rejects bad extension: %s', (path, errorPattern) => {
    const result = validateContentPath(path);
    expect(result.valid).toBe(false);
    if (errorPattern) expect(result.error).toMatch(errorPattern);
  });

  describe('valid paths', () => {
    test.each([
      ['content/demo.olx', 'demo.olx'],
      ['content/course.xml', 'course.xml'],
      ['content/readme.md', 'readme.md'],
      ['content/dialogue.chatpeg', 'dialogue.chatpeg'],
      ['content/demos/intro/lesson1.olx', 'demos/intro/lesson1.olx'],
    ])('accepts %s', (path, expectedRelative) => {
      const result = validateContentPath(path);
      expect(result.valid).toBe(true);
      expect(result.relativePath).toBe(expectedRelative);
    });

    test('normalizes paths with . and ..', () => {
      const result = validateContentPath('content/demos/./intro/../intro/lesson.olx');
      expect(result.valid).toBe(true);
      expect(result.relativePath).toBe('demos/intro/lesson.olx');
    });
  });

  describe('edge cases', () => {
    test('rejects empty path', () => {
      expect(validateContentPath('').error).toMatch(/missing path/i);
    });

    test('rejects null-ish values', () => {
      expect(validateContentPath(null as any).valid).toBe(false);
      expect(validateContentPath(undefined as any).valid).toBe(false);
    });
  });
});

describe('getEditPathFromProvenance security', () => {
  test('extracts content-relative path from mount-point URI', () => {
    const result = getEditPathFromProvenance(['file:content://demos/foo.xml']);
    expect(result.valid).toBe(true);
    expect(result.relativePath).toBe('demos/foo.xml');
  });

  test('rejects provenance with traversal', () => {
    const result = getEditPathFromProvenance(['file:content://../../etc/passwd']);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/outside content directory/i);
  });

  test('rejects empty provenance', () => {
    expect(getEditPathFromProvenance([]).valid).toBe(false);
    expect(getEditPathFromProvenance(undefined).valid).toBe(false);
  });

  test('rejects non-file provenance', () => {
    const result = getEditPathFromProvenance(['http://example.com/file.olx']);
    expect(result.error).toMatch(/no file provenance/i);
  });

  test('rejects file URI without :// separator', () => {
    const result = getEditPathFromProvenance(['file:etc/passwd']);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/not in the content mount/i);
  });

  test('rejects non-content mount', () => {
    const result = getEditPathFromProvenance(['file:etc://passwd']);
    expect(result.error).toMatch(/not in the content mount/i);
  });
});
