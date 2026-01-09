// src/lib/types.ts
//
// Type definitions - central TypeScript types for Learning Observer architecture.
//
// Defines the core data structures that flow through the Learning Observer system:
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

export type JSONValue =
  | string
  | number
  | boolean
  | null
  | JSONValue[]
  | { [key: string]: JSONValue };

// OLX Content Loading Errors
export interface OLXLoadingError {
  type: 'parse_error' | 'duplicate_id' | 'file_error' | 'peg_error' | 'attribute_validation' | 'metadata_error';
  file: string;
  message: string;
  location?: {
    line?: number;
    column?: number;
    offset?: number;
  };
  technical?: any;
  stack?: any;
}

// Storage API: Grabbing OLX files from disk
export interface FileProvenance {
  type: 'file';
  path: string;
  [key: string]: any;
}

export interface GenericProvenance {
  type: string;
  path?: string;
  [key: string]: any;
}

/**
  * TODO: These should be a branded or tagged type:
  *   type ProvenanceURI = string & { __brand: "ProvenanceURI" };
  * Then we use this as:
  *   const uri = "file://content/foo.olx" as ProvenanceURI;
  * And it stops being interchangeable with strings.
  */
export type ProvenanceURI = string;
// TODO: Rename variables from 'name' to 'tag' throughout codebase for consistency with OLXTag
export type OLXTag = string & { __brand: 'OLXTag' };

// ID Types (Branded)
// See docs/README.md "IDs" section for documentation.
export type OlxReference = string & { __brand: 'OlxReference' };  // "/foo", "./foo", "foo"
export type OlxKey = OlxReference & { __resolved: true };         // idMap lookup key
export type IdPrefix = string & { __brand: 'IdPrefix' };          // scope prefix for Redux keys
export type ReduxStateKey = string & { __brand: 'ReduxStateKey' }; // state key with idPrefix
export type ReactKey = string & { __brand: 'ReactKey' };          // React reconciliation
export type HtmlId = string & { __brand: 'HtmlId' };              // DOM element ID


/** Primary representation for provenance references */
export type Provenance = ProvenanceURI[];

/** Structured representation used in debug output */
export type ProvenanceStruct = FileProvenance | GenericProvenance;
export type ProvenanceEntry = ProvenanceURI | ProvenanceStruct;

// Fields API
export interface FieldInfo {
  type: 'field';
  name: string;
  event: string;
  scope: import('./state/scopes').Scope;
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
  event: z.string(),
  scope: z.enum(scopeNames),
}).strict();

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
  parser: z.function().optional(),
  staticKids: z.function().optional(),
  reducers: z.array(z.function()).optional(),
  fields: ReduxFieldsReturn.optional(),
  getValue: z.function().optional(),
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
   * - `'children'`: Recursively check if ANY child blocks require unique IDs. If any child
   *   requires uniqueness, this block will also require uniqueness. Useful for container
   *   blocks that may contain interactive content.
   * - `function`: Custom logic to determine uniqueness requirement at parse time.
   *   Receives context including parsed content, attributes, and current state.
   */
  requiresUniqueId: z.union([z.boolean(), z.literal('children'), z.function().returns(z.boolean())]).optional(),
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
export interface LoBlock {
  component: React.ComponentType<any>;
  _isBlock: true;
  action?: Function;
  parser?: Function;
  staticKids?: Function;
  reducers: Function[];
  getValue?: Function;
  locals?: Record<string, any>;
  fields: Fields;
  name?: string;  // Block name for selector matching
  OLXName: OLXTag;
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
  requiresUniqueId?: boolean | 'children' | ((context: {
    id: string,
    attributes: Record<string, any>,
    tag: string,
    rawParsed: any,
    idMap: IdMap,
    provenance: Provenance,
    entry: any,
    children?: any[]
  }) => boolean);
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
  [tag: string]: LoBlock;
}

/** @deprecated Use BlockRegistry instead */
export type ComponentMap = BlockRegistry;

export type ComponentError = string | null;
export type ParseError = string | null | {
  type: 'missing_component' | 'missing_static_kids';
  tag: string;
  node: string;
  message: string;
};

// A list of kids can have any of these; renderedCompiledChildren should handle all of these.
// TODO: These should probably all be of type kidEntry, and the current type should move under a different key.
export type BlueprintKidEntry =
  | { type: 'block'; id: OlxReference; overrides?: Record<string, JSONValue> }
  | { type: 'text'; text: string }
  | { type: 'xml'; xml: string }
  | { type: 'cdata'; value: string }
  | { type: 'html'; tag: string; attributes: any; kids: BlueprintKidEntry[] }
  | { type: 'node'; rawParsed: any };

/**
 * OlxDomNode - a node in the dynamic OLX DOM tree.
 *
 * Created at render time (not parse time). Has parent/child relationships
 * for traversal by the action system. Distinct from:
 * - OlxJson (static parsed content in idMap)
 * - React DOM (the actual browser rendering)
 */
export interface OlxDomNode {
  node: OlxJson;
  renderedKids: Record<OlxKey, OlxDomNode>;
  parent?: OlxDomNode;
  loBlock: LoBlock;
  sentinel?: string;  // 'root' for root node
}

/** Selector function for filtering OlxDomNodes in DOM traversal */
export type OlxDomSelector = (node: OlxDomNode) => boolean;

/**
 * RuntimeProps - the context bag passed through the system.
 *
 * This is a hybrid of three things (pragmatic compromise for React):
 * 1. Opaque context (nodeInfo, blockRegistry, idPrefix) - thread through, don't inspect
 * 2. Block machinery (loBlock, fields, locals) - framework injects these
 * 3. OLX attributes - flow in via [key: string]: any
 *
 * Most functions just pass props through without inspecting. Blocks destructure
 * only what they need (usually just attributes and fields).
 */
export interface RuntimeProps {
  // This block's identity and content
  id: string;
  kids: BlueprintKidEntry[];

  // Opaque context - thread through
  nodeInfo: OlxDomNode;
  blockRegistry: BlockRegistry;
  idPrefix?: IdPrefix;
  olxJsonSources?: string[];  // Redux source names in priority order for OlxJson lookup
  store: Store;  // Redux store - enables replay mode where a different store provides historical state
  logEvent: (event: string, payload: any) => void;  // Event logging - no-op during replay
  sideEffectFree: boolean;  // True during replay - disables fetches, event logging, etc.

  // Block machinery - framework injects these
  loBlock: LoBlock;
  fields: Fields;
  locals: LocalsAPI;  // {} if none, not undefined

  // OLX attributes flow in here
  [key: string]: any;
}

export interface OlxJson {
  id: OlxKey;
  tag: string;
  attributes: Record<string, JSONValue>;  // Always present, defaults to {} in parsing
  provenance: Provenance;
  rawParsed: JSONValue;
  [key: string]: JSONValue | undefined;
}

export interface IdMap {
  [id: OlxKey]: OlxJson;
}

export interface GraphNode {
  id: string;
  data: {
    label: string;
    attributes: Record<string, string>;
    tag: string;
    provenance?: any;
  };
  position: { x: number; y: number };
  type: string;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
}
