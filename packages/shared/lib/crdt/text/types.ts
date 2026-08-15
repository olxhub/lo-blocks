/**
 * A globally unique position in the CRDT.
 *
 * Like Yjs, each client owns a monotonically increasing logical clock. The
 * pair (client, clock) is globally unique; clocks count UTF-16 code units.
 */
export interface ID {
  readonly client: number
  readonly clock: number
}

/**
 * The JSON wire representation of one text item.
 *
 * Like Yjs, one item may pack a compatible run of UTF-16 code units. Every
 * interior clock remains addressable; operations split the item at boundaries.
 */
export interface JsonItem {
  readonly id: ID
  readonly length: number
  readonly origin: ID | null
  readonly rightOrigin: ID | null
  readonly parent: string
  /** null means Yjs-style garbage-collected deleted content. */
  readonly content: string | null
}

export interface DeleteRange {
  readonly client: number
  readonly clock: number
  readonly length: number
}

export interface JsonUpdate {
  readonly version: 1
  readonly structs: readonly JsonItem[]
  readonly deletes: readonly DeleteRange[]
}

/** The next clock known for each client. Object keys are decimal client IDs. */
export type StateVector = Record<string, number>

export type DeltaOp =
  | { insert: string }
  | { delete: number }
  | { retain: number }

export interface DocOptions {
  /** Inject a stable client ID in tests and classroom examples. */
  readonly clientID?: number
  readonly guid?: string
  /** Match Yjs: reclaim deleted string payload and coalesce ranges by default. */
  readonly gc?: boolean
}

export interface InspectItem extends JsonItem {
  readonly left: ID | null
  readonly right: ID | null
  readonly deleted: boolean
}

export interface Inspection {
  readonly clientID: number
  readonly stateVector: StateVector
  readonly pending: readonly JsonItem[]
  readonly deletes: readonly DeleteRange[]
  readonly texts: Readonly<Record<string, readonly InspectItem[]>>
}
