// src/lib/types.ts
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

/** A URI referencing the origin of a block */
export type ProvenanceURI = string;

/** Primary representation for provenance references */
export type Provenance = ProvenanceURI[];

/** Structured representation used in debug output */
export type ProvenanceStruct = FileProvenance | GenericProvenance;

export type ProvenanceEntry = ProvenanceURI | ProvenanceStruct;

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

export interface BlockBlueprint {
  name?: string;
  namespace: string;
  component?: React.ComponentType<any>;
  action?: Function;
  isGrader?: boolean;
  parser?: Function;
  staticKids?: Function;
  reducers?: Function[];
  fields?: Fields;
  getValue?: Function;
  extraDebug?: React.ComponentType<any>;
  description?: string;
}

export interface Block {
  component: React.ComponentType<any>;
  _isBlock: true;
  action?: Function;
  parser?: Function;
  staticKids?: Function;
  reducers: Function[];
  getValue?: Function;
  fields: FieldInfoByField;
  OLXName: string;
  description?: string;
  namespace: string;
  blueprint: BlockBlueprint;
}

export type BlueprintKidEntry =
  | { type: 'block'; id: string }
  | { type: 'text'; text: string }
  | { type: 'xml'; xml: string }
  | { type: 'cdata'; value: string }
  | { type: 'html'; tag: string; attributes: any; kids: BlueprintKidEntry[] }
  | { type: 'node'; rawParsed: any };

export interface NodeInfo {
  node: any;
  renderedKids: Record<string, NodeInfo>;
  parent?: NodeInfo;
  blueprint: BlockBlueprint;
}

export interface PropType {
  id: string;
  kids?: BlueprintKidEntry[];
  idMap: Record<string, any>;
  blueprint: BlockBlueprint;
  fields?: FieldInfoByField;
  nodeInfo: NodeInfo;
  debug?: boolean;
  [key: string]: any;
}
