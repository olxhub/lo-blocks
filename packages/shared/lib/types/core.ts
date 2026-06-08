// packages/shared/lib/types/core.ts
//
// Type definitions - central TypeScript types for Learning Observer architecture.
//
// This file defines and explains the core data structures that flow
// through the Learning Observer system:
//
// - Content types (OLX, provenance, errors)
// - Block system types (blueprints, components, fields)
// - State management types (Redux fields, scopes)
// - Storage types (providers, file metadata)
//
// TypeScript philosophy: We use types to avoid confusion on major interfaces
// and data structures, but generally don't type basic values (string, any, etc.).
// Focus is on documenting contracts between system components, not exhaustive typing.
//
import { z } from 'zod';
import { scopeNames } from '../state/scopes';
import type { Store } from 'redux';
import type { LofsRef, LofsCanonical } from './address';
import type { ContentVariant, LocaleContext } from './i18n';

/**
 * ════════════
 * COMMON TYPES
 * ════════════
 */

export type JSONValue =
  | string
  | number
  | boolean
  | null
  | JSONValue[]
  | { [key: string]: JSONValue };

/**
 * ════════
 * ID TYPES
 * ════════
 *
 * The ID system has four layers, from authored content to runtime state.
 * Branded types enforce correct usage at compile time.
 *
 * NAMING PLAN
 * -----------
 * Type helpers should distinguish three jobs:
 * - parseX(value): validate an untrusted value and return a branded type.
 * - asX(value): unchecked internal branding when a value is already inside the
 *   type system and validation would be redundant.
 * - validateX(value): boolean or assertion-style validation without conversion.
 *
 * Ref -> Key conversion is a separate job with named resolvers in id-grammar.ts.
 * Own-state and authored cross-references use DIFFERENT resolvers — see
 * scopedStateKeyForBlock (own-state) vs stateKeyForGlobalRef (authored targets).
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │                        CONVERSION PATHWAYS                           │
 * │  (all functions live in id-grammar.ts)                               │
 * │                                                                      │
 * │  DefinitionRef ──definitionKeyForRef()──> DefinitionKey              │
 * │      │                                  │                            │
 * │      │                                  │  Content lookup in Redux   │
 * │      │                                  │  (selectBlock, ensureBlock)│
 * │      v                                  │                            │
 * │  props ─scopedStateKeyForBlock(props)──> StateKey  (own-state)       │
 * │  StateRef ─stateKeyForGlobalRef(ref)──> StateKey   (authored target) │
 * │                                                                      │
 * │  StateKey ─leafDefinitionKeyFromStateKey()──> DefinitionKey (leaf)   │
 * │      │              ↑                                                │
 * │      │              │ Last non-ScopeMarker segment                   │
 * │      │              │ (DefinitionKeys cannot contain ':' or '#')     │
 * │      │                                                               │
 * │  StateKey ─allDefinitionKeysFromStateKey()──> DefinitionKey[]        │
 * │                                                                      │
 * │  extendIdPrefix(props, [id, scopeMarker(index)]) → IdPrefix          │
 * │    Blocks like DynamicList create scoped prefixes                    │
 * └──────────────────────────────────────────────────────────────────────┘
 *
 * SCOPE MARKERS
 * -------------
 * Segments in a StateKey that start with '#' are ScopeMarkers —
 * instance indices, attempt numbers, etc. They are NOT loadable block IDs.
 * All other segments are valid DefinitionKeys.
 *
 * Constructed via scopeMarker(label): e.g. scopeMarker(0) → '#0'
 * Format: #[0-9a-zA-Z_]+
 *
 * Examples:
 *   DefinitionRef:  "resistorProblem", "/mit.edu/6002x/resistorProblem"
 *   DefinitionKey:        "resistorProblem" (canonical, for content lookup)
 *   StateRef: "answer" or "myList:#0:answer" (authored target)
 *   ScopeMarker:   "#0", "#attempt_2" (instance scoping, not a block ID)
 *   IdPrefix:      "myList:#0" (DynamicList "myList", instance 0)
 *   StateKey: "myList:#0:resistorProblem" (scoped state key)
 *
 * The ':' delimiter (SCOPE_SEPARATOR) is reserved — forbidden in
 * user-authored IDs. This makes decomposition deterministic:
 *   leafDefinitionKeyFromStateKey("CONTENT/myList:#0:resistorProblem") → "CONTENT/resistorProblem"
 *   allDefinitionKeysFromStateKey("CONTENT/myList:#0:resistorProblem") → ["CONTENT/myList", "CONTENT/resistorProblem"]
 *
 * See docs/redux-key-decomposition.md for full design documentation.
 */

// ════��══════════════════════════��═══════════════════════════════════════════════
// CONTENT NAMESPACE
// ══���════════════════════════════════════════════════════════════════════════════

/**
 * A short logical name for a content collection.
 *
 * Identifies WHAT a content source is (logical identity), not WHERE it lives
 * (physical location). Multiple LOFS origins can map to the same namespace:
 * forks, memory overlays, and local checkouts of the same course all share one.
 *
 * Derived from the LOFS origin by default (last path component, strip .git),
 * but can be overridden via manifest.yaml.
 *
 * Examples: "analogForDummies", "calculusForDummies", "docs", "content"
 *
 * Used as the first dimension in Redux state: state.olxjson[namespace][bareKey]
 */
// Re-exported from id-grammar.ts — see that file for the Brand<> pattern.
export type { ContentNamespace } from './id-grammar';
import type { ContentNamespace } from './id-grammar';
import { VALID } from './id-grammar';

/** Validate and brand a content namespace string. */
export function toContentNamespace(s: string): ContentNamespace {
  if (!s) throw new Error('ContentNamespace cannot be empty');
  if (!VALID.namespace.test(s)) {
    throw new Error(`ContentNamespace must match namespace grammar (letter/underscore start, dot-separated segments): "${s}"`);
  }
  return s as ContentNamespace;
}

/** The transitional namespace for single-repo content. Will eventually be repo-derived. */
export { PLACEHOLDER_NS as CONTENT_NAMESPACE } from './id-grammar';

// ═══════════════���═══════════════════════════════════════════════��═══════════════
// ID TYPES
// ════════════════════════════════��══════════════════════════════════════════════

// All ID types re-exported from id-grammar.ts (single source of truth).
export type {
  DefinitionRef, DefinitionKey,
  StateRef, StateKey,
  IdPrefix, ScopeMarker,
  ReactKey, HtmlId, OLXTag, LeafId,
} from './id-grammar';

// Local imports for use within this file.
import type {
  DefinitionRef, DefinitionKey,
  StateRef, StateKey,
  IdPrefix, ScopeMarker,
  ReactKey, HtmlId, OLXTag,
} from './id-grammar';
import { asOLXTag } from './id-grammar';

// Zod schemas re-exported for use by MCP tools and other schema consumers.
// Uses transform so z.infer<typeof OLXTagSchema> preserves the branded OLXTag type.
// Regex matches validateOLXTag in id-grammar.ts: PascalCase, letters/digits only.
export const OLXTagSchema = z.string()
  .regex(/^[A-Z][a-zA-Z0-9]*$/, 'OLXTag must be PascalCase')
  .describe('OLX tag name (e.g. "Markdown", "ChoiceInput")')
  .transform((s): OLXTag => asOLXTag(s));

/** Git status of a file tracked by the block registry generator. */
export const BlockGitStatusSchema = z.enum(['committed', 'modified', 'untracked']);
export type BlockGitStatus = z.infer<typeof BlockGitStatusSchema>;


/**
 * ═══════════════════
 * Provenance (LofsRef)
 * ═══════════════════
 *
 * Every piece of parsed content tracks where it came from:
 *
 *   source:    The OLX file this block was parsed from (e.g., foo.olx).
 *              Used for save-back, error messages, and re-parse targeting.
 *
 *   parseDeps: Auxiliary files loaded during parsing that affect the output
 *              (e.g., quiz.chatpeg, characters.castpeg). If any change,
 *              the source file must be re-parsed. Also includes assets
 *              processed at parse time (e.g., a video whose metadata is
 *              extracted into OlxJson).
 *
 * Together these enable:
 * - Precise error messages ("syntax error in demos/foo.olx:42")
 * - Dependency tracking (if quiz.chatpeg changes, re-parse foo.olx)
 * - Authoring workflows (knowing which file to save edits back to)
 *
 * Provenance is a *location*, not an *identity*. The same content name
 * (SafeRelativePath "uofa/writing/foo.md") can exist in multiple places
 * simultaneously — a university postgres database, a professor's git repo,
 * an in-memory editing buffer. Each has its own provenance:
 *   pg:profx@uofa.edu://uofa/writing/foo.md
 *   git:profx@github.com/profx/olxrepo://uofa/writing/foo.md
 *   memory:local://uofa/writing/foo.md
 *
 * "Save" might push content from memory: → git:; "publish" from git: → pg:.
 * The true canonical identity is ultimately the content itself (a SHA hash),
 * with paths and provenance serving as mutable pointers.
 *
 * Backed by LofsRef (see address.ts) so address functions (source, addressPath,
 * scheme, etc.) work directly on provenance values.
 *
 * Sub-branded by scheme so TypeScript can distinguish file: from memory:
 * at compile time.
 */
/** file: ref — content loaded from local filesystem */
export type FileLofsRef = LofsRef & { readonly __scheme: 'file' };
/** memory: ref — content from in-memory storage (tests, virtual FS) */
export type MemoryLofsRef = LofsRef & { readonly __scheme: 'memory' };

/**
 * A list of source files involved in an error or operation.
 * Used in OLXLoadingError.location.provenance where a flat list of involved
 * files is the right shape. NOT used on OlxJson — blocks use source + parseDeps.
 */
export type LofsDependencies = LofsCanonical[];


/*
 * ═══════════════════════════════════════════════════════════════════════════════
 * PATH TYPES - How content paths flow through the system
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * In OLX, we'd like authors to have flexibility in how they refer to files.
 * For example, inside /uofa/writing/101/bar.olx, we might reference:
 *   teammates.md
 *   ../teammates.md
 *   /uofm/electronics/teammates.md
 * etc. We call this:
 */
export type OlxRelativePath = string & { __brand: 'OlxRelativePath' };
/*
 * These are really more like IDs than paths — analogous to DefinitionRef
 * for block IDs. They come from user input (OLX attributes, URL params,
 * LLM tool callbacks) and may be invalid (traversal attacks, nonexistent
 * files, etc.). At trust boundaries, we brand them via toOlxRelativePath()
 * which does minimal structural checks (no null bytes, not absolute) but
 * does NOT reject ".." — that's the provider's job during resolution.
 *
 * When an OLX file references another file relatively
 * (src="../foo.md"), we need to resolve that against the referring
 * file's location to get a canonical, unique path, which can be used
 * as a key — just like resolving DefinitionRef → DefinitionKey.  If ../foo.md
 * appears in uofa/writing/101/bar.olx, it resolves to
 * uofa/writing/foo.md. This canonical form is:
 */
export type SafeRelativePath = OlxRelativePath & { __safe: true };
/*
 * Produced by resolveRelativePath(provenance, relativePath). The name
 * emphasizes safety (no directory escape) but the real point is
 * canonicalization: a unique name in the virtual namespace, with "../"
 * resolved away. This is a *name*, not a *location* — the same
 * SafeRelativePath can exist in multiple storage providers simultaneously
 * (postgres, git, in-memory). The provider's toLofsRef() maps
 * from name → location.
 *
 * From here, it must be read from storage. The location in our
 * virtual filesystem is:
 */
export type LofsPath = string & { __brand: 'LofsPath' };
/*
 * This might have a prefix, and be managed differently by different
 * providers. For example:
 *
 * - FileStorageProvider: resolves against baseDir to an absolute path,
 *   validated by resolveSafeReadPath / resolveSafeWritePath (traversal
 *   checks, symlink validation, allowed-directory rules).
 *
 * - NetworkStorageProvider: prepends a namespace ("content/") to form
 *   a wire-format path (LofsPath) for HTTP API calls, then strips it
 *   back on the response side. Validated by contentPaths.ts on the
 *   server. Not every provider needs this — FileStorageProvider goes
 *   straight from OlxRelativePath to the filesystem, and a postgres
 *   provider would use SQL queries.
 *
 * - InMemoryStorageProvider: uses OlxRelativePath directly as a map key.
 *
 * For filesystem I/O specifically, the final resolved absolute path is:
 */
export type FileSystemPath = string & { __brand: 'FileSystemPath', __safe: true };
/*
 * Always produced by resolveSafeReadPath / resolveSafeWritePath. Only
 * relevant to FileStorageProvider.
 *
 * In summary:
 * - The OLX universal types are OlxRelativePath (unresolved) and
 *   SafeRelativePath (canonical).
 * - LofsPath is internal to our virtual filesystem.
 * - FileSystemPath represents a specific file on disk.
 *
 * Safety convention: __safe: true means "verified safe" (escape-checked,
 * canonical). Its absence means "safety not claimed — treat as untrusted."
 * These are TS "soft" checks — documentation for developers and LLMs, not
 * hard enforcement. An `as` cast can bypass them, which is why runtime
 * checks (resolveSafeReadPath, etc.) are needed as well for security and
 * defense-in-depth.
 */



// =============================================================================
// Fields API
// =============================================================================
//
// A FieldInfo is the complete behavioral specification for a piece of block state.
// It declares how the value is stored (events, scope), validated (schema),
// materialized (read), compared (equality), and — eventually — how it's
// reduced and merged across peers.
//
// Fields belong to blocks, not to a global registry. Two blocks can have a
// "value" field with different storage types (plain string vs RgaDoc).
//
// Design direction: each field type (plain, doc, set, counter, ...) will
// carry its own reducer and merge function, enabling:
//   - Offline editing with automatic reconciliation (CRDT merge)
//   - Collaborative editing across peers
//   - Server-side reducers that replay events to reconstruct state
//   - Field-level conflict resolution (last-writer-wins, CRDT, etc.)
//
// See fieldTypes/ for constructors: stateField(), docField(), etc.
// FieldInfo.read = decode: raw Redux → consumer value (see decodeField in redux.ts)
// FieldInfo.write = encode: consumer value → event payload(s) (see updateField in redux.ts)
// =============================================================================

/** Branded type for field names within a block's state. */
export type FieldName = string & { readonly __brand: 'FieldName' };

/** Branded type for event type strings dispatched via logEvent. */
export type FieldEvent = string & { readonly __brand: 'FieldEvent' };

/** Result of a field.write() call — event type + payload to dispatch. */
export interface WriteResult {
  event: FieldEvent;
  payload: Record<string, any>;
}

export interface FieldInfo {
  type: 'field';
  name: FieldName;

  /** Field type discriminator — determines which hook is the primary accessor.
   *  'state' → useFieldState, 'set' → useSet, 'doc' → useDoc (future).
   *  Type-specific hooks validate this and throw on mismatch.
   *  Absent for classic fields (no validation — classic stateField omits kind).
   *  Present on CRDT fields (crdt/state.ts sets 'state', crdt/doc.ts sets 'doc',
   *  crdt/set.ts sets 'set'). */
  kind?: 'state' | 'set' | 'doc' | 'id';

  /** Event types this field dispatches. A plain field has one (e.g. UPDATE_VALUE).
   *  A CRDT field may have several (e.g. SPLICE_INPUT for insert/delete). Future
   *  field types may add more (SET_ADD, SET_REMOVE, COUNTER_INCREMENT, etc.). */
  events: FieldEvent[];

  scope: import('../state/scopes').Scope;

  /** Zod schema for value validation/coercion. Fields without schemas accept any value. */
  schema?: z.ZodType;

  /** Materialize raw Redux value → consumer-facing value. Default: identity.
   *  Examples: RgaDoc → string, SetDoc → Set, CounterDoc → number.
   *  Must be a pure function. Called AFTER useSelector equality check, never inside it. */
  read?: (raw: any) => any;

  /** Equality check for useSelector on the RAW (pre-read) value.
   *  Default: Object.is (referential equality).
   *  CRDTs use referential equality since each mutation produces a new object. */
  equality?: (a: any, b: any) => boolean;

  /** Transform a consumer-facing value into event payload(s) for this field's storage type.
   *  Called by updateField to dispatch the right events.
   *
   *  Examples:
   *  - Plain field: (_, val) => [{ event: 'UPDATE_VALUE', payload: { value: val } }]
   *  - Doc field: (doc, text) => [{ event: 'SPLICE_INPUT', payload: { index, deleteCount, inserted } }]
   *  - Set field: not a single write fn — needs add/remove/clear operations
   *    (will be exposed through useField API, not write)
   *
   *  Returns an array of WriteResult — usually one event, but some operations
   *  may produce multiple (e.g., clear + insert). Empty array = no-op. */
  write?: (oldRaw: any, newValue: any) => WriteResult[];

  /** Field-level reducer. Receives the component's state object and returns a
   *  patch to merge back. The main reducer routes events to field.reduce based
   *  on event type, handles scope/id routing, and merges the result.
   *
   *  Signature: (componentState, action, fieldName) => patch
   *  - componentState: the current state for this component (e.g., state.component[id])
   *  - action: the full event action
   *  - fieldName: which field within the component state
   *  - returns: object to spread into componentState (only changed keys)
   *
   *  Fields without reduce use the default behavior: spread action payload
   *  directly into componentState (plain key-value merge). */
  reduce?: (componentState: Record<string, any>, action: any, fieldName: string) => Record<string, any>;

  /** Human/LLM-readable string representation. Distinct from `read`:
   *  - read: programmatic value (Set, number, structured object)
   *  - display: always a string, for rendering in prompts, summaries, logs
   *
   *  Default (no display fn): String(read(raw)) for primitives, JSON.stringify for objects.
   *  Examples: Set → "apple, banana, cherry". Counter → "42". Doc → same as read. */
  display?: (raw: any) => string;

  /** Event batching strategy for analytics and network efficiency.
   *  Controls how loggers (websocket, server) buffer and flush events.
   *
   *  NOT a state concern — the client-side Redux reducer always runs
   *  immediately on every event. Batching only affects what goes over the wire.
   *
   *  Built-in factories: immediate(), debounce(ms), throttle(ms), aggregate(ms).
   *  Custom strategies via custom(asyncGeneratorFn).
   *  Default (no batching specified): immediate — every event sent as-is.
   *
   *  See fieldTypes/batching.ts for strategy constructors and documentation. */
  batching?: import('../state/fieldTypes/batching').BatchingStrategy;

  // ---------------------------------------------------------------------------
  // Future: serverReduce, merge
  // ---------------------------------------------------------------------------
  //
  // serverReduce?: (componentState, action, fieldName) => patch;
  //   Server-side reducer. Same signature as reduce, but serves different purposes:
  //   - Client reduce: local UX (e.g., gray checkbox on submit)
  //   - Server reduce: social, aggregation, cross-student concerns
  //     (e.g., blue checkbox once server confirms; class-wide analytics;
  //     "3 of your peers also chose B"; teacher dashboards)
  //   These aren't "optimistic vs authoritative" — they do fundamentally
  //   different things. Defaults to reduce if not specified.
  //   Server reducers enable: grade computation, social features, aggregation,
  //   deadline enforcement, per-student overrides, anti-cheat validation.
  //
  // merge?: (local: any, remote: any) => any;
  //   CRDT merge function for reconciling divergent state.
  //   Used when: syncing offline edits, collaborative editing, server-side replay.
  //   Plain (LWW): (local, remote) => remote.ts > local.ts ? remote : local
  //   Doc (RGA): (local, remote) => rgaMerge(local, remote)
  //   Set (OR-Set): (local, remote) => orSetMerge(local, remote)
  //   Counter (G-Counter): (local, remote) => gCounterMerge(local, remote)
  // ---------------------------------------------------------------------------

  // ---------------------------------------------------------------------------
  // URL sync — opt-in per field
  // ---------------------------------------------------------------------------

  /** Sync this field to/from URL search params.
   *  When true, useFieldState reads an initial value from the URL (as fallback
   *  override) and writes back on setValue.
   *
   *  URL key convention:
   *  - Component-scoped: `?blockOlxId.fieldName=value`
   *  - System-scoped: `?fieldName=value`
   *  - If urlDefault is also true: `?blockOlxId=value` (bare, no field name)
   *
   *  Only fields explicitly marked url:true are accessible from the URL.
   *  This is a security boundary — fields like score, correct, etc. must
   *  never be URL-overridable. */
  url?: boolean;

  /** Make this the "bare" URL parameter for its block.
   *  With urlDefault, `?myBlock=someValue` sets this field.
   *  Without it, `?myBlock.fieldName=someValue` is required.
   *  At most one field per block should have urlDefault. */
  urlDefault?: boolean;

  /** Use pushState instead of replaceState when updating the URL.
   *  pushState creates browser history entries (back button navigates).
   *  Default: false (replaceState — URL updates silently). */
  urlPush?: boolean;

  /** @deprecated Use `events[0]` for single-event fields. Kept for backward compatibility
   *  during migration — will be removed once all callers use `events`. */
  event?: string;
}

export interface FieldInfoByEvent { [event: string]: FieldInfo; }

/**
 * Field definitions for a block. Maps field names to FieldInfo.
 * Includes extend() for composing field sets.
 */
export type Fields = Record<string, FieldInfo> & {
  extend: (...more: Fields[]) => Fields;
};

/**
 * A valid JavaScript identifier (e.g., foo, getChoices, _private).
 * Must match /^[a-zA-Z_$][a-zA-Z0-9_$]*$/
 */
export type JavaScriptId = string;

/**
 * Block-local API functions. Keys must be valid JS identifiers
 * since they're called as locals.foo(). Values are any.
 */
export type LocalsAPI = Record<JavaScriptId, any>;

// Blocks
// Blueprint: How we declare / register them.

const ReduxFieldInfo = z.object({
  type: z.literal('field'),
  name: z.string(),
  events: z.array(z.string()),
  event: z.string().optional(),  // deprecated compat
  scope: z.enum(scopeNames),
  schema: z.custom<z.ZodType>().optional(),
  read: z.function().optional(),
  write: z.function().optional(),
  reduce: z.function().optional(),
  display: z.function().optional(),
  equality: z.function().optional(),
});

// Fields schema: { fieldName: FieldInfo, ..., extend?: fn }
// Uses record for dynamic field names. The extend method is validated separately
// since Zod records require uniform value types.
export const ReduxFieldsReturn = z.record(
  z.union([ReduxFieldInfo, z.function()])
);

// === Schema ===
export const BlockBlueprintSchema = z.object({
  name: z.string().optional(),
  namespace: z.string().nonempty(),
  component: z.custom<React.ComponentType<any>>().optional(),
  action: z.function().optional(),
  isGrader: z.boolean().optional().default(false),
  isInput: z.boolean().optional().default(false),
  isMatch: z.boolean().optional().default(false),
  /**
   * Named slots for multi-input graders.
   * When provided, the framework resolves inputs to slots and passes an
   * inputDict object to the grader instead of an array.
   * Example: ['numerator', 'denominator'] for RatioGrader
   */
  slots: z.array(z.string()).optional(),
  /**
   * How to display the answer when "Show Answer" is clicked.
   * - 'per-input': Show next to each input (default)
   * - 'summary': Show once after all inputs
   * - 'custom': Grader handles display (e.g., MCQ highlights choices)
   * - 'none': No answer to show
   */
  answerDisplayMode: z.enum(['per-input', 'summary', 'custom', 'none']).optional(),
  /** Get display answers per slot for multi-input graders. */
  getDisplayAnswers: z.function().optional(),
  parser: z.function().optional(),
  /** Return child block refs for server-side preloading (collectBlockWithKids).
   *  Refs may be bare (DefinitionRef) — the caller qualifies with the parent's namespace. */
  staticKids: z.function().args(z.any()).returns(z.array(z.string())).optional(),
  reducers: z.array(z.function()).optional(),
  fields: ReduxFieldsReturn.optional(),
  selectValue: z.function().optional(),
  /**
   * Advance the block's internal state by one step (e.g. next dialogue line,
   * next sequence item).  Called by the advance tree walker (lib/advance.ts).
   *
   * Return value:
   *   true  — still active (advanced, or waiting on a condition)
   *   false — nothing left to advance (conversation finished, end of sequence)
   *
   * When present, the block OWNS child traversal: the system will NOT
   * auto-walk renderedKids.  Call advanceFrom() on specific children
   * to implement depth-first semantics (e.g. Sequential advances its
   * current child before itself).
   *
   * When absent, the block is a transparent container — the system
   * auto-walks its renderedKids looking for advanceable descendants.
   */
  advance: z.function().optional(),
  /**
   * Read-only check: can this block (or its active subtree) advance?
   * Used for visual feedback (e.g. Sequential dims its Next button when
   * a child is still advanceable).
   *
   * Same ownership rule as advance: when present, the block owns child
   * traversal.
   */
  canAdvance: z.function().optional(),
  /**
   * Block-local API functions that expose the block's logic separately from its UI.
   *
   * While the React component (_Block.jsx) handles presentation, `locals` contains
   * the block's business logic as reusable functions. This separation enables:
   * - Server-side execution (grading, analytics) without React dependencies
   * - Cross-block communication (e.g., graders querying input metadata)
   * - Cleaner testing of logic independent of rendering
   *
   * Each function receives (props, state, id, ...args) when called through the API.
   * When passed to graders, these are pre-bound so graders just call fn(...args).
   *
   * Example for ChoiceInput:
   *   locals: {
   *     getChoices: (props, state, id) => {
   *       // Returns [{ id, tag, value }, ...] for Key/Distractor children
   *     }
   *   }
   *
   * A grader would then call: inputApi.getChoices() to get the choices.
   */
  locals: z.record(z.string(), z.any()).optional(),
  extraDebug: z.custom<React.ComponentType<any>>().optional(),
  description: z.string().optional(),
  /**
   * Marks this block as internal/system use only.
   * Internal blocks are hidden from the main documentation navigation
   * and grouped separately, as they're not intended for direct use by
   * course authors.
   */
  internal: z.boolean().optional(),
  /**
   * Optional category override for documentation grouping.
   * By default, blocks are grouped by their directory location (e.g., 'input', 'grading').
   * Set this to override the default categorization without moving the file.
   * Example: A grader block in the 'input' directory can set category: 'grading'
   * to appear under the Grading section in documentation.
   */
  category: z.string().optional(),
  /**
   * Controls whether this block type requires unique IDs in the content.
   *
   * - `true` (default): All instances must have unique IDs, enforces strict uniqueness
   * - `false`: Allows duplicate IDs, useful for content blocks like TextBlock/Markdown
   */
  requiresUniqueId: z.boolean().optional(),
  /**
   * What kind of children this block's parser accepts.
   * Set automatically by standard parsers (blocks, text, ignore, etc.).
   * Used by CodeMirror XML schema for autocompletion:
   *   'blocks' — suggests block names as children
   *   'text'   — no child element suggestions (text content)
   *   'none'   — self-closing / no children
   *   undefined — custom parser (permissive: suggests all block names)
   */
  childMode: z.enum(['blocks', 'text', 'none']).optional(),
  /**
   * Zod schema for validating block attributes at parse time and render time.
   * If defined, invalid attributes produce errors in parseOLX and DisplayError at render.
   */
  attributes: z.custom<z.ZodTypeAny>().optional(),
  /**
   * Semantic validation for attributes beyond what Zod schema can express.
   * Called after Zod parsing succeeds. Use for domain-specific validation like:
   * - NumericalGrader: answer must be a valid number/range
   * - StringGrader with regexp=true: answer must be a valid regex
   *
   * @param attrs - The parsed attributes (after Zod transforms)
   * @returns Array of error messages, or empty/undefined if valid
   */
  validateAttributes: z.function()
    .args(z.record(z.string(), z.any()))
    .returns(z.array(z.string()).optional())
    .optional(),
  /**
   * Structural validation for children, called after children are parsed.
   * Receives the raw kids value (string, array, etc.) and the idMap for
   * looking up any block by ID (tag, attributes, nested kids, etc.).
   *
   * Use for checking grader/input compatibility, required children,
   * ordering constraints, etc.
   *
   * @param kids - The parsed kids value (same shape stored in idMap)
   * @param idMap - The full parsed content map for resolving block references
   * @returns Array of error messages, or empty/undefined if valid
   */
  validateChildren: z.function()
    .args(z.any(), z.any())
    .returns(z.array(z.string()).optional())
    .optional(),
  /**
   * Zod schema describing the type of value this input produces.
   * Used for automatic compatibility checking with graders.
   * Example: z.string() for ChoiceInput, z.array(z.string()) for CheckboxInput.
   */
  valueSchema: z.custom<z.ZodType>().optional(),
  /**
   * Zod schema describing the type of input value this grader accepts.
   * Used for automatic compatibility checking with inputs.
   * Example: z.string() for KeyGrader, z.array(z.string()) for CheckboxGrader.
   */
  inputSchema: z.custom<z.ZodType>().optional(),
  /**
   * Declares that this block requires a parent grader in the hierarchy.
   * When true, render will inject `graderId` into props or show DisplayError if not found.
   */
  requiresGrader: z.boolean().optional(),
  /**
   * Returns the answer to display (may differ from grading answer).
   */
  getDisplayAnswer: z.function().optional(),
  /**
   * PEG grammar extensions used by this block (e.g. ['chatpeg']).
   * Auto-populated by peggyParser() for the 95% case; set manually
   * on the blueprint for blocks that use grammars without peggyParser().
   */
  grammars: z.array(z.string()).optional(),
}).strict();

export type BlockBlueprint = z.infer<typeof BlockBlueprintSchema>;

/**
 * LoBlock - a Learning Observer block type (code, not content).
 *
 * Created from BlockBlueprint by factory.tsx. Stored in BlockRegistry.
 *
 * The block lifecycle:
 *   BlockBlueprint (what devs write) → LoBlock (processed) → OlxJson (instance) → OlxDomNode (rendered)
 */

/**
 * Selector that extracts a block's "value" from Redux state.
 *
 * Called by valueSelector/useValue to read what an input block exports
 * (e.g., a string for LineInput, a number for NumberInput, an object for
 * MatchingInput). Also used by non-input blocks (Ref, Tabs, Navigator)
 * for programmatic value access.
 *
 * For blocks using withStatus, the return type is BlockDataResult & { value }.
 */
export type ValueSelectorFn = (props: RuntimeProps, state: any, stateKey: StateKey) => any;

export interface LoBlock {
  component: React.ComponentType<any>;
  _isBlock: true;
  action?: Function;
  parser?: Function;
  staticKids?: (entry: OlxJson) => DefinitionRef[];
  reducers: Function[];
  selectValue?: ValueSelectorFn;
  /** Advance one step. See BlockBlueprintSchema.advance for semantics. */
  advance?: (props: RuntimeProps, state: any) => boolean;
  /** Can this block advance? See BlockBlueprintSchema.canAdvance for semantics. */
  canAdvance?: (props: RuntimeProps, state: any) => boolean;
  locals: Record<string, any>;
  fields: Fields;
  name: OLXTag;  // Block name — always set by factory (inferred from component name if not in blueprint)
  description?: string;
  namespace: string;
  isInput: boolean;
  isMatch: boolean;
  isGrader: boolean;
  /**
   * Marks this block as internal/system use only.
   * Internal blocks are hidden from the main documentation navigation.
   */
  internal?: boolean;
  /**
   * Optional category override for documentation grouping.
   * Overrides directory-based categorization without moving the file.
   */
  category?: string;
  /**
   * Controls whether this block type requires unique IDs in the content.
   *
   * - `true` (default): All instances must have unique IDs, enforces strict uniqueness
   * - `false`: Allows duplicate IDs, useful for content blocks like TextBlock/Markdown
   * - `'children'`: Recursively check if ANY child blocks require unique IDs. If any child
   *   requires uniqueness, this block will also require uniqueness. Useful for container
   *   blocks that may contain interactive content.
   * - `function`: Custom logic to determine uniqueness requirement at parse time.
   *   Receives context including parsed content, attributes, and current state.
   */
  requiresUniqueId?: boolean;
  /**
   * What kind of children this block's parser accepts.
   * Set automatically by standard parsers. Used for editor autocompletion.
   */
  childMode?: 'blocks' | 'text' | 'none';
  /**
   * Zod schema for validating block attributes at parse time and render time.
   */
  attributes?: z.ZodTypeAny;
  /**
   * Semantic validation for attributes beyond what Zod schema can express.
   * Returns array of error messages or undefined if valid.
   */
  validateAttributes?: (attrs: Record<string, any>) => string[] | undefined;
  /**
   * Structural validation for children, called after children are parsed.
   * Receives the raw kids value and a function to look up a block's tag by ID.
   */
  validateChildren?: (kids: any, idMap: IdMap) => string[] | undefined;
  /**
   * Zod schema describing the type of value this input produces.
   */
  valueSchema?: z.ZodType;
  /**
   * Zod schema describing the type of input value this grader accepts.
   */
  inputSchema?: z.ZodType;
  /**
   * Declares that this block requires a parent grader in the hierarchy.
   */
  requiresGrader?: boolean;
  /**
   * Returns the answer to display (may differ from grading answer).
   */
  getDisplayAnswer?: (props: any) => any;
  /**
   * Named slots for multi-input graders.
   * When provided, the framework resolves inputs to slots and passes an
   * inputDict object to the grader instead of an array.
   */
  slots?: string[];
  /**
   * How to display the answer when "Show Answer" is clicked.
   * - 'per-input': Show next to each input (default)
   * - 'summary': Show once after all inputs
   * - 'custom': Grader handles display (MCQ highlights, etc.)
   * - 'none': No answer to show
   */
  answerDisplayMode?: 'per-input' | 'summary' | 'custom' | 'none';
  /**
   * Returns display answers per slot for multi-input graders.
   * Used when answerDisplayMode is 'per-input' with slots defined.
   */
  getDisplayAnswers?: (props: any) => Record<string, any>;

  // Documentation properties (added by generateBlockRegistry at build time)
  /** Path to the block's source file relative to project root */
  source?: string;
  /** Path to the block's README.md documentation file */
  readme?: string;
  /** Git status of the README file */
  readmeGitStatus?: BlockGitStatus;
  /** Key into examples dict for editor insert template (bare block) */
  template?: string;
  /** Key into examples dict for docs marquee example (minimum working example with context) */
  demo?: string;
  /** Example OLX files keyed by filename. template/demo are keys into this dict. */
  examples?: Record<string, { path: string; gitStatus?: BlockGitStatus }>;
  /** Git status of the block source file */
  gitStatus?: BlockGitStatus;
  /** PEG grammar extensions used by this block (e.g. ['chatpeg']) */
  grammars?: string[];
}

export interface BlockRegistry {
  [tag: string]: LoBlock;  // Maps OLX tag names (e.g., "ChoiceInput", "Vertical") to block implementations
}

/** @deprecated Use BlockRegistry instead */
export type ComponentMap = BlockRegistry;

export type ComponentError = string | null;
export type ParseError = string | null | {
  type: 'missing_component' | 'missing_static_kids';
  tag: OLXTag;
  node: string;
  message: string;
};

/**
 * KidEntry — a single child element in a parsed block structure.
 *
 * Standard OLX parsing produces arrays of these entries as the `kids` field
 * of an OlxJson block.  Each variant represents a different kind of child:
 *
 *   block  — reference to another block:  <MCQ id="q1">...</MCQ>
 *   text   — literal text content:        Some paragraph text
 *   xml    — raw XML string (lossy):      <foo bar="baz"/>
 *   cdata  — CDATA section:               <![CDATA[...]]>
 *   html   — HTML element with children:  <div class="x">...</div>
 *   custom — parser-specific node type (see below)
 *
 * PARENTCONTEXT
 * -------------
 * Any entry can carry `parentContext` — opaque metadata from the parent
 * block's parser about how to present this child.  The child block never
 * sees it; only the parent's rendering logic reads it.
 *
 * Example: chatpeg embed with display hints:
 *
 *   ::video_1 [display=fullscreen title="Theory of Foo"]
 *
 *   → { type: 'block', id: 'video_1',
 *       parentContext: { display: 'fullscreen', title: 'Theory of Foo' } }
 *
 * The Video block renders normally.  _Chat.tsx reads parentContext to
 * decide whether to show it inline, expanded, or fullscreen.
 *
 * CUSTOM ENTRIES
 * --------------
 * PEG-parsed blocks (Chat, MarkupProblem, etc.) can produce domain-specific
 * node types that don't map to standard block/text/html.  The `custom`
 * variant gives them a place in the kids type system:
 *
 *   Kim: Did you read the study? [face=smile]
 *
 *   → { type: 'custom', subtype: 'line',
 *       data: { speaker: 'Kim', text: 'Did you read the study?', face: 'smile' } }
 *
 * `subtype` is a parser-specific discriminator (e.g. 'line', 'pause',
 * 'wait', 'arrow').  `data` carries the payload — the parent block knows
 * its own subtypes and narrows accordingly.  The kids system treats custom
 * entries as opaque.
 */

/** Opaque context from the parent block's parser about how to present a child.
 *  Read by the parent's rendering logic; invisible to the child block itself.
 *  Example: `{ display: 'fullscreen', title: 'Theory of Foo' }` from a
 *  chatpeg embed directive `::video_1 [display=fullscreen title="Theory of Foo"]`. */
export type ParentContext = Record<string, JSONValue>;

export type KidEntry =
  | { type: 'block'; id: DefinitionRef; overrides?: Record<string, JSONValue>; parentContext?: ParentContext }
  | { type: 'text'; text: string; parentContext?: ParentContext }
  | { type: 'xml'; xml: string; parentContext?: ParentContext }
  | { type: 'cdata'; value: string; parentContext?: ParentContext }
  | { type: 'html'; tag: string; attributes: Record<string, JSONValue>; kids: KidEntry[]; parentContext?: ParentContext }
  | { type: 'custom'; subtype: string; data: Record<string, JSONValue>; parentContext?: ParentContext };

/**
 * PeggyKids<T> — typed wrapper for PEG parser output stored as kids.
 *
 * peggyParser() in parsers.ts wraps grammar output as { type: 'parsed', parsed }.
 * This type makes the shape explicit so block components can access `kids.parsed`
 * without casting through `any`.
 *
 * Usage in a block component:
 *
 *   const parsed = (kids as PeggyKids<ParsedConversation>).parsed;
 *
 * See parsers.ts peggyParser() for how this structure is produced.
 */
export interface PeggyKids<T> {
  type: 'parsed';
  parsed: T;
}

/**
 * OlxDomNode - a node in the dynamic OLX DOM tree.
 *
 * Created at render time (not parse time). Has parent/child relationships
 * for traversal by the action system. Distinct from:
 * - OlxJson (static parsed content in idMap)
 * - React DOM (the actual browser rendering)
 */
export interface OlxDomNode {
  olxJson: OlxJson;
  stateKey: StateKey;  // Scoped runtime key (idPrefix + id), e.g. "factors:0:factor"
  renderedKids: Record<StateKey, OlxDomNode>;
  parent?: OlxDomNode;
  loBlock: LoBlock;
  sentinel?: string;  // 'root' for root node
  runtime: LoBlockRuntimeContext;  // Stored at render time (render.tsx) for actions/valueSelector
}

/** Selector function for filtering OlxDomNodes in DOM traversal */
export type OlxDomSelector = (node: OlxDomNode) => boolean;


// =============================================================================
// Cast of characters — types derived from Zod schemas in cast.ts.
// Schemas are the single source of truth; types are re-exported here
// so the rest of the codebase can import from types.ts as usual.
// =============================================================================

import type { Cast, OpenPeeps, CastMember, FaceExpression, AvatarStyleValue } from '@/lib/avatar/types';
export type { OpenPeeps, CastMember, Cast, FaceExpression, AvatarStyleValue };

/**
 * LoBlockRuntimeContext - runtime configuration that flows through the component tree.
 *
 * Contains system-wide runtime properties that may change based on context:
 * - blockRegistry: Registry of all available block blueprints
 * - store: Redux store (may be historical during replay mode)
 * - logEvent: Event logging function (no-op during replay)
 * - sideEffectFree: True during replay - disables fetches and logging
 * - olxJsonSources: Priority-ordered list of Redux source names for OlxJson lookup
 * - idPrefix: Scope prefix for Redux state keys (changes at list boundaries)
 *
 * This is bundled into RuntimeProps to enable easier addition of new runtime properties
 * (like locale) without full prop-threading updates.
 */
export interface LoBlockRuntimeContext {
  blockRegistry: BlockRegistry;
  store: Store;
  logEvent: (event: string, payload: any) => void;  // Event logging - no-op during replay
  sideEffectFree: boolean;  // True during replay - disables fetches, event logging, etc.
  olxJsonSources?: string[];  // Redux source names in priority order for OlxJson lookup
  idPrefix?: IdPrefix;  // Scope prefix for Redux state (changes at list boundaries)
  ns: ContentNamespace;  // Content namespace — identifies the logical content source
  locale: LocaleContext;  // Language and text direction
  cast: Cast;  // Cast of characters
}

/**
 * RuntimeProps - the context bag passed through the system.
 *
 * This is a hybrid of three things (pragmatic compromise for React):
 * 1. Opaque context (nodeInfo, runtime) - thread through, don't inspect
 * 2. Block machinery (loBlock, fields, locals) - framework injects these
 * 3. OLX attributes - flow in via [key: string]: any
 *
 * Most functions just pass props through without inspecting. Blocks destructure
 * only what they need (usually just attributes and fields).
 */

/**
 * BaselineProps - Minimal props for global/system context.
 *
 * Used in global components (LanguageSwitcher, RenderOLX initialization) and
 * functions that only need access to the runtime context (store, logEvent, locale).
 *
 * Most system-level functions (settings access, locale selection, logging) only
 * require BaselineProps, not the full RuntimeProps with block-specific machinery.
 *
 * FUTURE: As we establish global context infrastructure (root page context, DOM
 * navigation, global state), some fields from RuntimeProps may migrate here:
 * - rootId: Global page identifier for resolving /absolute references
 * - domPath: Path through OLX DOM tree for context-aware resolution
 * - breadcrumbs: Stack of ancestor IDs for relative reference resolution
 * - globalFields: System-level state fields (vs block-scoped fields in RuntimeProps)
 *
 * The distinction is: BaselineProps has things that exist globally and propagate
 * everywhere; RuntimeProps has things specific to rendering a particular block.
 */
export interface BaselineProps {
  runtime: LoBlockRuntimeContext;  // Required - contains store, logEvent, locale, blockRegistry
}

/**
 * CurrentUser - identity of the logged-in user, as resolved by the server.
 *
 * The server's auth pipeline (HTTP Basic via nginx, LTI, password file,
 * guest cookie, etc.) echoes the resolved identity back over the WebSocket
 * in a `{status: 'auth', ...}` message. websocketLogger stashes it in its
 * storage shim and dispatches a DOM CustomEvent; reduxLogger consumes that
 * event and dispatches SET_CURRENT_USER to land the object here, at
 * state.system.currentUser (via the settings.currentUser field).
 *
 * Currently minimal: just user_id (client-side) and safe_user_id (server-
 * side persistence key, scoped by auth provider so two providers' "mchen"
 * don't collide).
 *
 * Profile and display-name fields are commented out below. They originated
 * from Learning Observer, which started from Google Classroom's roster
 * format (itself based on Google OIDC claims: given_name, family_name,
 * etc.). The rationale was to avoid reinventing wheels — Google put real
 * work into those formats, and starting from them gave us documentation
 * and compatibility for free. But the decomposition doesn't map well to
 * what we actually need:
 *
 *   1. user_id — system identifier ("mchen")
 *   2. display name — context-dependent social label. Could be "Maggie",
 *      "mchen", "Dr. Chen", or "陈美琳" depending on locale, role, and
 *      social context (student vs scholar, formal vs informal). Open
 *      question whether this is systemwide or via props/PMSS.
 *   3. legal name — full formal name ("Margaret Chen"), rarely displayed
 *
 * Google's given_name/family_name split bakes in Western name structure
 * and doesn't capture any of these three cleanly. We'll revisit when we
 * actually need display names in the UX.
 */
export interface CurrentUser {
  /** Unencoded user identifier from the auth provider (e.g., "mchen"). */
  user_id: string;
  /**
   * Provider-prefixed key for server-side persistence (e.g., "nginx-mchen").
   * Scoped by provenance so identities from different auth providers don't
   * collide — two providers may each have an "mchen" who are different people.
   */
  safe_user_id?: string;
  /** Which auth provider resolved this identity: 'nginx', 'pwd', 'gcu', 'lti', 'guest', etc. */
  provenance?: string;

  // --- Profile fields (from LO / Google Classroom heritage) ---
  // Commented out until we need them. See docstring above for design notes.
  // When re-enabled, these should be redesigned around the three use cases
  // (system id, display name, legal name) rather than the OIDC decomposition.
  //
  // email?: string;
  // name?: string;           // LO mapped Google OIDC given_name here
  // family_name?: string;    // Google OIDC family_name
  // picture?: string;        // avatar URL
  // role?: 'student' | 'teacher' | 'admin';
  // authorized?: boolean;

  /** Forward-compat: new fields added server-side flow through without a type change. */
  [key: string]: any;
}

export interface RuntimeProps extends BaselineProps {
  // This block's identity and content
  id: DefinitionKey;
  kids: JSONValue;

  // Opaque context - thread through
  nodeInfo: OlxDomNode;

  // Block machinery - framework injects these
  loBlock: LoBlock;
  fields: Fields;
  locals: LocalsAPI;  // {} if none, not undefined

  // OLX attributes flow in here
  [key: string]: any;
}

/**
 * OlxJson - Parsed content for a single block in a specific variant.
 *
 * Represents the structure and metadata for a block at render time.
 * Each block can have multiple OlxJson entries in idMap[blockId] - one per ContentVariant.
 *
 * Metadata cascades down from file-level through element hierarchy:
 * 1. File-level metadata (from YAML comment at top of OLX file)
 * 2. Parent element metadata (inherited by children unless overridden)
 * 3. Element-level metadata (from preceding comment or element attributes)
 *
 * Note: The `lang` field represents the language/variant of THIS specific OlxJson entry.
 * It's separate from the ContentVariant key (idMap[id][variant]) which may evolve to
 * include feature flags (e.g., "en-Latn-US:audio-only"). The `lang` field stays as a
 * simple BCP 47 code for now, identifying which language variant this entry represents.
 */
export interface OlxJson {
  id: DefinitionKey;
  tag: OLXTag;
  attributes: Record<string, JSONValue>;  // Always present, defaults to {} in parsing
  kids?: JSONValue;  // Child nodes, or a string from text parsers
  /** The OLX file this block was parsed from. */
  source: LofsCanonical;
  /** Auxiliary files loaded during parsing that affect this block's output
   *  (e.g., .chatpeg grammars, assets processed at parse time). If any
   *  change, the source file must be re-parsed. */
  parseDeps: LofsCanonical[];

  // Optional metadata (from YAML frontmatter or parsed attributes)
  /** Brief description of this content block (for search, activity cards, etc.) */
  description?: string;
  /** Content category for filtering/organization (e.g., "psychology", "writing", "demo") */
  category?: string;
  /** Numeric sort index within a category. Positive = front, negative = end, unset = middle (alphabetical). Fractions allowed. */
  index?: number;
  /** BCP 47 language tag identifying which language/variant this OlxJson represents (e.g., 'en-Latn-US', 'ar-Arab-SA') */
  lang?: string;
  /** Generation provenance. Absent on human-authored content.
   *  Present on machine-generated content (translations, build outputs).
   *  Truthy check (!!generated) replaces the old autogenerated boolean. */
  generated?: {
    method: 'machineTranslated' | 'build';
    source_file?: string;     // source file that was translated or processed
    source_version?: string;  // hash of source at generation time
  };

  /**
   * INTERIM: byte offset of this element's opening `<` within its source
   * XML, captured from fast-xml-parser's `captureMetaData` option in
   * parseOLX.ts. The `_` prefix flags this as a temporary placement.
   *
   * Eventual home: folded into the provenance URI itself, e.g.
   * `file:content://foo.olx#L3:3` or `file:content://foo.olx#char=36,55` (RFC 5147), so
   * one provenance value carries source identity AND span. When that
   * lands, this field goes away.
   *
   * OPEN QUESTION (decide when authoring tooling forces it):
   * The shape of this field is wrong for any consumer outside parseOLX.
   * Byte offset is only convertible to line/col with the original XML
   * string in scope, and the source string only exists during parse.
   * Right now the only consumer is parseOLX itself (the duplicate-id
   * message), where xml IS in scope, so it works — but as soon as
   * something downstream (an authoring UI badge, an editor jump-to,
   * the warning panel) wants line/col, it can't get there from here.
   *
   * Three options when we revisit:
   *   A) Keep just `_sourceOffset` (status quo). Cheapest, but downstream
   *      consumers are blocked.
   *   B) Replace with `_sourceLine` / `_sourceColumn` computed at parse
   *      time. Matches the eventual `#L3:3` URI fragment shape and is
   *      what humans actually read. Drops the byte offset (which is an
   *      FXP implementation detail).
   *   C) Store all three. "More complete" but the offset is only useful
   *      to a hypothetical IDE-jump consumer.
   */
  _sourceOffset?: number;
}

/**
 * IdMap - Content index mapping block IDs to their available variants.
 *
 * Structure: Maps each block ID to a variant map, where each variant is a
 * different version of that block (language, accessibility, context, etc.).
 *
 * Enables multi-dimensional content variants:
 * - Language: "en-Latn-US", "ar-Arab-SA", "pl-Latn-PL"
 * - Feature variants (future): "en-Latn-US:audio-only", "en:low-bandwidth"
 * - Wildcard fallback: "*" (matches any variant if no better match)
 *
 * CURRENT STATE:
 * - Keys are language codes (BCP 47): "en-Latn-US", "ar-Arab-SA"
 * - One variant per block per language
 *
 * FUTURE STATE:
 * - Keys are compound variants: "en-Latn-US:audio-only", "ar-Arab-SA:vision-impaired"
 * - Multiple variants per language (language + feature combinations)
 * - Structured variant matching with BCP 47 language hierarchy fallback
 *
 * EXAMPLE:
 * ```
 * idMap = {
 *   "my-problem": {
 *     "en-Latn-US": OlxJson { id, tag, attributes, ... },
 *     "ar-Arab-SA": OlxJson { id, tag, attributes, ... },
 *     "en-Latn-US:audio-only": OlxJson { ... },  // Future
 *     "*": OlxJson { ... }  // Wildcard fallback (Future)
 *   },
 *   "another-block": {
 *     "en-Latn-US": OlxJson { ... },
 *     ...
 *   }
 * }
 * ```
 */
/** All variants of a single block: { 'en-Latn-US': OlxJson, 'ar-Arab-SA': OlxJson, ... } */
export type VariantMap = { [variant: ContentVariant]: OlxJson };

export interface IdMap {
  [id: DefinitionKey]: VariantMap;
}

/**
 * GraphNode - A node in the content dependency graph.
 * Represents a single block and its metadata.
 */
export interface GraphNode {
  id: DefinitionKey;  // Block ID that this node represents
  data: {
    label: string;
    attributes: Record<string, JSONValue>;
    tag: OLXTag;
    source?: any;
    parseDeps?: any;
  };
  position: { x: number; y: number };
  type: string;
}

/**
 * GraphEdge - An edge in the content dependency graph.
 * Represents a reference from one block to another.
 */
export interface GraphEdge {
  id: string;  // Edge ID (graph-specific, not a block ID)
  source: DefinitionKey;  // Source block ID
  target: DefinitionKey;  // Target block ID
}

/**
 * ═══════════════════
 * BLOCK DATA STATUS
 * ═══════════════════
 *
 * Standard result type for block data access. All hooks and selectors that
 * retrieve block data by ID return this shape (extended with their primary
 * field: `value`, `block`, `olxJson`, etc.).
 *
 * This represents the state machine for block loading:
 *   unknown → loading → ready | error
 *                              ↓
 *                     (future: translanguaging)
 *
 * Blocks that don't care about loading states can just destructure the
 * primary field: `const { value } = useValue(props, id)`. The system
 * provides a usable fallback while loading.
 *
 * Blocks that DO care (like Ref) can check `loading` or `error` to
 * show spinners or error messages.
 */
export type BlockDataStatus = 'ready' | 'loading' | 'error';
// Future: | 'translanguaging'

export interface BlockDataResult {
  status: BlockDataStatus; // Low level: prefer the derived booleans below
  loading: boolean;        // status === 'loading' or not yet in Redux
  ready: boolean;          // status === 'ready'
  error: string | null;    // Error message (for DisplayError), null if no error
}

// Content tier - computed from `generated` field
// - 'supported': Human-authored or reviewed content (generated absent)
// - 'bestEffort': Machine-generated content (generated present)
// Future: Computation can become more complex (e.g., generated + reviewed by 2 people = supported)
export type ContentTier = 'supported' | 'bestEffort';
