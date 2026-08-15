import assert from 'node:assert/strict'
import { test } from 'vitest'
import {
  Doc,
  applyUpdate,
  type DeltaOp,
  type JsonUpdate,
  type TextEvent,
  type Transaction
} from './index'

test('basic insert, append, prepend, and delete use UTF-16 indices', () => {
  const doc = new Doc({ clientID: 1 })
  const text = doc.getText('essay')

  text.insert(0, 'ac')
  text.insert(1, 'b')
  text.insert(text.length, '!')
  assert.equal(text.toString(), 'abc!')
  assert.equal(text.length, 4)

  text.delete(1, 2)
  assert.equal(text.toString(), 'a!')
  assert.equal(text.length, 2)
  assert.deepEqual(text.toJSON(), 'a!')
  assert.deepEqual(text.toDelta(), [{ insert: 'a!' }])
})

test('empty operations are harmless and bounds are checked before mutation', () => {
  const text = new Doc({ clientID: 1 }).getText()
  text.insert(0, '')
  text.delete(0, 0)
  assert.equal(text.toString(), '')

  assert.throws(() => text.insert(-1, 'x'), RangeError)
  assert.throws(() => text.insert(1, 'x'), RangeError)
  assert.throws(() => text.delete(0, 1), RangeError)
  text.insert(0, 'abc')
  assert.throws(() => text.delete(2, 2), RangeError)
  assert.equal(text.toString(), 'abc')
})

test('getText is stable and top-level texts are independent', () => {
  const doc = new Doc({ clientID: 1 })
  assert.equal(doc.getText('a'), doc.getText('a'))
  assert.equal(doc.get('a'), doc.getText('a'))
  doc.getText('a').insert(0, 'A')
  doc.getText('b').insert(0, 'B')
  assert.deepEqual(doc.toJSON(), { a: 'A', b: 'B' })
})

test('a transaction batches edits into one Yjs-style delta', () => {
  const doc = new Doc({ clientID: 1 })
  const text = doc.getText()
  text.insert(0, 'abcdef')
  const seen: DeltaOp[][] = []
  text.observe(event => seen.push([...event.delta]))

  doc.transact(() => {
    text.delete(1, 1)
    text.insert(1, 'XY')
    text.delete(5, 1)
  }, 'editor')

  assert.equal(text.toString(), 'aXYcdf')
  assert.deepEqual(seen, [
    [{ retain: 1 }, { delete: 1 }, { insert: 'XY' }, { retain: 2 }, { delete: 1 }]
  ])
})

test('insert then delete in one transaction emits an empty text delta', () => {
  const doc = new Doc({ clientID: 1 })
  const text = doc.getText()
  let observed: readonly DeltaOp[] | undefined
  text.observe(event => {
    observed = event.delta
  })
  doc.transact(() => {
    text.insert(0, 'temporary')
    text.delete(0, 9)
  })
  assert.deepEqual(observed, [])
  assert.equal(text.toString(), '')
  assert.equal(doc.inspect().texts['']?.length, 1)
  assert.equal(doc.inspect().texts['']?.[0]?.length, 9)
})

test('observer transaction exposes origin, locality, and ID membership', () => {
  const doc = new Doc({ clientID: 7 })
  const text = doc.getText()
  let seenEvent: TextEvent | undefined
  let seenTransaction: Transaction | undefined
  text.observe((event, transaction) => {
    seenEvent = event
    seenTransaction = transaction
  })
  doc.transact(() => text.insert(0, 'x'), { source: 'typing' })

  assert.equal(seenEvent?.target, text)
  assert.equal(seenEvent?.transaction, seenTransaction)
  assert.deepEqual(seenTransaction?.origin, { source: 'typing' })
  assert.equal(seenTransaction?.local, true)
  assert.equal(seenTransaction?.adds({ client: 7, clock: 0 }), true)
  assert.equal(seenTransaction?.deletes({ client: 7, clock: 0 }), false)
  assert.deepEqual(seenTransaction?.beforeState, {})
  assert.deepEqual(seenTransaction?.afterState, { '7': 1 })
})

test('document lifecycle events have Yjs-compatible ordering', () => {
  const doc = new Doc({ clientID: 1 })
  const text = doc.getText()
  const order: string[] = []
  doc.on('beforeTransaction', () => order.push('beforeTransaction'))
  doc.on('beforeObserverCalls', () => order.push('beforeObserverCalls'))
  text.observe(() => order.push('observe'))
  doc.on('afterTransaction', () => order.push('afterTransaction'))
  doc.on('update', () => order.push('update'))
  text.insert(0, 'x')
  assert.deepEqual(order, [
    'beforeTransaction',
    'beforeObserverCalls',
    'observe',
    'afterTransaction',
    'update'
  ])
})

test('applyDelta supports the plain text insert/retain/delete subset', () => {
  const text = new Doc({ clientID: 1 }).getText()
  text.insert(0, 'abcd')
  text.applyDelta([
    { retain: 1 },
    { delete: 2 },
    { insert: 'XY' }
  ])
  assert.equal(text.toString(), 'aXYd')
})

test('uncollected tombstones retain content, IDs, and linked-list location', () => {
  const doc = new Doc({ clientID: 5, gc: false })
  const text = doc.getText('notes')
  text.insert(0, 'abc')
  text.delete(1, 1)

  const items = doc.inspect().texts.notes!
  assert.equal(items.length, 3)
  assert.equal(items[1]?.content, 'b')
  assert.equal(items[1]?.deleted, true)
  assert.deepEqual(items[1]?.id, { client: 5, clock: 1 })
  assert.deepEqual(items[1]?.left, { client: 5, clock: 0 })
  assert.deepEqual(items[1]?.right, { client: 5, clock: 2 })
  assert.deepEqual(doc.inspect().deletes, [{ client: 5, clock: 1, length: 1 }])
})

test('unobserve removes a listener', () => {
  const text = new Doc({ clientID: 1 }).getText()
  let calls = 0
  const listener = text.observe(() => calls++)
  text.insert(0, 'a')
  text.unobserve(listener)
  text.insert(1, 'b')
  assert.equal(calls, 1)
})

test('throwing observers do not skip later observers or outbound updates', () => {
  const doc = new Doc({ clientID: 1 })
  const text = doc.getText()
  const calls: string[] = []
  const updates: JsonUpdate[] = []
  text.observe(() => {
    calls.push('throwing')
    throw new Error('observer failed')
  })
  text.observe(() => calls.push('later'))
  doc.on('update', update => updates.push(update as JsonUpdate))

  assert.throws(() => text.insert(0, 'hello'), /observer failed/)
  assert.deepEqual(calls, ['throwing', 'later'])
  assert.equal(updates.length, 1)
  assert.equal(text.toString(), 'hello')
  const peer = new Doc({ clientID: 2 })
  applyUpdate(peer, updates[0]!)
  assert.equal(peer.getText().toString(), 'hello')
  doc.assertIntegrity()
})

test('a throwing transaction body commits its batch like Yjs', () => {
  const doc = new Doc({ clientID: 1 })
  const text = doc.getText()
  let updates = 0
  doc.on('update', () => updates++)

  assert.throws(
    () =>
      doc.transact(() => {
        text.insert(0, 'abc')
        throw new Error('body failed')
      }),
    /body failed/
  )
  assert.equal(text.toString(), 'abc')
  assert.equal(updates, 1)
})

test('nested transactions return values without opening another batch', () => {
  const doc = new Doc({ clientID: 1 })
  let updates = 0
  doc.on('update', () => updates++)
  const result = doc.transact(() => {
    doc.getText().insert(0, 'x')
    return doc.transact(() => 43)
  })
  assert.equal(result, 43)
  assert.equal(updates, 1)
})

test('applyDelta rejects a retain beyond the end without mutation', () => {
  const text = new Doc({ clientID: 1 }).getText()
  text.insert(0, 'abc')
  assert.throws(
    () => text.applyDelta([{ retain: 4 }, { insert: 'x' }]),
    RangeError
  )
  assert.equal(text.toString(), 'abc')
})

test('UTF-16 deletion may deliberately split a surrogate pair', () => {
  const text = new Doc({ clientID: 1 }).getText()
  text.insert(0, 'a😀b')
  text.delete(1, 1)

  assert.equal(text.length, 3)
  assert.deepEqual(
    [...text.toString()].map(character => character.codePointAt(0)),
    [0x61, 0xde00, 0x62]
  )
})

test('a throwing beforeTransaction listener cannot wedge or veto edits', () => {
  const doc = new Doc({ clientID: 1 })
  const peer = new Doc({ clientID: 2 })
  const updates: JsonUpdate[] = []
  const listener = doc.on('beforeTransaction', () => {
    throw new Error('lifecycle listener failed')
  })
  doc.on('update', update => updates.push(update as JsonUpdate))

  assert.throws(
    () => doc.getText().insert(0, 'hello'),
    /lifecycle listener failed/
  )
  assert.equal(doc.getText().toString(), 'hello')
  assert.equal(updates.length, 1)

  doc.off('beforeTransaction', listener)
  doc.getText().insert(5, '!')
  assert.equal(updates.length, 2)
  for (const update of updates) applyUpdate(peer, update)
  assert.equal(peer.getText().toString(), 'hello!')
})
