// @vitest-environment node
//
// Namespace Conversions — How Identity Flows Through the System
// =============================================================
//
// This file teaches (via executable examples) how the four ID types
// relate, how conversions work, and why. Read it top-to-bottom.
//
// See id-grammar.ts for the formal regex grammar.
// See id-grammar.test.ts for exhaustive validation examples.
//
// THE FOUR TYPES
// ──────────────
//
//   ┌──────────────┬───────────────────────┬────────────────────────────────┐
//   │              │ Ref (may lack ns)     │ Key (always ns/...)            │
//   ├──────────────┼───────────────────────┼────────────────────────────────┤
//   │ Definition   │ DefinitionRef         │ DefinitionKey                  │
//   │              │ "answer"              │ "physics/answer"               │
//   ├──────────────┼───────────────────────┼────────────────────────────────┤
//   │ State        │ StateRef              │ StateKey                       │
//   │ (instance)   │ "problems:#0:answer"  │ "physics/problems:#0:answer"   │
//   └──────────────┴───────────────────────┴────────────────────────────────┘
//
//   Horizontal (Ref → Key):          prepend namespace
//   Vertical   (Definition → State): insert instance scope
//   Diagonal shortcuts exist but always decompose into these two steps.
//
// WHY TWO AXES?
// ─────────────
// Axis 1 — Instance scope: A DynamicList with id="problems" containing
// <TextArea id="answer"/> creates N instances. We distinguish them:
//   problems:#0:answer   (instance 0)
//   problems:#1:answer   (instance 1)
// But there's still only ONE definition: DefinitionRef "answer".
//
// Axis 2 — Namespace: Two courses both defining "pset1" must not collide
// in the state store. We prepend a stable course name:
//   physics/pset1   vs   calculus/pset1
//
// These compose orthogonally:
//   physics/problems:#0:answer
//   ^^^^^^^  ^^^^^^^ ^^ ^^^^^
//   namespace  scope     block
//
// NAMESPACE
// ─────────
// The namespace is a short, stable, logical name — not a URL.
//
//   git@github.com:olxhub/ee101.git  →  namespace: "ee101"
//   git@gitlab.com:olxhub/ee101.git  →  namespace: "ee101"  (same!)
//
// Student state is keyed by namespace — moving a repo must not lose progress.
// Can be hierarchical: edu.mit.eecs.eecs6002
//
// Namespace qualification usually happens at parse time. But authors CAN
// write namespaces explicitly for cross-course references:
//
//   <Sequential id="review" when="ee101/finalexam.score < 85">
//     <UseDynamic target="ee101/notes"/>
//   </Sequential>

import { describe, it, expect } from 'vitest';
import { isNamespaceQualified, isSourceQualifiedRef, defaultNamespace, extractBlocks } from './id-grammar';

// ═══════════════════════════════════════════════════════════════════════════════
// Ref → Key: namespace qualification
// ═══════════════════════════════════════════════════════════════════════════════
//
// The simplest conversion. An author writes a ref; the system knows which
// course it's parsing and prepends the namespace. If the ref already has a
// namespace, it's a cross-course reference and passes through unchanged.

describe("Ref → Key: namespace qualification", () => {
  // This is the target API. Same logic for both Definition and State refs.
  const qualify = (ref: string, ns: string) => {
    if (isSourceQualifiedRef(ref)) throw new Error(`Source-qualified ref needs LOFS resolution: "${ref}"`);
    if (isNamespaceQualified(ref)) return ref;       // already "ee101/..."
    return `${ns}/${ref}`;
  };

  it("bare refs get namespace prepended", () => {
    expect(qualify("answer", "physics")).toBe("physics/answer");
    expect(qualify("problems:#0:answer", "physics")).toBe("physics/problems:#0:answer");
  });

  it("cross-course refs pass through", () => {
    // Author in ee202 references ee101 content — already qualified:
    expect(qualify("ee101/notes", "ee202")).toBe("ee101/notes");
    expect(qualify("ee101/problems:#0:answer", "ee202")).toBe("ee101/problems:#0:answer");
  });

  it("source-qualified refs are not silently passed through", () => {
    // "git@gitlab.com:olxhub/ee101.git://hw1" has "://" but is NOT a
    // canonical key — the prefix isn't a namespace. Needs LOFS resolution.
    expect(() => qualify("git@gitlab.com:olxhub/ee101.git://hw1", "ee202"))
      .toThrow("LOFS resolution");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Definition → State: instance scope insertion
// ═══════════════════════════════════════════════════════════════════════════════
//
// When a block renders inside a scoping container (DynamicList, etc.), the
// container provides an idPrefix via React context. The block's DefinitionKey gets
// scoped to produce a StateKey. With namespaces, scope goes AFTER "ns/".
//
// This is RUNTIME OWN-STATE SCOPING (pathway 1 in id-grammar.ts). Don't
// confuse with authored cross-references (pathway 2 = qualifyStateRef),
// which are already scoped and only need namespace prepended.

describe("Definition → State: instance scope insertion", () => {
  const addScope = (key: string, idPrefix: string) => {
    if (!idPrefix) return key;
    const sep = key.indexOf('/');
    if (sep >= 0) {
      return key.slice(0, sep + 1) + idPrefix + ':' + key.slice(sep + 1);
    }
    return idPrefix + ':' + key;
  };

  it("inserts scope between namespace and block", () => {
    expect(addScope("physics/answer", "problems:#0"))
      .toBe("physics/problems:#0:answer");       // scope goes after "physics/"

    expect(addScope("answer", "problems:#0"))
      .toBe("problems:#0:answer");                  // no namespace: scope prepended directly
  });

  it("top-level blocks (no scope) pass through unchanged", () => {
    expect(addScope("physics/answer", "")).toBe("physics/answer");
    expect(addScope("answer", "")).toBe("answer");
  });

  it("deeply nested scope composes", () => {
    expect(addScope("physics/leaf", "outer:#0:inner:#1"))
      .toBe("physics/outer:#0:inner:#1:leaf");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// State → Definition: extracting block definitions from state keys
// ═══════════════════════════════════════════════════════════════════════════════
//
// Given a StateKey, which DefinitionKeys need to be loaded? Strip scope
// markers (segments starting with "#") — everything else is a block ID.
// extractBlocks() preserves the namespace so you can reconstruct DefinitionKeys.

describe("State → Definition: extract block definitions", () => {
  it("returns namespace + block IDs for content loading", () => {
    const result = extractBlocks("physics/problems:#0:answer");
    expect(result).toEqual({ namespace: "physics", blockIds: ["problems", "answer"] });

    // To get DefinitionKeys for the idMap:
    const definitionKeys = result.blockIds.map(id => `${result.namespace}/${id}`);
    expect(definitionKeys).toEqual(["physics/problems", "physics/answer"]);
  });

  it("unscoped keys have a single block", () => {
    expect(extractBlocks("physics/answer"))
      .toEqual({ namespace: "physics", blockIds: ["answer"] });
  });

  it("deeply nested: all blocks, no scope markers", () => {
    expect(extractBlocks("physics/outer:#0:inner:#1:bank:#attempt_2:leaf"))
      .toEqual({ namespace: "physics", blockIds: ["outer", "inner", "bank", "leaf"] });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Namespace derivation
// ═══════════════════════════════════════════════════════════════════════════════
//
// The namespace is derived from the content source: last path component,
// strip .git. If the result isn't a valid namespace (hyphens, leading
// digits, dots), the content source must provide an explicit override
// via manifest.yaml.

describe("Namespace derivation", () => {
  it("clean repo names derive directly", () => {
    expect(defaultNamespace("git@github.com:olxhub/ee101.git")).toBe("ee101");
    expect(defaultNamespace("/home/user/courses/analogForDummies")).toBe("analogForDummies");
  });

  it("same name regardless of hosting", () => {
    expect(defaultNamespace("git@github.com:olxhub/ee101.git"))
      .toBe(defaultNamespace("git@gitlab.com:olxhub/ee101.git"));
  });

  it("throws for names that aren't valid namespaces", () => {
    expect(() => defaultNamespace("git@github.com:olxhub/lo-course.git"))
      .toThrow("manifest.yaml");   // hyphen
    expect(() => defaultNamespace("git@github.com:olxhub/6.002x.git"))
      .toThrow("manifest.yaml");   // leading digit + dot
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Full round-trips
// ═══════════════════════════════════════════════════════════════════════════════
//
// Putting it all together. A course "physics" has a DynamicList "problems"
// containing a TextArea "answer". A grader targets instance 0.

describe("Full round-trip", () => {
  it("same-course: author → parse → state store → content loading", () => {
    // Author writes: <Grader target="problems:#0:answer"/>
    // That's a StateRef — scoped, but no namespace yet.
    const authored = "problems:#0:answer";

    // At parse time, the system qualifies it with the course namespace:
    const key = `physics/${authored}`;
    expect(key).toBe("physics/problems:#0:answer");

    // For content loading, extract which definitions we need:
    const { namespace, blockIds } = extractBlocks(key);
    expect(namespace).toBe("physics");
    expect(blockIds).toEqual(["problems", "answer"]);

    // Both "physics/problems" and "physics/answer" must be in the idMap.
  });

  it("cross-course: author-qualified ref passes through", () => {
    // Author in ee202 writes: <UseDynamic target="ee101/notes"/>
    const authored = "ee101/notes";

    // Already has a namespace — qualification is a no-op:
    expect(isNamespaceQualified(authored)).toBe(true);

    // The system needs ee101's content loaded to resolve this.
  });
});
