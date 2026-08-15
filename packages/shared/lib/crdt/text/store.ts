import { copyID } from './id'
import type {
  DeleteRange,
  ID,
  InspectItem,
  JsonItem,
} from './types'
import { IDRangeSet } from './ranges'

/**
 * Internal struct. Compatible live strings and collected deleted ranges may
 * span many clocks. Collected content has `content === null`.
 */
export interface Item {
  id: ID
  length: number
  readonly origin: ID | null
  readonly rightOrigin: ID | null
  readonly parent: string
  content: string | null
  left: Item | null
  right: Item | null
  deleted: boolean
}

const findStructIndex = (items: readonly Item[], clock: number): number => {
  let left = 0
  let right = items.length - 1
  while (left <= right) {
    const middle = (left + right) >>> 1
    const item = items[middle]!
    if (clock < item.id.clock) right = middle - 1
    else if (clock >= item.id.clock + item.length) left = middle + 1
    else return middle
  }
  return -1
}

export class StructStore {
  private readonly clients = new Map<number, Item[]>()
  readonly pending = new Map<string, JsonItem>()
  private readonly deleteSet = new IDRangeSet()

  has(id: ID): boolean {
    return this.get(id) !== null
  }

  /**
   * Return the struct containing an ID. A collected struct can contain a whole
   * clock interval, just like a Yjs Item with ContentDeleted.
   */
  get(id: ID | null): Item | null {
    if (id === null) return null
    const items = this.clients.get(id.client)
    if (items === undefined) return null
    const index = findStructIndex(items, id.clock)
    return index < 0 ? null : items[index]!
  }

  add(item: Item): void {
    const structs = this.clients.get(item.id.client)
    if (structs === undefined) {
      this.clients.set(item.id.client, [item])
    } else {
      structs.push(item)
    }
  }

  nextClock(client: number): number {
    const structs = this.clients.get(client)
    const last = structs?.at(-1)
    return last === undefined ? 0 : last.id.clock + last.length
  }

  clocks(): Record<string, number> {
    const result: Record<string, number> = {}
    for (const [client, items] of this.clients) {
      const last = items.at(-1)!
      result[String(client)] = last.id.clock + last.length
    }
    return result
  }

  allItems(): Item[] {
    return [...this.clients.values()].flat()
  }

  assertStructIntegrity(): void {
    for (const [client, structs] of this.clients) {
      let expectedClock = 0
      for (const item of structs) {
        if (item.id.client !== client || item.id.clock !== expectedClock) {
          throw new Error(
            `client ${client} has a clock gap or overlapping struct at ${item.id.clock}`
          )
        }
        if (!Number.isSafeInteger(item.length) || item.length <= 0) {
          throw new Error(`item ${client}:${item.id.clock} has invalid length`)
        }
        if (!item.deleted && item.content?.length !== item.length) {
          throw new Error(
            `live item ${client}:${item.id.clock} has invalid content`
          )
        }
        if (item.content === null && !item.deleted) {
          throw new Error(
            `live item ${client}:${item.id.clock} has collected content`
          )
        }
        if (item.deleted && !this.isDeleted(item.id)) {
          throw new Error(
            `deleted item ${client}:${item.id.clock} is absent from delete set`
          )
        }
        expectedClock += item.length
      }
    }
  }

  markDeleteRange(range: DeleteRange): void {
    this.deleteSet.add(range.client, range.clock, range.length)
  }

  isDeleted(id: ID): boolean {
    return this.deleteSet.has(id)
  }

  deleteRanges(): DeleteRange[] {
    return this.deleteSet.ranges()
  }

  deletedRangesIn(item: Item): DeleteRange[] {
    return this.deleteSet.intersections(
      item.id.client,
      item.id.clock,
      item.length
    )
  }

  /**
   * Split a struct so `clock` becomes the first ID of the right half.
   * Collected content has no payload to split.
   */
  cleanStart(id: ID): Item {
    const item = this.get(id)
    if (item === null) throw new Error(`missing item ${id.client}:${id.clock}`)
    const offset = id.clock - item.id.clock
    if (offset === 0) return item
    return this.split(item, offset)
  }

  /** Split a struct so `id` becomes the final ID of the left half. */
  cleanEnd(id: ID): Item {
    const item = this.get(id)
    if (item === null) throw new Error(`missing item ${id.client}:${id.clock}`)
    const offset = id.clock - item.id.clock + 1
    if (offset === item.length) return item
    this.split(item, offset)
    return item
  }

  /**
   * Return whole structs covering the known part of an ID range. Boundary
   * structs are split first so callers can safely mutate every returned item.
   */
  itemsInRange(range: DeleteRange): Item[] {
    const knownEnd = Math.min(
      range.clock + range.length,
      this.nextClock(range.client)
    )
    if (range.clock >= knownEnd) return []
    const start = this.cleanStart({
      client: range.client,
      clock: range.clock
    })
    if (knownEnd < this.nextClock(range.client)) {
      this.cleanStart({ client: range.client, clock: knownEnd })
    }
    const structs = this.clients.get(range.client)!
    const startIndex = findStructIndex(structs, start.id.clock)
    const result: Item[] = []
    for (let index = startIndex; index < structs.length; index++) {
      const item = structs[index]!
      if (item.id.clock >= knownEnd) break
      result.push(item)
    }
    return result
  }

  private split(item: Item, offset: number): Item {
    const oldLength = item.length
    const right: Item = {
      id: { client: item.id.client, clock: item.id.clock + offset },
      length: oldLength - offset,
      origin: {
        client: item.id.client,
        clock: item.id.clock + offset - 1
      },
      rightOrigin: copyID(item.rightOrigin),
      parent: item.parent,
      content: item.content === null ? null : item.content.slice(offset),
      left: item,
      right: item.right,
      deleted: item.deleted
    }
    item.length = offset
    if (item.content !== null) item.content = item.content.slice(0, offset)
    item.right = right
    if (right.right !== null) right.right.left = right

    const structs = this.clients.get(item.id.client)!
    const index = structs.indexOf(item)
    structs.splice(index + 1, 0, right)
    return right
  }

  /**
   * Coalesce the same compatible live and deleted runs that Yjs merges.
   * When GC is enabled, deleted string payload is collected before merging.
   */
  compactAndMerge(
    insertedIDs: IDRangeSet,
    deletedIDs: IDRangeSet,
    collectDeleted: boolean
  ): void {
    const affectedClients = new Set<number>()
    for (const range of insertedIDs.ranges()) {
      affectedClients.add(range.client)
    }
    for (const range of deletedIDs.ranges()) {
      affectedClients.add(range.client)
      for (const item of this.itemsInRange(range)) {
        if (item.deleted && collectDeleted) item.content = null
      }
    }
    for (const client of affectedClients) {
      const structs = this.clients.get(client)!
      for (let index = structs.length - 1; index > 0; index--) {
        const right = structs[index]!
        const left = structs[index - 1]!
        if (
          left.deleted === right.deleted &&
          (left.content === null) === (right.content === null) &&
          left.parent === right.parent &&
          left.right === right &&
          left.id.clock + left.length === right.id.clock &&
          right.origin?.client === left.id.client &&
          right.origin.clock === left.id.clock + left.length - 1 &&
          ((left.rightOrigin === null && right.rightOrigin === null) ||
            (left.rightOrigin !== null &&
              right.rightOrigin !== null &&
              left.rightOrigin.client === right.rightOrigin.client &&
              left.rightOrigin.clock === right.rightOrigin.clock))
        ) {
          if (left.content !== null && right.content !== null) {
            left.content += right.content
          }
          left.length += right.length
          left.right = right.right
          if (left.right !== null) left.right.left = left
          structs.splice(index, 1)
        }
      }
    }
  }

  toJSON(item: Item, offset = 0, length = item.length - offset): JsonItem {
    const id = { client: item.id.client, clock: item.id.clock + offset }
    return {
      id,
      length,
      origin:
        offset === 0
          ? copyID(item.origin)
          : { client: item.id.client, clock: id.clock - 1 },
      rightOrigin: copyID(item.rightOrigin),
      parent: item.parent,
      content:
        item.content === null
          ? null
          : item.content.slice(offset, offset + length)
    }
  }

  inspect(item: Item): InspectItem {
    return {
      ...this.toJSON(item),
      left: copyID(item.left?.id ?? null),
      right: copyID(item.right?.id ?? null),
      deleted: item.deleted
    }
  }
}
