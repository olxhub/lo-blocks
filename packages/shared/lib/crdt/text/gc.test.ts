import assert from 'node:assert/strict'
import { test } from 'vitest'
import { Doc, applyUpdate, type JsonUpdate } from './index'

test('gc defaults on: deleted payload is reclaimed and adjacent IDs coalesce', () => {
  const doc = new Doc({ clientID: 1 })
  const text = doc.getText()
  text.insert(0, 'a'.repeat(10_000))
  text.delete(0, 10_000)

  const items = doc.inspect().texts['']!
  assert.equal(items.length, 1)
  assert.deepEqual(items[0]?.id, { client: 1, clock: 0 })
  assert.equal(items[0]?.length, 10_000)
  assert.equal(items[0]?.content, null)
  assert.equal(items[0]?.deleted, true)
  assert.deepEqual(doc.getStateVector(), { '1': 10_000 })
})

test('gc false retains tombstone payload while still merging the run', () => {
  const doc = new Doc({ clientID: 1, gc: false })
  const text = doc.getText()
  text.insert(0, 'abc')
  text.delete(0, 3)
  const items = doc.inspect().texts['']!
  assert.equal(items.length, 1)
  assert.equal(items[0]?.length, 3)
  assert.equal(items[0]?.content, 'abc')
  assert.equal(items[0]?.deleted, true)
})

test('live items prevent unrelated deleted runs from coalescing', () => {
  const doc = new Doc({ clientID: 1 })
  const text = doc.getText()
  text.insert(0, 'abcde')
  text.delete(1, 1)
  text.delete(2, 1)
  const items = doc.inspect().texts['']!
  const collected = items.filter(item => item.deleted)
  assert.equal(collected.length, 2)
  assert.deepEqual(collected.map(item => item.id.clock), [1, 3])
})

test('a delayed insertion can address the interior of a collected range', () => {
  const source = new Doc({ clientID: 1, gc: false })
  const packets: JsonUpdate[] = []
  source.on('update', update =>
    packets.push(JSON.parse(JSON.stringify(update)) as JsonUpdate)
  )
  source.getText().insert(0, 'abc')
  source.getText().insert(2, 'X') // origin is b, right-origin is c

  const target = new Doc({ clientID: 2 })
  applyUpdate(target, packets[0]!)
  target.getText().delete(0, 3) // target compacts a..c into one collected range
  assert.equal(target.inspect().texts['']?.length, 1)

  applyUpdate(target, packets[1]!)
  assert.equal(target.getText().toString(), 'X')
  assert.equal(target.inspect().texts['']?.some(item => item.content === 'X'), true)
})

test('a collected document still synchronizes to an empty replica', () => {
  const source = new Doc({ clientID: 1 })
  source.getText().insert(0, 'discard me')
  source.getText().delete(0, source.getText().length)
  const update = source.encodeStateAsUpdate()
  assert.equal(update.structs.length, 1)
  assert.equal(update.structs[0]?.content, null)
  assert.equal(update.structs[0]?.length, 10)

  const target = new Doc({ clientID: 2 })
  applyUpdate(target, update)
  assert.equal(target.getText().toString(), '')
  assert.deepEqual(target.getStateVector(), { '1': 10 })
})

test('state-vector slicing works inside a collected clock range', () => {
  const doc = new Doc({ clientID: 1 })
  doc.getText().insert(0, 'abcdef')
  doc.getText().delete(0, 6)
  const update = doc.encodeStateAsUpdate({ '1': 3 })
  assert.equal(update.structs.length, 1)
  assert.deepEqual(update.structs[0]?.id, { client: 1, clock: 3 })
  assert.equal(update.structs[0]?.length, 3)
  assert.equal(update.structs[0]?.content, null)
  assert.deepEqual(update.structs[0]?.origin, { client: 1, clock: 2 })
})
