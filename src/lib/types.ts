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

export type JSONValue =
  | string
  | number
  | boolean
  | null
  | JSONValue[]
  | { [key: string]: JSONValue };

// OLX Content Loading Errors
export interface OLXLoadingError {
  type: 'parse_error' | 'duplicate_id' | 'file_error' | 'peg_error' | 'attribute_validation';
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
export type OLXId = string;
export type OLXTag = string;

// TODO: Add similar tagged types for things like Block ID, etc.

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

export interface FieldInfoByField { [name: string]: FieldInfo; }
export interface FieldInfoByEvent { [event: string]: FieldInfo; }

export interface Fields {
  fieldInfoByField: FieldInfoByField;
  fieldInfoByEvent: FieldInfoByEvent;
}

// Blocks
// Blueprint: How we declare / register them.

const ReduxFieldInfo = z.object({
  type: z.literal('field'),
  name: z.string(),
  event: z.string(),
  scope: z.string(),
}).strict();
const ReduxFieldInfoMap = z.record(ReduxFieldInfo);
export const ReduxFieldsReturn = z.object({
  fieldInfoByField: ReduxFieldInfoMap,
  fieldInfoByEvent: ReduxFieldInfoMap,
}).strict();

// === Schema ===
export const BlockBlueprintSchema = z.object({
  name: z.string().optional(),
  namespace: z.string().nonempty(),
  component: z.custom<React.ComponentType<any>>().optional(),
  action: z.function().optional(),
  isGrader: z.boolean().optional(),
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
  attributeSchema: z.custom<z.ZodTypeAny>().optional(),
}).strict();

export type BlockBlueprint = z.infer<typeof BlockBlueprintSchema>;

// Blocks don't pass in the namespace; that's added by the partial
type BlockBlueprintReg = Omit<BlockBlueprint, "namespace">;

// Blueprints get processed into a block
export interface Block {
  component: React.ComponentType<any>;
  _isBlock: true;
  action?: Function;
  parser?: Function;
  staticKids?: Function;
  reducers: Function[];
  getValue?: Function;
  locals?: Record<string, any>;
  fields: FieldInfoByField;
  OLXName: OLXTag;
  description?: string;
  namespace: string;
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
  attributeSchema?: z.ZodTypeAny;
  blueprint: BlockBlueprint;
}

export interface ComponentMap {
  [tag: string]: Block;
}

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
  | { type: 'block'; id: OLXId; overrides?: Record<string, JSONValue> }
  | { type: 'text'; text: string }
  | { type: 'xml'; xml: string }
  | { type: 'cdata'; value: string }
  | { type: 'html'; tag: string; attributes: any; kids: BlueprintKidEntry[] }
  | { type: 'node'; rawParsed: any };

// TODO: Rename to indicate the type of node. This is a _dynamic_ node, as generated by render.
export interface NodeInfo {
  node: OlxJson;
  renderedKids: Record<OLXId, NodeInfo>;
  parent?: NodeInfo;
  blueprint: BlockBlueprint;
}

export interface PropType {
  id: string;
  kids: BlueprintKidEntry[];
  idMap: IdMap;
  blueprint: BlockBlueprint;
  fields: FieldInfoByField;
  nodeInfo: NodeInfo;
  componentMap: ComponentMap;
  idPrefix?: string;
  [key: string]: any;
}

export interface OlxJson {
  id: OLXId;
  tag: string;
  attributes?: Record<string, JSONValue>;
  provenance: Provenance;
  rawParsed: JSONValue;
  [key: string]: JSONValue | undefined;
}

export interface IdMap {
  [id: OLXId]: OlxJson;
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
