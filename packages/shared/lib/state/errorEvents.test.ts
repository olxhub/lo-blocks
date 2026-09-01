// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  UNCAUGHT_ERROR,
  UNHANDLED_REJECTION,
  errorEventPayload,
  installGlobalErrorReporting,
  logErrorEvent,
  resetGlobalErrorReportingForTests,
} from './errorEvents';

afterEach(() => {
  resetGlobalErrorReportingForTests();
  vi.restoreAllMocks();
});

describe('error event reporting', () => {
  it('projects unknown throws through AppError and bounds durable messages', () => {
    expect(errorEventPayload(new TypeError('bad value'))).toEqual({
      title: 'TypeError', message: 'bad value',
    });
    expect(errorEventPayload({ reason: 'boom' }).message).toContain('boom');

    const payload = errorEventPayload(new Error('x'.repeat(10_000)));
    expect(payload.message.length).toBeLessThanOrEqual(4096);
    expect(payload.message.endsWith('…')).toBe(true);
  });

  it('does not replace the original failure when the logger throws', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => logErrorEvent('TEST_ERROR', {}, () => {
      throw new Error('logger unavailable');
    })).not.toThrow();
  });

  it('installs once, reports both browser failure types, and removes its listeners', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const logEvent = vi.fn();
    const uninstall = installGlobalErrorReporting(logEvent);
    expect(installGlobalErrorReporting(logEvent)).toBe(uninstall);

    window.dispatchEvent(Object.assign(
      new Event('unhandledrejection'), { reason: new RangeError('nope') }));
    window.dispatchEvent(new ErrorEvent('error', {
      error: new Error('kaboom'), message: 'kaboom', filename: 'app.js', lineno: 3, colno: 7,
    }));

    expect(logEvent.mock.calls).toEqual([
      [UNHANDLED_REJECTION, { error: { title: 'RangeError', message: 'nope' } }],
      [UNCAUGHT_ERROR, {
        error: { title: 'Error', message: 'kaboom' },
        filename: 'app.js', lineno: 3, colno: 7,
      }],
    ]);

    uninstall();
    window.dispatchEvent(Object.assign(
      new Event('unhandledrejection'), { reason: new Error('after cleanup') }));
    expect(logEvent).toHaveBeenCalledTimes(2);
  });
});
