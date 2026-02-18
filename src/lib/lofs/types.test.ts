// @vitest-environment node
import { validatePathSegment, toOlxRelativePath } from './types';

describe('validatePathSegment', () => {
  describe('rejects URI-unsafe characters', () => {
    it.each(['#', '?'])('rejects "%s"', (char) => {
      expect(validatePathSegment(`file${char}name.olx`)).toMatch(/not allowed/);
    });
  });

  describe('rejects OS-reserved characters', () => {
    it.each(['\\', ':', '<', '>', '"', '|', '*'])('rejects "%s"', (char) => {
      expect(validatePathSegment(`file${char}name.olx`)).toMatch(/not allowed/);
    });
  });

  describe('rejects spaces and punctuation', () => {
    it('rejects space', () => {
      expect(validatePathSegment('file name.olx')).toMatch(/not allowed/);
    });

    it('rejects exclamation mark', () => {
      expect(validatePathSegment('hello!.olx')).toMatch(/not allowed/);
    });
  });

  describe('rejects control characters', () => {
    it('rejects null byte', () => {
      expect(validatePathSegment('file\x00name.olx')).toMatch(/not allowed/);
    });

    it('rejects tab', () => {
      expect(validatePathSegment('file\tname.olx')).toMatch(/not allowed/);
    });

    it('rejects newline', () => {
      expect(validatePathSegment('file\nname.olx')).toMatch(/not allowed/);
    });
  });

  describe('rejects leading dots and empty segments', () => {
    it('rejects leading dot (hidden file)', () => {
      expect(validatePathSegment('.hidden')).toMatch(/Hidden/);
    });

    it('rejects empty segment', () => {
      expect(validatePathSegment('')).toMatch(/Empty/);
    });
  });

  describe('accepts valid filenames', () => {
    it.each([
      'lesson.olx',
      'my-file_v2.olx',
      'André.olx',
      'café.md',
      'file(copy).olx',
      '100%.olx',
    ])('accepts "%s"', (name) => {
      expect(validatePathSegment(name)).toBeNull();
    });
  });
});

describe('toOlxRelativePath', () => {
  describe('rejects paths with bad segments', () => {
    it('rejects hash in filename', () => {
      expect(() => toOlxRelativePath('subdir/file#2.olx')).toThrow(/not allowed/);
    });

    it('rejects question mark in directory', () => {
      expect(() => toOlxRelativePath('what?/file.olx')).toThrow(/not allowed/);
    });

    it('rejects backslash', () => {
      expect(() => toOlxRelativePath('dir\\file.olx')).toThrow(/not allowed/);
    });

    it('rejects hidden directory', () => {
      expect(() => toOlxRelativePath('.git/config')).toThrow(/Hidden/);
    });

    it('rejects space in path', () => {
      expect(() => toOlxRelativePath('my dir/file.olx')).toThrow(/not allowed/);
    });

    it('rejects exclamation mark', () => {
      expect(() => toOlxRelativePath('wow!/file.olx')).toThrow(/not allowed/);
    });
  });

  describe('preserves existing behavior', () => {
    it('rejects absolute paths', () => {
      expect(() => toOlxRelativePath('/etc/passwd')).toThrow(/absolute/);
    });

    it('rejects empty string', () => {
      expect(() => toOlxRelativePath('')).toThrow(/non-empty/);
    });

    it('allows .. segments (resolved by providers)', () => {
      expect(toOlxRelativePath('../sibling.olx')).toBe('../sibling.olx');
    });

    it('allows . segments', () => {
      expect(toOlxRelativePath('./file.olx')).toBe('./file.olx');
    });
  });

  describe('accepts valid paths', () => {
    it('accepts simple filename', () => {
      expect(toOlxRelativePath('lesson.olx')).toBe('lesson.olx');
    });

    it('accepts nested path', () => {
      expect(toOlxRelativePath('demos/intro/lesson.olx')).toBe('demos/intro/lesson.olx');
    });

    it('accepts hyphens and underscores', () => {
      expect(toOlxRelativePath('my-dir/my_file.olx')).toBe('my-dir/my_file.olx');
    });

    it('accepts unicode in path', () => {
      expect(toOlxRelativePath('André/café.olx')).toBe('André/café.olx');
    });
  });
});
