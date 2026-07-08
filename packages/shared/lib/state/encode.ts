// packages/shared/lib/state/encode.ts
//
// The TIME axis (docs/state-library-design.md §0, §4): batch one user's
// high-frequency writes — video playback position, scrubbing, dragging —
// into one event per quiet period, without giving up either UI
// responsiveness or replay fidelity. WHICH samples survive is the
// field's ENCODER (./encoders.ts):
//
//   stateField('currentTime', { encoder: trace({ maxPoints: 100 }) })
//
// Per write:
//   1. The value lands in LOCAL Redux immediately (direct store dispatch,
//      bypassing lo_event's loggers — nothing hits the wire), so the UI
//      tracks every sample.
//   2. The sample is buffered: [dt, value] relative to the batch start.
//
// Per quiet period (debounceMs) or when the buffer fills (maxPoints):
//   one aggregate event ships through the normal path —
//     { field, startTs, endTs, samples: [[dt, value], ...] }
//   It folds locally too (lwwReduce takes the LAST sample — idempotent
//   with the optimistic updates), goes over the wire, and lands in the
//   event log.
//
// Replay: lib/replay.ts expands aggregate events into per-sample
// synthetic events stamped with their sample timestamps BEFORE the fold,
// so "state at time T" is correct mid-gesture and replayToEvent itself
// never changes. Replay fidelity is exactly what the field declared.
//
// NOT to be confused with authority (who reduces / who sees): encode is
// how ONE user's writes batch onto the wire. The axes compose — a shared
// scrubber would declare both.

import type { BaselineProps, FieldInfo, StateKey } from '../types';
import type { SampleBuffer } from './encoders';
import { getActorId } from '../crdt/actorId';
import { scopes } from './scopes';
import { getReduxStoreInstance } from './store';
import { dispatchFieldEvent } from './redux';
import { scopedStateKeyForBlock as scopedKey } from '../types/id-grammar';

interface EncodeSlot {
  buffer: SampleBuffer | undefined;
  timer: ReturnType<typeof setTimeout> | null;
  /** Captured at first sample so the flush doesn't depend on the caller
   * still being mounted. */
  flushNow: () => void;
}

const buffers = new Map<string, EncodeSlot>();

/**
 * Buffered write for a field with `encode` (called by updateField).
 * Local state updates per sample; the wire sees one aggregate event per
 * quiet period.
 */
export function writeEncoded(
  props: BaselineProps | null,
  field: FieldInfo,
  newValue: any,
  { stateKey, tag }: { stateKey?: StateKey; tag?: string } = {},
) {
  const encoder = field.encoder!;
  const ts = Date.now();

  // 1. Optimistic LOCAL fold — same envelope a plain write would produce,
  // dispatched directly on the store so no logger (wire, capture, save)
  // sees it. __localOnly guards tab-sync if it ever returns.
  const store = (props as any)?.runtime?.store ?? getReduxStoreInstance();
  const resolvedKey = (field.scope === scopes.component || field.scope === scopes.storage)
    ? (stateKey ?? scopedKey(props as any))
    : undefined;
  const envelope = {
    event: field.event,
    scope: field.scope,
    ...(resolvedKey !== undefined ? { id: resolvedKey } : {}),
    ...(tag !== undefined ? { tag } : {}),
    field: field.name,
    [field.name]: newValue,
    ts,
    actor: getActorId(),
  };
  store.dispatch({
    redux_type: 'EMIT_EVENT',
    type: field.event,
    payload: JSON.stringify(envelope),
    __localOnly: true,
  });

  // 2. Buffer the sample via the field's encoder; flush on quiet or when
  // the encoder says so.
  const key = `${field.scope}|${resolvedKey ?? tag ?? ''}|${field.name}`;
  let slot = buffers.get(key);
  if (!slot) {
    slot = {
      buffer: undefined,
      timer: null,
      flushNow: () => {
        const b = buffers.get(key);
        if (!b?.buffer || b.buffer.samples.length === 0) return;
        buffers.delete(key);
        if (b.timer) clearTimeout(b.timer);
        dispatchFieldEvent(props, field, field.event!, {
          field: field.name,
          ...encoder.flush(b.buffer),
          actor: getActorId(),
        }, { stateKey, tag });
      },
    };
    buffers.set(key, slot);
  }
  slot.buffer = encoder.append(slot.buffer, newValue, ts);

  if (encoder.shouldFlush?.(slot.buffer)) {
    slot.flushNow();
    return;
  }
  if (slot.timer) clearTimeout(slot.timer);
  slot.timer = setTimeout(slot.flushNow, encoder.debounceMs);
}

/** Flush every pending buffer now — page unload, disconnect, tests. */
export function flushEncoded() {
  for (const buf of [...buffers.values()]) buf.flushNow();
}

// Navigating away inside the debounce window must not lose the tail of a
// gesture: flush on pagehide (unload path) and on tab-hide (long before
// unload, and reliably deliverable — pagehide sends race the socket
// closing, so visibilitychange is the one that usually saves the data).
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', flushEncoded);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushEncoded();
  });
}

/**
 * Expand aggregate events into per-sample synthetic events for replay.
 * Generic on the wire shape ({field, startTs, samples}) — the standard
 * encoders all emit it. A custom encoder with a different payload
 * supplies its own decode; the replay loader consults the field registry
 * (fieldByName) when the generic shape doesn't match.
 * Non-aggregate events pass through untouched.
 */
export function expandEncodedEvents<T extends Record<string, any>>(events: T[]): T[] {
  return events.flatMap((e) => {
    if (!Array.isArray(e.samples) || !e.field || typeof e.startTs !== 'number') return [e];
    const { samples, startTs, endTs: _endTs, ...rest } = e;
    return samples.map(([dt, value]: [number, any]) => ({
      ...rest,
      [e.field]: value,
      ts: startTs + dt,
    })) as unknown as T[];
  });
}

/**
 * Expand AND put the log back into true time order. An aggregate event
 * ARRIVES at its end time, so its samples are time-stamped earlier than
 * their log position — folding order self-corrects for LWW (ts
 * comparison), but snapshot-by-index and any order-sensitive consumer
 * would see samples in the future's past. The stable sort interleaves
 * expanded samples with ordinary events by time; events without their
 * own ts inherit the previous event's (carry-forward), so content loads
 * and blob responses keep their place.
 */
export function expandAndOrderEvents<T extends Record<string, any>>(events: T[]): T[] {
  const expanded = expandEncodedEvents(events);
  let lastTs = -Infinity;
  const keyed = expanded.map((e, index) => {
    if (typeof e.ts === 'number') lastTs = e.ts;
    return { e, ts: lastTs, index };
  });
  keyed.sort((a, b) => (a.ts - b.ts) || (a.index - b.index));
  return keyed.map((k) => k.e);
}
