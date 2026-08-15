import type { Doc } from './doc'
import { callAll } from './callbacks'
import { TextEvent, type Transaction } from './events'
import type { DeltaOp, ID, InspectItem } from './types'
import type { Item } from './store'

export type TextObserver = (event: TextEvent, transaction: Transaction) => void

export class Text {
  /** First item in integration order, including tombstones. */
  _start: Item | null = null
  private visibleLength = 0
  private readonly observers = new Set<TextObserver>()

  constructor (
    readonly doc: Doc,
    readonly name: string
  ) {}

  get length (): number {
    return this.visibleLength
  }

  toString(): string {
    let result = ''
    for (let item = this._start; item !== null; item = item.right) {
      if (!item.deleted) result += item.content
    }
    return result
  }

  toJSON(): string {
    return this.toString()
  }

  toDelta(): readonly DeltaOp[] {
    const value = this.toString()
    return value.length === 0 ? [] : [{ insert: value }]
  }

  insert(index: number, content: string): void {
    this.doc.insert(this, index, content)
  }

  delete(index: number, length = 1): void {
    this.doc.delete(this, index, length)
  }

  /**
   * Plain-text subset of Y.Text.applyDelta.
   * Formatting attributes and embeds are rejected instead of silently lost.
   */
  applyDelta(delta: readonly DeltaOp[]): void {
    this.doc.transact(() => {
      let index = 0
      for (const op of delta) {
        if ('retain' in op) {
          index += op.retain
        } else if ('insert' in op) {
          this.insert(index, op.insert)
          index += op.insert.length
        } else {
          this.delete(index, op.delete)
        }
      }
    })
  }

  observe(observer: TextObserver): TextObserver {
    this.observers.add(observer)
    return observer
  }

  unobserve(observer: TextObserver): void {
    this.observers.delete(observer)
  }

  _notify(event: TextEvent, transaction: Transaction): void {
    callAll(
      [...this.observers].map(
        observer => () => observer(event, transaction)
      )
    )
  }

  _changeLength(change: number): void {
    this.visibleLength += change
    if (this.visibleLength < 0) throw new Error('text length became negative')
  }

  _boundary(index: number): { left: Item | null; right: Item | null } {
    if (!Number.isSafeInteger(index) || index < 0 || index > this.length) {
      throw new RangeError(`index ${index} is outside text length ${this.length}`)
    }
    let left: Item | null = null
    let right = this._start
    let remaining = index
    while (right !== null) {
      if (!right.deleted) {
        if (remaining === 0) break
        if (remaining < right.length) {
          right = this.doc.store.cleanStart({
            client: right.id.client,
            clock: right.id.clock + remaining
          })
          left = right.left
          remaining = 0
          break
        }
        remaining -= right.length
      }
      left = right
      right = right.right
    }
    return { left, right }
  }

  _visibleItems(index: number, length: number): Item[] {
    if (!Number.isSafeInteger(length) || length < 0) {
      throw new RangeError('delete length must be a non-negative safe integer')
    }
    if (index + length > this.length) {
      throw new RangeError(
        `delete [${index}, ${index + length}) exceeds text length ${this.length}`
      )
    }
    const start = this._boundary(index)
    const end = this._boundary(index + length).right
    let item = start.right
    const result: Item[] = []
    while (item !== null && item !== end) {
      if (!item.deleted) result.push(item)
      item = item.right
    }
    return result
  }

  _inspect(): InspectItem[] {
    const result: InspectItem[] = []
    for (let item = this._start; item !== null; item = item.right) {
      result.push(this.doc.store.inspect(item))
    }
    return result
  }

  _idAt(index: number): ID | null {
    return this._boundary(index).right?.id ?? null
  }
}
