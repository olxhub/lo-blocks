// packages/shared/components/common/ConnectionStatus.tsx
//
// Shared connection/save status: one subscription point plus the small
// presentational pieces used by StatusBar (the app header). Factored out so
// the connection semantics, offline wording, and save-dot mapping live in one
// place rather than being re-implemented per call site.
//
// The key semantics live in useConnected()'s tri-state:
//   null  → no websocket configured; nothing persists → show NOTHING
//            (don't claim "Saved" on a system that never saves)
//   false → persistence configured but the connection dropped → offline
//   true  → connected → show save status
//
'use client';
import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, WifiOff } from 'lucide-react';
import * as lo_event from 'lo_event';
import { useConnected, useSaved } from '@/lib/state';
import { onDocumentFault } from '@/lib/crdt/docText';

export type SaveStatus = 'saved' | 'modified' | 'error';

// Single source of truth for the offline wording.
export const OFFLINE_MESSAGE = 'Offline — changes may not be saved';

// ---------------------------------------------------------------------------
// FATAL DELIVERY FAILURE — live, driven by a symptom.
// ---------------------------------------------------------------------------
//
// A delivery failure distinct from "offline": the client holds its queue but
// nothing is reaching the server, so the UX fails hard rather than letting
// anyone keep working under the illusion of saving. Rendered as a full-width
// banner plus a page dim (see StatusBar).
//
// The trigger is a SYMPTOM, not a handshake: connected, outbox non-empty,
// nothing acked for NOT_ACKING_WINDOW_MS. There used to be an ACK_REQUIRED
// trigger reading `capabilities.ack` off the server's `hello`; capability
// negotiation is gone (it existed to guard a legacy confirm-on-send fallback,
// and a fallback that silently downgrades durability is worse than none). The
// symptom needs no capability frame and catches strictly more — a wedged
// pipeline or a quarantined event type present identically, and a server
// advertising `capabilities.ack` would have looked healthy through both.
//
// Two things this must keep doing: honour the tier distinction (a recoverable
// per-connection fault must NOT surface here, or people learn to ignore the
// banner — hence a disconnect or an emptied outbox resets the window, so
// reconnect churn and in-flight bursts never trip it), and show FATAL_MESSAGES
// copy rather than a raw diagnostic string, which is a developer message that
// must never reach a student.

export interface Fatal { code: string; message: string }

export const FATAL_MESSAGES: Record<string, string> = {
  NOT_ACKING: 'Saving isn’t working right now — the server isn’t confirming your work. Your work is held on this device; keep this page open and try again later.',
  DOCUMENT_FAULT: 'This page is out of sync, and edits to the text on it can no longer be saved. Reload to get the current version — anything typed here since the problem started will be lost.',
};
export const FATAL_FALLBACK = 'Saving is unavailable right now. Your work is held and will sync once the connection is restored.';
export function fatalMessage(code: string): string { return FATAL_MESSAGES[code] ?? FATAL_FALLBACK; }

/**
 * Fatals that RELOADING fixes, which is not most of them — the advice is
 * per-code and sometimes opposite. NOT_ACKING holds the work in an on-device
 * queue and tells the student to keep the page open, so offering a reload
 * there would invite them to discard exactly what is being protected. A
 * document fault is the reverse: the copy in this tab is the broken thing,
 * and reloading is the whole remedy.
 */
export const FATAL_RELOADABLE = new Set(['DOCUMENT_FAULT']);

// --- symptom detector -------------------------------------------------------
//
// How often we sample the outbox depth. Cheap (one IndexedDB count per logger),
// so the interval is chosen for responsiveness, not cost.
export const POLL_MS = 5_000;
// How long the outbox must stay non-empty with no observed decrease, measured
// in CONNECTED time, before we call it fatal. Long enough to sit out a slow
// batch or a retry, short enough that a student notices before doing much work.
export const NOT_ACKING_WINDOW_MS = 30_000;

/** Detector state, threaded through pure steps so the decision is testable. */
export interface NotAckingState {
  /** First connected sample of the current stuck run, or null if not stuck. */
  stuckSince: number | null;
  /** Outbox depth at the previous connected sample, or null. */
  lastCount: number | null;
  fatal: Fatal | null;
}

export interface NotAckingSample {
  /** Monotonic-ish ms timestamp of the sample. */
  t: number;
  connected: boolean | null;
  /** Unacked events across all loggers; ignored when not connected. */
  count: number;
}

export const initialNotAckingState: NotAckingState = { stuckSince: null, lastCount: null, fatal: null };

/**
 * One sample → next state. The decision core, deliberately pure.
 *
 * A decrease in the count means an ack landed, so the pipeline is alive: window
 * resets and any existing fatal clears. That is what "sticky" meant in the
 * older breadcrumb — no flicker while the outbox sits stuck — not
 * unrecoverable-by-design; a server that genuinely starts acking again stops
 * being fatal. A disconnect only resets the window (offline has its own,
 * truthful message and takes precedence in StatusBar); the fatal itself is
 * cleared only by evidence of progress.
 */
export function stepNotAcking(state: NotAckingState, sample: NotAckingSample): NotAckingState {
  if (sample.connected !== true) {
    return { ...state, stuckSince: null, lastCount: null };
  }
  const acked = state.lastCount !== null && sample.count < state.lastCount;
  if (sample.count === 0 || acked) {
    return { stuckSince: null, lastCount: sample.count, fatal: null };
  }
  const stuckSince = state.stuckSince ?? sample.t;
  const fatal = sample.t - stuckSince >= NOT_ACKING_WINDOW_MS
    ? (state.fatal ?? { code: 'NOT_ACKING', message: fatalMessage('NOT_ACKING') })
    : state.fatal;
  return { stuckSince, lastCount: sample.count, fatal };
}

/** Fold a sample sequence — the shape tests use. */
export function foldNotAcking(samples: NotAckingSample[]): NotAckingState {
  return samples.reduce(stepNotAcking, initialNotAckingState);
}

/** Polls the outbox while connected and reports the symptom-based fatal. */
function useNotAckingFatal(connected: boolean | null): Fatal | null {
  const stateRef = useRef<NotAckingState>(initialNotAckingState);
  const [fatal, setFatal] = useState<Fatal | null>(null);

  useEffect(() => {
    if (connected !== true) {
      // Not connected: fold the disconnect in so the window restarts on return.
      stateRef.current = stepNotAcking(stateRef.current, { t: Date.now(), connected, count: 0 });
      return;
    }
    let cancelled = false;
    const sample = async () => {
      let count: number;
      try {
        count = await lo_event.unackedCount();
      } catch {
        return; // No queue to inspect yet — say nothing rather than guess.
      }
      if (cancelled) return;
      stateRef.current = stepNotAcking(stateRef.current, { t: Date.now(), connected: true, count });
      setFatal(stateRef.current.fatal);
    };
    void sample();
    const timer = setInterval(() => void sample(), POLL_MS);
    return () => { cancelled = true; clearInterval(timer); };
  }, [connected]);

  return fatal;
}

/**
 * Fatal from a document the CRDT refused (lib/crdt/docText.ts).
 *
 * Unlike the NOT_ACKING detector above, this needs no sampling and no
 * heuristic: the fold either merged or it did not. It reports directly,
 * and clears itself if the same place folds again — which is what happens
 * when reconnecting adopts the stored copy and repairs this client.
 */
function useDocumentFaultFatal(): Fatal | null {
  const [faults, setFaults] = useState<readonly string[]>([]);
  useEffect(() => onDocumentFault(setFaults), []);
  return faults.length > 0
    ? { code: 'DOCUMENT_FAULT', message: fatalMessage('DOCUMENT_FAULT') }
    : null;
}

export interface ConnectionStatus {
  /** null = no persistence configured, false = disconnected, true = connected. */
  connected: boolean | null;
  saveStatus: SaveStatus;
  /** True when persistence is active (a websocket is configured). */
  persists: boolean;
  /** True when persistence is active but the connection has dropped. */
  offline: boolean;
  /** Fatal delivery failure, or null. See the FATAL block above. */
  fatal: Fatal | null;
}

/** Single subscription to connection + save state, with the null/false/true rules applied. */
export function useConnectionStatus(): ConnectionStatus {
  const connected = useConnected();
  const saveStatus = useSaved() as SaveStatus;
  const notAcking = useNotAckingFatal(connected);
  const documentFault = useDocumentFaultFatal();
  return {
    connected,
    saveStatus,
    persists: connected !== null,
    offline: connected === false,
    // A document fault takes precedence: it is a certainty rather than a
    // symptom, and its remedy (reload) contradicts NOT_ACKING's advice, so
    // showing the weaker diagnosis would tell the student to sit and wait
    // for something that will never resolve on its own.
    fatal: documentFault ?? notAcking,
  };
}

const SAVE_META: Record<SaveStatus, { label: string; dot: string }> = {
  saved: { label: 'Saved', dot: 'bg-success' },
  modified: { label: 'Unsaved changes', dot: 'bg-warning' },
  error: { label: 'Save failed', dot: 'bg-error' },
};

/** Save-status dot, optionally with a text label. */
export function SaveIndicator({
  saveStatus,
  showLabel = false,
}: {
  saveStatus: SaveStatus;
  showLabel?: boolean;
}) {
  const meta = SAVE_META[saveStatus] ?? SAVE_META.saved;
  return (
    <span className="flex items-center gap-2" title={meta.label}>
      <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
      {showLabel && <span>{meta.label}</span>}
    </span>
  );
}

/**
 * Inline offline notice: WifiOff icon + the standard wording. Carries no
 * background of its own — the caller supplies the container styling (StatusBar
 * uses a full-width banner).
 */
export function OfflineNotice({ className = '' }: { className?: string }) {
  return (
    <span className={`flex items-center gap-2 ${className}`}>
      <WifiOff className="w-4 h-4" />
      {OFFLINE_MESSAGE}
    </span>
  );
}

/**
 * Inline fatal notice: AlertTriangle + FATAL_MESSAGES copy (never a raw
 * diagnostic). Like OfflineNotice, it carries no background of its own — the
 * caller supplies the container styling.
 */
export function FatalNotice({ message, className = '' }: { message: string; className?: string }) {
  return (
    <span className={`flex items-center gap-2 ${className}`}>
      <AlertTriangle className="w-4 h-4" />
      {message}
    </span>
  );
}
