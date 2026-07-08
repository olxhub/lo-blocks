// packages/shared/lib/state/encoders.ts
//
// The TIME axis (docs/state-library-design.md §0, §4): pluggable
// encoders decide how one user's high-frequency writes are represented
// across time — every sample, a debounced few, only the last value.
// A field declares one:
//
//   stateField('currentTime', { encoder: trace({ maxPoints: 100 }) })
//   stateField('mouse',       { encoder: lastValue({ debounceMs: 250 }) })
//   stateField('scrub',       { encoder: debounce({ intervalMs: 500 }) })
//
// All encoders here emit the SAME wire shape — one aggregate event per
// quiet period carrying `{ field, startTs, endTs, samples: [[dt, value],
// …] }` — differing only in WHICH samples survive. That keeps decoding
// generic: replay expands `samples` back into per-timestamp events and
// interleaves them with everything else by time (lib/state/encode.ts).
// A custom encoder that needs a different payload also supplies
// `decode`; the replay loader consults it through the field registry.
//
// Timing is data: append() receives the wall time, and every surviving
// sample keeps its own timestamp. Lossy encoders (debounce, lastValue)
// declare their loss here, at the field, where replay fidelity is an
// explicit authoring decision.

export type Sample = [dtMs: number, value: unknown];

/** The in-flight buffer all standard encoders share. */
export interface SampleBuffer {
  startTs: number;
  samples: Sample[];
}

export interface FieldEncoder {
  /** Quiet period that closes a batch and ships the aggregate. */
  debounceMs: number;
  /** Fold one write into the buffer (created on first call). */
  append(buffer: SampleBuffer | undefined, value: unknown, ts: number): SampleBuffer;
  /** Ship early? (size caps and the like) */
  shouldFlush?(buffer: SampleBuffer): boolean;
  /** Buffer → aggregate event payload. */
  flush(buffer: SampleBuffer): Record<string, unknown>;
  /** Aggregate payload → per-timestamp events, for replay. Omit when the
   *  payload is the standard samples shape (decoded generically). */
  decode?(payload: Record<string, unknown>): Array<{ ts: number } & Record<string, unknown>>;
}

const start = (buffer: SampleBuffer | undefined, ts: number): SampleBuffer =>
  buffer ?? { startTs: ts, samples: [] };

const flushSamples = (buffer: SampleBuffer) => ({
  startTs: buffer.startTs,
  endTs: buffer.startTs + (buffer.samples.at(-1)?.[0] ?? 0),
  samples: buffer.samples,
});

/** Keep EVERY sample — lossless. Video playback position. */
export function trace({ maxPoints = 100, debounceMs = 5000 } = {}): FieldEncoder {
  return {
    debounceMs,
    append(buffer, value, ts) {
      const b = start(buffer, ts);
      b.samples.push([ts - b.startTs, value]);
      return b;
    },
    shouldFlush: (b) => b.samples.length >= maxPoints,
    flush: flushSamples,
  };
}

/**
 * Rate-limit: at most one sample per interval, plus (by default) the
 * first and last of the gesture. Lossy, declared.
 */
export function debounce({
  intervalMs = 500,
  keepFirst = true,
  keepLast = true,
  debounceMs = 5000,
  maxPoints = 100,
} = {}): FieldEncoder {
  return {
    debounceMs,
    append(buffer, value, ts) {
      const b = start(buffer, ts);
      const dt = ts - b.startTs;
      const last = b.samples.at(-1);
      if (b.samples.length === 0) {
        b.samples.push([dt, value]); // opens the window; protected iff keepFirst
      } else if (dt - last![0] >= intervalMs) {
        b.samples.push([dt, value]);
      } else if (keepLast) {
        // Keep the gesture's end alive: overwrite the trailing sample —
        // unless it is the protected first, in which case grow.
        if (keepFirst && b.samples.length === 1) b.samples.push([dt, value]);
        else { last![0] = dt; last![1] = value; }
      }
      return b;
    },
    shouldFlush: (b) => b.samples.length >= maxPoints,
    flush: flushSamples,
  };
}

/** Only the final value survives. Mouse position, hover state. */
export function lastValue({ debounceMs = 250 } = {}): FieldEncoder {
  return {
    debounceMs,
    append(buffer, value, ts) {
      const b = start(buffer, ts);
      b.samples[0] = [ts - b.startTs, value];
      return b;
    },
    flush: flushSamples,
  };
}
