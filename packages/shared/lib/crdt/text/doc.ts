import { callAll, captureError, throwFirst } from './callbacks'
import { copyID, equalIDs, idKey, assertClientID } from './id'
import { TextEvent, Transaction, type DocEventName } from './events'
import { StructStore, type Item } from './store'
import { Text } from './text'
import type {
  DeltaOp,
  DocOptions,
  ID,
  Inspection,
  JsonItem,
  JsonUpdate,
  StateVector
} from './types'
import { validateStateVector, validateUpdate } from './update'

type Listener = (...args: any[]) => void

const randomClientID = (): number => {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(6))
  let clientID = 0
  for (const byte of bytes) clientID = clientID * 256 + byte
  return clientID
}

const appendDelta = (delta: DeltaOp[], op: DeltaOp): void => {
  const previous = delta.at(-1)
  if (previous !== undefined) {
    if ('retain' in previous && 'retain' in op) {
      previous.retain += op.retain
      return
    }
    if ('delete' in previous && 'delete' in op) {
      previous.delete += op.delete
      return
    }
    if ('insert' in previous && 'insert' in op) {
      previous.insert += op.insert
      return
    }
  }
  delta.push(op)
}

interface StructIndexEntry {
  readonly structs: JsonItem[]
  readonly greatestEndThrough: number[]
}

type StructIndex = Map<number, StructIndexEntry>

/**
 * Group and sort structs once so validation can find ID ranges efficiently.
 * `greatestEndThrough[i]` also lets a lookup skip nested ranges that ended.
 */
const buildStructIndex = (structs: readonly JsonItem[]): StructIndex => {
  const index: StructIndex = new Map()
  for (const struct of structs) {
    let entry = index.get(struct.id.client)
    if (entry === undefined) {
      entry = { structs: [], greatestEndThrough: [] }
      index.set(struct.id.client, entry)
    }
    entry.structs.push(struct)
  }
  for (const entry of index.values()) {
    entry.structs.sort((a, b) => a.id.clock - b.id.clock)
    let greatestEnd = 0
    for (const struct of entry.structs) {
      greatestEnd = Math.max(greatestEnd, struct.id.clock + struct.length)
      entry.greatestEndThrough.push(greatestEnd)
    }
  }
  return index
}

const findStructContaining = (
  index: StructIndex,
  id: ID
): JsonItem | null => {
  const entry = index.get(id.client)
  if (entry === undefined) return null

  let low = 0
  let high = entry.structs.length
  while (low < high) {
    const middle = (low + high) >>> 1
    if (entry.structs[middle]!.id.clock <= id.clock) low = middle + 1
    else high = middle
  }
  for (let position = low - 1; position >= 0; position--) {
    if (entry.greatestEndThrough[position]! <= id.clock) break
    const struct = entry.structs[position]!
    if (id.clock < struct.id.clock + struct.length) return struct
  }
  return null
}

export class Doc {
  readonly clientID: number
  readonly guid: string
  readonly gc: boolean
  readonly store = new StructStore()
  readonly share = new Map<string, Text>()

  private readonly listeners = new Map<DocEventName, Set<Listener>>()
  private transaction: Transaction | null = null

  constructor(options: DocOptions = {}) {
    this.clientID = options.clientID ?? randomClientID()
    assertClientID(this.clientID)
    this.guid = options.guid ?? globalThis.crypto.randomUUID()
    this.gc = options.gc ?? true
  }

  getText(name = ''): Text {
    let text = this.share.get(name)
    if (text === undefined) {
      text = new Text(this, name)
      this.share.set(name, text)
    }
    return text
  }

  /** Yjs 14 calls the generic top-level accessor `get`. */
  get(name = ''): Text {
    return this.getText(name)
  }

  toJSON(): Record<string, string> {
    return Object.fromEntries(
      [...this.share].map(([name, text]) => [name, text.toString()])
    )
  }

  on(name: DocEventName, listener: Listener): Listener {
    let listeners = this.listeners.get(name)
    if (listeners === undefined) {
      listeners = new Set()
      this.listeners.set(name, listeners)
    }
    listeners.add(listener)
    return listener
  }

  off(name: DocEventName, listener: Listener): void {
    this.listeners.get(name)?.delete(listener)
  }

  private emit(name: DocEventName, ...args: unknown[]): void {
    callAll(
      [...(this.listeners.get(name) ?? [])].map(
        listener => () => listener(...args)
      )
    )
  }

  transact<T>(
    body: (transaction: Transaction) => T,
    origin: unknown = null,
    local = true
  ): T {
    if (this.transaction !== null) return body(this.transaction)

    const transaction = new Transaction(this, origin, local)
    this.transaction = transaction
    const errors: unknown[] = []
    let result!: T

    captureError(errors, () => {
      this.emit('beforeTransaction', transaction, this)
    })
    captureError(errors, () => {
      result = body(transaction)
    })

    this.transaction = null
    transaction.afterState = this.getStateVector()
    captureError(errors, () => {
      this.emit('beforeObserverCalls', transaction, this)
    })
    for (const text of transaction.changedTexts) {
      captureError(errors, () => {
        const delta = this.eventDelta(text, transaction)
        text._notify(new TextEvent(text, transaction, delta), transaction)
      })
    }
    captureError(errors, () => {
      this.emit('afterTransaction', transaction, this)
    })

    const generated: { update: JsonUpdate | null } = { update: null }
    captureError(errors, () => {
      generated.update = this.updateFromTransaction(transaction)
    })
    captureError(errors, () => {
      if (!transaction.inserted.isEmpty || !transaction.deleted.isEmpty) {
        this.store.compactAndMerge(
          transaction.inserted,
          transaction.deleted,
          this.gc
        )
      }
    })
    if (
      generated.update !== null &&
      (generated.update.structs.length > 0 ||
        generated.update.deletes.length > 0)
    ) {
      captureError(errors, () => {
        this.emit('update', generated.update, origin, this, transaction)
      })
    }

    throwFirst(errors)
    return result
  }

  insert(text: Text, index: number, content: string): void {
    if (typeof content !== 'string') throw new TypeError('content must be a string')
    if (content.length === 0) return
    this.transact(transaction => {
      const { left, right } = text._boundary(index)
      const rightOrigin = copyID(right?.id ?? null)
      const json: JsonItem = {
        id: {
          client: this.clientID,
          clock: this.store.nextClock(this.clientID)
        },
        length: content.length,
        origin:
          left === null
            ? null
            : {
                client: left.id.client,
                clock: left.id.clock + left.length - 1
              },
        rightOrigin,
        parent: text.name,
        content
      }
      if (this.integrate(json, transaction) === null) {
        throw new Error('local item unexpectedly had dependencies')
      }
    })
  }

  delete(text: Text, index: number, length: number): void {
    if (length === 0) {
      text._boundary(index)
      return
    }
    const items = text._visibleItems(index, length)
    this.transact(transaction => {
      for (const item of items) this.markDeleted(item, transaction)
    })
  }

  applyUpdate(candidate: JsonUpdate, origin: unknown = null): void {
    const update = validateUpdate(candidate)
    this.validateUpdateAgainstDoc(update)
    this.transact(
      transaction => {
        for (const original of update.structs) {
          const knownClock = this.store.nextClock(original.id.client)
          const end = original.id.clock + original.length
          if (end <= knownClock) {
            if (!this.compatibleKnownStruct(original)) {
              throw new Error(
                `conflicting structs use the same ID ${idKey(original.id)}`
              )
            }
            continue
          }
          const offset = Math.max(0, knownClock - original.id.clock)
          const item: JsonItem =
            offset === 0
              ? original
              : {
                  ...original,
                  id: { client: original.id.client, clock: knownClock },
                  length: original.length - offset,
                  origin: { client: original.id.client, clock: knownClock - 1 },
                  content: original.content?.slice(offset) ?? null
                }
          // A queued claim is provisional because its dependencies were
          // unavailable. A newly received, currently valid claim wins.
          this.store.pending.set(idKey(item.id), item)
          // Integrating eagerly avoids treating a later overlapping compacted
          // view as a conflicting pending struct. Missing dependencies simply
          // remain queued and are retried below.
          this.drainPending(transaction)
        }
        for (const range of update.deletes) this.store.markDeleteRange(range)
        this.drainPending(transaction)
        for (const range of update.deletes) {
          for (const item of this.store.itemsInRange(range)) {
            this.markDeleted(item, transaction)
          }
        }
      },
      origin,
      false
    )
  }

  getStateVector(): StateVector {
    return this.store.clocks()
  }

  encodeStateAsUpdate(target: StateVector = {}): JsonUpdate {
    const stateVector = validateStateVector(target)
    const structs: JsonItem[] = []
    for (const item of this.store.allItems()) {
      const knownClock = stateVector[String(item.id.client)] ?? 0
      const end = item.id.clock + item.length
      if (end > knownClock) {
        structs.push(
          this.store.toJSON(item, Math.max(0, knownClock - item.id.clock))
        )
      }
    }
    structs.sort(
      (a, b) => a.id.client - b.id.client || a.id.clock - b.id.clock
    )
    return {
      version: 1,
      structs,
      // As in Yjs, a state vector only summarizes structs, not deletions.
      deletes: this.store.deleteRanges()
    }
  }

  inspect(): Inspection {
    const texts: Record<string, readonly ReturnType<Text['_inspect']>[number][]> =
      {}
    for (const [name, text] of this.share) texts[name] = text._inspect()
    return {
      clientID: this.clientID,
      stateVector: this.getStateVector(),
      pending: [...this.store.pending.values()],
      deletes: this.store.deleteRanges(),
      texts
    }
  }

  /**
   * Expensive consistency check intended for tests and student assignments.
   * It verifies clock coverage, linked-list pointers, parent ownership, and
   * that every stored struct occurs exactly once in a shared text.
   */
  assertIntegrity(): void {
    this.store.assertStructIntegrity()
    const stored = new Set(this.store.allItems())
    const linked = new Set<Item>()
    for (const [name, text] of this.share) {
      let previous: Item | null = null
      for (let item = text._start; item !== null; item = item.right) {
        if (linked.has(item)) throw new Error('linked list contains a cycle')
        if (!stored.has(item)) throw new Error('linked item is absent from store')
        if (item.left !== previous) throw new Error('broken left/right link')
        if (item.parent !== name) throw new Error('item belongs to wrong text')
        linked.add(item)
        previous = item
      }
    }
    if (linked.size !== stored.size) {
      throw new Error('stored item is absent from its shared text')
    }
  }

  private dependenciesKnown(item: JsonItem): boolean {
    if (item.id.clock !== this.store.nextClock(item.id.client)) return false
    if (item.origin !== null && !this.store.has(item.origin)) return false
    if (item.rightOrigin !== null && !this.store.has(item.rightOrigin)) return false
    return true
  }

  /**
   * Reject semantic faults decidable from known and same-packet information
   * before mutation. Missing dependencies remain provisional in the queue.
   */
  private validateUpdateAgainstDoc(update: JsonUpdate): void {
    const incoming = buildStructIndex(update.structs)
    this.validateIncomingOverlaps(incoming)
    for (const item of update.structs) {
      if (!this.compatibleKnownStruct(item)) {
        throw new Error(
          `conflicting structs use the same ID ${idKey(item.id)}`
        )
      }
      this.validateOriginParent(item, item.origin, incoming)
      this.validateOriginParent(item, item.rightOrigin, incoming)
    }
  }

  /** Check only the prefix already represented by this document. */
  private compatibleKnownStruct(item: JsonItem): boolean {
    const knownEnd = Math.min(
      item.id.clock + item.length,
      this.store.nextClock(item.id.client)
    )
    let clock = item.id.clock
    while (clock < knownEnd) {
      const existing = this.store.get({ client: item.id.client, clock })
      if (existing === null || existing.parent !== item.parent) return false
      const end = Math.min(
        knownEnd,
        existing.id.clock + existing.length
      )
      if (!existing.deleted && item.content !== null) {
        const existingOffset = clock - existing.id.clock
        const incomingOffset = clock - item.id.clock
        const length = end - clock
        if (
          existing.content?.slice(existingOffset, existingOffset + length) !==
          item.content.slice(incomingOffset, incomingOffset + length)
        ) {
          return false
        }
      }
      clock = end
    }
    return true
  }

  private validateOriginParent(
    item: JsonItem,
    origin: JsonItem['origin'],
    incoming: StructIndex
  ): void {
    if (origin === null) return
    const stored = this.store.get(origin)
    const candidate = findStructContaining(incoming, origin)
    if (
      (stored !== null && stored.parent !== item.parent) ||
      (candidate !== null && candidate.parent !== item.parent)
    ) {
      throw new Error('an item cannot use an origin from another shared text')
    }
  }

  private validateIncomingOverlaps(index: StructIndex): void {
    for (const items of index.values()) {
      for (let leftIndex = 0; leftIndex < items.structs.length; leftIndex++) {
        const left = items.structs[leftIndex]!
        for (
          let rightIndex = leftIndex + 1;
          rightIndex < items.structs.length;
          rightIndex++
        ) {
          const right = items.structs[rightIndex]!
          if (right.id.clock >= left.id.clock + left.length) break
          const start = Math.max(left.id.clock, right.id.clock)
          const end = Math.min(
            left.id.clock + left.length,
            right.id.clock + right.length
          )
          if (start >= end) continue
          if (
            left.parent !== right.parent ||
            (left.id.clock === right.id.clock &&
              (!equalIDs(left.origin, right.origin) ||
                !equalIDs(left.rightOrigin, right.rightOrigin)))
          ) {
            throw new Error(
              `conflicting structs use the same ID ${left.id.client}:${start}`
            )
          }
          if (left.content !== null && right.content !== null) {
            const leftText = left.content.slice(
              start - left.id.clock,
              end - left.id.clock
            )
            const rightText = right.content.slice(
              start - right.id.clock,
              end - right.id.clock
            )
            if (leftText !== rightText) {
              throw new Error(
                `conflicting structs use the same ID ${left.id.client}:${start}`
              )
            }
          }
        }
      }
    }
  }

  private drainPending(transaction: Transaction): void {
    let progressed: boolean
    do {
      progressed = false
      const pending = [...this.store.pending.values()].sort(
        (a, b) => a.id.client - b.id.client || a.id.clock - b.id.clock
      )
      for (const json of pending) {
        if (!this.dependenciesKnown(json)) continue
        if (!this.knownOriginsBelongToParent(json)) {
          // Pending data is provisional. Once dependencies prove it invalid,
          // discard only that struct; its unresolved dependents remain queued.
          this.store.pending.delete(idKey(json.id))
          progressed = true
          continue
        }
        if (this.integrate(json, transaction) !== null) {
          this.store.pending.delete(idKey(json.id))
          progressed = true
        }
      }
    } while (progressed)
  }

  /**
   * Integrate one item using the conflict-resolution loop from Yjs Item.integrate.
   *
   * `origin` and `rightOrigin` are immutable insertion-time neighbors. `left`
   * and `right` are mutable current neighbors. Concurrent insertions that chose
   * the same gap are ordered by client ID, recursively respecting origins.
   */
  private integrate(json: JsonItem, transaction: Transaction): Item | null {
    if (this.store.has(json.id)) return this.store.get(json.id)
    if (!this.dependenciesKnown(json)) {
      this.store.pending.set(idKey(json.id), json)
      return null
    }

    if (!this.knownOriginsBelongToParent(json)) {
      throw new Error('an item cannot use an origin from another shared text')
    }
    const text = this.getText(json.parent)
    const origin =
      json.origin === null ? null : this.store.cleanEnd(json.origin)
    const rightOrigin =
      json.rightOrigin === null ? null : this.store.cleanStart(json.rightOrigin)
    const item: Item = {
      id: copyID(json.id)!,
      length: json.length,
      origin: copyID(json.origin),
      rightOrigin: copyID(json.rightOrigin),
      parent: json.parent,
      content: json.content,
      left: origin,
      right: rightOrigin,
      deleted: json.content === null
    }

    let left = item.left
    if (
      (!left && (!item.right || item.right.left !== null)) ||
      (left && left.right !== item.right)
    ) {
      let cursor = left !== null ? left.right : text._start
      const conflicting = new Set<Item>()
      const beforeOrigin = new Set<Item>()

      while (cursor !== null && cursor !== item.right) {
        beforeOrigin.add(cursor)
        conflicting.add(cursor)
        if (equalIDs(item.origin, cursor.origin)) {
          if (cursor.id.client < item.id.client) {
            left = cursor
            conflicting.clear()
          } else if (equalIDs(item.rightOrigin, cursor.rightOrigin)) {
            break
          }
        } else if (
          cursor.origin !== null &&
          beforeOrigin.has(this.store.get(cursor.origin)!)
        ) {
          if (!conflicting.has(this.store.get(cursor.origin)!)) {
            left = cursor
            conflicting.clear()
          }
        } else {
          break
        }
        cursor = cursor.right
      }
      item.left = left
    }

    if (item.left !== null) {
      item.right = item.left.right
      item.left.right = item
    } else {
      item.right = text._start
      text._start = item
    }
    if (item.right !== null) item.right.left = item

    this.store.add(item)
    transaction.inserted.add(item.id.client, item.id.clock, item.length)
    if (item.deleted) {
      this.store.markDeleteRange({
        client: item.id.client,
        clock: item.id.clock,
        length: item.length
      })
      transaction.deleted.add(item.id.client, item.id.clock, item.length)
    }
    transaction.changedTexts.add(text)
    if (!item.deleted) text._changeLength(item.length)

    if (!item.deleted) {
      for (const range of this.store.deletedRangesIn(item)) {
        for (const deletedItem of this.store.itemsInRange(range)) {
          this.markDeleted(deletedItem, transaction)
        }
      }
    }
    return item
  }

  private knownOriginsBelongToParent(item: JsonItem): boolean {
    for (const origin of [item.origin, item.rightOrigin]) {
      if (origin === null) continue
      const dependency = this.store.get(origin)
      if (dependency !== null && dependency.parent !== item.parent) return false
    }
    return true
  }

  private markDeleted(item: Item, transaction: Transaction): void {
    this.store.markDeleteRange({
      client: item.id.client,
      clock: item.id.clock,
      length: item.length
    })
    if (item.deleted) return
    item.deleted = true
    transaction.deleted.add(item.id.client, item.id.clock, item.length)
    const text = this.getText(item.parent)
    text._changeLength(-item.length)
    transaction.changedTexts.add(text)
  }

  private eventDelta(text: Text, transaction: Transaction): DeltaOp[] {
    const result: DeltaOp[] = []
    for (let item = text._start; item !== null; item = item.right) {
      const added = transaction.inserted.contains(
        item.id.client,
        item.id.clock,
        item.length
      )
      const deleted = transaction.deleted.contains(
        item.id.client,
        item.id.clock,
        item.length
      )
      if (added && deleted) continue
      if (deleted) appendDelta(result, { delete: item.length })
      else if (added && !item.deleted) {
        appendDelta(result, { insert: item.content ?? '' })
      } else if (!item.deleted) {
        appendDelta(result, { retain: item.length })
      }
    }
    if ('retain' in (result.at(-1) ?? {})) result.pop()
    return result
  }

  private updateFromTransaction(transaction: Transaction): JsonUpdate {
    const structs: JsonItem[] = []
    for (const item of this.store.allItems()) {
      for (const range of transaction.inserted.intersections(
        item.id.client,
        item.id.clock,
        item.length
      )) {
        structs.push(
          this.store.toJSON(
            item,
            range.clock - item.id.clock,
            range.length
          )
        )
      }
    }
    structs.sort(
      (a, b) => a.id.client - b.id.client || a.id.clock - b.id.clock
    )

    const deletes = transaction.deleted.ranges()
    return {
      version: 1,
      structs,
      deletes
    }
  }
}
