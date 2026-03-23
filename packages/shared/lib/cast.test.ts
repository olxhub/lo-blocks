// @vitest-environment node
// src/lib/cast.test.ts
//
// Literate tests for the cast-of-characters library.
//
// A "cast" is a YAML record mapping character IDs to definitions. Casts
// propagate through the component tree via runtime.cast (like locale),
// so the same character shows a consistent avatar everywhere.
//
// These tests show expected inputs and outputs for each function.

import {
  parseCastYaml,
  validateCast,
  mergeCasts,
  castMemberToAvatarProps,
  useCast,
  updateCast,
  CastSchema,
  CastMemberSchema,
  OpenPeepsSchema,
} from './cast';

import { parseOLX } from './content/parseOLX';

// =============================================================================
// parseCastYaml — parse YAML text into a validated Cast object
// =============================================================================

describe('parseCastYaml', () => {
  test('minimal cast: just IDs with empty definitions', () => {
    const yaml = `
bob: {}
alice: {}
`;
    expect(parseCastYaml(yaml)).toEqual({
      bob: {},
      alice: {},
    });
  });

  test('typical cast file with names, avatars, and profiles', () => {
    const yaml = `
ty:
  name: Ty Johnson
  seed: ty_intern
  openPeeps:
    face: smile
    head: short1
    skinColor: d08b5b
  profile:
    role: Intern
    bio: Data analysis enthusiast
  groups:
    - interns
    - comm360
lianne:
  name: Lianne Park
  src: images/lianne.png
  profile:
    role: Supervisor
  groups:
    - supervisors
    - comm360
`;
    const result = parseCastYaml(yaml);

    expect(result.ty).toEqual({
      name: 'Ty Johnson',
      seed: 'ty_intern',
      openPeeps: { face: 'smile', head: 'short1', skinColor: 'd08b5b' },
      profile: { role: 'Intern', bio: 'Data analysis enthusiast' },
      groups: ['interns', 'comm360'],
    });

    expect(result.lianne).toEqual({
      name: 'Lianne Park',
      src: 'images/lianne.png',
      profile: { role: 'Supervisor' },
      groups: ['supervisors', 'comm360'],
    });
  });

  test('empty or non-object YAML returns empty cast', () => {
    expect(parseCastYaml('')).toEqual({});
    expect(parseCastYaml('null')).toEqual({});
    expect(parseCastYaml('42')).toEqual({});
  });

  test('rejects unknown fields in cast members (strict schema)', () => {
    const yaml = `
bob:
  name: Bob
  favoriteColor: blue
`;
    expect(() => parseCastYaml(yaml)).toThrow();
  });

  test('rejects invalid openPeeps face values', () => {
    const yaml = `
bob:
  openPeeps:
    face: notARealFace
`;
    expect(() => parseCastYaml(yaml)).toThrow();
  });

  test('rejects invalid hex color (must be 6 hex digits, no #)', () => {
    const yaml = `
bob:
  openPeeps:
    skinColor: "#ff0000"
`;
    expect(() => parseCastYaml(yaml)).toThrow();
  });

  test('accepts array values for openPeeps enums (DiceBear picks randomly)', () => {
    const yaml = `
bob:
  openPeeps:
    face:
      - smile
      - smileBig
    head:
      - short1
      - short2
`;
    const result = parseCastYaml(yaml);
    expect(result.bob.openPeeps).toEqual({
      face: ['smile', 'smileBig'],
      head: ['short1', 'short2'],
    });
  });
});

// =============================================================================
// mergeCasts — recursive deep merge, left to right
// =============================================================================
//
// Used to layer: runtime.cast (global) ← block cast= attr ← local overrides
// Objects merge recursively; arrays and scalars overwrite.

describe('mergeCasts', () => {
  test('non-overlapping members are combined', () => {
    const global = { bob: { name: 'Bob' } };
    const local = { alice: { name: 'Alice' } };

    expect(mergeCasts(global, local)).toEqual({
      bob: { name: 'Bob' },
      alice: { name: 'Alice' },
    });
  });

  test('later cast overrides scalar fields of the same member', () => {
    const base = { bob: { name: 'Robert', seed: 'bob_v1' } };
    const override = { bob: { name: 'Bob' } };

    expect(mergeCasts(base, override)).toEqual({
      bob: { name: 'Bob', seed: 'bob_v1' },
    });
  });

  test('openPeeps deep-merges: partial override only changes specified fields', () => {
    const base = {
      bob: {
        openPeeps: { face: 'smile', head: 'short1', skinColor: 'edb98a' },
      },
    };
    // Scene override: Bob wears a turban in this scene
    const sceneOverride = {
      bob: {
        openPeeps: { head: 'turban' },
      },
    };

    expect(mergeCasts(base, sceneOverride)).toEqual({
      bob: {
        openPeeps: { face: 'smile', head: 'turban', skinColor: 'edb98a' },
      },
    });
  });

  test('arrays overwrite (not concatenate)', () => {
    const base = { bob: { groups: ['team-a', 'interns'] } };
    const override = { bob: { groups: ['team-b'] } };

    expect(mergeCasts(base, override)).toEqual({
      bob: { groups: ['team-b'] },
    });
  });

  test('skips undefined and null casts gracefully', () => {
    const cast = { bob: { name: 'Bob' } };

    expect(mergeCasts(undefined, cast, null)).toEqual({
      bob: { name: 'Bob' },
    });
  });

  test('three-way merge: runtime ← block attr ← local header', () => {
    const runtime = {
      bob: { name: 'Bob', seed: 'bob', openPeeps: { face: 'smile', head: 'short1' } },
      alice: { name: 'Alice' },
    };
    const blockAttr = {
      bob: { openPeeps: { head: 'turban' } },
    };
    const chatHeader = {
      bob: { openPeeps: { face: 'serious' } },
    };

    // runtime ← blockAttr ← chatHeader
    const result = mergeCasts(runtime, blockAttr, chatHeader);

    // Bob's face comes from chatHeader, head from blockAttr, seed from runtime
    expect(result.bob).toEqual({
      name: 'Bob',
      seed: 'bob',
      openPeeps: { face: 'serious', head: 'turban' },
    });
    // Alice untouched
    expect(result.alice).toEqual({ name: 'Alice' });
  });
});

// =============================================================================
// castMemberToAvatarProps — convert a CastMember to Avatar component props
// =============================================================================
//
// The Avatar component accepts: { name, seed, style?, src?, options? }
// This function applies defaults (name/seed default to the cast ID)
// and maps openPeeps → options.

describe('castMemberToAvatarProps', () => {
  test('minimal member: defaults name and seed to the cast ID', () => {
    expect(castMemberToAvatarProps('bob', {})).toEqual({
      name: 'bob',
      seed: 'bob',
      style: 'illustrated',
    });
  });

  test('member with explicit name, seed, and openPeeps', () => {
    expect(castMemberToAvatarProps('ty', {
      name: 'Ty Johnson',
      seed: 'ty_intern',
      openPeeps: { face: 'smile', head: 'short1' },
    })).toEqual({
      name: 'Ty Johnson',
      seed: 'ty_intern',
      style: 'illustrated',
      options: { face: 'smile', head: 'short1' },
    });
  });

  test('member with src: Avatar renders the image directly', () => {
    expect(castMemberToAvatarProps('lianne', {
      name: 'Lianne Park',
      src: 'images/lianne.png',
    })).toEqual({
      name: 'Lianne Park',
      seed: 'lianne',
      src: 'images/lianne.png',
    });
  });

  test('initials style', () => {
    expect(castMemberToAvatarProps('bob', {
      style: 'initials',
    })).toEqual({
      name: 'bob',
      seed: 'bob',
      style: 'initials',
    });
  });
});

// =============================================================================
// useCast — merge runtime.cast with a block's local cast= attribute
// =============================================================================
//
// Components call: const cast = useCast(props)
// This merges props.runtime.cast (from parent <Cast>) with props.cast
// (from the block's own cast= attribute, loaded at parse time).

describe('useCast', () => {
  test('returns runtime cast when no local cast', () => {
    const props = {
      runtime: { cast: { bob: { name: 'Bob' } } },
    };
    expect(useCast(props)).toEqual({ bob: { name: 'Bob' } });
  });

  test('merges runtime and local cast', () => {
    const props = {
      runtime: { cast: { bob: { name: 'Bob', seed: 'bob' } } },
      cast: { bob: { openPeeps: { face: 'serious' } } },
    };
    expect(useCast(props)).toEqual({
      bob: { name: 'Bob', seed: 'bob', openPeeps: { face: 'serious' } },
    });
  });

  test('returns empty cast when neither runtime nor local', () => {
    expect(useCast({})).toEqual({});
    expect(useCast({ runtime: {} })).toEqual({});
  });
});

// =============================================================================
// updateCast — propthread cast into runtime for children
// =============================================================================
//
// Used by wrapper blocks (like <Cast>) to pass updated cast to children:
//   const castProps = updateCast(props, mergedCast);
//   const { kids } = useKids(castProps);

describe('updateCast', () => {
  test('returns new props with cast in runtime', () => {
    const props = { runtime: { locale: 'en' }, id: 'block1' };
    const cast = { bob: { name: 'Bob' } };
    const result = updateCast(props, cast);

    expect(result.runtime.cast).toEqual({ bob: { name: 'Bob' } });
    // Preserves other runtime fields
    expect(result.runtime.locale).toBe('en');
    // Preserves other props
    expect(result.id).toBe('block1');
  });
});

// =============================================================================
// Schema validation — CastSchema, CastMemberSchema, OpenPeepsSchema
// =============================================================================

describe('CastSchema validation', () => {
  test('accepts well-formed cast', () => {
    const input = {
      bob: { name: 'Bob', openPeeps: { face: 'smile' } },
      alice: {},
    };
    expect(CastSchema.parse(input)).toEqual(input);
  });

  test('rejects non-record input', () => {
    expect(() => CastSchema.parse('not an object')).toThrow();
    expect(() => CastSchema.parse([1, 2, 3])).toThrow();
  });
});

describe('OpenPeepsSchema validation', () => {
  test('all valid face values are accepted', () => {
    for (const face of ['smile', 'serious', 'angryWithFang', 'veryAngry', 'cute', 'cyclops']) {
      expect(OpenPeepsSchema.parse({ face })).toEqual({ face });
    }
  });

  test('all valid head values are accepted', () => {
    for (const head of ['afro', 'turban', 'hijab', 'mohawk', 'noHair1', 'short5']) {
      expect(OpenPeepsSchema.parse({ head })).toEqual({ head });
    }
  });

  test('valid hex colors are accepted', () => {
    expect(OpenPeepsSchema.parse({ skinColor: 'edb98a' })).toEqual({ skinColor: 'edb98a' });
    expect(OpenPeepsSchema.parse({ clothingColor: 'ff00ff' })).toEqual({ clothingColor: 'ff00ff' });
  });

  test('invalid hex colors are rejected', () => {
    // No # prefix allowed
    expect(() => OpenPeepsSchema.parse({ skinColor: '#edb98a' })).toThrow();
    // Too short
    expect(() => OpenPeepsSchema.parse({ skinColor: 'fff' })).toThrow();
    // Not hex
    expect(() => OpenPeepsSchema.parse({ skinColor: 'zzzzzz' })).toThrow();
  });

  test('rejects unknown openPeeps fields', () => {
    expect(() => OpenPeepsSchema.parse({ hat: 'fedora' })).toThrow();
  });
});

// =============================================================================
// validateCast — case-sensitivity warnings ("did you mean...")
// =============================================================================
//
// Content authors frequently use wrong case (e.g. "Face" instead of "face").
// validateCast returns helpful warnings before Zod's strict() rejects the key.

describe('validateCast', () => {
  test('valid cast produces no warnings', () => {
    const { cast, warnings } = validateCast({
      bob: { name: 'Bob', openPeeps: { face: 'smile' } },
    });
    expect(warnings).toEqual([]);
    expect(cast.bob.name).toBe('Bob');
  });

  test('wrong case on member key gives "did you mean" warning', () => {
    // "Name" should be "name", "OpenPeeps" should be "openPeeps"
    expect(() => validateCast({
      bob: { Name: 'Bob' },
    })).toThrow(/should be "name"/);
  });

  test('wrong case on openPeeps key gives "did you mean" warning', () => {
    expect(() => validateCast({
      bob: { openPeeps: { Face: 'smile' } },
    })).toThrow(/should be "face"/);
  });

  test('parseCastYaml includes case hint in error', () => {
    const yaml = `
bob:
  Name: Bob
  Seed: bob123
`;
    expect(() => parseCastYaml(yaml)).toThrow(/should be "name"/);
  });
});

// =============================================================================
// Integration: Cast → propthread → TeamDirectory (end-to-end)
// =============================================================================
//
// Exercises the full pipeline: parseOLX (with mock provider) → Redux store →
// render → Cast propthreads cast to children → TeamDirectory reads runtime.cast.
//
// This is the test that catches the "No team members found" bug where the cast
// data fails to reach TeamDirectory at render time.

const CAST_YAML = `
bob:
  name: Bob Builder
  openPeeps:
    face: smile
    head: short1
  profile:
    role: Engineer
    bio: Builds things
  groups:
    - team-a
    - engineering

alice:
  name: Alice Wonderland
  openPeeps:
    face: cute
    head: long
  profile:
    role: Designer
    bio: Designs things
  groups:
    - team-a
    - design

carol:
  name: Carol Singer
  profile:
    role: Manager
  groups:
    - team-b
`;

function makeMockProvider(files: Record<string, string>) {
  return {
    read: async (path: string) => {
      const content = files[path] ?? files[path.replace(/^\//, '')];
      if (content === undefined) throw new Error(`Mock: file not found: ${path}`);
      return { content };
    },
    resolveRelativePath: (_base: string, relative: string) => relative,
    toProvenanceURI: (path: string) => `file:///${path}`,
    loadXmlFilesWithStats: async () => ({}),
    write: async () => {},
    update: async () => {},
    delete: async () => {},
    rename: async () => {},
    listFiles: async () => ({}),
    glob: async () => [],
    grep: async () => [],
  };
}

// =============================================================================
// Integration: withCastSupport parse-time file loading
// =============================================================================
//
// Verifies the parse-time pipeline: withCastSupport loads the .cast file,
// parses YAML, validates with CastSchema, and stores the parsed object
// (not the file path string) in the block's attributes.

describe('Integration: withCastSupport parse-time loading', () => {
  test('loads .cast file and stores parsed Cast object in idMap attributes', async () => {
    const olx = `
      <Cast id="test_cast" cast="test.cast">
        <TeamDirectory id="test_dir" group="team-a"/>
      </Cast>
    `;
    const provider = makeMockProvider({ 'test.cast': CAST_YAML });
    const { idMap } = await parseOLX(olx, ['file:///test.olx'], provider);

    // The Cast block should have the parsed cast object (not a string) in its attributes
    const castEntry = idMap['test_cast'];
    expect(castEntry).toBeDefined();
    const castEntryData = Object.values(castEntry)[0] as any;  // first language variant
    expect(castEntryData.attributes.cast).toBeDefined();
    expect(typeof castEntryData.attributes.cast).toBe('object');
    expect(castEntryData.attributes.cast.bob).toBeDefined();
    expect(castEntryData.attributes.cast.bob.name).toBe('Bob Builder');
    expect(castEntryData.attributes.cast.alice.groups).toEqual(['team-a', 'design']);

    // TeamDirectory should also be in the idMap
    const dirEntry = idMap['test_dir'];
    expect(dirEntry).toBeDefined();
  });
});
