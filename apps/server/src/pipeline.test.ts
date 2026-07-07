// @vitest-environment node
// apps/server/src/pipeline.test.ts
//
// End-to-end pipeline tests over a fake WebSocket: the canonical switch
// (blob vs fields on fetch_blob), field persistence as events reduce,
// and blob fallback for users who predate the field store.

import { test, expect } from 'vitest';
import { EventEmitter } from 'node:events';
import zlib from 'node:zlib';
import { runPipeline, type PipelineContext } from './pipeline.js';
import { MemoryKVStore } from './kvs.js';
import { FieldPersister } from './fieldStore.js';
import { kvsKey, type SafeUserId } from '@/lib/types/identity';
import type { AuthUser } from './auth.js';
import type { ConnectionLog } from './eventLog.js';

const USER: AuthUser = {
  user_id: 'PipeTester', provenance: 'guest',
  safe_user_id: 'guest-PipeTester' as SafeUserId, authorized: false,
} as AuthUser;

/** Minimal stand-in for the ws socket: emits 'message'/'close', records sends. */
class FakeWs extends EventEmitter {
  OPEN = 1;
  readyState = 1;
  sent: any[] = [];
  send(data: string) { this.sent.push(JSON.parse(data)); }
}

function fakeConn(): ConnectionLog {
  // Real gzip stream into the void — appendEvent needs .write only.
  const stream = zlib.createGzip();
  stream.resume();
  return {
    id: 'test-conn', user: USER, path: '/dev/null', stream,
    fileStream: null as any,
    log: { description: 'test', started: '', user: USER, eventCount: 0 } as any,
  };
}

/** Run the pipeline over a scripted message sequence; return sent frames. */
async function drive(ctx: Partial<PipelineContext>, messages: object[]) {
  const ws = new FakeWs();
  const full: PipelineContext = {
    ws: ws as any, user: USER, conn: fakeConn(),
    kvs: new MemoryKVStore(), ...ctx,
  };
  const run = runPipeline(full);
  for (const m of messages) ws.emit('message', Buffer.from(JSON.stringify(m)));
  // Let queued messages drain through the async generators, then close.
  await new Promise(r => setTimeout(r, 20));
  ws.emit('close');
  await run;
  return { sent: ws.sent, ctx: full };
}

const UPDATE = {
  event: 'UPDATE_VALUE', field: 'value', scope: 'component',
  id: 'pipe-block', value: 'v1', ts: 1, actor: 'test',
};

test('blob canonical: fetch_blob serves the stored blob', async () => {
  const kvs = new MemoryKVStore();
  await kvs.set(kvsKey.blob(USER.safe_user_id), JSON.stringify({
    application_state: { component: { b: { value: 'from-blob' } } },
  }));
  const { sent } = await drive({ kvs, canonical: 'blob' }, [{ event: 'fetch_blob' }]);
  const fetch = sent.find(m => m.status === 'fetch_blob');
  expect(fetch.data.application_state.component.b.value).toBe('from-blob');
});

test('events persist to field keys as they reduce', async () => {
  const kvs = new MemoryKVStore();
  const { ctx } = await drive({ kvs, canonical: 'blob' }, [UPDATE]);
  await ctx.persister!.close();
  const stored = await kvs.get(kvsKey.field(USER.safe_user_id, 'component', 'pipe-block'));
  expect(JSON.parse(stored!).value).toBe('v1');
});

test('fields canonical: fetch_blob serves assembled field state', async () => {
  const kvs = new MemoryKVStore();
  // A previous session persisted per-field state.
  const p = new FieldPersister(kvs, USER.safe_user_id, 0);
  p.note({ system: {}, component: { b: { value: 'from-fields' } }, componentSetting: {} });
  await p.close();

  const { sent } = await drive({ kvs, canonical: 'fields' }, [{ event: 'fetch_blob' }]);
  const fetch = sent.find(m => m.status === 'fetch_blob');
  expect(fetch.data.application_state.component.b.value).toBe('from-fields');
});

test('fields canonical falls back to blob for users without field state', async () => {
  const kvs = new MemoryKVStore();
  await kvs.set(kvsKey.blob(USER.safe_user_id), JSON.stringify({
    application_state: { component: { b: { value: 'legacy-blob' } } },
  }));
  const { sent } = await drive({ kvs, canonical: 'fields' }, [{ event: 'fetch_blob' }]);
  const fetch = sent.find(m => m.status === 'fetch_blob');
  expect(fetch.data.application_state.component.b.value).toBe('legacy-blob');
});

test('fetch seed + events: assembled state accumulates across sessions', async () => {
  const kvs = new MemoryKVStore();
  await kvs.set(kvsKey.blob(USER.safe_user_id), JSON.stringify({
    application_state: { system: {}, component: { old: { value: 'kept' } }, componentSetting: {} },
  }));
  // Session 1: fetch (seeds from blob), then a new event.
  const { ctx } = await drive({ kvs, canonical: 'fields' },
    [{ event: 'fetch_blob' }, UPDATE]);
  await ctx.persister!.close();

  // Session 2, fields canonical: both the seeded and the new bucket serve.
  const { sent } = await drive({ kvs, canonical: 'fields' }, [{ event: 'fetch_blob' }]);
  const state = sent.find(m => m.status === 'fetch_blob').data.application_state;
  expect(state.component.old.value).toBe('kept');
  expect(state.component['pipe-block'].value).toBe('v1');
});
