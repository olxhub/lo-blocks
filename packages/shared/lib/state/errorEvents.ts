// packages/shared/lib/state/errorEvents.ts
//
// LOUD failures: the error half of the event stream.
//
// console.error reaches exactly one audience — a developer with DevTools
// open on the tab that broke. This platform is event-sourced, so anything
// that matters has to travel the same road every other fact travels:
// lo_event.logEvent → durable outbox → WebSocket → the server's event log
// (apps/server/src/pipeline.ts, decodeAndLog) and its console line. That is
// what makes a failure visible in production (the hosts' hono-server logs)
// and countable per user after the fact.
//
// Two producers today: a block action that threw (lib/blocks/actions.tsx)
// and the window-level backstop below, which catches the whole class —
// every dropped promise and uncaught throw the app never thought to wrap.
//
// WIRE SHAPE — why there is no top-level `id`
// ===========================================
// These event types are deliberately NOT registered with the store
// (collectEventTypes in store.ts), so on the client updateResponseReducer
// never runs for them: they are reported, not stored. The SERVER, however,
// folds EVERY event it receives (routeEvent → ServerState.dispatch →
// updateResponseReducer). An unregistered event there falls through to the
// plain-spread path, which writes its payload into `component[action.id]`
// when a top-level `id` is present. A crash report must never become
// student state, so the block's identity travels as `actionId`/`actionStateKey`
// and the envelope keys the reducer routes on — `id`, `scope`, `field`,
// `tag` — are left absent. With no `id`, the spread path returns state
// untouched (store.ts, "Actions with no bucket key are not ours").
//
import * as lo_event from 'lo_event';
import type { LogEventFn } from '../player/client/render';

/** A block action rejected; its effect did not happen. */
export const ACTION_ERROR = 'ACTION_ERROR';
/** A promise rejected with nobody awaiting it (the window backstop). */
export const UNHANDLED_REJECTION = 'UNHANDLED_REJECTION';
/** A synchronous throw reached window.onerror (the window backstop). */
export const UNCAUGHT_ERROR = 'UNCAUGHT_ERROR';

/**
 * The `error` sub-object every error event carries — name + message only.
 *
 * Events stay lean deliberately: they are durable, replayed, and fanned out.
 * The STACK stays on the console, where the developer who needs it is; the
 * event carries what a log grep or a per-user count needs.
 */
export interface ErrorEventPayload {
  name: string;
  message: string;
}

/** Normalize any thrown value into { name, message }. Never throws. */
export function describeError(e: unknown): ErrorEventPayload {
  try {
    if (e instanceof Error) {
      return { name: e.name || 'Error', message: e.message || String(e) };
    }
    if (e && typeof e === 'object') {
      const o = e as Record<string, any>;
      const name = typeof o.name === 'string' ? o.name : 'Error';
      const message = typeof o.message === 'string' ? o.message : safeStringify(e);
      return { name, message };
    }
    return { name: 'Error', message: String(e) };
  } catch {
    return { name: 'Error', message: '<undescribable error>' };
  }
}

function safeStringify(value: unknown): string {
  try { return JSON.stringify(value) ?? String(value); }
  catch { return String(value); }
}

/**
 * Emit an error event, fire-and-forget.
 *
 * ABSOLUTELY MUST NOT THROW: every caller is already on a failure path
 * (a catch block, an unhandledrejection handler). A throw here would either
 * replace the original error with a worse one or — in the backstop's case —
 * raise a second unhandled rejection and loop. lo_event.logEvent CAN throw
 * (reserved frame names; a logger that blew up mid-init), so the whole body
 * is guarded, and the guard's own fallback console.error is guarded too.
 */
export function logErrorEvent(
  eventType: string,
  payload: Record<string, any>,
  logEvent?: LogEventFn,
): void {
  try {
    (logEvent ?? lo_event.logEvent)(eventType, payload);
  } catch (e) {
    try { console.error(`[errorEvents] failed to report ${eventType}:`, e); }
    catch { /* nothing left to try */ }
  }
}

// =============================================================================
// Window-level backstop
// =============================================================================

/** Fail-fast latch: installing twice is a caller bug, not a state to absorb. */
let installed = false;
/** Re-entry guard: a failure INSIDE reporting must not be reported again. */
let reporting = false;

/**
 * Install window-level error reporting: every unhandled rejection and every
 * uncaught throw becomes an event on the same stream as everything else.
 *
 * This is the backstop for the class of bug that motivated it — an async
 * handler whose caller cannot await it, so a rejection produces no console
 * output, no Redux action, and a control that simply looks dead. Named
 * catch sites (actions.tsx) give a better report; this one guarantees a
 * report exists at all.
 *
 * Idempotent (store.init runs per app and per test) and loop-safe: if the
 * act of reporting throws, the resulting rejection is swallowed by
 * `reporting` rather than re-entering.
 *
 * `logEvent` is injectable only so tests can observe the emission point;
 * production passes nothing and gets lo_event.logEvent.
 */
// TODO: this module is shared code and must stay node-safe; the global
// installer below is browser-only and is called from the CLIENT entry points
// (apps/client/src/App.tsx, apps/static/src/App.tsx), never from shared init
// paths like store.init. If node-side reporting is ever wanted, add a
// separate installer for process-level 'unhandledRejection'.
export function installGlobalErrorReporting(logEvent?: LogEventFn): void {
  if (installed) {
    throw new Error(
      'installGlobalErrorReporting called twice: it must be called exactly '
      + 'once, from the client entry point. Find and fix the second caller.');
  }
  installed = true;

  window.addEventListener('unhandledrejection', (ev: PromiseRejectionEvent) => {
    if (reporting) return;
    reporting = true;
    try {
      // The stack (if any) goes to the console only — see ErrorEventPayload.
      console.error('[unhandledrejection]', ev.reason);
      logErrorEvent(UNHANDLED_REJECTION, { error: describeError(ev?.reason) }, logEvent);
    } catch { /* reporting must never make things worse */ }
    finally { reporting = false; }
  });

  window.addEventListener('error', (ev: ErrorEvent) => {
    if (reporting) return;
    // Resource load failures (<img>, <script>) also fire 'error', but they
    // target the element rather than the window and carry no .error. They
    // are a different problem with a different fix; skip them.
    if (!ev?.error && !ev?.message) return;
    reporting = true;
    try {
      logErrorEvent(UNCAUGHT_ERROR, {
        error: describeError(ev.error ?? ev.message),
        ...(ev.filename ? { filename: ev.filename, lineno: ev.lineno, colno: ev.colno } : {}),
      }, logEvent);
    } catch { /* as above */ }
    finally { reporting = false; }
  });
}

/** Test-only: forget the registration so a fresh window can install again. */
export function resetGlobalErrorReportingForTests(): void {
  installed = false;
  reporting = false;
}
