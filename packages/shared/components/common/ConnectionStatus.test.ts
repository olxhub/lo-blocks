// Unit tests for the not-acking symptom detector in ConnectionStatus.tsx.
//
// The decision core is a pure fold over (t, connected, count) samples, so these
// tests need no React, no timers, and no IndexedDB — only the rules that decide
// whether a stuck outbox is a fatal delivery failure or ordinary churn.
//
import { describe, test, expect } from 'vitest';
import { foldNotAcking, NOT_ACKING_WINDOW_MS, POLL_MS, type NotAckingSample } from './ConnectionStatus';

/** Connected samples, one every POLL_MS, with the given outbox depths. */
function connectedRun(counts: number[], t0 = 0): NotAckingSample[] {
  return counts.map((count, i) => ({ t: t0 + i * POLL_MS, connected: true, count }));
}

const polls = (ms: number) => Math.ceil(ms / POLL_MS) + 1;

describe('not-acking detector', () => {
  test('fires once the count has been stuck for the full window', () => {
    const samples = connectedRun(Array(polls(NOT_ACKING_WINDOW_MS)).fill(3));
    expect(foldNotAcking(samples).fatal).toEqual({
      code: 'NOT_ACKING',
      message: expect.any(String),
    });
  });

  test('does not fire before the window elapses', () => {
    const stuckFor = NOT_ACKING_WINDOW_MS - POLL_MS;
    expect(foldNotAcking(connectedRun(Array(stuckFor / POLL_MS).fill(3))).fatal).toBeNull();
  });

  test('a disconnect resets the window — reconnect churn must not trip it', () => {
    const before = connectedRun(Array(polls(NOT_ACKING_WINDOW_MS) - 1).fill(3));
    const t = POLL_MS * before.length;
    const samples: NotAckingSample[] = [
      ...before,
      { t, connected: false, count: 3 },
      // Back online with the same depth: the clock starts over, so the one
      // remaining poll is nowhere near the window.
      ...connectedRun([3, 3], t + POLL_MS),
    ];
    expect(foldNotAcking(samples).fatal).toBeNull();
  });

  test('a decrease resets the window — an ack landed', () => {
    const half = polls(NOT_ACKING_WINDOW_MS);
    const samples = connectedRun([
      ...Array(half - 1).fill(5),
      4, // ack
      ...Array(half - 2).fill(4),
    ]);
    expect(foldNotAcking(samples).fatal).toBeNull();
  });

  test('an empty outbox resets the window', () => {
    const n = polls(NOT_ACKING_WINDOW_MS);
    const samples = connectedRun([...Array(n - 1).fill(2), 0, ...Array(n - 2).fill(7)]);
    expect(foldNotAcking(samples).fatal).toBeNull();
  });

  test('clears after firing once the outbox drains', () => {
    const stuck = connectedRun(Array(polls(NOT_ACKING_WINDOW_MS)).fill(3));
    expect(foldNotAcking(stuck).fatal).not.toBeNull();
    const recovered = [...stuck, ...connectedRun([0], POLL_MS * stuck.length)];
    expect(foldNotAcking(recovered).fatal).toBeNull();
  });

  test('clears after firing once a decrease is observed', () => {
    const stuck = connectedRun(Array(polls(NOT_ACKING_WINDOW_MS)).fill(3));
    const recovered = [...stuck, ...connectedRun([2], POLL_MS * stuck.length)];
    expect(foldNotAcking(recovered).fatal).toBeNull();
  });

  test('stays fatal while stuck — no flicker poll to poll', () => {
    const n = polls(NOT_ACKING_WINDOW_MS);
    const first = foldNotAcking(connectedRun(Array(n).fill(3))).fatal;
    const later = foldNotAcking(connectedRun(Array(n + 6).fill(3))).fatal;
    expect(later).toEqual(first);
  });

  test('a growing outbox is still stuck — growth is not progress', () => {
    const samples = connectedRun(
      Array.from({ length: polls(NOT_ACKING_WINDOW_MS) }, (_, i) => i + 1),
    );
    expect(foldNotAcking(samples).fatal).not.toBeNull();
  });
});
