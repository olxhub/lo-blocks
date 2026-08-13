// @vitest-environment node
//
// The three surface forms a configured source can take, and the writability
// each implies. The plain-string form must stay writable-by-default: existing
// content-sources.local.yaml files rely on it.
//
import { asDirSource, parseContentSourcesConfig } from './contentSources';
import type { ContentSource } from './contentSources';

describe('asDirSource', () => {
  it.each([
    ['plain string (shorthand)', '../edu.memphis.writing', { dir: '../edu.memphis.writing', writable: true }],
    ['long form, default', { dir: '/srv/content/psych' }, { dir: '/srv/content/psych', writable: true }],
    ['long form, read-only', { dir: '/srv/ref', writable: false }, { dir: '/srv/ref', writable: false }],
    ['long form, explicit writable', { dir: '/srv/ref', writable: true }, { dir: '/srv/ref', writable: true }],
  ])('%s', (_name, entry, expected) => {
    expect(asDirSource(entry as ContentSource)).toEqual(expected);
  });

  it('returns null for a repo source', () => {
    const entry = { repo: 'https://example.com/x.git' };
    expect(asDirSource(entry)).toBeNull();
  });
});

describe('parseContentSourcesConfig', () => {
  it('normalizes defaults and accepts all three source forms', () => {
    expect(parseContentSourcesConfig({
      sources: {
        shorthand: '/srv/content/shorthand',
        directory: { dir: '/srv/content/reference', writable: false },
        remote: { repo: 'https://example.com/course.git', branch: 'stable' },
      },
    })).toEqual({
      sources: {
        shorthand: '/srv/content/shorthand',
        directory: { dir: '/srv/content/reference', writable: false },
        remote: { repo: 'https://example.com/course.git', branch: 'stable' },
      },
      fallback: './content',
      fallbackWritable: false,
    });
  });

  it('treats an empty YAML sources section as no configured sources', () => {
    expect(parseContentSourcesConfig({ sources: null })).toEqual({
      sources: {},
      fallback: './content',
      fallbackWritable: false,
    });
  });

  it('names the source mount and all three supported forms in validation errors', () => {
    expect(() => parseContentSourcesConfig({
      sources: {
        course: { dir: '/srv/course', repo: 'https://example.com/course.git' },
      },
    }, 'test.yaml')).toThrow(
      'Invalid test.yaml: sources.course: source mount "course" must be a directory path string, ' +
      '{ dir: <path>, writable?: <boolean> }, or { repo: <url>, ... }',
    );
  });

  it.each([
    ['non-boolean writability', { sources: { course: { dir: '/srv/course', writable: 'yes' } } }],
    ['ambiguous source form', { sources: { course: { dir: '/srv/course', repo: 'https://example.com/x' } } }],
    ['non-object sources', { sources: [] }],
    ['unknown top-level setting', { sources: {}, typo: true }],
  ])('rejects %s', (_name, config) => {
    expect(() => parseContentSourcesConfig(config, 'test.yaml')).toThrow(/^Invalid test\.yaml:/);
  });
});
