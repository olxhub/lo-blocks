// Error events are diagnostics, not student state. They deliberately carry no
// top-level id/scope/field/tag, so the state reducer has no bucket to fold.
import * as lo_event from 'lo_event';
import type { LogEventFn } from '../player/client/render';
import { toAppError, type AppError } from '../types/errors';
import { truncateString } from '../util';

export const ACTION_ERROR = 'ACTION_ERROR';
export const UNHANDLED_REJECTION = 'UNHANDLED_REJECTION';
export const UNCAUGHT_ERROR = 'UNCAUGHT_ERROR';

const MAX_ERROR_MESSAGE = 4096;
const MAX_ERROR_TITLE = 256;
const MAX_FILENAME = 2048;

type EventError = Pick<AppError, 'message' | 'title'>;

/** Convert through the application's canonical error type, then keep only the
 * bounded subset suitable for a durable event. Stack and technical details
 * remain available to the local console/UI. */
export function errorEventPayload(error: unknown): EventError {
  const appError = toAppError(
    error,
    error instanceof Error && error.name ? { title: error.name } : {},
  );
  return {
    ...(appError.title ? { title: truncateString(appError.title, MAX_ERROR_TITLE) } : {}),
    message: truncateString(appError.message, MAX_ERROR_MESSAGE),
  };
}

/** Reporting a failure must never replace it with a logger failure. */
export function logErrorEvent(
  eventType: string,
  payload: Record<string, any>,
  logEvent?: LogEventFn,
): void {
  try {
    (logEvent ?? lo_event.logEvent)(eventType, payload);
  } catch (error) {
    try { console.error(`[errorEvents] failed to report ${eventType}:`, error); }
    catch { /* no reporting path remains */ }
  }
}

let uninstallGlobalErrorReporting: (() => void) | null = null;
let reporting = false;

/** Install the browser-wide backstop. Repeated installation is harmless and
 * returns the same cleanup function; production entry points need not retain
 * it, while tests and future embedded clients can uninstall exactly. */
export function installGlobalErrorReporting(logEvent?: LogEventFn): () => void {
  if (uninstallGlobalErrorReporting) return uninstallGlobalErrorReporting;

  const report = (eventType: string, error: unknown, extra: Record<string, any> = {}) => {
    if (reporting) return;
    reporting = true;
    try {
      // TODO(error-reporting): Rate-limit repeated signatures. A tight failure
      // loop should not flood the durable event stream.
      logErrorEvent(eventType, { error: errorEventPayload(error), ...extra }, logEvent);
    } catch { /* reporting must never make the original failure worse */ }
    finally { reporting = false; }
  };

  const onUnhandledRejection = (event: PromiseRejectionEvent) => {
    try { console.error('[unhandledrejection]', event.reason); }
    catch { /* console implementations can be replaced by host pages */ }
    report(UNHANDLED_REJECTION, event.reason);
  };

  const onError = (event: ErrorEvent) => {
    // Resource-load errors have neither a thrown value nor a message and need
    // different diagnostics from JavaScript failures.
    if (!event?.error && !event?.message) return;
    report(UNCAUGHT_ERROR, event.error ?? event.message, event.filename ? {
      filename: truncateString(event.filename, MAX_FILENAME),
      lineno: event.lineno,
      colno: event.colno,
    } : {});
  };

  window.addEventListener('unhandledrejection', onUnhandledRejection);
  window.addEventListener('error', onError);

  let active = true;
  const uninstall = () => {
    if (!active) return;
    active = false;
    window.removeEventListener('unhandledrejection', onUnhandledRejection);
    window.removeEventListener('error', onError);
    if (uninstallGlobalErrorReporting === uninstall) {
      uninstallGlobalErrorReporting = null;
    }
    reporting = false;
  };
  uninstallGlobalErrorReporting = uninstall;
  return uninstall;
}

/** @internal Test helper; production callers use the returned cleanup. */
export function resetGlobalErrorReportingForTests(): void {
  uninstallGlobalErrorReporting?.();
  reporting = false;
}
