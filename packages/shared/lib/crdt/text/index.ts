export { Doc } from './doc'
export { Text } from './text'
export { TextEvent, Transaction } from './events'
export {
  emptyUpdate,
  mergeUpdates,
  parseUpdate,
  stringifyUpdate,
  validateStateVector,
  validateUpdate
} from './update'
export { equalIDs } from './id'
export { IDRangeSet } from './ranges'
export type {
  DeleteRange,
  DeltaOp,
  DocOptions,
  ID,
  InspectItem,
  Inspection,
  JsonItem,
  JsonUpdate,
  StateVector
} from './types'

import type { Doc } from './doc'
import type { JsonUpdate, StateVector } from './types'

/** Function-style aliases mirror the commonly used Yjs synchronization API. */
export const applyUpdate = (
  doc: Doc,
  update: JsonUpdate,
  origin: unknown = null
): void => doc.applyUpdate(update, origin)

export const encodeStateVector = (doc: Doc): StateVector =>
  doc.getStateVector()

export const encodeStateAsUpdate = (
  doc: Doc,
  targetStateVector: StateVector = {}
): JsonUpdate => doc.encodeStateAsUpdate(targetStateVector)
