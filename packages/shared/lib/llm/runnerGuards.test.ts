// Each guard is tested in BOTH directions: does it pass a failure, and does it
// fail a pass? Every silent-failure bug in this harness so far has been one or
// the other, so neither half is optional.

import { describe, it, expect } from 'vitest';
import { LLM_STATUS } from '@/lib/llm/reduxClient';
import { isTerminal, isReady, hasSettled, shouldRetry, backoffMs } from './runnerGuards';

const { INIT, RUNNING, RESPONSE_READY, ERROR } = LLM_STATUS;

describe('isReady', () => {
  it('passes a success', () => {
    expect(isReady(RESPONSE_READY)).toBe(true);
  });
  it('does NOT pass a failure', () => {
    expect(isReady(ERROR)).toBe(false);
  });
  it('does not pass work in progress or absence', () => {
    for (const s of [INIT, RUNNING, undefined, null, '', 'anything']) {
      expect(isReady(s)).toBe(false);
    }
  });
});

describe('isTerminal', () => {
  it('accepts both endings, success and failure', () => {
    expect(isTerminal(RESPONSE_READY)).toBe(true);
    expect(isTerminal(ERROR)).toBe(true);
  });
  it('rejects non-endings', () => {
    for (const s of [INIT, RUNNING, undefined, null]) {
      expect(isTerminal(s)).toBe(false);
    }
  });
});

describe('hasSettled', () => {
  it('fails a pass? no — a fresh success settles', () => {
    expect(hasSettled(RESPONSE_READY, INIT)).toBe(true);
  });

  it('fails a pass? no — a success that arrives before any poll still settles', () => {
    // The RUNNING state is never observed here; an earlier version required it
    // and threw away cells that finished quickly.
    expect(hasSettled(RESPONSE_READY, RUNNING)).toBe(true);
  });

  it('passes a failure? yes, as terminal — the caller separates ready from error', () => {
    expect(hasSettled(ERROR, INIT)).toBe(true);
    expect(isReady(ERROR)).toBe(false);
  });

  it('passes a stale result? no — an unchanged terminal status is the previous cell', () => {
    expect(hasSettled(RESPONSE_READY, RESPONSE_READY)).toBe(false);
    expect(hasSettled(ERROR, ERROR)).toBe(false);
  });

  it('a terminal status that CHANGED is this cell, not the last one', () => {
    expect(hasSettled(ERROR, RESPONSE_READY)).toBe(true);
    expect(hasSettled(RESPONSE_READY, ERROR)).toBe(true);
  });

  it('does not settle while still running', () => {
    expect(hasSettled(RUNNING, INIT)).toBe(false);
    expect(hasSettled(INIT, INIT)).toBe(false);
    expect(hasSettled(undefined, INIT)).toBe(false);
  });
});

describe('shouldRetry', () => {
  it('retries a failure', () => {
    expect(shouldRetry(ERROR, 1, 3)).toBe(true);
  });
  it('does NOT retry a success — that would spend a call and could lose a good result', () => {
    expect(shouldRetry(RESPONSE_READY, 1, 3)).toBe(false);
  });
  it('does not retry something that has not finished', () => {
    for (const s of [INIT, RUNNING, undefined]) {
      expect(shouldRetry(s, 1, 3)).toBe(false);
    }
  });
  it('stops at the attempt limit even on a failure', () => {
    expect(shouldRetry(ERROR, 3, 3)).toBe(false);
    expect(shouldRetry(ERROR, 4, 3)).toBe(false);
  });
});

describe('backoffMs', () => {
  it('grows, and is already seconds on the first retry', () => {
    expect(backoffMs(1)).toBe(5000);
    expect(backoffMs(2)).toBe(10000);
    expect(backoffMs(3)).toBe(20000);
  });
  it('is capped', () => {
    expect(backoffMs(10)).toBe(40000);
  });
});
