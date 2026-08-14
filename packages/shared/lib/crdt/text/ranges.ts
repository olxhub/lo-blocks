import type { DeleteRange, ID } from './types'

/**
 * A sorted, coalesced set of client-clock intervals.
 *
 * Yjs uses the same idea for insert/delete sets. Keeping transaction changes
 * as ranges is what makes a 5,000-character paste or deletion one record
 * instead of 5,000 temporary string keys.
 */
export class IDRangeSet {
  private readonly clients = new Map<number, DeleteRange[]>()

  get isEmpty(): boolean {
    return this.clients.size === 0
  }

  add(client: number, clock: number, length: number): void {
    if (length <= 0) return
    const ranges = this.clients.get(client) ?? []
    ranges.push({ client, clock, length })
    ranges.sort((a, b) => a.clock - b.clock)
    const merged: DeleteRange[] = []
    for (const current of ranges) {
      const previous = merged.at(-1)
      if (
        previous !== undefined &&
        current.clock <= previous.clock + previous.length
      ) {
        const end = Math.max(
          previous.clock + previous.length,
          current.clock + current.length
        )
        ;(previous as { length: number }).length = end - previous.clock
      } else {
        merged.push({ ...current })
      }
    }
    this.clients.set(client, merged)
  }

  has(id: ID): boolean {
    return (this.clients.get(id.client) ?? []).some(
      range => range.clock <= id.clock && id.clock < range.clock + range.length
    )
  }

  contains(client: number, clock: number, length: number): boolean {
    const end = clock + length
    return (this.clients.get(client) ?? []).some(
      range => range.clock <= clock && end <= range.clock + range.length
    )
  }

  intersections(client: number, clock: number, length: number): DeleteRange[] {
    const end = clock + length
    const result: DeleteRange[] = []
    for (const range of this.clients.get(client) ?? []) {
      const start = Math.max(clock, range.clock)
      const overlapEnd = Math.min(end, range.clock + range.length)
      if (start < overlapEnd) {
        result.push({ client, clock: start, length: overlapEnd - start })
      }
    }
    return result
  }

  ranges(): DeleteRange[] {
    return [...this.clients.values()].flat().map(range => ({ ...range }))
  }
}
