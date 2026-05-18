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
const scopeMarkerPat      = `#${indexId}`;                             // "#0", "#attempt_2", "#a3F"
export const scopeSegment = `(?:${leafId}|${scopeMarkerPat})`;        // "answer" | "#0"

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
  scopeMarker:        compile(scopeMarkerPat),
  namespace:          compile(namespace),
  definitionRef:             compile(definitionRef),
  definitionKey:             compile(definitionKey),
  stateRef:      compile(stateRef),
  stateKey:      compile(stateKey),
  stateFieldRef:      compile(stateFieldRef),
};

// ═══════════════════════════════════════════════════════════════════════════════
// STRUCTURED PARSERS (named capture groups)
// ═══════════════════════════════════════════════════════════════════════════════
//
// VALID regexes answer "is this valid?" (boolean). PARSE regexes answer
// "what are the pieces?" (named groups). Same grammar, different jobs.

function compileGroups(pattern: string): RegExp {
  return new RegExp(`^${pattern}$`, 'u');
}

export const PARSE = {
  /** "ee101://hw1" → { ns: "ee101", id: "hw1" } */
  definitionKey: compileGroups(`(?<ns>${namespace})${nsDelim}(?<id>${leafId})`),

  /** "ee101://list:#0:answer" → { ns: "ee101", path: "list:#0:answer" } */
  stateKey: compileGroups(`(?<ns>${namespace})${nsDelim}(?<path>${statePath})`),

  /** "problems:#0:answer.value" → { ref: "problems:#0:answer", field: "value" } */
  stateFieldRef: compileGroups(`(?<ref>(?:${stateRef}))\\.(?<field>${fieldAccess})`),
};

// ═══════════════════════════════════════════════════════════════════════════════
// SPLIT / JOIN HELPERS
// ═══════════════════════════════════════════════════════════════════════════════
//
// Small primitives for breaking apart and reassembling IDs. Conversion
// functions compose these — no string surgery with indexOf.

/** "ee101://list:#0:answer" → { ns: "ee101", path: "list:#0:answer" } */
export function splitNs(key: string): { ns: string; path: string } {
  const m = key.match(PARSE.stateKey) ?? key.match(PARSE.definitionKey);
  if (m?.groups) return { ns: m.groups.ns, path: m.groups.path ?? m.groups.id };
  throw new Error(`splitNs: "${key}" has no namespace`);
}

/** "ee101" + "list:#0:answer" → "ee101://list:#0:answer" */
export function joinNs(ns: string, path: string): string {
  return `${ns}${NS_DELIM}${path}`;
}

/** "list:#0:answer" → ["list", "#0", "answer"] */
export function splitPath(path: string): string[] {
  return path.split(':');
}

/** ["list", "#0", "answer"] → "list:#0:answer" */
export function joinPath(segments: string[]): string {
  return segments.join(':');
}

/** "list:#0:answer" → "answer" (last non-scope-marker segment) */
export function leafBlock(path: string): string {
  const segs = splitPath(path);
  for (let i = segs.length - 1; i >= 0; i--) {
    if (!segs[i].startsWith('#')) return segs[i];
  }
  return segs[segs.length - 1];
}

/** "list:#0:answer" → ["list", "answer"] (all non-scope-marker segments) */
export function blockSegments(path: string): string[] {
  return splitPath(path).filter(s => !s.startsWith('#'));
}

// ═══════════════════════════════════════════════════════════════════════════════
// BRANDED TYPES
// ═══════════════════════════════════════════════════════════════════════════════
//
// Nominal types for the ID system. At runtime these are plain strings — the
// brands exist only at compile time to prevent mixing up refs, keys, and
// other ID-shaped strings.
//
// The Ref → Key relationship is a subtype: every Key is a valid Ref (it has
// been resolved/qualified with a namespace). This mirrors LofsRef →
// LofsCanonical in the address system.

import { Brand, Branded } from './brand';

// --- Content namespace -------------------------------------------------------

export type ContentNamespace = Branded<string, 'ContentNamespace'>;  // "ee101", "analogForDummies"

// --- Content identity (what a block IS) --------------------------------------

export type DefinitionRef = Branded<string, 'DefinitionRef'>;        // "answer", "ee101://answer"
export type DefinitionKey = DefinitionRef & Brand<'Resolved'>;       // "ee101://answer" (always namespaced)

// --- State identity (which runtime INSTANCE) ---------------------------------

export type StateRef = Branded<string, 'StateRef'>;                  // "list:#0:answer"
export type StateKey = StateRef & Brand<'Resolved'>;                 // "ee101://list:#0:answer"

// --- Scoping and rendering ---------------------------------------------------

export type IdPrefix    = Branded<string, 'IdPrefix'>;    // "list:#0" — accumulated scope from containers
export type ScopeMarker = Branded<string, 'ScopeMarker'>; // "#0", "#attempt_2" — instance index, not a block ID
export type ReactKey    = Branded<string, 'ReactKey'>;    // React reconciliation key
export type HtmlId      = Branded<string, 'HtmlId'>;      // DOM element id attribute
export type OLXTag      = Branded<string, 'OLXTag'>;      // "Vertical", "ChoiceInput"

// ═══════════════════════════════════════════════════════════════════════════════
// UNCHECKED CASTS (asX)
// ═══════════════════════════════════════════════════════════════════════════════
//
// For values proven correct by construction — you just built the string, no
// need to re-validate. Use parseX at boundaries; asX internally.

export const asContentNamespace = (s: string) => s as ContentNamespace;
export const asDefinitionRef    = (s: string) => s as DefinitionRef;
export const asDefinitionKey    = (s: string) => s as unknown as DefinitionKey;
export const asStateRef         = (s: string) => s as StateRef;
export const asStateKey         = (s: string) => s as unknown as StateKey;
export const asIdPrefix         = (s: string) => s as IdPrefix;
export const asScopeMarker      = (s: string) => s as ScopeMarker;
export const asReactKey         = (s: string) => s as ReactKey;
export const asOLXTag           = (s: string) => s as OLXTag;

// ═══════════════════════════════════════════════════════════════════════════════
// VALIDATORS (validateX)
// ═══════════════════════════════════════════════════════════════════════════════
//
// Pure shape checks. Return true on success, error message string on failure.
// No branding — these are the shared logic consumed by both parseX and z_x.

export function validateContentNamespace(s: string): true | string {
  if (!s) return 'ContentNamespace cannot be empty';
  if (!VALID.namespace.test(s)) return `Not a valid namespace: "${s}" (must match ${namespace})`;
  return true;
}

export function validateDefinitionRef(s: string): true | string {
  if (!s) return 'DefinitionRef cannot be empty';
  // DefinitionRef accepts bare IDs and path-prefixed forms (/, ./)
  const stripped = s.replace(/^\.?\//, '');
  if (!stripped) return `DefinitionRef "${s}" has path prefix but no ID`;
  if (!VALID.leafId.test(stripped)) return `DefinitionRef "${s}" contains invalid characters`;
  return true;
}

export function validateDefinitionKey(s: string): true | string {
  if (!s) return 'DefinitionKey cannot be empty';
  if (!VALID.definitionKey.test(s) && !VALID.leafId.test(s)) {
    return `Not a valid DefinitionKey: "${s}"`;
  }
  return true;
}

export function validateStateRef(s: string): true | string {
  if (!s) return 'StateRef cannot be empty';
  if (!VALID.stateRef.test(s)) {
    return `Not a valid StateRef: "${s}" (segments must be block IDs or #index markers, separated by :)`;
  }
  // Must have at least one non-ScopeMarker segment
  const segs = s.split(':');
  if (segs.every(seg => seg.startsWith('#'))) {
    return `StateRef "${s}" has only scope markers — must include at least one block ID`;
  }
  return true;
}

export function validateStateKey(s: string): true | string {
  if (!s) return 'StateKey cannot be empty';
  // Accept both bare (transitional) and namespaced forms
  if (!VALID.stateKey.test(s) && !VALID.stateRef.test(s)) {
    return `Not a valid StateKey: "${s}"`;
  }
  return true;
}

export function validateOLXTag(s: string): true | string {
  if (!s) return 'OLXTag cannot be empty';
  if (!/^[A-Z][a-zA-Z0-9]*$/.test(s)) return `OLXTag must be PascalCase: "${s}"`;
  return true;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PARSERS (parseX)
// ═══════════════════════════════════════════════════════════════════════════════
//
// Boundary functions: validate + brand. Accept unknown/string, throw on
// failure. No Zod dependency — Zod schemas consume these, not the reverse.

function assertValid(result: true | string): asserts result is true {
  if (result !== true) throw new Error(result);
}

export function parseContentNamespace(s: string): ContentNamespace {
  assertValid(validateContentNamespace(s));
  return asContentNamespace(s);
}

export function parseDefinitionRef(s: string, context = 'ID'): DefinitionRef {
  const result = validateDefinitionRef(s);
  if (result !== true) throw new Error(`${context}: ${result}`);
  return asDefinitionRef(s.trim());
}

export function parseDefinitionKey(s: string): DefinitionKey {
  assertValid(validateDefinitionKey(s));
  return asDefinitionKey(s.trim());
}

export function parseStateRef(s: string): StateRef {
  assertValid(validateStateRef(s));
  return asStateRef(s.trim());
}

export function parseStateKey(s: string): StateKey {
  assertValid(validateStateKey(s));
  return asStateKey(s.trim());
}

export function parseOLXTag(s: string): OLXTag {
  assertValid(validateOLXTag(s));
  return asOLXTag(s);
}

// ═══════════════════════════════════════════════════════════════════════════════
// SCOPE CONSTRUCTION
// ═══════════════════════════════════════════════════════════════════════════════

export const SCOPE_SEPARATOR = ':';
export const SCOPE_MARKER_PREFIX = '#';

/**
 * Create a ScopeMarker — an instance index segment in a StateKey.
 *
 *   scopeMarker(0)            → "#0"
 *   scopeMarker('attempt_2')  → "#attempt_2"
 */
export function scopeMarker(label: string | number): ScopeMarker {
  const str = String(label);
  if (!VALID.indexId.test(str)) {
    throw new Error(`scopeMarker: "${label}" must match [0-9a-zA-Z_]+`);
  }
  return asScopeMarker(`${SCOPE_MARKER_PREFIX}${str}`);
}

/**
 * Extend an IdPrefix for child components in scoping containers.
 *
 *   extendIdPrefix(props, [id, scopeMarker(0)])
 *   // { idPrefix: "list:#0" } or { idPrefix: "outer:#1:list:#0" }
 */
export function extendIdPrefix(
  props: { idPrefix?: IdPrefix; [key: string]: unknown },
  scope: string | (string | number | ScopeMarker)[]
): { idPrefix: IdPrefix } {
  const scopeStr = Array.isArray(scope) ? scope.join(SCOPE_SEPARATOR) : scope;
  const newPrefix = props.idPrefix
    ? `${props.idPrefix}${SCOPE_SEPARATOR}${scopeStr}`
    : scopeStr;
  return { idPrefix: asIdPrefix(newPrefix) };
}

/**
 * Insert scope into a DefinitionKey to produce a StateKey.
 * Scope goes AFTER the namespace:
 *
 *   addScope("ee101://answer", "list:#0" as IdPrefix)
 *   → "ee101://list:#0:answer"
 *
 *   addScope("ee101://answer", undefined)
 *   → "ee101://answer"  (no scope — StateKey = DefinitionKey)
 */
export function addScope(key: DefinitionKey, idPrefix?: IdPrefix): StateKey {
  if (!idPrefix) return key as unknown as StateKey;
  if (hasNamespace(key)) {
    const { ns, path } = splitNs(key);
    return asStateKey(joinNs(ns, `${idPrefix}${SCOPE_SEPARATOR}${path}`));
  }
  // Bare key (transitional — no namespace yet)
  return asStateKey(`${idPrefix}${SCOPE_SEPARATOR}${key}`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// ZOD SCHEMAS (z_x)
// ═══════════════════════════════════════════════════════════════════════════════
//
// Boundary adapters for Zod-based attribute validation. These consume the
// same validateX functions as parseX — Zod is a consumer, not the source of
// truth for ID validation.

import { z } from 'zod';

/** Factory: builds a Zod schema that validates a string and brands it. */
function brandedString<T extends string>(
  validate: (value: string) => true | string,
  brand: (value: string) => T,
): z.ZodType<T, z.ZodTypeDef, string> {
  return z.string()
    .superRefine((value, ctx) => {
      const result = validate(value);
      if (result !== true) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: result });
      }
    })
    .transform(value => brand(value)) as z.ZodType<T, z.ZodTypeDef, string>;
}

export const z_contentNamespace = brandedString(validateContentNamespace, asContentNamespace);
export const z_definitionRef    = brandedString(validateDefinitionRef, asDefinitionRef);
export const z_definitionKey    = brandedString(validateDefinitionKey, asDefinitionKey);
export const z_stateRef         = brandedString(validateStateRef, asStateRef);
export const z_stateKey         = brandedString(validateStateKey, asStateKey);

// ═══════════════════════════════════════════════════════════════════════════════
// DECOMPOSITION
// ═══════════════════════════════════════════════════════════════════════════════
//
// These compose splitNs + blockSegments + leafBlock to extract structure from
// validated keys. Callers get namespace context so they can reconstruct
// qualified DefinitionKeys for content loading.

/**
 * Extract all block IDs from a StateKey, preserving namespace context.
 *
 *   extractBlocks("physics://problems:#0:answer")
 *   → { ns: "physics", blockIds: ["problems", "answer"] }
 *
 * To get DefinitionKeys:
 *   result.blockIds.map(id => joinNs(result.ns, id))
 */
export function extractBlocks(key: string): { ns: string; blockIds: string[] } {
  const { ns, path } = splitNs(key);
  return { ns, blockIds: blockSegments(path) };
}

/** Extract all block IDs (strips namespace and scope markers). */
export function extractBlockIds(key: string): string[] {
  return blockSegments(splitNs(key).path);
}

/** Extract the leaf (target) block ID. */
export function extractLeafId(key: string): string {
  return leafBlock(splitNs(key).path);
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

/** Qualify a DefinitionRef → DefinitionKey. Already-namespaced refs pass through. */
export function qualifyDefinitionRef(ref: DefinitionRef, ns: ContentNamespace): DefinitionKey {
  return asDefinitionKey(qualifyRef(ref, ns));
}

/** Qualify a StateRef → StateKey. Already-namespaced refs pass through. */
export function qualifyStateRef(ref: StateRef, ns: ContentNamespace): StateKey {
  return asStateKey(qualifyRef(ref, ns));
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
export function defaultNamespace(origin: string): ContentNamespace {
  const cleaned = origin.replace(/\.git$/, '');
  const lastSep = Math.max(cleaned.lastIndexOf('/'), cleaned.lastIndexOf(':'));
  const derived = cleaned.slice(lastSep + 1);
  if (!VALID.namespace.test(derived)) {
    throw new Error(
      `Cannot derive a valid namespace from "${origin}" (got "${derived}"). ` +
      `Add an explicit "namespace" field to manifest.yaml.`
    );
  }
  return asContentNamespace(derived);
}

// ═══════════════════════════════════════════════════════════════════════════════
// REMAINING WORK
// ═══════════════════════════════════════════════════════════════════════════════
//
// This file owns grammar, types, validation, parsing, Zod schemas, scope
// construction, namespace qualification, and decomposition. What's left:
//
//   - Migrate attributeSchemas.ts to import from here (not id.ts)
//   - Migrate 44 consumer files from id.ts to here (see plan.md)
//   - Delete id.ts once empty
//   - LOFS address integration (fold in address.ts types)
