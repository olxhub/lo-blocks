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

import { parse } from 'pathe';

export function literal(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\\-]/g, '\\$&');
}

// ═══════════════════════════════════════════════════════════════════════════════
// GRAMMAR
// ═══════════════════════════════════════════════════════════════════════════════
//
// These are the building blocks. Each is a raw regex source string that can
// be composed with template literals. Capturing groups are used for the leaf
// productions; non-capturing (?:) for composition.

// --- Atoms ----------------------------------------------------------------

// publicLeafId — what authors write in OLX. No leading underscore.
// leafId       — full form used in Keys and internal sentinels. Allows leading "_".
//
// This reserves "_"-prefixed IDs for system use (e.g. _spinner_, _error_
// placeholders). Authors can't collide because bare "_foo" is rejected at
// parse time, but "CONTENT/_foo" is a valid DefinitionKey.
export const publicLeafId = String.raw`[\p{L}][\p{L}\p{N}_]*`;  // "answer", "żółw"
export const leafId = String.raw`[\p{L}_][\p{L}\p{N}_]*`;       // "answer", "żółw", "_spinner_quiz"
export const indexId = String.raw`[\p{L}\p{N}_]+`;               // Same + leading digits: "0", "3fgb", "attempt_2"
const scopeMarkerPat = `#${indexId}`;                             // "#0", "#attempt_2", "#a3F"
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

export const NS_DELIM = '/';                                           // Separates namespace from path in Keys
export const SOURCE_DELIM = '://';                                     // Separates source from path in source-qualified Refs (unimplemented)
const nsDelim = literal(NS_DELIM);
const sourceDelim = literal(SOURCE_DELIM);

// --- Refs (brandable input forms — bare or namespace-qualified) -------------
//
// DefinitionRef and StateRef are the validated, brandable input forms.
// They accept bare IDs or namespace-qualified IDs, but NOT source-qualified
// refs (which contain "://"). Keys are canonical subsets of Refs — always
// namespace-qualified.
//
// DefinitionRef:   "hw1"  (bare)  or  "ee101/hw1"  (also a valid DefinitionKey)
// StateRef:        "problems:#0:answer"  (bare)  or  "ee101/problems:#0:answer"
//
// Source-qualified refs (e.g., "git@gitlab.com:olxhub/ee101.git://hw1")
// are a SEPARATE pre-validation form. They cannot be branded as DefinitionRef
// or StateRef because they need LOFS resolution to determine the canonical
// namespace first. isSourceQualifiedRef() detects them; qualifyRef() throws
// if one is passed in. See the "Source-qualified refs" section below.

// Bare refs use publicLeafId (no leading _); qualified refs use full leafId.
export const definitionRef = `(?:${namespace}${nsDelim}${leafId}|${publicLeafId})`;
export const stateRef = `(?:${namespace}${nsDelim}(?:${scopeSegment}:)*${leafId}|(?:${scopeSegment}:)*${publicLeafId})`;

// --- "Any" Refs (permissive — accept system-generated _-prefixed bare refs) ----
//
// At OLX parse boundaries, bare _-prefixed refs are rejected (parseDefinitionRef,
// parseStateRef) because authors cannot create them. But at runtime, attributes
// like target= may contain system-generated _-prefixed bare refs (from
// joinDefinitionRef with auto-generated parents). These patterns accept both
// authored and system refs while still validating structure.
export const anyDefinitionRef = `(?:${namespace}${nsDelim}${leafId}|${leafId})`;
export const anyStateRef = `(?:${namespace}${nsDelim}(?:${scopeSegment}:)*${leafId}|(?:${scopeSegment}:)*${leafId})`;

// --- Keys (canonical forms — always namespace/path) -----------------------
//
// Keys are the normalized subset of Refs. Always namespace-qualified with
// a short stable name (not a full URL). In TypeScript, branded as a subtype
// of the corresponding Ref (Key = Ref & Brand<'Resolved'>).
//
// DefinitionKey:   "ee101/hw1", "edu.mit.eecs6002/resistorProblem"
// StateKey:        "ee101/designList:#7:mydesigns"

const statePath = `(?:${scopeSegment}:)*${leafId}`;
export const definitionKey = `${namespace}${nsDelim}${leafId}`;
export const stateKey = `${namespace}${nsDelim}${statePath}`;

// --- Source-qualified refs (pre-validation input — NOT brandable) -----------
//
// These are raw input strings that identify content by its storage origin.
// They are NOT DefinitionRefs or StateRefs — they must go through LOFS
// resolution to extract the canonical namespace before they can be used as
// Refs or Keys. parseDefinitionRef() and parseStateRef() reject them.
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
// These all resolve to the same DefinitionKey: ee101/hw1
// Source-qualified refs use "://" as delimiter (distinct from the "/" used by Keys).
// The grammar is intentionally permissive — the part before "://" can be
// nearly anything (URLs, file paths, etc.). Validation is left to the LOFS layer.
//
// LOFS resolution (source-qualified → DefinitionKey) is not yet implemented.
// isSourceQualifiedRef() detects them; qualifyRef() throws if one is passed.

export const sourceQualifiedRef = `.+?${sourceDelim}${leafId}`;

// --- Field access ------------------------------------------------------------
//
// Many attributes reference a specific field of a block's state, not just
// the block itself:
//
//   "problems:#0:answer.value"          (CopyFieldAction source)
//   "ee101/finalexam.score"             (IntakeGate when= expression)
//   "myInput.submitted"                 (SetFieldAction target)
//
// The field is separated by "." and is always a leafId. The part before "."
// is a StateRef (or StateKey). This is what attribute schemas like
// z_blockFieldRef validate against.
//
// NOTE: The "." here is NOT a namespace hierarchy separator — those only
// appear within the namespace portion (before "/"). After "/", the
// first "." encountered is always a field separator.

export const fieldAccess = leafId;                                    // "value", "score", "submitted"
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
  leafId: compile(leafId),
  indexId: compile(indexId),
  scopeMarker: compile(scopeMarkerPat),
  namespace: compile(namespace),
  definitionRef: compile(definitionRef),
  definitionKey: compile(definitionKey),
  stateRef: compile(stateRef),
  stateKey: compile(stateKey),
  stateFieldRef: compile(stateFieldRef),
  anyDefinitionRef: compile(anyDefinitionRef),
  anyStateRef: compile(anyStateRef),
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
  /** "ee101/hw1" → { ns: "ee101", id: "hw1" } */
  definitionKey: compileGroups(`(?<ns>${namespace})${nsDelim}(?<id>${leafId})`),

  /** "ee101/list:#0:answer" → { ns: "ee101", path: "list:#0:answer" } */
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

/** "ee101/answer" → { ns: "ee101", path: "answer" } */
export function splitNs(key: DefinitionKey): { ns: ContentNamespace; path: DefinitionRef };
/** "ee101/list:#0:answer" → { ns: "ee101", path: "list:#0:answer" } */
export function splitNs(key: StateKey): { ns: ContentNamespace; path: StateRef };
export function splitNs(key: DefinitionKey | StateKey): { ns: ContentNamespace; path: string } {
  const m = key.match(PARSE.stateKey) ?? key.match(PARSE.definitionKey);
  if (m?.groups) return { ns: asContentNamespace(m.groups.ns), path: m.groups.path ?? m.groups.id };
  throw new Error(`splitNs: "${key}" has no namespace`);
}

/** "ee101" + "list:#0:answer" → "ee101/list:#0:answer" */
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

export type DefinitionRef = Branded<string, 'DefinitionRef'>;        // "answer", "ee101/answer"
export type DefinitionKey = DefinitionRef & Brand<'Resolved'>;       // "ee101/answer" (always namespaced)

// --- State identity (which runtime INSTANCE) ---------------------------------

export type StateRef = Branded<string, 'StateRef'>;                  // "list:#0:answer"
export type StateKey = StateRef & Brand<'Resolved'>;                 // "ee101/list:#0:answer"

// --- Scoping and rendering ---------------------------------------------------

export type IdPrefix = Branded<string, 'IdPrefix'>;    // "list:#0" — accumulated scope from containers
export type ScopeMarker = Branded<string, 'ScopeMarker'>; // "#0", "#attempt_2" — instance index, not a block ID
export type ReactKey = Branded<string, 'ReactKey'>;    // React reconciliation key
export type HtmlId = Branded<string, 'HtmlId'>;      // DOM element id attribute
export type OLXTag = Branded<string, 'OLXTag'>;      // "Vertical", "ChoiceInput"
export type LeafId = Branded<string, 'LeafId'>;      // "answer", "grader" — single identifier segment

// ═══════════════════════════════════════════════════════════════════════════════
// UNCHECKED CASTS (asX)
// ═══════════════════════════════════════════════════════════════════════════════
//
// For values proven correct by construction — you just built the string, no
// need to re-validate. Use parseX at boundaries; asX internally.

export const asContentNamespace = (s: string) => s as ContentNamespace;
export const asDefinitionRef = (s: string) => s as DefinitionRef;
export const asDefinitionKey = (s: string) => s as unknown as DefinitionKey;
export const asStateRef = (s: string) => s as StateRef;
export const asStateKey = (s: string) => s as unknown as StateKey;
export const asIdPrefix = (s: string) => s as IdPrefix;
export const asScopeMarker = (s: string) => s as ScopeMarker;
export const asReactKey = (s: string) => s as ReactKey;
export const asOLXTag = (s: string) => s as OLXTag;
export const asLeafId = (s: string) => s as LeafId;

// ═══════════════════════════════════════════════════════════════════════════════
// VALIDATORS (validateX)
// ═══════════════════════════════════════════════════════════════════════════════
//
// Pure shape checks. Return true on success, error message string on failure.
// No branding — these are the shared logic consumed by both parseX and z_x.

export function validateLeafId(s: string): true | string {
  if (!s) return 'LeafId cannot be empty';
  if (!VALID.leafId.test(s)) return `Not a valid LeafId: "${s}" (must match ${leafId})`;
  return true;
}

export function validateContentNamespace(s: string): true | string {
  if (!s) return 'ContentNamespace cannot be empty';
  if (!VALID.namespace.test(s)) return `Not a valid namespace: "${s}" (must match ${namespace})`;
  return true;
}

export function validateDefinitionRef(s: string): true | string {
  if (!s) return 'DefinitionRef cannot be empty';
  if (!VALID.definitionRef.test(s)) {
    const hint = s.includes(SOURCE_DELIM)
      ? '. Source-qualified refs (containing "://") need LOFS resolution first'
      : '';
    const underscore = /^_/.test(s) ? '. Bare IDs starting with _ are reserved for system use' : '';
    return `Not a valid DefinitionRef: "${s}" (expected leafId or namespace/leafId${hint}${underscore})`;
  }
  return true;
}

export function validateDefinitionKey(s: string): true | string {
  if (!s) return 'DefinitionKey cannot be empty';
  if (!VALID.definitionKey.test(s)) {
    return `Not a valid DefinitionKey: "${s}" (must be namespace/leafId)`;
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
  if (!VALID.stateKey.test(s)) {
    return `Not a valid StateKey: "${s}" (must be namespace/path)`;
  }
  return true;
}

/** Permissive DefinitionRef validator — accepts both authored refs and system-generated _-prefixed bare refs.
 *  Use at runtime boundaries (attribute resolution, target lookup) where system-generated
 *  refs are legitimate. Use validateDefinitionRef at authoring boundaries (OLX parsing). */
export function validateAnyDefinitionRef(s: string): true | string {
  if (!s) return 'DefinitionRef cannot be empty';
  if (!VALID.anyDefinitionRef.test(s)) {
    const hint = s.includes(SOURCE_DELIM)
      ? '. Source-qualified refs (containing "://") need LOFS resolution first'
      : '';
    return `Not a valid DefinitionRef: "${s}" (expected leafId or namespace/leafId${hint})`;
  }
  return true;
}

/** Permissive StateRef validator — accepts both authored refs and system-generated _-prefixed bare refs.
 *  Use at runtime boundaries (attribute resolution, target lookup) where system-generated
 *  refs are legitimate. Use validateStateRef at authoring boundaries (OLX parsing). */
export function validateAnyStateRef(s: string): true | string {
  if (!s) return 'StateRef cannot be empty';
  if (!VALID.anyStateRef.test(s)) {
    return `Not a valid StateRef: "${s}" (segments must be block IDs or #index markers, separated by :)`;
  }
  // Must have at least one non-ScopeMarker segment
  const segs = s.split(':');
  if (segs.every(seg => seg.startsWith('#'))) {
    return `StateRef "${s}" has only scope markers — must include at least one block ID`;
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
// Boundary functions: validate + brand. Accept string, throw on failure.
// No Zod dependency — Zod schemas consume these, not the reverse.

function assertValid(result: true | string): asserts result is true {
  if (result !== true) throw new Error(result);
}

export function parseContentNamespace(s: string): ContentNamespace {
  assertValid(validateContentNamespace(s));
  return asContentNamespace(s);
}

export function parseDefinitionRef(s: string, context?: string): DefinitionRef {
  const result = validateDefinitionRef(s);
  if (result !== true) throw new Error(context ? `${context}: ${result}` : result);
  return asDefinitionRef(s);
}

export function parseDefinitionKey(s: string): DefinitionKey {
  assertValid(validateDefinitionKey(s));
  return asDefinitionKey(s);
}

export function parseStateRef(s: string): StateRef {
  assertValid(validateStateRef(s));
  return asStateRef(s);
}

export function parseStateKey(s: string): StateKey {
  assertValid(validateStateKey(s));
  return asStateKey(s);
}

/** Create a system-reserved DefinitionRef by prefixing "_" to a validated base.
 *  Authors cannot collide: bare "_foo" refs are rejected by parseDefinitionRef.
 *  Base is validated (must be safe characters — letters, digits, underscores)
 *  so garbage can't sneak through even on the system path. */
export function makeSystemDefinitionRef(base: string): DefinitionRef {
  if (!VALID.indexId.test(base)) {
    throw new Error(`makeSystemDefinitionRef: invalid base "${base}" (must match indexId)`);
  }
  return asDefinitionRef('_' + base);
}

export function parseLeafId(s: string): LeafId {
  assertValid(validateLeafId(s));
  return asLeafId(s);
}

export function parseOLXTag(s: string): OLXTag {
  assertValid(validateOLXTag(s));
  return asOLXTag(s);
}

/** Permissive DefinitionRef parser — accepts both authored and system-generated _-prefixed bare refs.
 *  Use at runtime boundaries where target attributes may contain system-generated refs.
 *  Use parseDefinitionRef at authoring boundaries (OLX parsing) to reject bare _-prefixed refs. */
export function parseAnyDefinitionRef(s: string, context?: string): DefinitionRef {
  const result = validateAnyDefinitionRef(s);
  if (result !== true) throw new Error(context ? `${context}: ${result}` : result);
  return asDefinitionRef(s);
}

/** Permissive StateRef parser — accepts both authored and system-generated _-prefixed bare refs.
 *  Use at runtime boundaries where target attributes may contain system-generated refs.
 *  Use parseStateRef at authoring boundaries (OLX parsing) to reject bare _-prefixed refs. */
export function parseAnyStateRef(s: string): StateRef {
  assertValid(validateAnyStateRef(s));
  return asStateRef(s);
}

/**
 * Derive a StateKey from a file path and content namespace.
 *
 * Uses pathe to extract the basename (no directory, no extension), lowercases
 * the first character (PascalCase → camelCase), and qualifies with the namespace.
 *
 * Examples:
 *   stateKeyFromFilename('blocks/CodeMirror/CodeMirrorPEGSyntaxDemo.olx', 'docs')
 *   → "docs/codeMirrorPEGSyntaxDemo"
 *
 *   stateKeyFromFilename('example.chatpeg', 'docs')
 *   → "docs/example"
 *
 *   stateKeyFromFilename('demos/resistor.olx', 'edu.memphis.psych101')
 *   → "edu.memphis.psych101/resistor"
 */
export function stateKeyFromFilename(filename: string, ns: ContentNamespace): StateKey {
  const { name } = parse(filename);
  // Dots and hyphens become camelCase boundaries:
  //   "Chat.demo" → "chatDemo", "linear-dialogue-demo" → "linearDialogueDemo"
  // (dots are field separators and hyphens are invalid in state keys)
  const parts = name.split(/[.\-]/);
  const camel = parts[0].charAt(0).toLowerCase() + parts[0].slice(1)
    + parts.slice(1).map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('');
  return parseStateKey(`${ns}/${camel}`);
}

/** Join a parent ref with child segments to form a derived DefinitionRef.
 *  Uses "_" as separator. The result inherits the parent's system prefix
 *  if present — authors cannot collide because bare "_foo" refs are rejected.
 *  Strips namespace from qualified parents so the result is always a bare ref. */
export function joinDefinitionRef(
  parent: DefinitionRef,
  ...parts: (LeafId | number)[]
): DefinitionRef {
  const path = isNamespaceQualified(parent) ? splitNs(parseDefinitionKey(parent)).path : String(parent);
  return asDefinitionRef([path, ...parts.map(String)].join('_'));
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
  props: { idPrefix?: IdPrefix;[key: string]: unknown },
  scope: string | (string | number | ScopeMarker)[]
): { idPrefix: IdPrefix } {
  // Strip namespace from scope components — idPrefix is a bare scope path,
  // never namespace-qualified. Callers commonly pass props.id (a DefinitionRef
  // that may be qualified like "CONTENT/list") as a scope component.
  //
  // Currently, all callers pass IDs from the same namespace (the block's own
  // id). Cross-namespace scoping (e.g. embedding ns1/foo inside ns2/bar) is
  // not reachable with current syntax. When it becomes possible, we'll need
  // to decide whether mixed-namespace idPrefixes are valid or whether scoping
  // should be namespace-local. For now, reject the case we know is wrong.
  let seenNs: string | null = null;
  const strip = (s: string | number | ScopeMarker): string => {
    const str = String(s);
    if (!isNamespaceQualified(str)) return str;
    const { ns, path } = splitNs(parseDefinitionKey(str));
    if (seenNs === null) {
      seenNs = ns;
    } else if (ns !== seenNs) {
      throw new Error(
        `extendIdPrefix: mixed namespaces in scope components ("${seenNs}" vs "${ns}"). ` +
        `Cross-namespace scoping is not yet supported.`
      );
    }
    return path;
  };
  const scopeStr = Array.isArray(scope) ? scope.map(strip).join(SCOPE_SEPARATOR) : strip(scope);
  const newPrefix = props.idPrefix
    ? `${props.idPrefix}${SCOPE_SEPARATOR}${scopeStr}`
    : scopeStr;
  return { idPrefix: asIdPrefix(newPrefix) };
}

/**
 * Insert scope into a DefinitionKey to produce a StateKey.
 * Scope goes AFTER the namespace:
 *
 *   addScope("ee101/answer", "list:#0" as IdPrefix)
 *   → "ee101/list:#0:answer"
 *
 *   addScope("ee101/answer", undefined)
 *   → "ee101/answer"  (no scope — StateKey = DefinitionKey)
 */
export function addScope(key: DefinitionKey, idPrefix?: IdPrefix): StateKey {
  if (!idPrefix) return key as unknown as StateKey;
  const { ns, path } = splitNs(key);
  return asStateKey(joinNs(ns, `${idPrefix}${SCOPE_SEPARATOR}${path}`));
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
export const z_definitionRef = brandedString(validateDefinitionRef, asDefinitionRef);
export const z_definitionKey = brandedString(validateDefinitionKey, asDefinitionKey);
export const z_stateRef = brandedString(validateStateRef, asStateRef);
export const z_stateKey = brandedString(validateStateKey, asStateKey);

/** Permissive Zod schemas for runtime attribute validation.
 *  Accept both authored and system-generated _-prefixed bare refs.
 *  Use at render-time attribute boundaries; strict z_stateRef/z_definitionRef
 *  remain for authoring boundaries. */
export const z_anyDefinitionRef = brandedString(validateAnyDefinitionRef, asDefinitionRef);
export const z_anyStateRef = brandedString(validateAnyStateRef, asStateRef);

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
 *   extractBlocks("physics/problems:#0:answer")
 *   → { namespace: "physics", blockIds: ["problems", "answer"] }
 *
 * To get DefinitionKeys:
 *   result.blockIds.map(id => joinNs(result.namespace, id))
 */
export function extractBlocks(key: DefinitionKey | StateKey): { namespace: ContentNamespace; blockIds: string[] } {
  const { ns, path } = splitNs(key as StateKey);
  return { namespace: ns, blockIds: blockSegments(path) };
}

/** Extract all block IDs (strips namespace and scope markers). */
export function extractBlockIds(key: DefinitionKey | StateKey): string[] {
  return blockSegments(splitNs(key as StateKey).path);
}

/** Extract the leaf (target) block ID. */
export function extractLeafId(key: DefinitionKey | StateKey): string {
  return leafBlock(splitNs(key as StateKey).path);
}

// ═══════════════════════════════════════════════════════════════════════════════
// NAMESPACE QUALIFICATION
// ═══════════════════════════════════════════════════════════════════════════════
//
// Determines whether a ref is already a canonical Key or needs namespace
// prepended. Three ref forms:
//
//   1. Bare ref (no "/" or "://") → prepend namespace with "/"
//   2. Namespace-qualified ("ee101/hw1") → already a Key, pass through
//   3. Source-qualified ("git@.../ee101.git://hw1") → needs LOFS resolution
//      (not yet implemented — throws)
//
// Check order matters: test for "://" FIRST (source-qualified), then "/"
// (namespace-qualified), because source-qualified refs also contain "/".
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
//        DefinitionKey "physics/answer" + idPrefix "problems:#0"
//        → StateKey "physics/problems:#0:answer"
//
//   2. AUTHORED CROSS-REFERENCE (qualifyStateRef)
//      An author writes `target="problems:#0:answer"` to reference a
//      SPECIFIC instance of another block's state. The scope is already
//      fully specified — it only needs namespace qualification:
//
//        StateRef "problems:#0:answer" + namespace "physics"
//        → StateKey "physics/problems:#0:answer"
//
// Applying pathway 1 to pathway 2 inputs (or vice versa) produces
// double-scoped nonsense. Keep them separate.

/** Check if a ref is source-qualified (contains "://"). These need LOFS resolution. */
export function isSourceQualifiedRef(ref: string): boolean {
  return ref.includes(SOURCE_DELIM);
}

/** Check if a ref already has a namespace prefix (valid namespace before "/"). */
export function isNamespaceQualified(ref: string): boolean {
  if (isSourceQualifiedRef(ref)) return false;  // "://" refs are NOT namespace-qualified Keys
  const idx = ref.indexOf(NS_DELIM);
  if (idx < 0) return false;
  const prefix = ref.slice(0, idx);
  return VALID.namespace.test(prefix);
}


/**
 * Prepend namespace to a ref that lacks one. Already-namespaced refs
 * (cross-course references) pass through unchanged.
 *
 *   qualifyRef("answer", "physics")                    → "physics/answer"
 *   qualifyRef("problems:#0:answer", "physics")        → "physics/problems:#0:answer"
 *   qualifyRef("ee101/notes", "ee202")                 → "ee101/notes"  (pass-through)
 *
 * @throws {Error} for source-qualified refs (e.g., "git@...://hw1") which
 *   need LOFS resolution, not simple namespace prepending.
 */
export function qualifyRef(ref: string, namespace: string): string {
  if (isSourceQualifiedRef(ref)) {
    throw new Error(
      `Source-qualified ref needs LOFS resolution: "${ref}". ` +
      `Cannot qualify with simple namespace prepend.`
    );
  }
  if (isNamespaceQualified(ref)) return ref;
  return `${namespace}${NS_DELIM}${ref}`;
}

/** Qualify a DefinitionRef → DefinitionKey. Already-namespaced refs pass through. */
export function qualifyDefinitionRef(ref: DefinitionRef, ns: ContentNamespace): DefinitionKey {
  return parseDefinitionKey(qualifyRef(ref, ns));
}

/** Qualify a StateRef → StateKey. Already-namespaced refs pass through. */
export function qualifyStateRef(ref: StateRef, ns: ContentNamespace): StateKey {
  return parseStateKey(qualifyRef(ref, ns));
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
// TODO(namespace): origin should be LofsOrigin (from address.ts), not string.
// Blocked by circular dependency — id-grammar.ts is the leaf of the type system
// and address.ts doesn't depend on it yet. Resolve when folding in address types.
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
// KEY RESOLUTION
// ═══════════════════════════════════════════════════════════════════════════════
//
// Runtime key construction. These compose everything above — grammar, validators,
// parsers, scope construction, and namespace qualification — into the functions
// that call sites actually use.
//
// Two fundamentally different operations:
//   1. Own-state (scope-relative): block builds its own StateKey from its
//      DefinitionRef + inherited idPrefix. Uses scopedStateKeyForBlock.
//   2. Authored target (global): an authored target="answer" attribute resolves
//      globally — no caller idPrefix. Uses stateKeyForGlobalRef.
//
// Do NOT conflate these. See the NAMESPACE QUALIFICATION section above.

/**
 * Build a block's scoped StateKey from its props.
 *
 * Scope-relative: applies idPrefix from the rendering container.
 * The id is a DefinitionRef — validated by the grammar. No path prefix
 * stripping; if props.id contains "./" that's a bug upstream.
 *
 *   scopedStateKeyForBlock({ id: 'answer', ns: 'ee101', idPrefix: 'list:#0' as IdPrefix })
 *   → "ee101/list:#0:answer"
 *
 *   scopedStateKeyForBlock({ id: 'answer', runtime: { ns: 'ee101' } })
 *   → "ee101/answer"  (no scope)
 *
 * The namespace comes from props.ns or props.runtime.ns — there is no
 * fallback. A missing namespace means a render pathway failed to thread
 * it; fail fast rather than silently qualifying into the wrong namespace.
 */
export function scopedStateKeyForBlock(
  props: { id: DefinitionRef; ns?: ContentNamespace; runtime?: { ns: ContentNamespace }; idPrefix?: IdPrefix;[key: string]: unknown }
): StateKey {
  const ns = props.ns ?? props.runtime?.ns;
  if (!ns) {
    throw new Error(
      `scopedStateKeyForBlock: no content namespace for id "${props.id}". ` +
      `Every render pathway must supply ns (via RenderOLX's ns prop / runtime context).`
    );
  }
  const defKey = qualifyDefinitionRef(props.id, ns);
  return addScope(defKey, props.idPrefix);
}

/**
 * Resolve an authored target reference globally.
 *
 * Replaces refToReduxKey({...props, id: target}) for authored cross-refs.
 * Global: does NOT apply the caller's idPrefix.
 *
 *   stateKeyForGlobalRef(asStateRef('answer'))
 *   → "CONTENT/answer"
 *
 *   stateKeyForGlobalRef(asStateRef('problems:#0:answer'))
 *   → "CONTENT/problems:#0:answer"
 *
 *   stateKeyForGlobalRef(asStateRef('calculus/answer'))
 *   → "calculus/answer"  (already qualified, pass-through)
 */
// TODO(target-scope): Current behavior is global resolution (no idPrefix applied).
//
// Desired behavior: local-then-global fallback. Given <Ref target="bar"> inside
// a DynamicList scope, first check if "bar" exists in the local scope (e.g.
// foo:#0:bar), then fall back to the global "bar". This preserves the ability to
// reference things outside the current scope — if we always applied scope, we'd
// lose that.
//
// Note the THREE-SCOPE problem for cross-references:
//   <Example id="foo"/>
//   <DynamicList id="a">
//     <Example id="foo"/>             ← action's scope 'a:#n:foo' (local #1)
//     <SetFieldAction id="b" target="useDynamic" field="value" value="foo">
//   </DynamicList>
//   <DynamicList id="c">
//     <Example id="foo"/>             ← UseDynamic's scope 'b:#n:foo' (local #2)
//     <UseDynamic id="d">
//   <Example id="foo">                ← global scope 'foo'
//
// The local -> global problem complicates!

// NOTE: currently identical to qualifyStateRef, and kept deliberately:
// the TODO above describes a planned divergence (local-then-global fallback)
// that qualifyStateRef must never grow — qualification stays a pure namespace
// prepend. Call sites that mean "resolve an authored target" use this name so
// they pick up the new behavior when it lands. (Its definition-side sibling,
// definitionKeyForRef, had no pending divergence and was removed — use
// qualifyDefinitionRef.)
export function stateKeyForGlobalRef(
  ref: StateRef,
  ns: ContentNamespace
): StateKey {
  return qualifyStateRef(ref, ns);
}

/**
 * Extract the leaf DefinitionKey from a StateKey.
 *
 * Replaces stateKeyToDefinitionKey from id.ts. Namespace-aware.
 *
 *   leafDefinitionKeyFromStateKey("CONTENT/list:#0:answer")
 *   → "CONTENT/answer"
 */
export function leafDefinitionKeyFromStateKey(key: StateKey): DefinitionKey {
  const { ns, path } = splitNs(key);
  return asDefinitionKey(joinNs(ns, leafBlock(path)));
}

/**
 * Extract ALL DefinitionKeys from a StateKey (for content loading).
 *
 * Replaces allDefinitionKeys from id.ts. Namespace-aware.
 *
 *   allDefinitionKeysFromStateKey("CONTENT/problems:#0:answer")
 *   → ["CONTENT/problems", "CONTENT/answer"]
 */
export function allDefinitionKeysFromStateKey(key: StateKey): DefinitionKey[] {
  const { ns, path } = splitNs(key);
  return blockSegments(path).map(id => asDefinitionKey(joinNs(ns, id)));
}

/** Non-throwing boundary parse: the branded StateKey when valid, else
 * null. For callers handling id-shaped strings that may not be StateKeys
 * (componentSetting tags, storage URIs, system ids) — the caller keeps
 * the null case and decides what non-key means THERE; this module never
 * returns an unbranded id-shaped string. */
export function tryParseStateKey(s: string): StateKey | null {
  return validateStateKey(s) === true ? asStateKey(s) : null;
}
