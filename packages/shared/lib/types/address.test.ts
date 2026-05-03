// @vitest-environment node
//
// Content address system tests.
// Ported from prototypes/lofs/src/address.test.ts with Lofs-prefixed types.

import { describe, it, expect } from 'vitest';
import {
  source, version, addressPath, withVersion, withoutVersion,
  withPath, makeAddress, hasVersion, scheme,
  toLofsRef, toLofsContentPath, toLofsOrigin, toLofsVersion,
} from './address';

// Helper to avoid repeating toLofsRef everywhere in tests
const ref = toLofsRef;
const cp = toLofsContentPath;
const sl = toLofsOrigin;
const vr = toLofsVersion;

describe('address parsing', () => {
  // ═══════════════════════════════════════════════════════════════════════════
  // The canonical examples table from the design doc
  // ═══════════════════════════════════════════════════════════════════════════

  const examples = [
    {
      address: 'git@github.com:olxhub/lo-blocks.git://content/myfile.olx',
      source: 'git@github.com:olxhub/lo-blocks.git',
      version: undefined,
      path: 'content/myfile.olx',
    },
    {
      address: 'git@github.com:olxhub/lo-blocks.git://content/myfile.olx#3f41866',
      source: 'git@github.com:olxhub/lo-blocks.git',
      version: '3f41866',
      path: 'content/myfile.olx',
    },
    {
      address: 'git@github.com:olxhub/lo-blocks.git://#main',
      source: 'git@github.com:olxhub/lo-blocks.git',
      version: 'main',
      path: '',
    },
    {
      address: 'file:/home/user/content://myfile.olx',
      source: 'file:/home/user/content',
      version: undefined,
      path: 'myfile.olx',
    },
    {
      address: 'pg://school.edu/cs101://hw1/problem3.olx#v42',
      source: 'pg://school.edu/cs101',
      version: 'v42',
      path: 'hw1/problem3.olx',
    },
    {
      address: 'memory:session-42://draft.olx',
      source: 'memory:session-42',
      version: undefined,
      path: 'draft.olx',
    },
    // @ in source locators — the old format would have misparsed these
    {
      address: 'postgres:profx@uofa.edu://hw1/problem.olx',
      source: 'postgres:profx@uofa.edu',
      version: undefined,
      path: 'hw1/problem.olx',
    },
    {
      address: 'postgres:profx@uofa.edu://hw1/problem.olx#v42',
      source: 'postgres:profx@uofa.edu',
      version: 'v42',
      path: 'hw1/problem.olx',
    },
  ];

  for (const ex of examples) {
    describe(ex.address, () => {
      const a = ref(ex.address);

      it('extracts source', () => {
        expect(source(a)).toBe(ex.source);
      });

      it('extracts version', () => {
        expect(version(a)).toBe(ex.version);
      });

      it('extracts path', () => {
        expect(addressPath(a)).toBe(ex.path);
      });
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Edge cases
  // ═══════════════════════════════════════════════════════════════════════════

  describe('source-only reference (no ://, no path)', () => {
    const a = ref('git@github.com:olxhub/lo-blocks.git');

    it('source is the whole string', () => {
      expect(source(a)).toBe('git@github.com:olxhub/lo-blocks.git');
    });

    it('version is undefined', () => {
      expect(version(a)).toBeUndefined();
    });

    it('path is empty', () => {
      expect(addressPath(a)).toBe('');
    });
  });

  describe('@ in source locator is not confused with version', () => {
    const a = ref('git@github.com:olxhub/lo-blocks.git://foo.olx');
    it('no version parsed', () => {
      expect(version(a)).toBeUndefined();
    });
    it('source includes git@github.com', () => {
      expect(source(a)).toBe('git@github.com:olxhub/lo-blocks.git');
    });
  });

  describe('version with dots and hyphens', () => {
    const a = ref('git@github.com:org/repo.git://foo.olx#v2.1-rc.3');
    it('parses version with dots and hyphens', () => {
      expect(version(a)).toBe('v2.1-rc.3');
    });
    it('source is unchanged', () => {
      expect(source(a)).toBe('git@github.com:org/repo.git');
    });
    it('path excludes version', () => {
      expect(addressPath(a)).toBe('foo.olx');
    });
  });

  describe('multiple :// — last one wins', () => {
    const a = ref('pg://school.edu/cs101://sub/dir/file.olx');
    it('path is after the last ://', () => {
      expect(addressPath(a)).toBe('sub/dir/file.olx');
    });
    it('source is before the last ://', () => {
      expect(source(a)).toBe('pg://school.edu/cs101');
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Construction and modification
// ═══════════════════════════════════════════════════════════════════════════════

describe('makeAddress', () => {
  it('source + path + version', () => {
    const a = makeAddress(
      sl('git@github.com:org/repo.git'),
      cp('content/foo.olx'),
      vr('main'),
    );
    expect(a).toBe('git@github.com:org/repo.git://content/foo.olx#main');
    expect(source(a)).toBe('git@github.com:org/repo.git');
    expect(version(a)).toBe('main');
    expect(addressPath(a)).toBe('content/foo.olx');
  });

  it('source + path, no version', () => {
    const a = makeAddress(sl('memory:session-42'), cp('draft.olx'));
    expect(a).toBe('memory:session-42://draft.olx');
  });

  it('source only', () => {
    const a = makeAddress(sl('git@github.com:org/repo.git'));
    expect(a).toBe('git@github.com:org/repo.git');
    expect(addressPath(a)).toBe('');
  });
});

describe('withVersion', () => {
  it('adds version to unversioned reference', () => {
    const a = ref('git@github.com:org/repo.git://foo.olx');
    const b = withVersion(a, vr('abc123'));
    expect(b).toBe('git@github.com:org/repo.git://foo.olx#abc123');
  });

  it('replaces existing version', () => {
    const a = ref('git@github.com:org/repo.git://foo.olx#main');
    const b = withVersion(a, vr('abc123'));
    expect(b).toBe('git@github.com:org/repo.git://foo.olx#abc123');
  });

  it('no-op on source-only reference (no path, no ://)', () => {
    // Without ://, withVersion has no path segment to attach #version to.
    // This is a source-only ref — versioning requires a path segment.
    const a = ref('git@github.com:org/repo.git');
    const b = withVersion(a, vr('main'));
    expect(b).toBe('git@github.com:org/repo.git');
  });
});

describe('withoutVersion', () => {
  it('removes version', () => {
    const a = ref('git@github.com:org/repo.git://foo.olx#main');
    const b = withoutVersion(a);
    expect(b).toBe('git@github.com:org/repo.git://foo.olx');
    expect(version(b)).toBeUndefined();
  });

  it('no-op on unversioned reference', () => {
    const a = ref('memory:session-42://draft.olx');
    expect(withoutVersion(a)).toBe('memory:session-42://draft.olx');
  });
});

describe('withPath', () => {
  it('replaces path, preserves version', () => {
    const a = ref('git@github.com:org/repo.git://old.olx#main');
    const b = withPath(a, cp('new/path.olx'));
    expect(b).toBe('git@github.com:org/repo.git://new/path.olx#main');
  });

  it('adds path to pathless reference', () => {
    const a = ref('git@github.com:org/repo.git');
    const b = withPath(a, cp('content/foo.olx'));
    expect(b).toBe('git@github.com:org/repo.git://content/foo.olx');
  });
});

describe('hasVersion', () => {
  it('true for versioned reference', () => {
    expect(hasVersion(ref('git@github.com:org/repo.git://foo.olx#main'))).toBe(true);
  });

  it('false for unversioned reference', () => {
    expect(hasVersion(ref('git@github.com:org/repo.git://foo.olx'))).toBe(false);
  });
});

describe('scheme', () => {
  it('git SSH', () => {
    expect(scheme(ref('git@github.com:org/repo.git://foo.olx'))).toBe('git');
  });

  it('file', () => {
    expect(scheme(ref('file:/home/user/content://foo.olx'))).toBe('file');
  });

  it('pg', () => {
    expect(scheme(ref('pg://school.edu/cs101://hw1/p3.olx'))).toBe('pg');
  });

  it('memory', () => {
    expect(scheme(ref('memory:session-42://draft.olx'))).toBe('memory');
  });

  it('https git', () => {
    expect(scheme(ref('https://github.com/org/repo.git://foo.olx'))).toBe('https');
  });
});
