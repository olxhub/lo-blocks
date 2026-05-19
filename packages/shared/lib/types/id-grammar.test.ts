// @vitest-environment node
//
// ID Grammar — Validation Examples
// =================================
//
// This file is the executable companion to id-grammar.ts. It documents,
// by example, what each ID type accepts and rejects. Read this file to
// understand the boundaries of each type at a glance.
//
// See namespace-conversions.test.ts for how these types relate to each
// other (the conversion grid). See id-grammar.ts for the formal regex
// grammar.

import { describe, it, expect } from 'vitest';
import {
  VALID, splitNs, joinNs, extractBlocks, extractBlockIds, extractLeafId,
  hasNamespace, defaultNamespace,
  PLACEHOLDER_NS, scopedStateKeyForBlock, stateKeyForGlobalRef,
  definitionKeyForRef, leafDefinitionKeyFromStateKey, allDefinitionKeysFromStateKey,
  asIdPrefix, asStateRef, asStateKey, asDefinitionRef,
} from './id-grammar';

// ═══════════════════════════════════════════════════════════════════════════════
// leafId — A single block or component identifier
// ═══════════════════════════════════════════════════════════════════════════════
//
// This is the atomic unit. Block IDs, component names, namespace segments.
// Must start with a letter or underscore. Unicode is welcome.
// Reserved delimiters (: # . / , -) are forbidden.

describe("leafId", () => {
  const re = VALID.leafId;

  const valid = [
    "answer",                     // typical block ID
    "hw1",                        // alphanumeric
    "_hash123",                   // auto-generated IDs start with _
    "FooBar",                     // PascalCase
    "_",                          // minimal valid
    "a",                          // single letter
    "żółw",                       // Polish for "turtle"
    "café",                       // accented Latin
    "日本語",                      // CJK
  ];

  const invalid = [
    "0abc",                       // leading digit
    "123",                        // all digits
    "foo-bar",                    // hyphen (reserved)
    "foo.bar",                    // dot (namespace separator)
    "foo:bar",                    // colon (scope separator)
    "foo/bar",                    // slash (path separator)
    "foo,bar",                    // comma (list separator)
    "#0",                         // scope marker, not a leafId
    "",                           // empty
  ];

  for (const v of valid)   it(`✓ ${v}`, () => expect(re.test(v)).toBe(true));
  for (const v of invalid) it(`✗ ${v}`, () => expect(re.test(v)).toBe(false));
});

// ═══════════════════════════════════════════════════════════════════════════════
// indexId — Like leafId, but also allows leading digits
// ═══════════════════════════════════════════════════════════════════════════════
//
// Used inside scope markers: #0, #42, #3fgb, #attempt_2.
// These are NOT block IDs — they're instance labels chosen by scoping blocks.

describe("indexId", () => {
  const re = VALID.indexId;

  const valid = [
    "answer",                     // also valid as leafId
    "0",                          // numeric index (DynamicList)
    "42",                         // multi-digit
    "3fgb",                       // leading digit ok here
    "attempt_2",                  // MasteryBank attempt label
  ];

  const invalid = [
    "",                           // empty
    "foo-bar",                    // hyphen still reserved
    "#0",                         // the # is not part of indexId
  ];

  for (const v of valid)   it(`✓ ${v}`, () => expect(re.test(v)).toBe(true));
  for (const v of invalid) it(`✗ ${v}`, () => expect(re.test(v)).toBe(false));
});

// ═══════════════════════════════════════════════════════════════════════════════
// scopeMarker — Instance label within a scope chain
// ═══════════════════════════════════════════════════════════════════════════════
//
// Always starts with #. The content after # is an indexId — chosen by each
// scoping block (DynamicList uses numeric, MasteryBank uses attempt labels,
// Annotation might use a range hash, etc.).

describe("scopeMarker", () => {
  const re = VALID.scopeMarker;

  const valid = [
    "#0",                         // DynamicList instance 0
    "#42",                        // DynamicList instance 42
    "#attempt_2",                 // MasteryBank attempt
    "#a3F",                       // arbitrary alphanumeric
  ];

  const invalid = [
    "0",                          // missing #
    "attempt_2",                  // missing #
    "#",                          // bare # (no label)
    "#foo-bar",                   // hyphen in label
    "answer",                     // not a scope marker at all
  ];

  for (const v of valid)   it(`✓ ${v}`, () => expect(re.test(v)).toBe(true));
  for (const v of invalid) it(`✗ ${v}`, () => expect(re.test(v)).toBe(false));
});

// ═══════════════════════════════════════════════════════════════════════════════
// namespace — Stable logical name for a content source
// ═══════════════════════════════════════════════════════════════════════════════
//
// Derived from the origin (last path component, strip .git). Can be
// dot-separated for institutional hierarchy. Must be stable across hosting
// changes — student state is keyed by this.

describe("namespace", () => {
  const re = VALID.namespace;

  const valid = [
    "ee101",                      // simple course name
    "lo_course",                  // underscores ok
    "physics",                    // plain English
    "edu.mit.courseSix",          // dot-separated hierarchy
    "edu.mit.eecs.eecs6002.weekThree.labHomework",
  ];

  const invalid = [
    ".foo",                       // leading dot
    "foo.",                       // trailing dot
    "foo..bar",                   // double dot
    "foo-bar",                    // hyphen
    "",                           // empty
  ];

  for (const v of valid)   it(`✓ ${v}`, () => expect(re.test(v)).toBe(true));
  for (const v of invalid) it(`✗ ${v}`, () => expect(re.test(v)).toBe(false));
});

// ═══════════════════════════════════════════════════════════════════════════════
// definitionRef — Content definition reference (what authors write)
// ═══════════════════════════════════════════════════════════════════════════════
//
// The most permissive content identifier. Anything an author might write to
// refer to a block definition. DefinitionKey is a canonical SUBSET of OlxRef.
//
// The grammar: optional source/namespace prefix (anything before "://"),
// then a leafId after the delimiter. If no "://", the whole thing is a
// bare leafId.
//
// All of these might refer to the same content definition — the system
// canonicalizes to DefinitionKey (ee101://hw1) at parse time.

describe("definitionRef", () => {
  const re = VALID.definitionRef;

  const valid = [
    "answer",                                              // bare (same-course)
    "hw1",                                                 // bare
    "żółw",                                                // unicode
    "ee101://hw1",                                         // namespace-qualified (also a valid DefinitionKey)
    "git@gitlab.com:olxhub/ee101.git://hw1",              // source-qualified
    "git@gitlab.com:olxhub/ee101.git@main://hw1",         // branch-pinned
    "git@gitlab.com:olxhub/ee101.git@a1238b://hw1",       // immutable (commit hash)
  ];

  const invalid = [
    "problems:#0:answer",         // that's state (StateRef), not content
    "",                           // empty
  ];

  for (const v of valid)   it(`✓ ${v}`, () => expect(re.test(v)).toBe(true));
  for (const v of invalid) it(`✗ ${v}`, () => expect(re.test(v)).toBe(false));
});

// ═══════════════════════════════════════════════════════════════════════════════
// stateRef — State instance reference (what authors write)
// ═══════════════════════════════════════════════════════════════════════════════
//
// Identifies a specific piece of student state. Includes instance scope
// (the colon-separated chain of blocks and scope markers). Must end with
// a leafId (the target block), not a scope marker.
//
// StateKey is a canonical SUBSET of StateRef — any valid Key is
// also a valid Ref. Authors write Refs; the system canonicalizes to Keys.

describe("stateRef", () => {
  const re = VALID.stateRef;

  const valid = [
    "problems:#0:answer",                                        // unqualified, scoped
    "designList:#7:mydesigns",                                   // unqualified, scoped
    "outer:#0:inner:#1:bank:#attempt_2:answer",                  // deeply nested
    "answer",                                                    // unscoped (top-level)
    "ee101://problems:#0:answer",                                // namespaced (also a valid Key)
    "git@gitlab.com:olxhub/ee101.git://problems:#0:answer",     // source-qualified
  ];

  const invalid = [
    "problems:#0",                // ends with scope marker, not a block
    "#0",                         // just a scope marker
    "#0:#1",                      // only scope markers, no block
    "",                           // empty
  ];

  for (const v of valid)   it(`✓ ${v}`, () => expect(re.test(v)).toBe(true));
  for (const v of invalid) it(`✗ ${v}`, () => expect(re.test(v)).toBe(false));
});

// ═══════════════════════════════════════════════════════════════════════════════
// definitionKey — Content definition key (always namespaced)
// ═══════════════════════════════════════════════════════════════════════════════
//
// The globally unique key for a content DEFINITION. Always has a namespace.
// No scope — DefinitionKeys identify what a block IS, not which instance.
// Used for idMap lookups (selectBlock, ensureBlock).

describe("definitionKey", () => {
  const re = VALID.definitionKey;

  const valid = [
    "ee101://hw1",                                 // simple
    "physics://answer",                            // simple
    "edu.mit.eecs6002://resistorProblem",           // hierarchical namespace
  ];

  const invalid = [
    "hw1",                                         // no namespace (that's an OlxRef)
    "answer",                                      // no namespace
    "ee101://problems:#0:answer",                  // has scope (that's a StateKey)
  ];

  for (const v of valid)   it(`✓ ${v}`, () => expect(re.test(v)).toBe(true));
  for (const v of invalid) it(`✗ ${v}`, () => expect(re.test(v)).toBe(false));
});

// ═══════════════════════════════════════════════════════════════════════════════
// stateKey — State instance key (always namespaced)
// ═══════════════════════════════════════════════════════════════════════════════
//
// The globally unique key for a piece of student state. Always has a namespace.
// This is what the state store is keyed by. Includes instance scope when the block
// appears inside a scoping container.

describe("stateKey", () => {
  const re = VALID.stateKey;

  const valid = [
    "ee101://designList:#7:mydesigns",             // scoped
    "physics://problems:#0:answer",                // scoped
    "physics://outer:#0:inner:#1:bank:#attempt_2:answer",  // deeply nested
    "ee101://hw1",                                 // unscoped (top-level state)
    "physics://answer",                            // unscoped
  ];

  const invalid = [
    "problems:#0:answer",                          // no namespace (that's a StateRef)
    "answer",                                      // no namespace
    "ee101://problems:#0",                         // ends with scope marker
  ];

  for (const v of valid)   it(`✓ ${v}`, () => expect(re.test(v)).toBe(true));
  for (const v of invalid) it(`✗ ${v}`, () => expect(re.test(v)).toBe(false));
});

// ═══════════════════════════════════════════════════════════════════════════════
// stateFieldRef — State key + field accessor
// ═══════════════════════════════════════════════════════════════════════════════
//
// Used in attribute schemas (CopyFieldAction, SetFieldAction, etc.) and DSL
// expressions (IntakeGate when=, conditional visibility). The field is
// separated by "." and is always a leafId.
//
// The "." here is NOT a namespace hierarchy separator. After "://", the
// first "." encountered is always a field separator.

describe("stateFieldRef", () => {
  const re = VALID.stateFieldRef;

  const valid = [
    "answer.value",                                        // bare key + field
    "problems:#0:answer.value",                            // scoped + field
    "problems:#0:answer.submitted",                        // different field
    "ee101://finalexam.score",                             // namespaced + field
    "ee101://problems:#0:answer.value",                    // namespaced, scoped + field
    "git@gitlab.com:olxhub/ee101.git://answer.value",     // source-qualified + field
  ];

  const invalid = [
    "answer",                         // no field
    "problems:#0:answer",             // no field
    "ee101://answer",                 // no field (that's a StateRef)
    "answer.",                        // trailing dot, no field name
    ".value",                         // no key, just field
    "answer.0bad",                    // field starts with digit (not a leafId)
  ];

  for (const v of valid)   it(`✓ ${v}`, () => expect(re.test(v)).toBe(true));
  for (const v of invalid) it(`✗ ${v}`, () => expect(re.test(v)).toBe(false));
});

// ═══════════════════════════════════════════════════════════════════════════════
// DECOMPOSITION — extracting structure from validated keys
// ═══════════════════════════════════════════════════════════════════════════════
//
// These operate on Keys (namespaced). Used for:
//   splitNs:         routing (which course does this belong to?)
//   extractBlocks:   content loading (which definitions do I need, with namespace?)
//   extractBlockIds: same, but just the bare IDs
//   extractLeafId:   target resolution (which block is being referenced?)

describe("decomposition", () => {
  const examples = [
    { key: "physics://problems:#0:answer",
      namespace: "physics", blocks: ["problems", "answer"], leaf: "answer" },
    { key: "ee101://designList:#7:mydesigns",
      namespace: "ee101", blocks: ["designList", "mydesigns"], leaf: "mydesigns" },
    { key: "physics://outer:#0:inner:#1:leaf",
      namespace: "physics", blocks: ["outer", "inner", "leaf"], leaf: "leaf" },
    { key: "edu.mit.eecs6002://resistorProblem",
      namespace: "edu.mit.eecs6002", blocks: ["resistorProblem"], leaf: "resistorProblem" },
  ];

  for (const ex of examples) {
    describe(ex.key, () => {
      it("splitNs", () => {
        expect(splitNs(ex.key)).toEqual({ ns: ex.namespace, path: ex.key.split('://')[1] });
      });
      it("extractBlocks (namespace + blockIds)", () => {
        expect(extractBlocks(ex.key)).toEqual({ namespace: ex.namespace, blockIds: ex.blocks });
      });
      it("extractBlockIds (bare IDs)", () => {
        expect(extractBlockIds(ex.key)).toEqual(ex.blocks);
      });
      it("extractLeafId", () => {
        expect(extractLeafId(ex.key)).toBe(ex.leaf);
      });
    });
  }

  it("extractBlocks enables DefinitionKey reconstruction for content loading", () => {
    // Given a StateKey, what DefinitionKeys do we need in the idMap?
    const { namespace, blockIds } = extractBlocks("physics://problems:#0:answer");
    const definitionKeys = blockIds.map(id => joinNs(namespace, id));
    expect(definitionKeys).toEqual(["physics://problems", "physics://answer"]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// hasNamespace — does a ref already have a namespace prefix?
// ═══════════════════════════════════════════════════════════════════════════════
//
// Both "ee101://hw1" and "git@gitlab.com:olxhub/ee101.git://hw1" contain
// "://". hasNamespace checks whether the part BEFORE "://" is a valid
// namespace. It does NOT validate the rest of the string — that's what
// VALID.definitionKey / VALID.stateKey are for.

describe("hasNamespace", () => {
  it("true when a valid namespace precedes ://", () => {
    expect(hasNamespace("ee101://hw1")).toBe(true);
    expect(hasNamespace("physics://problems:#0:answer")).toBe(true);
    expect(hasNamespace("edu.mit.eecs6002://resistorProblem")).toBe(true);
    expect(hasNamespace("lo_course://bank:#attempt_2:child")).toBe(true);
  });

  it("source-qualified Refs (non-namespace before ://)", () => {
    expect(hasNamespace("git@gitlab.com:olxhub/ee101.git://hw1")).toBe(false);
    expect(hasNamespace("git@gitlab.com:olxhub/ee101.git@main://hw1")).toBe(false);
    expect(hasNamespace("/home/user/courses/ee101://hw1")).toBe(false);
  });

  it("bare refs (no :// at all)", () => {
    expect(hasNamespace("hw1")).toBe(false);
    expect(hasNamespace("problems:#0:answer")).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// defaultNamespace — deriving namespace from origin
// ═══════════════════════════════════════════════════════════════════════════════
//
// Takes the last path component and strips .git. The derived name must already
// be a valid namespace; otherwise callers need an explicit manifest override.

describe("defaultNamespace", () => {
  it("derives from git origin", () => {
    expect(defaultNamespace("git@github.com:olxhub/ee101.git")).toBe("ee101");
  });

  it("same name regardless of hosting", () => {
    const gh = defaultNamespace("git@github.com:olxhub/ee101.git");
    const gl = defaultNamespace("git@gitlab.com:olxhub/ee101.git");
    expect(gh).toBe(gl);
  });

  it("derives from file path", () => {
    expect(defaultNamespace("/home/user/courses/analogForDummies")).toBe("analogForDummies");
  });

  it("throws for repo names that aren't valid namespaces", () => {
    // These all need an explicit namespace in manifest.yaml:
    expect(() => defaultNamespace("git@github.com:olxhub/lo-course.git"))
      .toThrow("manifest.yaml");                                          // hyphen
    expect(() => defaultNamespace("git@github.com:olxhub/6.002x.git"))
      .toThrow("manifest.yaml");                                          // leading digit + dot
    expect(() => defaultNamespace("git@github.com:olxhub/my course.git"))
      .toThrow("manifest.yaml");                                          // space
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// KEY RESOLUTION — runtime key construction
// ═══════════════════════════════════════════════════════════════════════════════
//
// These compose grammar, validation, scope construction, and namespace
// qualification into the functions call sites actually use. Two distinct
// operations: own-state (scoped) vs authored-target (global).

describe("PLACEHOLDER_NS", () => {
  it("is 'CONTENT'", () => {
    expect(String(PLACEHOLDER_NS)).toBe("CONTENT");
  });
});

describe("scopedStateKeyForBlock", () => {
  it("bare id, no scope", () => {
    expect(String(scopedStateKeyForBlock({ id: asDefinitionRef('answer') })))
      .toBe("CONTENT://answer");
  });

  it("bare id + idPrefix", () => {
    expect(String(scopedStateKeyForBlock({ id: asDefinitionRef('answer'), idPrefix: asIdPrefix('list:#0') })))
      .toBe("CONTENT://list:#0:answer");
  });

  it("already-namespaced id passes through", () => {
    expect(String(scopedStateKeyForBlock({ id: asDefinitionRef('calculus://answer') })))
      .toBe("calculus://answer");
  });

  it("nested scope", () => {
    expect(String(scopedStateKeyForBlock({
      id: asDefinitionRef('answer'),
      idPrefix: asIdPrefix('outer:#0:inner:#1')
    }))).toBe("CONTENT://outer:#0:inner:#1:answer");
  });
});

describe("stateKeyForGlobalRef", () => {
  it("bare ref", () => {
    expect(String(stateKeyForGlobalRef(asStateRef('answer'))))
      .toBe("CONTENT://answer");
  });

  it("scoped ref", () => {
    expect(String(stateKeyForGlobalRef(asStateRef('problems:#0:answer'))))
      .toBe("CONTENT://problems:#0:answer");
  });

  it("already-namespaced ref passes through", () => {
    expect(String(stateKeyForGlobalRef(asStateRef('calculus://answer'))))
      .toBe("calculus://answer");
  });

  it("custom namespace", () => {
    const ns = PLACEHOLDER_NS;  // uses default
    expect(String(stateKeyForGlobalRef(asStateRef('answer'), ns)))
      .toBe("CONTENT://answer");
  });
});

describe("definitionKeyForRef", () => {
  it("bare ref", () => {
    expect(String(definitionKeyForRef(asDefinitionRef('answer')))).toBe("CONTENT://answer");
  });

  it("already-namespaced passes through", () => {
    expect(String(definitionKeyForRef(asDefinitionRef('calculus://hw1')))).toBe("calculus://hw1");
  });
});

describe("leafDefinitionKeyFromStateKey", () => {
  it("scoped key → leaf", () => {
    expect(String(leafDefinitionKeyFromStateKey(asStateKey("CONTENT://list:#0:answer"))))
      .toBe("CONTENT://answer");
  });

  it("unscoped key → same", () => {
    expect(String(leafDefinitionKeyFromStateKey(asStateKey("CONTENT://answer"))))
      .toBe("CONTENT://answer");
  });

  it("deeply nested", () => {
    expect(String(leafDefinitionKeyFromStateKey(asStateKey("physics://outer:#0:inner:#1:leaf"))))
      .toBe("physics://leaf");
  });
});

describe("allDefinitionKeysFromStateKey", () => {
  it("scoped key → all blocks", () => {
    expect(allDefinitionKeysFromStateKey(asStateKey("CONTENT://problems:#0:answer")).map(String))
      .toEqual(["CONTENT://problems", "CONTENT://answer"]);
  });

  it("unscoped key → single block", () => {
    expect(allDefinitionKeysFromStateKey(asStateKey("CONTENT://answer")).map(String))
      .toEqual(["CONTENT://answer"]);
  });

  it("deeply nested", () => {
    expect(allDefinitionKeysFromStateKey(asStateKey("physics://a:#0:b:#1:c")).map(String))
      .toEqual(["physics://a", "physics://b", "physics://c"]);
  });
});
