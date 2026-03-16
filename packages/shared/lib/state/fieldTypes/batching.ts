// lib/state/fieldTypes/batching.ts
//
// STATUS: Prototype — API is a first attempt, implementations are
// placeholders.  The built-in factories (immediate, debounce,
// throttle, aggregate) define the correct types and interfaces, but
// their logAggregator implementations are simplified. Real
// timer-based batching requires integration with the logger's event
// loop, which hasn't been built yet.
//
// Batching strategies for field events.
//
// Batching controls how events are delivered to lo_event loggers (websocket,
// server, console). It is NOT a state concern — the client-side Redux reducer
// always runs immediately on every event for responsive UX. Batching only
// affects what goes over the wire.
//
// The core idea: a BatchingStrategy is an object that a logger uses to
// decide when and how to flush events. Built-in factories (immediate,
// debounce, throttle, aggregate) cover common patterns. Custom strategies
// are async generators that transform an event stream.
//
// Usage in field declarations:
//   stateField('value')                                    // immediate (default)
//   stateField('cursorPosition', { batching: throttle(100) })
//   stateField('dragPath', { batching: aggregate(500) })
//
// How loggers use this (future — lo_event integration):
//   - reduxLogger: ignores batching entirely (always instant)
//   - websocketLogger: applies the strategy before sending
//   - consoleLogger: configurable
//
// A logger receives the strategy object and either pattern-matches on `type`
// for built-ins or calls `logAggregator` for custom behavior.
//
// ---------------------------------------------------------------------------
// Replay and the timeline problem
// ---------------------------------------------------------------------------
//
// Batching creates a tension with replay. During live operation, the client
// Redux reducer sees every individual event instantly. But the server only
// sees batched events. When we replay from server-stored events, we're
// replaying the batched stream, not the original.
//
// The problem: a batched event arrives in the replay stream at its send
// timestamp, but it may contain data from much earlier. Consider:
//
//   ts:1   CLICK           ← individual event, replayed normally
//   ts:7   DRAG_START      ← individual event
//   ts:11  DRAG            ← individual event (client saw this; server didn't)
//   ts:111 DRAG            ← individual event (client saw this; server didn't)
//   ts:117 DRAG_BATCH      ← batched event arrives here, but covers ts:9–116.5
//          { batchStart: 9, batchEnd: 116.5, points: [{x,y,ts}, ...] }
//   ts:120 CLICK           ← next individual event
//
// The replayer can't rewind to ts:9 — it's already past that point. And the
// DRAG_BATCH is in a different format than the individual DRAG events the
// reducer normally handles.
//
// Solution: each batching strategy carries a decoder that tells the replay
// system how to handle its batched events. The decoder is the inverse of
// the aggregator — it knows the batch format because the same strategy
// created it.
//
// For lossless batching (aggregate): the decoder expands back to individual
// events. The replay system can interleave them into the timeline.
//
// For lossy batching (throttle, debounce): the decoder produces the best
// reconstruction possible — fewer events, lower fidelity, but replayable.
// Like image compression: the JPEG decoder doesn't recreate the original
// pixels, but it produces a valid image.
//
// The batch event must carry standardized metadata so the replay system
// knows when to invoke the decoder:
//   - batchStart: timestamp of the earliest event in the batch
//   - batchEnd: timestamp of the latest event in the batch
//   - batchType: matches strategy.type, so the right decoder is selected
//
// The logAggregator is responsible for adding this metadata to its output.
// The replay system reads it to decide where in the timeline to apply
// the decoded events.
//

/**
 * Standardized metadata that the logAggregator must add to batched events.
 *
 * This tells the replay system the time range the batch covers, so it can
 * decide where in the timeline to apply the decoded events.
 */
export interface BatchMetadata {
  /** Earliest timestamp of any event in the batch. */
  batchStart: number;
  /** Latest timestamp of any event in the batch. */
  batchEnd: number;
  /** Strategy type that produced this batch (for decoder selection). */
  batchType: string;
}

/**
 * A batching strategy controls how a logger buffers and flushes events.
 *
 * Built-in strategies have well-known `type` values that loggers can
 * optimize for. Custom strategies provide a `logAggregator` function
 * that the logger calls to transform the event stream.
 *
 * Each strategy also carries a `replayDecoder` — the inverse of the
 * aggregator. Given a batched event, it returns individual events that
 * the reducer can process during replay.
 */
export interface BatchingStrategy {
  /** Discriminator for built-in strategies. Custom strategies use 'custom'. */
  readonly type: string;

  /**
   * Encoder: consumes individual events, yields wire events.
   *
   * A logger feeds events in one at a time. The aggregator buffers,
   * compresses, or transforms them as needed, and yields events to
   * actually send. Each yielded value is one wire event (which may
   * itself represent multiple original events).
   *
   * Batched wire events MUST include BatchMetadata fields (batchStart,
   * batchEnd, batchType) so the replay system can position them in the
   * timeline. For 'immediate', events pass through unchanged (no batch
   * metadata needed — they're already individual events).
   *
   * The aggregator maintains whatever internal state it needs (timers,
   * buffers, pending events, etc.).
   */
  logAggregator: (events: AsyncIterable<any>) => AsyncIterable<any>;

  /**
   * Decoder: expands a batched wire event back into replayable events.
   *
   * Called during replay when the replay system encounters an event
   * with batch metadata. Returns an array of events to feed through
   * the reducer, each with its own timestamp for timeline positioning.
   *
   * For lossless strategies (aggregate): returns the original events.
   * For lossy strategies (throttle, debounce): returns the best
   * reconstruction possible — like a JPEG decoder, the output is
   * valid but may have lower fidelity than the original.
   *
   * For 'immediate', this is never called (events aren't batched).
   */
  replayDecoder: (batchedEvent: any) => any[];
}

// =============================================================================
// Built-in factories
// =============================================================================

/**
 * Immediate — every event is sent as-is, no buffering.
 * This is the default when no batching strategy is specified.
 */
export function immediate(): BatchingStrategy {
  return {
    type: 'immediate',
    logAggregator: async function*(events) {
      for await (const event of events) {
        yield event;
      }
    },
    // Never called — immediate events aren't batched
    replayDecoder: (event) => [event],
  };
}

/**
 * Debounce — wait for `ms` milliseconds of inactivity, then send the
 * latest event. Earlier events within the quiet window are dropped.
 *
 * Good for: text input where you want the final value, not every keystroke.
 * The guarantee: the last event is always sent (no silent drops).
 *
 * Lossy: intermediate values are lost. Replay shows the field jumping to
 * its final value after each quiet period, rather than showing each keystroke.
 */
export function debounce(ms: number): BatchingStrategy {
  return {
    type: 'debounce',
    logAggregator: async function*(events) {
      // Prototype: real implementation needs timer integration with
      // the logger's event loop. The async generator pattern lets the
      // logger drive timing.
      let pending: any | null = null;
      for await (const event of events) {
        pending = event;
      }
      // Flush final event
      if (pending) yield pending;
    },
    // Debounced events are regular events (the "winning" event from
    // each quiet window). They replay as-is — no expansion needed.
    replayDecoder: (event) => [event],
  };
}

/**
 * Throttle — at most one event every `ms` milliseconds.
 * Keeps the first event (response time) and the last event (final state)
 * within each window. Intermediate events are dropped.
 *
 * Good for: mouse position, slider values — need responsive feel but
 * don't want thousands of events per second on the wire.
 *
 * Lossy: motion appears jerkier during replay (fewer data points),
 * but first and last values in each window are preserved.
 */
export function throttle(ms: number): BatchingStrategy {
  return {
    type: 'throttle',
    logAggregator: async function*(events) {
      // Prototype: pass-through. Real implementation keeps first+last
      // per window and flushes on interval.
      for await (const event of events) {
        yield event;
      }
    },
    // Throttled events are regular events (survivors of the throttle
    // window). They replay as-is — no expansion needed.
    replayDecoder: (event) => [event],
  };
}

/**
 * Aggregate — collect events over `ms` milliseconds, then send them
 * together as one batch event. Nothing is dropped; the batch preserves
 * order and all data points.
 *
 * Good for: mouse drags, video scrubbing — need every data point for
 * faithful reconstruction, but sent as a compact batch rather than
 * thousands of individual messages.
 *
 * Lossless: the batch contains all original events. The replayDecoder
 * expands them back into individual events for the reducer.
 *
 * Wire format of the batch event:
 *   { event: 'BATCH', batchType: 'aggregate', batchStart: 9, batchEnd: 116,
 *     events: [originalEvent1, originalEvent2, ...] }
 */
export function aggregate(ms: number): BatchingStrategy {
  return {
    type: 'aggregate',
    logAggregator: async function*(events) {
      // Prototype: collect everything, yield at end.
      // Real implementation flushes every `ms`.
      let batch: any[] = [];
      for await (const event of events) {
        batch.push(event);
      }
      if (batch.length > 0) {
        const timestamps = batch
          .map(e => e.ts ?? e.metadata?.iso_ts)
          .filter(Boolean)
          .map(t => typeof t === 'string' ? new Date(t).getTime() : t);
        yield {
          event: 'BATCH',
          batchType: 'aggregate',
          batchStart: Math.min(...timestamps),
          batchEnd: Math.max(...timestamps),
          events: batch,
        };
      }
    },
    // Lossless: expand the batch back into individual events
    replayDecoder: (batchedEvent) => batchedEvent.events ?? [batchedEvent],
  };
}

/**
 * Custom strategy — provide your own encoder/decoder pair.
 *
 * The logAggregator consumes individual events and yields wire events.
 * The replayDecoder expands wire events back into reducer-compatible events.
 * They are inverses: what the aggregator encodes, the decoder must decode.
 *
 * The aggregator MUST add BatchMetadata (batchStart, batchEnd, batchType)
 * to any batched events it yields, so the replay system knows where in
 * the timeline they belong.
 *
 * Example: aggregate all events in a mouse drag into one batch:
 *
 *   custom(
 *     // Encoder: buffer until DRAG_STOP, then yield batch
 *     async function*(events) {
 *       let batch = [];
 *       for await (const event of events) {
 *         batch.push(event);
 *         if (event.event === 'DRAG_STOP') {
 *           yield {
 *             event: 'DRAG_BATCH',
 *             batchType: 'custom',
 *             batchStart: batch[0].ts,
 *             batchEnd: batch[batch.length - 1].ts,
 *             points: batch.map(e => ({ x: e.x, y: e.y, ts: e.ts })),
 *           };
 *           batch = [];
 *         }
 *       }
 *     },
 *     // Decoder: expand batch back into individual drag events
 *     (batchedEvent) => batchedEvent.points.map(p => ({
 *       event: 'DRAG', x: p.x, y: p.y, ts: p.ts,
 *     })),
 *   )
 */
export function custom(
  logAggregator: (events: AsyncIterable<any>) => AsyncIterable<any>,
  replayDecoder: (batchedEvent: any) => any[] = (e) => [e],
): BatchingStrategy {
  return { type: 'custom', logAggregator, replayDecoder };
}
