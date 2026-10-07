// @vitest-environment jsdom
// packages/shared/lib/state/errorEvents.test.ts
//
// The reporting path is the one path that must never fail: every caller is
// already handling a failure, so a throw here replaces a diagnosable bug
// with an undiagnosable one (or, in the backstop's case, loops).

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  ACTION_ERROR,
  UNHANDLED_REJECTION,
  UNCAUGHT_ERROR,
  describeError,
  logErrorEvent,
  installGlobalErrorReporting,
  resetGlobalErrorReportingForTests,
} from './errorEvents';

afterEach(() => {
  resetGlobalErrorReportingForTests();
  vi.restoreAllMocks();
});

describe('describeError', () => {
  it('keeps name and message, and nothing else', () => {
    const d = describeError(new TypeError('bad value'));
    expect(d).toEqual({ name: 'TypeError', message: 'bad value' });
    // No stack on the wire — events are durable and fanned out; stacks are
    // for the console.
    expect(Object.keys(d).sort()).toEqual(['message', 'name']);
  });

  it('survives non-Error throws', () => {
    expect(describeError('boom').message).toBe('boom');
    expect(describeError(undefined).message).toBe('undefined');
    expect(describeError({ weird: 1 }).message).toContain('weird');
  });

  it('survives a value that cannot be stringified', () => {
    const cyclic: any = {};
    cyclic.self = cyclic;
    expect(() => describeError(cyclic)).not.toThrow();
  });
});

describe('logErrorEvent', () => {
  it('emits through the supplied logEvent', () => {
    const logEvent = vi.fn();
    logErrorEvent(ACTION_ERROR, { blockId: 'x' }, logEvent);
    expect(logEvent).toHaveBeenCalledWith(ACTION_ERROR, { blockId: 'x' });
  });

  it('swallows a logger that throws rather than replacing the original error', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const logEvent = vi.fn(() => { throw new Error('logger down'); });
    expect(() => logErrorEvent(ACTION_ERROR, {}, logEvent)).not.toThrow();
  });
});

describe('installGlobalErrorReporting', () => {
  it('reports an unhandled rejection, and a second install fails fast', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const events: Array<[string, any]> = [];
    const logEvent = vi.fn((type: string, payload: any) => { events.push([type, payload]); });

    installGlobalErrorReporting(logEvent);
    // Installing twice is a caller bug (client entry points install exactly
    // once per page load) — it must throw, not be silently absorbed.
    expect(() => installGlobalErrorReporting(logEvent)).toThrow(/called twice/);

    window.dispatchEvent(Object.assign(
      new Event('unhandledrejection'), { reason: new RangeError('nope') }));

    expect(events).toEqual([
      [UNHANDLED_REJECTION, { error: { name: 'RangeError', message: 'nope' } }],
    ]);
  });

  it('reports an uncaught error with its location, and ignores resource errors', () => {
    const events: Array<[string, any]> = [];
    const logEvent = vi.fn((type: string, payload: any) => { events.push([type, payload]); });

    installGlobalErrorReporting(logEvent);

    window.dispatchEvent(new ErrorEvent('error', {
      error: new Error('kaboom'), message: 'kaboom', filename: 'a.js', lineno: 3, colno: 7,
    }));
    // A failed <img>/<script> load also fires 'error' but carries neither —
    // different problem, different fix.
    window.dispatchEvent(new ErrorEvent('error', {}));

    expect(events).toEqual([[UNCAUGHT_ERROR, {
      error: { name: 'Error', message: 'kaboom' },
      filename: 'a.js', lineno: 3, colno: 7,
    }]]);
  });

  it('does not loop when reporting itself throws', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    let calls = 0;
    const logEvent = vi.fn(() => {
      calls += 1;
      throw new Error('reporting is broken too');
    });

    installGlobalErrorReporting(logEvent);
    window.dispatchEvent(Object.assign(
      new Event('unhandledrejection'), { reason: new Error('first') }));

    expect(calls).toBe(1);
  });
});
