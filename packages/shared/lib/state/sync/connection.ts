// packages/shared/lib/state/sync/connection.ts
//
// The transport seam. The sync engine delivers messages to
// "connections" without knowing what they are: the ws WebSocket
// satisfies this structurally, tests use plain objects, and future
// transports (SSE, long-poll, peer channels) slot in. Nothing else in
// lib/state/sync may import a transport library.

export interface StateConnection {
  send(data: string): void;
  /** When present, compared against OPEN before sending. */
  readonly readyState?: number;
  readonly OPEN?: number;
}

/** Send if the connection is (still) open; delivery is best-effort —
 * a gone receiver is dropped by its own lifecycle, not by the sender. */
export function trySend(connection: StateConnection, data: string) {
  try {
    if (connection.readyState === undefined || connection.readyState === connection.OPEN) {
      connection.send(data);
    }
  } catch { /* receiver gone — its release will drop it */ }
}
