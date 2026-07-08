// Subscription registry — which connections care about which blocks.
//
// Fields-design 2b/2c hardening: shared and server-reduced events used
// to fan to EVERY connection on the server. Now the content fetch is
// the subscription (fetching a page declares what you are about to
// render — the response ids ARE the interest set), and fan-out targets
// only subscribers of the event's block.
//
// Writers self-subscribe: dispatching a shared/server event for a block
// subscribes the origin connection, so a client that writes without
// having fetched (rare, but possible in tests and synthetic clients)
// still hears the responses.
//
// Group scoping slots in here later: the key grows from blockId to
// `{blockId}:{group}` and nothing else changes shape.

import type { StateConnection } from './connection';

export class SubscriptionRegistry {
  private byKey = new Map<string, Set<StateConnection>>();
  private bySocket = new Map<StateConnection, Set<string>>();

  subscribe(ws: StateConnection, keys: string[]) {
    let mine = this.bySocket.get(ws);
    if (!mine) { mine = new Set(); this.bySocket.set(ws, mine); }
    for (const key of keys) {
      mine.add(key);
      let subs = this.byKey.get(key);
      if (!subs) { subs = new Set(); this.byKey.set(key, subs); }
      subs.add(ws);
    }
  }

  /** Drop everything a connection was subscribed to (on close). */
  unsubscribeAll(ws: StateConnection) {
    const mine = this.bySocket.get(ws);
    if (!mine) return;
    for (const key of mine) {
      const subs = this.byKey.get(key);
      if (subs) {
        subs.delete(ws);
        if (subs.size === 0) this.byKey.delete(key);
      }
    }
    this.bySocket.delete(ws);
  }

  subscribers(key: string): ReadonlySet<StateConnection> {
    return this.byKey.get(key) ?? EMPTY;
  }

  /** Swap a connection's partition for one block: drop the plain key and
   * every `${blockId}::…` partition key, subscribe the new key. The
   * group-switch path (groups.ts) — a user re-picking moves their
   * sockets to the new partition. */
  resubscribe(ws: StateConnection, blockId: string, newKey: string) {
    const mine = this.bySocket.get(ws);
    if (mine) {
      for (const key of mine) {
        if (key === blockId || key.startsWith(`${blockId}::`)) {
          mine.delete(key);
          const subs = this.byKey.get(key);
          if (subs) {
            subs.delete(ws);
            if (subs.size === 0) this.byKey.delete(key);
          }
        }
      }
    }
    this.subscribe(ws, [newKey]);
  }

  /** Counts, for tests and eventual stats. */
  size() { return { keys: this.byKey.size, sockets: this.bySocket.size }; }
}

const EMPTY: ReadonlySet<StateConnection> = new Set();
