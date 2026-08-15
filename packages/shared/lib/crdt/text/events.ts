import type { Doc } from './doc'
import type { Text } from './text'
import type { DeltaOp, ID, StateVector } from './types'
import { IDRangeSet } from './ranges'

export type DocEventName =
  | 'beforeTransaction'
  | 'beforeObserverCalls'
  | 'afterTransaction'
  | 'update'

export class Transaction {
  readonly inserted = new IDRangeSet()
  readonly deleted = new IDRangeSet()
  readonly changedTexts = new Set<Text>()
  readonly beforeState: StateVector
  afterState: StateVector = {}

  constructor (
    readonly doc: Doc,
    readonly origin: unknown,
    readonly local: boolean
  ) {
    this.beforeState = doc.getStateVector()
  }

  adds (id: ID): boolean {
    return this.inserted.has(id)
  }

  deletes (id: ID): boolean {
    return this.deleted.has(id)
  }
}

export class TextEvent {
  constructor (
    readonly target: Text,
    readonly transaction: Transaction,
    readonly delta: readonly DeltaOp[]
  ) {}
}
