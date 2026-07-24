// @vitest-environment node
//
// Security tests for the content API-route boundary conversion. This is the
// first line of defense before an untrusted ?path= reaches a provider.
//
import { toRepoRelativePath } from './repoPath';

describe('toRepoRelativePath', () => {
  describe('rejects traversal escaping the source', () => {
    it.each([
      '..',
      '../secrets.olx',
      '../../../etc/passwd.olx',
      'foo/../../bar.olx',
      'subdir/../../../etc/passwd.olx',
    ])('rejects "%s"', (p) => {
      expect(() => toRepoRelativePath(p)).toThrow(/escapes its source/);
    });
  });

  describe('rejects backslash / Windows-style separators', () => {
    // toOlxRelativePath's per-segment allowlist has no "\", so any backslash
    // segment is rejected before normalization — "\..\" cannot slip through.
    it.each([
      '\\..\\',
      '..\\..\\etc\\passwd.olx',
      'foo\\..\\..\\bar.olx',
      'dir/..\\x.olx',
      'a\\b.olx',
    ])('rejects %j', (p) => {
      expect(() => toRepoRelativePath(p)).toThrow(/not allowed/);
    });
  });

  describe('rejects absolute paths', () => {
    it.each(['/etc/passwd.olx', '/tmp/evil.olx'])('rejects "%s"', (p) => {
      expect(() => toRepoRelativePath(p)).toThrow(/absolute/);
    });
  });

  describe('rejects non-content files', () => {
    it.each(['malware.exe', 'script.sh', 'evil.js', 'passwd'])('rejects "%s"', (p) => {
      expect(() => toRepoRelativePath(p)).toThrow(/content file/);
    });
  });

  it('rejects control characters (null byte)', () => {
    expect(() => toRepoRelativePath('a\x00b.olx')).toThrow(/not allowed/);
  });

  it('rejects "#" (reserved version delimiter)', () => {
    expect(() => toRepoRelativePath('lesson.olx#main')).toThrow(/not allowed/);
  });

  it('rejects empty / nullish', () => {
    expect(() => toRepoRelativePath('')).toThrow(/non-empty/);
    expect(() => toRepoRelativePath(null as any)).toThrow();
    expect(() => toRepoRelativePath(undefined as any)).toThrow();
  });

  describe('accepts and normalizes valid content paths', () => {
    it.each([
      ['demo.olx', 'demo.olx'],
      ['course.xml', 'course.xml'],
      ['readme.md', 'readme.md'],
      ['demos/intro/lesson1.olx', 'demos/intro/lesson1.olx'],
      ['a/../b.olx', 'b.olx'],
      ['./lesson.olx', 'lesson.olx'],
    ])('accepts %s → %s', (input, expected) => {
      expect(toRepoRelativePath(input)).toBe(expected);
    });

    it('folds "." and ".." within the root (POSIX separators)', () => {
      expect(toRepoRelativePath('demos/./intro/../intro/lesson.olx')).toBe('demos/intro/lesson.olx');
    });
  });
});
