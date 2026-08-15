import { assertClientID, assertClock } from './id'
import { IDRangeSet } from './ranges'
import type {
  DeleteRange,
  JsonItem,
  JsonUpdate,
  StateVector
} from './types'

export const emptyUpdate = (): JsonUpdate => ({
  version: 1,
  structs: [],
  deletes: []
})

export const validateStateVector = (value: unknown): StateVector => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError('state vector must be a JSON object')
  }
  const result: StateVector = {}
  for (const [client, clock] of Object.entries(value)) {
    const parsedClient = Number(client)
    assertClientID(parsedClient, 'state-vector client')
    assertClock(clock as number, 'state-vector clock')
    result[String(parsedClient)] = clock as number
  }
  return result
}

const validateID = (value: unknown, label: string) => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`${label} must be an ID object`)
  }
  const id = value as Record<string, unknown>
  assertClientID(id.client as number, `${label}.client`)
  assertClock(id.clock as number, `${label}.clock`)
  return { client: id.client as number, clock: id.clock as number }
}

const validateRangeEnd = (
  clock: number,
  length: number,
  label: string
): void => {
  if (!Number.isSafeInteger(clock + length)) {
    throw new RangeError(`${label} clock + length must be a safe integer`)
  }
}

export const validateUpdate = (value: unknown): JsonUpdate => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError('update must be a JSON object')
  }
  const input = value as Record<string, unknown>
  if (input.version !== 1) throw new TypeError('unsupported update version')
  if (!Array.isArray(input.structs) || !Array.isArray(input.deletes)) {
    throw new TypeError('update.structs and update.deletes must be arrays')
  }

  const structs: JsonItem[] = input.structs.map((raw, index) => {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      throw new TypeError(`structs[${index}] must be an object`)
    }
    const item = raw as Record<string, unknown>
    if (typeof item.parent !== 'string') {
      throw new TypeError(`structs[${index}].parent must be a string`)
    }
    if (!Number.isSafeInteger(item.length) || (item.length as number) <= 0) {
      throw new RangeError(`structs[${index}].length must be positive`)
    }
    if (
      item.content !== null &&
      (typeof item.content !== 'string' ||
        item.content.length !== (item.length as number))
    ) {
      throw new TypeError(
        `structs[${index}].content must be null or match its UTF-16 length`
      )
    }
    const id = validateID(item.id, `structs[${index}].id`)
    const length = item.length as number
    validateRangeEnd(id.clock, length, `structs[${index}]`)
    return {
      id,
      length,
      origin:
        item.origin === null
          ? null
          : validateID(item.origin, `structs[${index}].origin`),
      rightOrigin:
        item.rightOrigin === null
          ? null
          : validateID(item.rightOrigin, `structs[${index}].rightOrigin`),
      parent: item.parent,
      content: item.content
    }
  })

  const deletes: DeleteRange[] = input.deletes.map((raw, index) => {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      throw new TypeError(`deletes[${index}] must be an object`)
    }
    const range = raw as Record<string, unknown>
    assertClientID(range.client as number, `deletes[${index}].client`)
    assertClock(range.clock as number, `deletes[${index}].clock`)
    if (!Number.isSafeInteger(range.length) || (range.length as number) <= 0) {
      throw new RangeError(`deletes[${index}].length must be positive`)
    }
    const client = range.client as number
    const clock = range.clock as number
    const length = range.length as number
    validateRangeEnd(clock, length, `deletes[${index}]`)
    return { client, clock, length }
  })

  return { version: 1, structs, deletes }
}

/** Combine updates without needing a document. The operation is idempotent. */
export const mergeUpdates = (
  updates: readonly JsonUpdate[]
): JsonUpdate => {
  const structs: JsonItem[] = []
  const seenStructs = new Set<string>()
  const deleted = new IDRangeSet()

  for (const candidate of updates) {
    const update = validateUpdate(candidate)
    for (const item of update.structs) {
      const encoded = JSON.stringify(item)
      if (!seenStructs.has(encoded)) {
        seenStructs.add(encoded)
        structs.push(item)
      }
    }
    for (const range of update.deletes) {
      deleted.add(range.client, range.clock, range.length)
    }
  }

  const deletes = deleted.ranges()
  // Preserve update-group order. Sorting overlapping pre-/post-GC views by
  // start clock can place a long collected range between its original atoms.
  // applyUpdate already resolves arbitrary dependency order.
  return { version: 1, structs, deletes }
}

export const stringifyUpdate = (update: JsonUpdate): string =>
  JSON.stringify(validateUpdate(update))

export const parseUpdate = (json: string): JsonUpdate =>
  validateUpdate(JSON.parse(json) as unknown)
