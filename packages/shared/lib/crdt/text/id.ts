import type { ID } from './types'

export const equalIDs = (a: ID | null, b: ID | null): boolean =>
  a === b ||
  (a !== null &&
    b !== null &&
    a.client === b.client &&
    a.clock === b.clock)

export const idKey = (id: ID): string => `${id.client}:${id.clock}`

export const copyID = (id: ID | null): ID | null =>
  id === null ? null : { client: id.client, clock: id.clock }

export const assertClientID = (client: number, label = 'client'): void => {
  if (!Number.isSafeInteger(client) || client < 0) {
    throw new RangeError(`${label} must be a non-negative safe integer`)
  }
}

export const assertClock = (clock: number, label = 'clock'): void => {
  if (!Number.isSafeInteger(clock) || clock < 0) {
    throw new RangeError(`${label} must be a non-negative safe integer`)
  }
}

export const compareIDOrder = (a: ID, b: ID): number =>
  a.client - b.client || a.clock - b.clock
