// packages/shared/lib/types.ts
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
import { scopeNames } from './state/scopes';
import type { Store } from 'redux';

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
 * ═══════════
 * ERROR TYPES
 * ═══════════
 *
 * Error type hierarchy:
 *
 *   AppError                  — Base error value type (lib/errors.ts)
 *     └─ OLXLoadingError      — Content loading/parsing errors (adds type, summary, file)
 *
 * AppError is the canonical error shape. It aligns with DisplayError props
 * so you can spread one into the other: <DisplayError {...error} />.
 *
 * OLXLoadingError extends AppError with content-pipeline-specific fields
 * (error type tag, human summary, source file). Any code that accepts
 * AppError also accepts OLXLoadingError.
 *
 * ErrorNode (the block) receives AppError as kids and passes through to
 * DisplayError. It doesn't need to know which subtype it has.
 *
 * Future directions:
 * - Other error subtypes (e.g. NetworkError, ValidationError) can extend
 *   AppError the same way OLXLoadingError does.
 * - DisplayError could gain location awareness (render line/column info)
 *   so ErrorNode doesn't need to format it.
 * - Consider whether the error panel (which uses OLXLoadingError[]) should
 *   accept AppError[] and use type narrowing for subtype-specific rendering.
 */

import type { AppError } from '@/lib/errors';

// OLX Content Loading Errors
export interface OLXLoadingError extends AppError {
  type: 'parse_error' | 'duplicate_id' | 'file_error' | 'peg_error' | 'attribute_validation' | 'metadata_error';
  /** Human-readable summary for display (e.g. "Error in file header") */
  summary: string;
  file: string;
}

/**
 * ════════
 * ID TYPES
 * ════════
 *
 * The ID system has four layers, from authored content to runtime state.
 * Branded types enforce correct usage at compile time.
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │                        CONVERSION PATHWAYS                           │
 * │                                                                      │
 * │  OlxReference ──refToOlxKey()──────> OlxKey                          │
 * │      │                                  │                            │
 * │      │   refToReduxKey(props)           │  Content lookup in Redux   │
 * │      │   (combines with IdPrefix)       │  (selectBlock, ensureBlock)│
 * │      v                                  │                            │
 * │  ReduxStateKey ─reduxKeyToOlxKey()──> OlxKey  (leaf block)           │
 * │      │              ↑                                                │
 * │      │              │ Last non-ScopeMarker segment                   │
 * │      │              │ (OlxKeys cannot contain ':' or start with '#') │
 * │      │                                                               │
 * │  ReduxStateKey ─allOlxKeys()──> OlxKey[]  (all blocks in scope)      │
 * │                                                                      │
 * │  IdPrefix + OlxKey ──refToReduxKey()──> ReduxStateKey                │
 * │                                                                      │
 * │  extendIdPrefix(props, [id, scopeMarker(index)]) → IdPrefix          │
 * │    Blocks like DynamicList create scoped prefixes                    │
 * └──────────────────────────────────────────────────────────────────────┘
 *
 * SCOPE MARKERS
 * -------------
 * Segments in a ReduxStateKey that start with '#' are ScopeMarkers —
 * instance indices, attempt numbers, etc. They are NOT loadable block IDs.
 * All other segments are valid OlxKeys.
 *
 * Constructed via scopeMarker(label): e.g. scopeMarker(0) → '#0'
 * Format: #[0-9a-zA-Z_]+
 *
 * Examples:
 *   OlxReference:  "resistorProblem", "/mit.edu/6002x/resistorProblem"
 *   OlxKey:        "resistorProblem" (canonical, for content lookup)
 *   ScopeMarker:   "#0", "#attempt_2" (instance scoping, not a block ID)
 *   IdPrefix:      "myList:#0" (DynamicList "myList", instance 0)
 *   ReduxStateKey: "myList:#0:resistorProblem" (scoped state key)
 *
 * The ':' delimiter (REDUX_SCOPE_SEPARATOR) is reserved — forbidden in
 * user-authored IDs. This makes decomposition deterministic:
 *   reduxKeyToOlxKey("myList:#0:resistorProblem") → "resistorProblem"
 *   allOlxKeys("myList:#0:resistorProblem")       → ["myList", "resistorProblem"]
 *
 * See docs/redux-key-decomposition.md for full design documentation.
 */

// Valid ID segments: [a-zA-Z_][a-zA-Z0-9_]* (no hyphens, dots, colons, slashes, commas).
// Auto-generated IDs are "_" + SHA1 hex hash.
// See idResolver.ts VALID_ID_SEGMENT for the canonical regex and delimiter conventions.

// User-authored reference as found in source OLX.
// Created via toOlxReference(string, context).
export type OlxReference = string & { __brand: 'OlxReference' };

// Canonical content key — used for content lookup in Redux (selectBlock, ensureBlock).
// Created via refToOlxKey(ref) — strips path prefixes and scope prefixes.
export type OlxKey = OlxReference & { __resolved: true };

// Scoping prefix for blocks rendered in repeating contexts (DynamicList, MasteryBank, etc.).
// Created via extendIdPrefix(props, [id, scopeMarker(index)]).
// Format: colon-delimited segments, e.g. "mylist:#0" or "bank:#attempt_2".
export type IdPrefix = string & { __brand: 'IdPrefix' };

// Scoped state key — used for Redux state access (field values, correctness, etc.).
// Created via refToReduxKey(props) — combines IdPrefix + OlxKey.
// Format: "prefix:baseId" or just "baseId" if no prefix.
// The target= attribute in OLX always contains a ReduxStateKey.
export type ReduxStateKey = string & { __brand: 'ReduxStateKey' };

// A non-OlxKey scope segment in a ReduxStateKey. Format: #[0-9a-zA-Z_]+
// Marks instance indices, attempt numbers, etc. — NOT loadable block IDs.
// Created via scopeMarker(label) in idResolver.ts.
// Examples: "#0" (list instance), "#attempt_2" (mastery bank attempt)
export type ScopeMarker = string & { __brand: 'ScopeMarker' };

// React Keys and HTML IDs have different uniqueness constraints:
export type ReactKey = string & { __brand: 'ReactKey' };          // React reconciliation
export type HtmlId = string & { __brand: 'HtmlId' };              // DOM element ID

// OLX element tag name (e.g., "Vertical", "Sequential", "ChoiceInput")
export type OLXTag = string & { __brand: 'OLXTag' };


/**
 * ═══════════
 * Provenances
 * ═══════════
 *
 * Every piece of parsed content carries a provenance chain — an array of
 * URIs recording where it came from. For a block in foo.olx that includes
 * quiz.chatpeg, that chain might be:
 *   ["file:///content/demos/foo.olx", "file:///content/demos/quiz.chatpeg"]
 *
 * This enables:
 * - Precise error messages ("syntax error in demos/foo.olx:42")
 * - Dependency tracking (if quiz.chatpeg changes, re-parse foo.olx)
 * - Authoring workflows (knowing which file to save edits back to)
 *
 * Provenance is a *location*, not an *identity*. The same content name
 * (SafeRelativePath "uofa/writing/foo.md") can exist in multiple places
 * simultaneously — a university postgres database, a professor's git repo,
 * an in-memory editing buffer. Each has its own provenance:
 *   postgres://profx@uofa.edu/uofa/writing/foo.md
 *   git://profx@github.com/profx/olxrepo/uofa/writing/foo.md
 *   inline://uofa/writing/foo.md
 *
 * "Save" might push content from inline → git; "publish" from git → postgres.
 * The true canonical identity is ultimately the content itself (a SHA hash),
 * with paths and provenance URIs serving as mutable pointers.
 *
 * Providers construct provenance URIs — parsers should never need to know
 * about schemes. See StorageProvider.toProvenanceURI().
 *
 * Sub-branded by scheme so TypeScript can distinguish file:// from memory://
 * at compile time. Runtime checks (startsWith('file://')) stay as
 * defense-in-depth — `as` casts and JS callers bypass brands.
 */
/** Any provenance URI — base brand for all schemes */
export type ProvenanceURI = string & { __brand: 'Provenance' };
/** file:// provenance — content loaded from local filesystem */
export type FileProvenanceURI = ProvenanceURI & { __scheme: 'file' };
/** memory:// provenance — content from in-memory storage (tests, virtual FS) */
export type MemoryProvenanceURI = ProvenanceURI & { __scheme: 'memory' };

/** Primary representation for provenance references */
export type Provenance = ProvenanceURI[];


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
 * These are really more like IDs than paths — analogous to OlxReference
 * for block IDs. They come from user input (OLX attributes, URL params,
 * LLM tool callbacks) and may be invalid (traversal attacks, nonexistent
 * files, etc.). At trust boundaries, we brand them via toOlxRelativePath()
 * which does minimal structural checks (no null bytes, not absolute) but
 * does NOT reject ".." — that's the provider's job during resolution.
 *
 * When an OLX file references another file relatively
 * (src="../foo.md"), we need to resolve that against the referring
 * file's location to get a canonical, unique path, which can be used
 * as a key — just like resolving OlxReference → OlxKey.  If ../foo.md
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
 * (postgres, git, in-memory). The provider's toProvenanceURI() maps
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
// See fieldTypes.ts for constructors: plainField(), docField(), etc.
// =============================================================================

/** Branded type for field names within a block's state. */
export type FieldName = string & { __brand: 'FieldName' };

/** Branded type for event type strings dispatched via logEvent. */
export type FieldEvent = string & { __brand: 'FieldEvent' };

/** Result of a field.write() call — event type + payload to dispatch. */
export interface WriteResult {
  event: FieldEvent;
  payload: Record<string, any>;
}

export interface FieldInfo {
  type: 'field';
  name: FieldName;

  /** Event types this field dispatches. A plain field has one (e.g. UPDATE_VALUE).
   *  A CRDT field may have several (e.g. SPLICE_INPUT for insert/delete). Future
   *  field types may add more (SET_ADD, SET_REMOVE, COUNTER_INCREMENT, etc.). */
  events: FieldEvent[];

  scope: import('./state/scopes').Scope;

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

  // ---------------------------------------------------------------------------
  // Future: display, reduce, merge, batching
  // ---------------------------------------------------------------------------
  //
  // display?: (raw: any) => string;
  //   Human/LLM-readable string representation. Distinct from `read`:
  //   - read: programmatic value (Set, number, structured object)
  //   - display: always a string, for rendering in prompts, summaries, logs
  //   Plain field: JSON.stringify or String(value)
  //   Doc field: same as read (already a string)
  //   Set field: "apple, banana, cherry"
  //   Counter field: "42"
  //   Complex objects: JSON.stringify(value, null, 2) or a custom format
  //
  // reduce?: (state: any, action: any) => any;
  //   Field-level reducer. Replaces the current pattern of special-casing event types
  //   (SPLICE_INPUT, SET_ADD, etc.) in updateResponseReducer. The main reducer routes
  //   to field.reduce based on the event type.
  //
  //   Client-side vs server-side reducers:
  //   Both client and server run reducers, but they serve different purposes:
  //   - Client reducer: local UX (e.g., gray checkbox on submit)
  //   - Server reducer: social, aggregation, cross-student concerns
  //     (e.g., blue checkbox once server confirms; class-wide analytics;
  //     "3 of your peers also chose B"; teacher dashboards)
  //   These aren't "optimistic vs authoritative" — they do fundamentally
  //   different things. The field carries both:
  //     reduce: (state, action) => any           // client-side (default)
  //     serverReduce?: (state, action) => any    // server-side (defaults to reduce)
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
  //
  // batching?: { strategy: 'immediate' | 'debounce' | 'aggregate'; interval?: number };
  //   Event batching strategy for analytics and network efficiency.
  //   - 'immediate': each state change → one event (default, current behavior)
  //   - 'debounce': wait `interval` ms of inactivity, then send latest value
  //     Good for: text input where we want the final value, not every keystroke
  //   - 'aggregate': collect events over `interval` ms, send as batch
  //     Good for: mouse moves, video scrub, slider drag — need ms-latency UX
  //     but don't want thousands of independent events on the wire.
  //     Batch format: [(ts, data), (ts, data), ...] or [ts, latest_data]
  //   Batching is an analytics/network concern, NOT a state concern — the local
  //   reducer still runs on every event immediately. Batching only affects what
  //   gets sent to lo_event loggers (websocket, server).
  // ---------------------------------------------------------------------------

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
  staticKids: z.function().optional(),
  reducers: z.array(z.function()).optional(),
  fields: ReduxFieldsReturn.optional(),
  selectValue: z.function().optional(),
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
   * Declares that this block requires a parent grader in the hierarchy.
   * When true, render will inject `graderId` into props or show DisplayError if not found.
   */
  requiresGrader: z.boolean().optional(),
  /**
   * Returns the answer to display (may differ from grading answer).
   */
  getDisplayAnswer: z.function().optional(),
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
export type ValueSelectorFn = (props: RuntimeProps, state: any, reduxKey: ReduxStateKey) => any;

export interface LoBlock {
  component: React.ComponentType<any>;
  _isBlock: true;
  action?: Function;
  parser?: Function;
  staticKids?: Function;
  reducers: Function[];
  selectValue?: ValueSelectorFn;
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
   * Zod schema for validating block attributes at parse time and render time.
   */
  attributes?: z.ZodTypeAny;
  /**
   * Semantic validation for attributes beyond what Zod schema can express.
   * Returns array of error messages or undefined if valid.
   */
  validateAttributes?: (attrs: Record<string, any>) => string[] | undefined;
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
  /** Git status of the README file: 'committed' | 'modified' | 'untracked' */
  readmeGitStatus?: 'committed' | 'modified' | 'untracked';
  /** Array of example OLX files for this block */
  examples?: Array<{ path: string; gitStatus?: 'committed' | 'modified' | 'untracked' }>;
  /** Git status of the block source file: 'committed' | 'modified' | 'untracked' */
  gitStatus?: 'committed' | 'modified' | 'untracked';
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
 * BlueprintKidEntry - A single child element in the parsed block structure.
 * Can represent blocks, text, XML, CDATA, or HTML elements.
 */
export type BlueprintKidEntry =
  | { type: 'block'; id: OlxReference; overrides?: Record<string, JSONValue> }
  | { type: 'text'; text: string }
  | { type: 'xml'; xml: string }
  | { type: 'cdata'; value: string }
  | { type: 'html'; tag: string; attributes: Record<string, JSONValue>; kids: BlueprintKidEntry[] };

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
  reduxKey: ReduxStateKey;  // Scoped runtime key (idPrefix + id), e.g. "factors:0:factor"
  renderedKids: Record<ReduxStateKey, OlxDomNode>;
  parent?: OlxDomNode;
  loBlock: LoBlock;
  sentinel?: string;  // 'root' for root node
  runtime: LoBlockRuntimeContext;  // Stored at render time (render.tsx) for actions/valueSelector
}

/** Selector function for filtering OlxDomNodes in DOM traversal */
export type OlxDomSelector = (node: OlxDomNode) => boolean;

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * INTERNATIONALIZATION TYPES: Locale, UserLocale, ContentVariant, RenderedVariant
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * These branded types prevent confusion between different semantic concepts in the
 * i18n pipeline. Each represents a distinct role:
 *
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │ LOCALE - A single language code, extracted from variants                    │
 * ├─────────────────────────────────────────────────────────────────────────────┤
 * │ What: A BCP 47 language tag for a single language (no feature flags)        │
 * │ Examples: "en-Latn-US", "ar-Arab-SA", "pl-Latn-PL", "es-Latn-ES"           │
 * │ Source: Extracted from ContentVariants by stripping feature flags           │
 * │ Usage: Content selection, language switcher UI, user preferences            │
 * │ Current: Identical to ContentVariant at runtime (no feature flags yet)      │
 * │ Future: Feature variants like "en-Latn-US:audio-only" will be parsed to    │
 * │         extract just "en-Latn-US" via localeFromVariant()                  │
 * │                                                                              │
 * │ Helper: localeFromVariant(variant: ContentVariant) → Locale                │
 * │   - Current: No-op (variants are just locales)                             │
 * │   - Future: Parses compound variants, returns language part                │
 * └─────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │ USER LOCALE - What the user prefers to read                                │
 * ├─────────────────────────────────────────────────────────────────────────────┤
 * │ What: User's language preference/setting                                   │
 * │ Current: A single Locale (e.g., "en-Latn-US")                             │
 * │ Source: Browser language → Redux settings → author override (lang= attr)   │
 * │ Usage: Select content variant to render, configure UI language            │
 * │                                                                              │
 * │ FUTURE EVOLUTION:                                                           │
 * │ As platform matures, UserLocale will become more sophisticated:            │
 * │                                                                              │
 * │ Option A: Polyglot Users                                                   │
 * │   type UserLocale = {                                                      │
 * │     preferred: Locale[];  // [en-Latn-US, pl-Latn-PL, fr-Latn-FR]       │
 * │     fallback: Locale;                                                      │
 * │   }                                                                         │
 * │   Use case: Teachers in multilingual communities reading in 2-3 languages  │
 * │   Selection: Try each preferred locale; fall back if not available        │
 * │                                                                              │
 * │ Option B: Feature Preferences                                              │
 * │   type UserLocale = {                                                      │
 * │     locale: Locale;                                                        │
 * │     features: {                                                            │
 * │       audioEnabled: boolean;    // Prefer audio when available            │
 * │       highContrast: boolean;    // Prefer high-contrast visuals           │
 * │       fontSize: 'normal' | 'large' | 'xlarge';                          │
 * │     };                                                                      │
 * │   }                                                                         │
 * │   Use case: Accessibility preferences, low-bandwidth mode                 │
 * │   Selection: Match feature preferences alongside language                 │
 * │                                                                              │
 * │ Both: Combined                                                              │
 * │   type UserLocale = {                                                      │
 * │     preferred: Locale[];  // Polyglot support                            │
 * │     features: FeaturePreferences;  // Accessibility + context             │
 * │   }                                                                         │
 * └─────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │ CONTENT VARIANT - What's available in content                              │
 * ├─────────────────────────────────────────────────────────────────────────────┤
 * │ What: A key representing available language/feature combination in content │
 * │ Examples:                                                                   │
 * │   Current: "en-Latn-US", "ar-Arab-SA", "pl-Latn-PL"                      │
 * │   Future: "en-Latn-US", "en-Latn-US:audio-only", "en:low-bandwidth",     │
 * │           "ar-Arab-SA:vision-impaired", "*" (catch-all)                  │
 * │ Source: idMap keys (from file-level metadata in OLX)                     │
 * │ Storage: idMap[blockId][variant] = OlxJson                              │
 * │ Usage: Variant selection/matching, content storage structure             │
 * │                                                                              │
 * │ Structure: language[:feature][:feature]...                               │
 * │   - language: BCP 47 tag (e.g., "en-Latn-US")                           │
 * │   - feature: accessibility/context modifier (e.g., "audio-only")        │
 * │   - "*": Wildcard fallback matching any variant                         │
 * │                                                                              │
 * │ Selection Algorithm (getBestVariant):                                      │
 * │   1. Try exact UserLocale match                                           │
 * │   2. Try language + matching features                                     │
 * │   3. Try language only (discard feature preferences)                     │
 * │   4. Try language parent (en-Latn-US → en-Latn → en)                   │
 * │   5. Try wildcard "*"                                                    │
 * │   6. Error: no variant available                                         │
 * └─────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │ RENDERED VARIANT - The selected variant to render                          │
 * ├─────────────────────────────────────────────────────────────────────────────┤
 * │ What: A ContentVariant that has been selected via getBestVariant*         │
 * │ Usage: Marks that this variant has been "chosen" and is being rendered   │
 * │ Purpose: Prevents re-selection; enables caching and memoization         │
 * └─────────────────────────────────────────────────────────────────────────────┘
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * MIGRATION PATH FOR FUTURE FEATURE VARIANTS
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Phase 1 (Current):
 * - ContentVariant is just locale codes
 * - localeFromVariant() is a no-op
 * - All code treats variants and locales identically
 *
 * Phase 2 (Near Future):
 * - Add support for compound variants: "en-Latn-US:audio-only"
 * - localeFromVariant() parses and extracts language part
 * - LanguageSwitcher filters out non-language variants for UI
 * - Content storage unchanged (idMap[blockId][fullVariant] = OlxJson)
 *
 * Phase 3 (Longer Term):
 * - UserLocale evolves to support preferences/polyglot
 * - getBestVariant matches both language and feature preferences
 * - LanguageSwitcher shows language options with feature indicators
 * - SelectVariant selector becomes more sophisticated (feature filtering)
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

/** A single language code, extracted from variants by stripping feature flags */
export type Locale = string & { readonly __locale: true };

/** What the user prefers to read (browser → Redux → author override) */
export type UserLocale = string & { readonly __userLocale: true };

/** A language/accessibility/context variant available for content (e.g., "ar-Arab-SA", "en:audio-only") */
export type ContentVariant = string & { readonly __variant: true };

/** The variant we actually render - a ContentVariant selected via getBestVariant* functions */
export type RenderedVariant = ContentVariant & { readonly __rendered: true };

/**
 * LocaleContext - language and text direction configuration.
 *
 * Enables i18n throughout the platform. For now, `dir` comes from Redux settings.
 * Future: derive `dir` from Intl.Locale.getTextInfo() when browser support is universal.
 */
export interface LocaleContext {
  code: UserLocale;  // BCP 47 locale code: 'en-Latn-US', 'zh-Hans-CN', 'ar-Arab-SA', 'pl-Latn-PL', 'tr-TR'
  dir: 'ltr' | 'rtl';  // Text direction from Redux settings
}

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
  locale: LocaleContext;  // Language and text direction
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

export interface RuntimeProps extends BaselineProps {
  // This block's identity and content
  id: OlxKey;
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
  id: OlxKey;
  tag: OLXTag;
  attributes: Record<string, JSONValue>;  // Always present, defaults to {} in parsing
  kids?: JSONValue;  // Child nodes, or a string from text parsers
  provenance: Provenance;

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

  [key: string]: JSONValue | undefined;
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
  [id: OlxKey]: VariantMap;
}

/**
 * GraphNode - A node in the content dependency graph.
 * Represents a single block and its metadata.
 */
export interface GraphNode {
  id: OlxKey;  // Block ID that this node represents
  data: {
    label: string;
    attributes: Record<string, JSONValue>;
    tag: OLXTag;
    provenance?: any;
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
  source: OlxKey;  // Source block ID
  target: OlxKey;  // Target block ID
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
