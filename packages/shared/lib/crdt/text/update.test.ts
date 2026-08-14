import assert from 'node:assert/strict'
import { test } from 'vitest'
import {
  Doc,
  applyUpdate,
  encodeStateAsUpdate,
  encodeStateVector,
  mergeUpdates,
  parseUpdate,
  stringifyUpdate,
  validateUpdate,
  type JsonUpdate
} from './index'

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

test('updates are pure JSON and survive a JSON round trip', () => {
  const source = new Doc({ clientID: 10 })
  source.getText('t').insert(0, 'hello 🌍')
  source.getText('t').delete(1, 2)
  const update = encodeStateAsUpdate(source)
  const json = stringifyUpdate(update)
  const parsed = parseUpdate(json)

  assert.deepEqual(parsed, update)
  assert.equal(JSON.stringify(parsed).includes('Uint8Array'), false)
  const target = new Doc({ clientID: 20 })
  applyUpdate(target, parsed)
  assert.equal(target.getText('t').toString(), source.getText('t').toString())
})

test('a pasted string is transmitted as one range struct', () => {
  const doc = new Doc({ clientID: 1 })
  const updates: JsonUpdate[] = []
  doc.on('update', update => updates.push(update as JsonUpdate))
  const content = '0123456789'.repeat(500)
  doc.getText().insert(0, content)

  assert.equal(updates.length, 1)
  assert.equal(updates[0]?.structs.length, 1)
  assert.equal(updates[0]?.structs[0]?.length, content.length)
  assert.equal(updates[0]?.structs[0]?.content, content)
})

test('state vectors produce incremental updates', () => {
  const a = new Doc({ clientID: 1 })
  const b = new Doc({ clientID: 2 })
  a.getText().insert(0, 'abc')
  applyUpdate(b, encodeStateAsUpdate(a))

  const vector = encodeStateVector(b)
  assert.deepEqual(vector, { '1': 3 })
  a.getText().insert(3, 'def')
  const incremental = encodeStateAsUpdate(a, vector)
  assert.equal(incremental.structs.length, 1)
  assert.equal(incremental.structs[0]?.length, 3)
  assert.equal(incremental.structs[0]?.content, 'def')
  applyUpdate(b, incremental)
  assert.equal(b.getText().toString(), 'abcdef')
})

test('duplicate updates are idempotent', () => {
  const a = new Doc({ clientID: 1 })
  const b = new Doc({ clientID: 2 })
  a.getText().insert(0, 'abc')
  a.getText().delete(1, 1)
  const update = clone(encodeStateAsUpdate(a))
  applyUpdate(b, update)
  applyUpdate(b, update)
  applyUpdate(b, update)
  assert.equal(b.getText().toString(), 'ac')
  assert.equal(b.inspect().texts['']?.length, 3)
})

test('later client clocks wait for missing earlier updates', () => {
  const source = new Doc({ clientID: 1 })
  const packets: JsonUpdate[] = []
  source.on('update', update => packets.push(clone(update as JsonUpdate)))
  source.getText().insert(0, 'a')
  source.getText().insert(1, 'b')

  const target = new Doc({ clientID: 2 })
  applyUpdate(target, packets[1]!)
  assert.equal(target.getText().toString(), '')
  assert.equal(target.inspect().pending.length, 1)
  applyUpdate(target, packets[0]!)
  assert.equal(target.getText().toString(), 'ab')
  assert.equal(target.inspect().pending.length, 0)
})

test('a deletion may arrive before the item it deletes', () => {
  const source = new Doc({ clientID: 1 })
  source.getText().insert(0, 'x')
  const insertion = encodeStateAsUpdate(source)
  source.getText().delete(0, 1)
  const deletionOnly: JsonUpdate = {
    version: 1,
    structs: [],
    deletes: [{ client: 1, clock: 0, length: 1 }]
  }

  const target = new Doc({ clientID: 2 })
  applyUpdate(target, deletionOnly)
  applyUpdate(target, insertion)
  assert.equal(target.getText().toString(), '')
  assert.equal(target.inspect().texts['']?.[0]?.deleted, true)
})

test('a partial deletion may arrive before a chunk containing its IDs', () => {
  const target = new Doc({ clientID: 2 })
  const deletion: JsonUpdate = {
    version: 1,
    structs: [],
    deletes: [{ client: 1, clock: 2, length: 3 }]
  }
  const insertion: JsonUpdate = {
    version: 1,
    structs: [{
      id: { client: 1, clock: 0 },
      length: 7,
      origin: null,
      rightOrigin: null,
      parent: '',
      content: 'abcdefg'
    }],
    deletes: []
  }

  applyUpdate(target, deletion)
  applyUpdate(target, insertion)
  assert.equal(target.getText().toString(), 'abfg')
  assert.deepEqual(
    target.inspect().texts['']?.map(item => [item.length, item.deleted]),
    [[2, false], [3, true], [2, false]]
  )
})

test('mergeUpdates deduplicates structs and coalesces delete ranges', () => {
  const source = new Doc({ clientID: 1 })
  const packets: JsonUpdate[] = []
  source.on('update', update => packets.push(clone(update as JsonUpdate)))
  source.getText().insert(0, 'abc')
  source.getText().delete(0, 1)
  source.getText().delete(0, 1)

  const merged = mergeUpdates([...packets, packets[0]!])
  assert.equal(merged.structs.length, 1)
  assert.equal(merged.structs[0]?.length, 3)
  assert.deepEqual(merged.deletes, [{ client: 1, clock: 0, length: 2 }])
  const target = new Doc({ clientID: 2 })
  applyUpdate(target, merged)
  assert.equal(target.getText().toString(), 'c')
})

test('mergeUpdates accepts views from before and after garbage collection', () => {
  const source = new Doc({ clientID: 1 })
  source.getText().insert(0, 'abc')
  const beforeDelete = source.encodeStateAsUpdate()
  source.getText().delete(0, 3)
  const afterCollection = source.encodeStateAsUpdate()

  const merged = mergeUpdates([beforeDelete, afterCollection])
  const target = new Doc({ clientID: 2 })
  applyUpdate(target, merged)
  assert.equal(target.getText().toString(), '')
  target.assertIntegrity()
})

test('right-origin dependencies can arrive before both sides of their gap', () => {
  const source = new Doc({ clientID: 1 })
  const packets: JsonUpdate[] = []
  source.on('update', update => packets.push(clone(update as JsonUpdate)))
  source.getText().insert(0, 'ab')
  source.getText().insert(1, 'X')

  const target = new Doc({ clientID: 2 })
  applyUpdate(target, packets[1]!)
  assert.equal(target.inspect().pending.length, 1)
  applyUpdate(target, packets[0]!)
  assert.equal(target.getText().toString(), 'aXb')
  target.assertIntegrity()
})

test('one update synchronizes multiple named texts', () => {
  const a = new Doc({ clientID: 1 })
  a.getText('title').insert(0, 'CRDTs')
  a.getText('body').insert(0, 'converge')
  const b = new Doc({ clientID: 2 })
  applyUpdate(b, encodeStateAsUpdate(a))
  assert.deepEqual(b.toJSON(), { title: 'CRDTs', body: 'converge' })
})

test('remote observers receive local=false and the apply origin', () => {
  const a = new Doc({ clientID: 1 })
  const b = new Doc({ clientID: 2 })
  a.getText().insert(0, 'x')
  let local: boolean | undefined
  let origin: unknown
  b.getText().observe((_event, transaction) => {
    local = transaction.local
    origin = transaction.origin
  })
  applyUpdate(b, encodeStateAsUpdate(a), 'network')
  assert.equal(local, false)
  assert.equal(origin, 'network')
})

test('malformed and conflicting updates fail loudly', () => {
  assert.throws(
    () => validateUpdate({
      version: 1,
      structs: [],
      deletes: [{ client: 1, clock: 0, length: 0 }]
    }),
    RangeError
  )
  assert.throws(
    () => validateUpdate({ version: 2, structs: [], deletes: [] }),
    /version/
  )
  assert.throws(
    () => validateUpdate({
      version: 1,
      structs: [],
      deletes: [{
        client: 1,
        clock: Number.MAX_SAFE_INTEGER,
        length: 1
      }]
    }),
    /clock \+ length/
  )

  const doc = new Doc({ clientID: 2 })
  const first: JsonUpdate = {
    version: 1,
    structs: [{
      id: { client: 1, clock: 0 },
      length: 1,
      origin: null,
      rightOrigin: null,
      parent: '',
      content: 'a'
    }],
    deletes: []
  }
  applyUpdate(doc, first)
  assert.throws(
    () => applyUpdate(doc, {
      ...first,
      structs: [{ ...first.structs[0]!, content: 'b' }]
    }),
    /conflicting/
  )
})

test('a semantic conflict rejects the whole update before mutation', () => {
  const doc = new Doc({ clientID: 9 })
  doc.getText().insert(0, 'a')
  let emitted = 0
  doc.on('update', () => emitted++)

  const update: JsonUpdate = {
    version: 1,
    structs: [
      {
        id: { client: 2, clock: 0 },
        length: 1,
        origin: { client: 9, clock: 0 },
        rightOrigin: null,
        parent: '',
        content: 'Z'
      },
      {
        id: { client: 9, clock: 0 },
        length: 1,
        origin: null,
        rightOrigin: null,
        parent: '',
        content: 'b'
      }
    ],
    deletes: []
  }

  assert.throws(() => applyUpdate(doc, update), /conflicting/)
  assert.equal(doc.getText().toString(), 'a')
  assert.deepEqual(doc.getStateVector(), { '9': 1 })
  assert.equal(emitted, 0)
  doc.assertIntegrity()
})

test('a cross-text origin rejects the whole update before mutation', () => {
  const doc = new Doc({ clientID: 1 })
  doc.getText('a').insert(0, 'a')
  const update: JsonUpdate = {
    version: 1,
    structs: [
      {
        id: { client: 2, clock: 0 },
        length: 1,
        origin: null,
        rightOrigin: null,
        parent: 'b',
        content: 'B'
      },
      {
        id: { client: 2, clock: 1 },
        length: 1,
        origin: { client: 1, clock: 0 },
        rightOrigin: null,
        parent: 'b',
        content: '!'
      }
    ],
    deletes: []
  }

  assert.throws(() => applyUpdate(doc, update), /another shared text/)
  assert.deepEqual(doc.toJSON(), { a: 'a' })
  assert.deepEqual(doc.getStateVector(), { '1': 1 })
})

test('mergeUpdates keeps a multi-million-clock delete as one range', () => {
  const range = { client: 1, clock: 10, length: 2_000_000 }
  const update: JsonUpdate = { version: 1, structs: [], deletes: [range] }
  assert.deepEqual(mergeUpdates([update, update]).deletes, [range])
})

test('documents sharing a client ID reject conflicting histories', () => {
  const alice = new Doc({ clientID: 5 })
  const bob = new Doc({ clientID: 5 })
  alice.getText().insert(0, 'A')
  bob.getText().insert(0, 'B')

  assert.throws(
    () => applyUpdate(alice, bob.encodeStateAsUpdate()),
    /conflicting structs use the same ID 5:0/
  )
  assert.equal(alice.getText().toString(), 'A')
})

test('a valid incoming struct replaces a conflicting provisional claim', () => {
  const doc = new Doc({ clientID: 1 })
  applyUpdate(doc, {
    version: 1,
    structs: [{
      id: { client: 7, clock: 0 },
      length: 1,
      origin: { client: 999_999, clock: 0 },
      rightOrigin: null,
      parent: '',
      content: 'X'
    }],
    deletes: []
  })
  assert.equal(doc.inspect().pending.length, 1)

  applyUpdate(doc, {
    version: 1,
    structs: [{
      id: { client: 7, clock: 0 },
      length: 1,
      origin: null,
      rightOrigin: null,
      parent: '',
      content: 'A'
    }],
    deletes: []
  })
  assert.equal(doc.getText().toString(), 'A')
  assert.equal(doc.inspect().pending.length, 0)
})

test('an invalid deferred struct is discarded without rejecting its dependency', () => {
  const doc = new Doc({ clientID: 9 })
  applyUpdate(doc, {
    version: 1,
    structs: [
      {
        id: { client: 2, clock: 0 },
        length: 1,
        origin: { client: 1, clock: 0 },
        rightOrigin: null,
        parent: 'b',
        content: 'B'
      },
      {
        id: { client: 2, clock: 1 },
        length: 1,
        origin: { client: 2, clock: 0 },
        rightOrigin: null,
        parent: 'b',
        content: '!'
      }
    ],
    deletes: []
  })
  assert.equal(doc.inspect().pending.length, 2)

  applyUpdate(doc, {
    version: 1,
    structs: [{
      id: { client: 1, clock: 0 },
      length: 1,
      origin: null,
      rightOrigin: null,
      parent: 'a',
      content: 'a'
    }],
    deletes: []
  })

  assert.deepEqual(doc.toJSON(), { a: 'a' })
  assert.equal(doc.inspect().pending.length, 1)
  assert.deepEqual(doc.inspect().pending[0]?.id, { client: 2, clock: 1 })
  doc.assertIntegrity()
})

test('re-entrant observer updates replay safely in emitted order', () => {
  const source = new Doc({ clientID: 1 })
  const target = new Doc({ clientID: 2 })
  const packets: JsonUpdate[] = []
  source.on('update', update => packets.push(clone(update as JsonUpdate)))
  let observations = 0
  source.getText().observe(() => {
    if (observations++ === 0) source.getText().insert(1, '!')
  })

  source.getText().insert(0, 'a')
  assert.deepEqual(
    packets.map(update => update.structs.map(item => item.content).join('')),
    ['!', 'a']
  )
  for (const packet of packets) applyUpdate(target, packet)
  assert.equal(target.getText().toString(), 'a!')
  assert.equal(target.inspect().pending.length, 0)
})

test('overlap validation catches conflicts nested behind another range', () => {
  const doc = new Doc({ clientID: 9 })
  const update: JsonUpdate = {
    version: 1,
    structs: [
      {
        id: { client: 1, clock: 0 },
        length: 10,
        origin: null,
        rightOrigin: null,
        parent: '',
        content: 'abcdefghij'
      },
      {
        id: { client: 1, clock: 1 },
        length: 1,
        origin: { client: 1, clock: 0 },
        rightOrigin: null,
        parent: '',
        content: 'b'
      },
      {
        id: { client: 1, clock: 3 },
        length: 1,
        origin: { client: 1, clock: 2 },
        rightOrigin: null,
        parent: '',
        content: 'X'
      }
    ],
    deletes: []
  }

  assert.throws(() => applyUpdate(doc, update), /conflicting/)
  assert.deepEqual(doc.getStateVector(), {})
  assert.equal(doc.getText().toString(), '')
})
