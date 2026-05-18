// packages/shared/lib/types/id-grammar.ts
//
// Formal grammar for the ID type system.
//
// This is the single source of truth for what constitutes a valid ID at each
// layer. All validation functions and Zod schemas should derive from these
// patterns.
//
// We use composed regex rather than PEG (Peggy). Benchmarks show 10-100x
// faster for simple ID validation. Peggy closes the gap for complex grammars
// with backtracking, but IDs are simple enough that regex is the right tool.
//
// The one helper we need: literal strings in regex context.

export function literal(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&');
}

// ═══════════════════════════════════════════════════════════════════════════════
// GRAMMAR
// ═══════════════════════════════════════════════════════════════════════════════
//
// These are the building blocks. Each is a raw regex source string that can
// be composed with template literals. Capturing groups are used for the leaf
// productions; non-capturing (?:) for composition.

// --- Atoms ----------------------------------------------------------------

export const leafId       = String.raw`[\p{L}_][\p{L}\p{N}_]*`;       // "answer", "żółw", "_hash123"
export const indexId      = String.raw`[\p{L}\p{N}_]+`;               // Same + leading digits: "0", "3fgb", "attempt_2"
export const scopeMarker  = `#${indexId}`;                             // "#0", "#attempt_2", "#a3F"
export const scopeSegment = `(?:${leafId}|${scopeMarker})`;           // "answer" | "#0"

// --- Namespace ------------------------------------------------------------
//
// Short stable name for a content source. Derived from origin, not an address.
//
//   ee101, lo_course, edu.mit.courseSix.eecs6002
//
// Dots separate hierarchy levels. The namespace is what makes keys globally
// unique — student state survives repo moves, forks, and hash updates.
//
// IMPORTANT: Not all repo names are valid namespaces. Git repos often have
// hyphens ("lo-course"), leading digits ("6002x"), or dots ("6.002x") which
// are not valid here. defaultNamespace() throws for these — the content
// source must provide an explicit namespace via manifest.yaml.

export const namespace = `${leafId}(?:\\.${leafId})*`;

// --- Delimiter ------------------------------------------------------------

export const NS_DELIM = '://';                                         // Separates namespace from path
export const nsDelim  = literal(NS_DELIM);

// --- Refs (what authors write — may or may not have namespace) -------------
//
// Refs are the permissive input form. Keys are canonical subsets of Refs.
// This mirrors LofsRef → LofsCanonical: same string format, different
// semantic guarantee (resolved / canonical).
//
// DefinitionRef:   Content definition reference. Anything an author writes
//                  to identify a block. Very permissive before "://".
//                  Examples:
//                    "hw1"                                              (bare)
//                    "ee101://hw1"                                      (also a valid DefinitionKey)
//                    "git@gitlab.com:olxhub/ee101.git://hw1"           (source-qualified)
//                    "git@gitlab.com:olxhub/ee101.git@main://hw1"      (branch-pinned)
//                    "git@gitlab.com:olxhub/ee101.git@a1238b://hw1"    (immutable)
//
// StateRef:   State instance reference. Scoped, may or may not have
//                  a namespace. A namespaced StateRef is also a valid
//                  StateKey.
//                  Examples:
//                    "problems:#0:answer"                               (unqualified)
//                    "ee101://problems:#0:answer"                       (also a valid StateKey)
//                    "git@gitlab.com:olxhub/ee101.git://problems:#0:answer"  (source-qualified)
//
// DISTINGUISHING CANONICAL KEYS FROM SOURCE-QUALIFIED REFS:
//
// Both "ee101://hw1" and "git@gitlab.com:olxhub/ee101.git://hw1" contain
// "://". A simple `includes('://')` check is NOT sufficient to tell if a
// ref is already a canonical Key. To determine canonicality:
//
//   1. Find the FIRST occurrence of "://"
//   2. Check if the part BEFORE it matches the `namespace` grammar
//   3. If yes → canonical Key. If no → source-qualified Ref that still
//      needs resolution to a Key.
//
// In practice, `qualifyRef(ref, ns)` should use this logic:
//   - Split on first "://"
//   - If prefix matches `namespace` regex → already a Key, pass through
//   - Otherwise → source-qualified ref, resolve via LOFS layer
//   - No "://" at all → bare ref, prepend namespace

export const definitionRef        = `(?:.+${nsDelim})?${leafId}`;
export const stateRef = `(?:.+${nsDelim})?(?:${scopeSegment}:)*${leafId}`;

// --- Keys (canonical forms — always namespace://path) ---------------------
//
// Keys are the normalized subset of Refs. Always namespace-qualified with
// a short stable name (not a full URL). In TypeScript, branded as a subtype
// of the corresponding Ref (Key extends Ref with { __resolved: true }).
//
// DefinitionKey:          "ee101://hw1", "edu.mit.eecs6002://resistorProblem"
// StateKey:   "ee101://designList:#7:mydesigns"

const statePath = `(?:${scopeSegment}:)*${leafId}`;
export const definitionKey        = `${namespace}${nsDelim}${leafId}`;
export const stateKey = `${namespace}${nsDelim}${statePath}`;

// --- Source-qualified refs (for provenance, analytics, reload) -------------
//
// These are NOT used for state keys or content lookup at runtime. They carry
// richer origin information for other purposes:
//
//   Immutable (analytics, replay):
//     git:github.com/olxhub/ee101.git@a1238b://hw1
//
//   Branch-pinned (cache invalidation — reload when main changes):
//     git:github.com/olxhub/ee101.git@main://hw1
//
//   Bare origin (fetch, no version):
//     git:github.com/olxhub/ee101.git://hw1
//
// These all resolve to the same DefinitionKey: ee101://hw1
// The grammar for source-qualified refs is intentionally permissive — the
// part before "://" can be nearly anything (URLs, file paths, etc.).
// Validation of the source portion is left to the LOFS layer.

export const sourceQualifiedRef = `.+?${nsDelim}${leafId}`;

// --- Field access ------------------------------------------------------------
//
// Many attributes reference a specific field of a block's state, not just
// the block itself:
//
//   "problems:#0:answer.value"          (CopyFieldAction source)
//   "ee101://finalexam.score"           (IntakeGate when= expression)
//   "myInput.submitted"                 (SetFieldAction target)
//
// The field is separated by "." and is always a leafId. The part before "."
// is a StateRef (or StateKey). This is what attribute schemas like
// z_blockFieldRef validate against.
//
// NOTE: The "." here is NOT a namespace hierarchy separator — those only
// appear within the namespace portion (before "://"). After "://", the
// first "." encountered is always a field separator.

export const fieldAccess   = leafId;                                    // "value", "score", "submitted"
export const stateFieldRef = `(?:${stateRef})\\.${fieldAccess}`;  // "problems:#0:answer.value"

// ═══════════════════════════════════════════════════════════════════════════════
// COMPILED VALIDATORS
// ═══════════════════════════════════════════════════════════════════════════════
//
// Each compiled regex anchors the pattern with ^...$ and enables Unicode.
// These are what validation functions and Zod schemas should use.

function compile(pattern: string): RegExp {
  return new RegExp(`^(?:${pattern})$`, 'u');
}

export const VALID = {
  leafId:             compile(leafId),
  indexId:            compile(indexId),
  scopeMarker:        compile(scopeMarker),
  namespace:          compile(namespace),
  definitionRef:             compile(definitionRef),
  definitionKey:             compile(definitionKey),
  stateRef:      compile(stateRef),
  stateKey:      compile(stateKey),
  stateFieldRef:      compile(stateFieldRef),
};

// ═══════════════════════════════════════════════════════════════════════════════
// DECOMPOSITION
// ═══════════════════════════════════════════════════════════════════════════════
//
// These extract structure from validated keys. They assume input has already
// been validated — they don't re-check the grammar.
//
// Return values include the namespace so callers can reconstruct qualified
// DefinitionKeys for content loading (e.g., "physics://problems:#0:answer" →
// need DefinitionKeys ["physics://problems", "physics://answer"] in the idMap).

/** Split a namespaced key into { namespace, path }. */
export function splitNamespace(key: string): { namespace: string; path: string } {
  const idx = key.indexOf(NS_DELIM);
  if (idx < 0) throw new Error(`splitNamespace: "${key}" has no ${NS_DELIM} delimiter`);
  return { namespace: key.slice(0, idx), path: key.slice(idx + NS_DELIM.length) };
}

/**
 * Extract all block IDs from a StateKey, preserving namespace context.
 *
 * Returns { namespace, blockIds } so callers can reconstruct DefinitionKeys:
 *   extractBlocks("physics://problems:#0:answer")
 *   → { namespace: "physics", blockIds: ["problems", "answer"] }
 *
 * To get DefinitionKeys for content loading:
 *   result.blockIds.map(id => `${result.namespace}://${id}`)
 *   → ["physics://problems", "physics://answer"]
 */
export function extractBlocks(key: string): { namespace: string; blockIds: string[] } {
  const { namespace, path } = splitNamespace(key);
  const blockIds = path.split(':').filter(seg => !seg.startsWith('#'));
  return { namespace, blockIds };
}

/** Extract all block IDs from a scoped path (strips namespace, strips scope markers). */
export function extractBlockIds(key: string): string[] {
  return extractBlocks(key).blockIds;
}

/** Extract the leaf (target) block ID from a scoped path. */
export function extractLeafId(key: string): string {
  const blocks = extractBlockIds(key);
  return blocks[blocks.length - 1];
}

// ═══════════════════════════════════════════════════════════════════════════════
// NAMESPACE QUALIFICATION
// ═══════════════════════════════════════════════════════════════════════════════
//
// Determines whether a ref is already a canonical Key or needs namespace
// prepended. The logic:
//
//   1. No "://" at all → bare ref, prepend namespace
//   2. Has "://" AND prefix matches `namespace` grammar → already a Key
//   3. Has "://" but prefix does NOT match `namespace` → source-qualified
//      ref (e.g., "git@gitlab.com:olxhub/ee101.git://hw1"). This requires
//      resolution via the LOFS layer to determine the canonical namespace.
//
// Cases 1 and 2 are common. Case 3 is rare at runtime (usually resolved
// at content-load time before attributes reach Redux).
//
// TWO DISTINCT SCOPE PATHWAYS
// ---------------------------
// Scope enters the system two ways. Do not conflate them:
//
//   1. RUNTIME OWN-STATE SCOPING (addScope / refToStateKey)
//      A block renders inside a scoping container (DynamicList, etc.).
//      The container passes `idPrefix` via React context. Each block
//      builds its own StateKey from its DefinitionKey + inherited idPrefix:
//
//        DefinitionKey "physics://answer" + idPrefix "problems:#0"
//        → StateKey "physics://problems:#0:answer"
//
//   2. AUTHORED CROSS-REFERENCE (qualifyStateRef)
//      An author writes `target="problems:#0:answer"` to reference a
//      SPECIFIC instance of another block's state. The scope is already
//      fully specified — it only needs namespace qualification:
//
//        StateRef "problems:#0:answer" + namespace "physics"
//        → StateKey "physics://problems:#0:answer"
//
// Applying pathway 1 to pathway 2 inputs (or vice versa) produces
// double-scoped nonsense. Keep them separate.

/** Check if a ref already has a namespace prefix (i.e., a valid namespace before "://"). */
export function hasNamespace(ref: string): boolean {
  const idx = ref.indexOf(NS_DELIM);
  if (idx < 0) return false;
  const prefix = ref.slice(0, idx);
  return VALID.namespace.test(prefix);
}

/**
 * Prepend namespace to a ref that lacks one. Already-namespaced refs
 * (cross-course references) pass through unchanged.
 *
 *   qualifyRef("answer", "physics")                    → "physics://answer"
 *   qualifyRef("problems:#0:answer", "physics")        → "physics://problems:#0:answer"
 *   qualifyRef("ee101://notes", "ee202")               → "ee101://notes"  (pass-through)
 *
 * @throws {Error} for source-qualified refs (e.g., "git@...://hw1") which
 *   need LOFS resolution, not simple namespace prepending.
 */
export function qualifyRef(ref: string, namespace: string): string {
  if (hasNamespace(ref)) return ref;
  if (!ref.includes(NS_DELIM)) return `${namespace}${NS_DELIM}${ref}`;
  throw new Error(
    `Source-qualified ref needs LOFS resolution: "${ref}". ` +
    `Cannot qualify with simple namespace prepend.`
  );
}

/**
 * Derive a namespace from a content source origin.
 *
 * Strips .git suffix and takes the last path component. The result must
 * be a valid namespace — if it isn't, the content source needs an explicit
 * `namespace` field in its manifest.yaml.
 *
 *   "git@github.com:olxhub/ee101.git"            → "ee101"
 *   "/home/user/courses/analogForDummies"         → "analogForDummies"
 *   "git@github.com:olxhub/lo-course.git"        → throws (hyphen)
 *   "git@github.com:olxhub/6.002x.git"           → throws (leading digit, dot)
 *
 * @throws {Error} if the derived name is not a valid namespace
 */
export function defaultNamespace(origin: string): string {
  const cleaned = origin.replace(/\.git$/, '');
  const lastSep = Math.max(cleaned.lastIndexOf('/'), cleaned.lastIndexOf(':'));
  const derived = cleaned.slice(lastSep + 1);
  if (!VALID.namespace.test(derived)) {
    throw new Error(
      `Cannot derive a valid namespace from "${origin}" (got "${derived}"). ` +
      `Add an explicit "namespace" field to manifest.yaml.`
    );
  }
  return derived;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONSOLIDATION PLAN
// ═══════════════════════════════════════════════════════════════════════════════
//
// This file is the beginning of a cleanroom rewrite of the ID type system.
// The goal is to consolidate and replace:
//
//   address.ts   — LofsRef, LofsCanonical, LofsOrigin, LofsVersion, etc.
//                  The LOFS address grammar (source://path#version) for
//                  content-addressed storage. Provides provenance identity.
//
//   core.ts      — Branded type definitions (DefinitionRef, DefinitionKey,
//   (ID section)   StateRef, StateKey, IdPrefix, ScopeMarker,
//                  ContentNamespace). The conversion pathway diagram.
//
//   id.ts        — Validation functions (toDefinitionRef, parseStateRef,
//                  toStateKey, toDefinitionKey), resolution functions
//                  (refToStateKey, refToDefinitionKey, stateKeyToDefinitionKey, allDefinitionKeys,
//                  extendIdPrefix), and assignReactKeys.
//
// After this file stabilizes, the plan is:
//
//   1. GRAMMAR (this section, above)
//      Single source of truth for what each type accepts.
//
//   2. BRANDED TYPES (next section to add, below grammar)
//      Type definitions with __brand and __resolved markers.
//      Mirrors the LofsRef → LofsCanonical pattern from address.ts:
//        DefinitionRef → DefinitionKey  (Key extends Ref with __resolved)
//        StateRef      → StateKey       (same pattern)
//
//   3. VALIDATION + BRANDING FUNCTIONS (below types)
//      parseDefinitionRef, parseDefinitionKey, parseStateRef, parseStateKey,
//      parseNamespace, etc. Each validates against the compiled grammar
//      and returns a branded type.
//
//   4. CONVERSION FUNCTIONS (below validation)
//      qualifyDefinitionRef(ref, namespace) → DefinitionKey
//      qualifyStateRef(ref, namespace) → StateKey
//      addScope(key, idPrefix) → StateKey  (scope after namespace)
//      extractBlockIds(key) → DefinitionRef[]
//      defaultNamespace(origin) → ContentNamespace
//
//   5. ZOD SCHEMAS (below conversions)
//      z_definitionRef, z_definitionKey, z_stateRef, z_stateKey, etc.
//      Wrappers around the validation functions for use in block attribute
//      schemas.
//
//   6. LOFS ADDRESS INTEGRATION
//      Fold in address.ts types. The relationship:
//        LofsRef    = source://path#version  (what you ask for)
//        LofsCanonical = same, with immutable version  (what you got)
//        LofsOrigin = source portion  (derives namespace via defaultNamespace)
//      Source-qualified DefinitionRefs (git@...://hw1) are LofsRefs without
//      a path component — the "path" IS the DefinitionRef's leafId.
//
// The two normalized forms for identity:
//
//   ee101://hw1                                    ← DefinitionKey (runtime identity)
//   git@gitlab.com:olxhub/ee101.git@a1238b://hw1  ← LofsCanonical (provenance)
//
// Both refer to the same content. DefinitionKey is what Redux uses. LofsCanonical
// is what analytics, replay, and cache invalidation use.
//
// assignReactKeys stays in its own utility — it's a rendering concern,
// not an identity concern.
