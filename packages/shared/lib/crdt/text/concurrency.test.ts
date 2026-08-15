import assert from 'node:assert/strict'
import { test } from 'vitest'
import { Doc, applyUpdate, type JsonUpdate } from './index'

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

const logicalItems = (doc: Doc): unknown[] =>
  (doc.inspect().texts[''] ?? []).flatMap(item =>
    Array.from({ length: item.length }, (_, offset) => ({
      id: { client: item.id.client, clock: item.id.clock + offset },
      origin:
        offset === 0
          ? item.origin
          : { client: item.id.client, clock: item.id.clock + offset - 1 },
      rightOrigin: item.rightOrigin,
      parent: item.parent,
      content: item.content === null ? null : item.content[offset],
      deleted: item.deleted
    }))
  )

const syncAll = (docs: Doc[]): void => {
  const updates = docs.map(doc => clone(doc.encodeStateAsUpdate()))
  for (const doc of docs) {
    for (const update of updates) applyUpdate(doc, update)
  }
}

test('concurrent insertions in the same gap use Yjs client-ID ordering', () => {
  const low = new Doc({ clientID: 1 })
  const high = new Doc({ clientID: 2 })
  low.getText().insert(0, 'L')
  high.getText().insert(0, 'H')
  syncAll([low, high])
  assert.equal(low.getText().toString(), 'LH')
  assert.equal(high.getText().toString(), 'LH')
})

test('concurrent insertions recursively respect their insertion origins', () => {
  const a = new Doc({ clientID: 1 })
  const b = new Doc({ clientID: 2 })
  a.getText().insert(0, 'ab')
  applyUpdate(b, a.encodeStateAsUpdate())

  a.getText().insert(1, 'X')
  a.getText().insert(2, 'x')
  b.getText().insert(1, 'Y')
  b.getText().insert(2, 'y')
  syncAll([a, b])
  assert.equal(a.getText().toString(), b.getText().toString())
  assert.equal(a.getText().toString(), 'aXxYyb')
})

test('delete versus concurrent insert preserves the insertion', () => {
  const a = new Doc({ clientID: 1 })
  const b = new Doc({ clientID: 2 })
  a.getText().insert(0, 'abc')
  applyUpdate(b, a.encodeStateAsUpdate())

  a.getText().delete(1, 1)
  b.getText().insert(2, 'X')
  syncAll([a, b])
  assert.equal(a.getText().toString(), 'aXc')
  assert.equal(b.getText().toString(), 'aXc')
  assert.equal(a.inspect().texts['']?.length, 4)
})

test('all permutations of three concurrent packets converge', () => {
  const sources = [1, 2, 3].map(clientID => new Doc({ clientID }))
  sources[0]!.getText().insert(0, 'A')
  sources[1]!.getText().insert(0, 'B')
  sources[2]!.getText().insert(0, 'C')
  const packets = sources.map(doc => clone(doc.encodeStateAsUpdate()))
  const orders = [
    [0, 1, 2],
    [0, 2, 1],
    [1, 0, 2],
    [1, 2, 0],
    [2, 0, 1],
    [2, 1, 0]
  ]
  for (const order of orders) {
    const target = new Doc({ clientID: 99 })
    for (const index of order) applyUpdate(target, packets[index]!)
    assert.equal(target.getText().toString(), 'ABC')
  }
})

test('seeded offline-edit fuzz converges under shuffled duplicate delivery', () => {
  let seed = 0x5eed1234
  const random = (): number => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed / 0x100000000
  }
  const docs = [11, 22, 33, 44].map(clientID => new Doc({ clientID }))
  const packets: JsonUpdate[] = []
  for (const doc of docs) {
    doc.on('update', update => packets.push(clone(update as JsonUpdate)))
  }

  for (let round = 0; round < 200; round++) {
    const doc = docs[Math.floor(random() * docs.length)]!
    const text = doc.getText()
    if (text.length === 0 || random() < 0.62) {
      const position = Math.floor(random() * (text.length + 1))
      const character = String.fromCharCode(97 + Math.floor(random() * 26))
      text.insert(position, character)
    } else {
      const position = Math.floor(random() * text.length)
      text.delete(position, 1)
    }

    // Occasionally deliver an arbitrary packet, including duplicates.
    if (packets.length > 0 && random() < 0.35) {
      const receiver = docs[Math.floor(random() * docs.length)]!
      applyUpdate(receiver, packets[Math.floor(random() * packets.length)]!)
      receiver.assertIntegrity()
    }
  }

  const shuffled = [...packets, ...packets.slice(0, 20)].sort(() => random() - 0.5)
  for (const doc of docs) {
    for (const packet of shuffled) applyUpdate(doc, packet)
    doc.assertIntegrity()
  }
  const values = docs.map(doc => doc.getText().toString())
  assert.equal(new Set(values).size, 1, values.join('\n---\n'))
  const inspections = docs.map(doc => JSON.stringify(logicalItems(doc)))
  assert.equal(new Set(inspections).size, 1)
})

test('a large pasted string remains fully introspectable', () => {
  const doc = new Doc({ clientID: 1 })
  const pasted = '0123456789'.repeat(1000)
  doc.getText().insert(0, pasted)
  assert.equal(doc.getText().toString(), pasted)
  assert.equal(doc.inspect().texts['']?.length, 1)
  assert.equal(doc.inspect().texts['']?.[0]?.length, pasted.length)
  assert.deepEqual(doc.getStateVector(), { '1': pasted.length })
})
