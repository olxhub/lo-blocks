// packages/shared/lib/lofs/contentPaths.test.ts
//
// Security tests for content path validation.
// This is the first line of defense at the API route level.
//

import { validateRepoRelativePath } from './contentPaths';

describe('validateRepoRelativePath security', () => {
  test.each([
    '../../../etc/passwd',
    '../../etc/passwd.olx',
    'subdir/../../../etc/passwd.olx',
    '..',
    'foo/../../bar.olx',
  ])('rejects traversal: %s', (path) => {
    expect(validateRepoRelativePath(path).valid).toBe(false);
  });

  test.each([
    '/etc/passwd',
    '/etc/passwd.olx',
    '/tmp/evil.olx',
  ])('rejects absolute path: %s', (path) => {
    expect(validateRepoRelativePath(path).valid).toBe(false);
  });

  test.each([
    ['malware.exe', /invalid file type/i],
    ['script.sh', /invalid file type/i],
    ['passwd', /invalid file type/i],
    ['evil.js', /invalid file type/i],
  ])('rejects bad extension: %s', (path, errorPattern) => {
    const result = validateRepoRelativePath(path);
    expect(result.valid).toBe(false);
    if (errorPattern) expect(result.error).toMatch(errorPattern);
  });

  test('rejects "#" (reserved version delimiter)', () => {
    expect(validateRepoRelativePath('lesson.olx#main').valid).toBe(false);
  });

  describe('valid paths', () => {
    test.each([
      ['demo.olx', 'demo.olx'],
      ['course.xml', 'course.xml'],
      ['readme.md', 'readme.md'],
      ['dialogue.chatpeg', 'dialogue.chatpeg'],
      ['demos/intro/lesson1.olx', 'demos/intro/lesson1.olx'],
    ])('accepts %s', (path, expectedRelative) => {
      const result = validateRepoRelativePath(path);
      expect(result.valid).toBe(true);
      expect(result.relativePath).toBe(expectedRelative);
    });

    test('normalizes paths with . and ..', () => {
      const result = validateRepoRelativePath('demos/./intro/../intro/lesson.olx');
      expect(result.valid).toBe(true);
      expect(result.relativePath).toBe('demos/intro/lesson.olx');
    });
  });

  describe('edge cases', () => {
    test('rejects empty path', () => {
      expect(validateRepoRelativePath('').error).toMatch(/missing path/i);
    });

    test('rejects null-ish values', () => {
      expect(validateRepoRelativePath(null as any).valid).toBe(false);
      expect(validateRepoRelativePath(undefined as any).valid).toBe(false);
    });
  });
});
