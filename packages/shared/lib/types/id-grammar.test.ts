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
  isNamespaceQualified, isSourceQualifiedRef, defaultNamespace,
  scopedStateKeyForBlock, stateKeyForGlobalRef,
  qualifyDefinitionRef, leafDefinitionKeyFromStateKey, leafDefinitionIdFor, allDefinitionKeysFromStateKey,
  tryParseStateKey,
  asIdPrefix, asStateRef, asDefinitionRef, asLeafId, asContentNamespace,
  parseLeafId, parseStateKey, parseDefinitionKey, joinDefinitionRef,
  parseAnyDefinitionRef, parseAnyStateRef,
  validateAnyDefinitionRef, validateAnyStateRef,
} from './id-grammar';

// Namespace used by these tests. Production namespaces come from storage
// providers; "CONTENT" is just this suite's convention.
const TEST_NS = asContentNamespace('CONTENT');

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
// The brandable content identifier — bare or namespace-qualified.
// Source-qualified refs (with "://") are a separate pre-validation form
// that cannot be branded as DefinitionRef (they need LOFS resolution first).
//
// The grammar: optional namespace prefix (namespace "/" leafId),
// or a bare leafId. The system qualifies to DefinitionKey at resolve time.

describe("definitionRef", () => {
  const re = VALID.definitionRef;

  const valid = [
    "answer",                                              // bare (same-course)
    "hw1",                                                 // bare
    "żółw",                                                // unicode
    "ee101/hw1",                                           // namespace-qualified (also a valid DefinitionKey)
    "CONTENT/_spinner_quiz",                               // _-prefix OK when namespace-qualified (system sentinel)
  ];

  const invalid = [
    "problems:#0:answer",         // that's state (StateRef), not content
    "_hash123",                   // leading _ reserved for system use (bare refs only)
    "",                           // empty
    "git@gitlab.com:olxhub/ee101.git://hw1",              // source-qualified — not a DefinitionRef (needs LOFS resolution)
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
    "ee101/problems:#0:answer",                                  // namespaced (also a valid Key)
    "CONTENT/_spinner_quiz",                                     // _-prefix OK when namespace-qualified
  ];

  const invalid = [
    "problems:#0",                // ends with scope marker, not a block
    "#0",                         // just a scope marker
    "#0:#1",                      // only scope markers, no block
    "_answer",                    // leading _ reserved for system use (bare refs only)
    "",                           // empty
    "git@gitlab.com:olxhub/ee101.git://problems:#0:answer",     // source-qualified — not a StateRef (needs LOFS resolution)
  ];

  for (const v of valid)   it(`✓ ${v}`, () => expect(re.test(v)).toBe(true));
  for (const v of invalid) it(`✗ ${v}`, () => expect(re.test(v)).toBe(false));
});

// ═══════════════════════════════════════════════════════════════════════════════
// anyDefinitionRef — Permissive DefinitionRef (accepts system _-prefixed bare refs)
// ═══════════════════════════════════════════════════════════════════════════════
//
// Same as definitionRef but uses leafId for bare refs instead of publicLeafId.
// Used at runtime boundaries where system-generated _-prefixed targets are valid.

describe("anyDefinitionRef", () => {
  const re = VALID.anyDefinitionRef;

  const valid = [
    "answer",                                              // bare (same-course)
    "hw1",                                                 // bare
    "żółw",                                                // unicode
    "ee101/hw1",                                           // namespace-qualified
    "CONTENT/_spinner_quiz",                               // _-prefix OK when namespace-qualified
    "_hash123",                                            // _-prefix bare ref (system-generated) — accepted
    "_abc_grader_0",                                       // joinDefinitionRef output
  ];

  const invalid = [
    "problems:#0:answer",         // that's state (StateRef), not content
    "",                           // empty
    "git@gitlab.com:olxhub/ee101.git://hw1",              // source-qualified
    "0abc",                       // leading digit
    "foo-bar",                    // hyphen
  ];

  for (const v of valid)   it(`✓ ${v}`, () => expect(re.test(v)).toBe(true));
  for (const v of invalid) it(`✗ ${v}`, () => expect(re.test(v)).toBe(false));
});

describe("parseAnyDefinitionRef", () => {
  it("accepts user-authored bare refs", () => {
    expect(String(parseAnyDefinitionRef("answer"))).toBe("answer");
  });

  it("accepts system-generated _-prefixed bare refs", () => {
    expect(String(parseAnyDefinitionRef("_hash123"))).toBe("_hash123");
    expect(String(parseAnyDefinitionRef("_abc_grader_0"))).toBe("_abc_grader_0");
  });

  it("accepts namespace-qualified refs", () => {
    expect(String(parseAnyDefinitionRef("ee101/hw1"))).toBe("ee101/hw1");
    expect(String(parseAnyDefinitionRef("CONTENT/_spinner"))).toBe("CONTENT/_spinner");
  });

  it("rejects invalid refs", () => {
    expect(() => parseAnyDefinitionRef("")).toThrow();
    expect(() => parseAnyDefinitionRef("0abc")).toThrow();
    expect(() => parseAnyDefinitionRef("foo-bar")).toThrow();
  });

  it("includes context in error message", () => {
    expect(() => parseAnyDefinitionRef("0abc", "target attribute")).toThrow("target attribute");
  });

  it("still validates structural correctness", () => {
    expect(validateAnyDefinitionRef("_valid_ref")).toBe(true);
    expect(validateAnyDefinitionRef("foo-bar")).not.toBe(true);
    expect(validateAnyDefinitionRef("")).not.toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// anyStateRef — Permissive StateRef (accepts system _-prefixed bare refs)
// ═══════════════════════════════════════════════════════════════════════════════

describe("anyStateRef", () => {
  const re = VALID.anyStateRef;

  const valid = [
    "problems:#0:answer",                                        // unqualified, scoped
    "answer",                                                    // unscoped (top-level)
    "ee101/problems:#0:answer",                                  // namespaced
    "CONTENT/_spinner_quiz",                                     // _-prefix OK when namespace-qualified
    "_answer",                                                   // _-prefix bare ref (system-generated) — accepted
    "_abc_input_0",                                              // joinDefinitionRef output
  ];

  const invalid = [
    "problems:#0",                // ends with scope marker, not a block
    "#0",                         // just a scope marker
    "#0:#1",                      // only scope markers, no block
    "",                           // empty
    "0abc",                       // leading digit
  ];

  for (const v of valid)   it(`✓ ${v}`, () => expect(re.test(v)).toBe(true));
  for (const v of invalid) it(`✗ ${v}`, () => expect(re.test(v)).toBe(false));
});

describe("parseAnyStateRef", () => {
  it("accepts user-authored bare refs", () => {
    expect(String(parseAnyStateRef("answer"))).toBe("answer");
  });

  it("accepts system-generated _-prefixed bare refs", () => {
    expect(String(parseAnyStateRef("_hash123"))).toBe("_hash123");
    expect(String(parseAnyStateRef("_abc_input_0"))).toBe("_abc_input_0");
  });

  it("accepts scoped refs", () => {
    expect(String(parseAnyStateRef("problems:#0:answer"))).toBe("problems:#0:answer");
  });

  it("accepts namespace-qualified refs", () => {
    expect(String(parseAnyStateRef("ee101/problems:#0:answer"))).toBe("ee101/problems:#0:answer");
  });

  it("rejects invalid refs", () => {
    expect(() => parseAnyStateRef("")).toThrow();
    expect(() => parseAnyStateRef("#0")).toThrow();
    expect(() => parseAnyStateRef("0abc")).toThrow();
  });

  it("still validates structural correctness", () => {
    expect(validateAnyStateRef("_valid_ref")).toBe(true);
    expect(validateAnyStateRef("#0")).not.toBe(true);
    expect(validateAnyStateRef("")).not.toBe(true);
  });
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
    "ee101/hw1",                                   // simple
    "physics/answer",                              // simple
    "edu.mit.eecs6002/resistorProblem",            // hierarchical namespace
    "CONTENT/_spinner_quiz",                       // _-prefix OK in Keys (system sentinels)
  ];

  const invalid = [
    "hw1",                                         // no namespace (that's a DefinitionRef)
    "answer",                                      // no namespace
    "ee101/problems:#0:answer",                    // has scope (that's a StateKey)
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
    "ee101/designList:#7:mydesigns",               // scoped
    "physics/problems:#0:answer",                  // scoped
    "physics/outer:#0:inner:#1:bank:#attempt_2:answer",  // deeply nested
    "ee101/hw1",                                   // unscoped (top-level state)
    "physics/answer",                              // unscoped
  ];

  const invalid = [
    "problems:#0:answer",                          // no namespace (that's a StateRef)
    "answer",                                      // no namespace
    "ee101/problems:#0",                           // ends with scope marker
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
// The "." here is NOT a namespace hierarchy separator. After "/", the
// first "." encountered is always a field separator.

describe("stateFieldRef", () => {
  const re = VALID.stateFieldRef;

  const valid = [
    "answer.value",                                        // bare key + field
    "problems:#0:answer.value",                            // scoped + field
    "problems:#0:answer.submitted",                        // different field
    "ee101/finalexam.score",                               // namespaced + field
    "ee101/problems:#0:answer.value",                      // namespaced, scoped + field
  ];

  const invalid = [
    "answer",                         // no field
    "problems:#0:answer",             // no field
    "ee101/answer",                   // no field (that's a StateRef)
    "answer.",                        // trailing dot, no field name
    ".value",                         // no key, just field
    "answer.0bad",                    // field starts with digit (not a leafId)
    "git@gitlab.com:olxhub/ee101.git://answer.value",     // source-qualified — needs LOFS resolution first
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
    { key: "physics/problems:#0:answer",
      namespace: "physics", blocks: ["problems", "answer"], leaf: "answer" },
    { key: "ee101/designList:#7:mydesigns",
      namespace: "ee101", blocks: ["designList", "mydesigns"], leaf: "mydesigns" },
    { key: "physics/outer:#0:inner:#1:leaf",
      namespace: "physics", blocks: ["outer", "inner", "leaf"], leaf: "leaf" },
    { key: "edu.mit.eecs6002/resistorProblem",
      namespace: "edu.mit.eecs6002", blocks: ["resistorProblem"], leaf: "resistorProblem" },
  ];

  for (const ex of examples) {
    describe(ex.key, () => {
      const key = parseStateKey(ex.key);
      it("splitNs", () => {
        const firstSlash = ex.key.indexOf('/');
        expect(splitNs(key)).toEqual({ ns: ex.namespace, path: ex.key.slice(firstSlash + 1) });
      });
      it("extractBlocks (namespace + blockIds)", () => {
        expect(extractBlocks(key)).toEqual({ namespace: ex.namespace, blockIds: ex.blocks });
      });
      it("extractBlockIds (bare IDs)", () => {
        expect(extractBlockIds(key)).toEqual(ex.blocks);
      });
      it("extractLeafId", () => {
        expect(extractLeafId(key)).toBe(ex.leaf);
      });
    });
  }

  it("extractBlocks enables DefinitionKey reconstruction for content loading", () => {
    // Given a StateKey, what DefinitionKeys do we need in the idMap?
    const { namespace, blockIds } = extractBlocks(parseStateKey("physics/problems:#0:answer"));
    const definitionKeys = blockIds.map(id => joinNs(namespace, id));
    expect(definitionKeys).toEqual(["physics/problems", "physics/answer"]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// isNamespaceQualified — does a ref have a namespace/path prefix?
// ═══════════════════════════════════════════════════════════════════════════════
//
// Checks for "/" with a valid namespace before it. Returns false for
// source-qualified refs ("://") and bare refs.

describe("isNamespaceQualified", () => {
  it("true when a valid namespace precedes /", () => {
    expect(isNamespaceQualified("ee101/hw1")).toBe(true);
    expect(isNamespaceQualified("physics/problems:#0:answer")).toBe(true);
    expect(isNamespaceQualified("edu.mit.eecs6002/resistorProblem")).toBe(true);
    expect(isNamespaceQualified("lo_course/bank:#attempt_2:child")).toBe(true);
  });

  it("source-qualified refs (contain ://) are NOT namespace-qualified", () => {
    expect(isNamespaceQualified("git@gitlab.com:olxhub/ee101.git://hw1")).toBe(false);
    expect(isNamespaceQualified("git@gitlab.com:olxhub/ee101.git@main://hw1")).toBe(false);
  });

  it("bare refs (no / at all)", () => {
    expect(isNamespaceQualified("hw1")).toBe(false);
    expect(isNamespaceQualified("problems:#0:answer")).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// isSourceQualifiedRef — does a ref contain "://" (source-qualified)?
// ═══════════════════════════════════════════════════════════════════════════════

describe("isSourceQualifiedRef", () => {
  it("true for source-qualified refs", () => {
    expect(isSourceQualifiedRef("git@gitlab.com:olxhub/ee101.git://hw1")).toBe(true);
    expect(isSourceQualifiedRef("git@gitlab.com:olxhub/ee101.git@main://hw1")).toBe(true);
    expect(isSourceQualifiedRef("/home/user/courses/ee101://hw1")).toBe(true);
  });

  it("false for namespace-qualified keys", () => {
    expect(isSourceQualifiedRef("ee101/hw1")).toBe(false);
    expect(isSourceQualifiedRef("physics/answer")).toBe(false);
  });

  it("false for bare refs", () => {
    expect(isSourceQualifiedRef("hw1")).toBe(false);
    expect(isSourceQualifiedRef("problems:#0:answer")).toBe(false);
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

describe("scopedStateKeyForBlock", () => {
  it("bare id, no scope", () => {
    expect(String(scopedStateKeyForBlock({ id: asDefinitionRef('answer'), ns: TEST_NS })))
      .toBe("CONTENT/answer");
  });

  it("bare id + idPrefix", () => {
    expect(String(scopedStateKeyForBlock({ id: asDefinitionRef('answer'), ns: TEST_NS, idPrefix: asIdPrefix('list:#0') })))
      .toBe("CONTENT/list:#0:answer");
  });

  it("takes namespace from runtime context", () => {
    expect(String(scopedStateKeyForBlock({ id: asDefinitionRef('answer'), runtime: { ns: TEST_NS } })))
      .toBe("CONTENT/answer");
  });

  it("already-namespaced id passes through", () => {
    expect(String(scopedStateKeyForBlock({ id: asDefinitionRef('calculus/answer'), ns: TEST_NS })))
      .toBe("calculus/answer");
  });

  it("nested scope", () => {
    expect(String(scopedStateKeyForBlock({
      id: asDefinitionRef('answer'),
      ns: TEST_NS,
      idPrefix: asIdPrefix('outer:#0:inner:#1')
    }))).toBe("CONTENT/outer:#0:inner:#1:answer");
  });

  it("throws when no namespace is supplied — there is no fallback", () => {
    expect(() => scopedStateKeyForBlock({ id: asDefinitionRef('answer') }))
      .toThrow(/no content namespace/);
  });
});

describe("stateKeyForGlobalRef", () => {
  it("bare ref", () => {
    expect(String(stateKeyForGlobalRef(asStateRef('answer'), TEST_NS)))
      .toBe("CONTENT/answer");
  });

  it("scoped ref", () => {
    expect(String(stateKeyForGlobalRef(asStateRef('problems:#0:answer'), TEST_NS)))
      .toBe("CONTENT/problems:#0:answer");
  });

  it("already-namespaced ref passes through", () => {
    expect(String(stateKeyForGlobalRef(asStateRef('calculus/answer'), TEST_NS)))
      .toBe("calculus/answer");
  });

  it("custom namespace", () => {
    const ns = TEST_NS;
    expect(String(stateKeyForGlobalRef(asStateRef('answer'), ns)))
      .toBe("CONTENT/answer");
  });
});

describe("qualifyDefinitionRef", () => {
  it("bare ref", () => {
    expect(String(qualifyDefinitionRef(asDefinitionRef('answer'), TEST_NS))).toBe("CONTENT/answer");
  });

  it("already-namespaced passes through", () => {
    expect(String(qualifyDefinitionRef(asDefinitionRef('calculus/hw1'), TEST_NS))).toBe("calculus/hw1");
  });
});

describe("leafDefinitionKeyFromStateKey", () => {
  it("scoped key → leaf", () => {
    expect(String(leafDefinitionKeyFromStateKey(parseStateKey("CONTENT/list:#0:answer"))))
      .toBe("CONTENT/answer");
  });

  it("unscoped key → same", () => {
    expect(String(leafDefinitionKeyFromStateKey(parseStateKey("CONTENT/answer"))))
      .toBe("CONTENT/answer");
  });

  it("deeply nested", () => {
    expect(String(leafDefinitionKeyFromStateKey(parseStateKey("physics/outer:#0:inner:#1:leaf"))))
      .toBe("physics/leaf");
  });
});

describe("leafDefinitionIdFor", () => {
  it("scoped key → leaf definition id", () => {
    expect(leafDefinitionIdFor("demos/list:#2:notes")).toBe("demos/notes");
  });

  it("non-key id → itself", () => {
    expect(leafDefinitionIdFor("Tabs")).toBe("Tabs");
    expect(leafDefinitionIdFor("demos/notes#row3")).toBe("demos/notes#row3");
  });
});

describe("allDefinitionKeysFromStateKey", () => {
  it("scoped key → all blocks", () => {
    expect(allDefinitionKeysFromStateKey(parseStateKey("CONTENT/problems:#0:answer")).map(String))
      .toEqual(["CONTENT/problems", "CONTENT/answer"]);
  });

  it("unscoped key → single block", () => {
    expect(allDefinitionKeysFromStateKey(parseStateKey("CONTENT/answer")).map(String))
      .toEqual(["CONTENT/answer"]);
  });

  it("deeply nested", () => {
    expect(allDefinitionKeysFromStateKey(parseStateKey("physics/a:#0:b:#1:c")).map(String))
      .toEqual(["physics/a", "physics/b", "physics/c"]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// tryParseStateKey — the non-throwing boundary parse
// ═══════════════════════════════════════════════════════════════════════════════
//
// The sync engine handles id-shaped strings that are USUALLY StateKeys
// but may be componentSetting tags, storage URIs, or system sentinels.
// It parses at the boundary and keeps the null case — the grammar module
// never returns an unbranded id-shaped string.

describe("tryParseStateKey", () => {
  it("valid keys parse to the branded key", () => {
    expect(String(tryParseStateKey("CONTENT/list:#2:grader"))).toBe("CONTENT/list:#2:grader");
    expect(String(tryParseStateKey("CONTENT/grader"))).toBe("CONTENT/grader");
  });

  it("non-keys return null, never throw", () => {
    expect(tryParseStateKey("Tabs")).toBeNull();                  // setting tag
    expect(tryParseStateKey("studio://course/f.olx")).toBeNull(); // storage URI
    expect(tryParseStateKey("demos/notes#row3")).toBeNull();      // dead '#' dialect
    expect(tryParseStateKey("")).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// joinDefinitionRef — Typed child ID construction
// ═══════════════════════════════════════════════════════════════════════════════
//
// Component parsers derive child IDs from a parent DefinitionRef. The join
// function uses "_" as separator and returns a branded DefinitionRef.

describe("joinDefinitionRef", () => {
  const GRADER = parseLeafId('grader');
  const INPUT = parseLeafId('input');
  const PROBLEM = parseLeafId('problem');

  it("joins parent + suffix + index", () => {
    expect(String(joinDefinitionRef(asDefinitionRef('quiz'), GRADER, 0))).toBe('quiz_grader_0');
  });

  it("strips namespace from parent", () => {
    expect(String(joinDefinitionRef(asDefinitionRef('CONTENT/quiz'), GRADER, 0))).toBe('quiz_grader_0');
  });

  it("works with system-prefixed parents", () => {
    expect(String(joinDefinitionRef(asDefinitionRef('_abc123'), INPUT, 1))).toBe('_abc123_input_1');
  });

  it("suffix only, no index", () => {
    expect(String(joinDefinitionRef(asDefinitionRef('quiz'), PROBLEM))).toBe('quiz_problem');
  });

  it("multiple indices", () => {
    expect(String(joinDefinitionRef(asDefinitionRef('quiz'), parseLeafId('choice'), 2, 3))).toBe('quiz_choice_2_3');
  });

  it("nested derivation (child of child)", () => {
    const choiceId = joinDefinitionRef(asDefinitionRef('quiz'), parseLeafId('choice'), 0);
    expect(String(joinDefinitionRef(choiceId, parseLeafId('md')))).toBe('quiz_choice_0_md');
  });
});
