// @vitest-environment node
// SubscriptionRegistry: the registry is generic over opaque string keys —
// resubscribe takes the CALLER's predicate for "keys of this block" (the
// StateKey grammar lives in router.ts, not here).

import { test, expect } from 'vitest';
import { SubscriptionRegistry } from './subscriptions';
import type { StateConnection } from './connection';

const sock = (name: string) => ({ name } as unknown as StateConnection);

test('resubscribe drops matching keys across instances and leaves others', () => {
  const subs = new SubscriptionRegistry();
  const a = sock('a');
  const b = sock('b');
  // Two partitions' worth of keys for one block, plus a neighbour block
  // and another socket that must not be touched.
  subs.subscribe(a, [
    'set:topic:0|demos/chat',
    'set:topic:0|demos/list:#2:chat',
    'set:topic:0|demos/other',
  ]);
  subs.subscribe(b, ['set:topic:0|demos/chat']);

  const isChat = (key: string) => {
    const stateId = key.slice(key.lastIndexOf('|') + 1);
    return stateId === 'demos/chat' || stateId.startsWith('demos/list:');
  };
  subs.resubscribe(a, isChat, 'set:topic:1|demos/chat');

  expect([...subs.subscribers('set:topic:0|demos/chat')]).toEqual([b]);
  expect([...subs.subscribers('set:topic:0|demos/list:#2:chat')]).toEqual([]);
  expect([...subs.subscribers('set:topic:0|demos/other')]).toEqual([a]);
  expect([...subs.subscribers('set:topic:1|demos/chat')]).toEqual([a]);
});

test('resubscribe subscribes the new key even with nothing to drop', () => {
  const subs = new SubscriptionRegistry();
  const a = sock('a');
  subs.resubscribe(a, () => true, 'all|demos/chat');
  expect([...subs.subscribers('all|demos/chat')]).toEqual([a]);
});
