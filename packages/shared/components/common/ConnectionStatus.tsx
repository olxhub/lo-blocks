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
import { WifiOff } from 'lucide-react';
import { useConnected, useSaved } from '@/lib/state';

export type SaveStatus = 'saved' | 'modified' | 'error';

// Single source of truth for the offline wording.
export const OFFLINE_MESSAGE = 'Offline — changes may not be saved';

// ---------------------------------------------------------------------------
// FATAL DELIVERY FAILURE — disabled, deliberately. Breadcrumb, not dead weight.
// ---------------------------------------------------------------------------
//
// A sticky, non-recoverable delivery failure, distinct from "offline": the
// client holds its queue but nothing will ever reach the server, so the UX
// fails hard rather than letting anyone keep working under the illusion of
// saving. Rendered as a full-width banner plus a page dim (see StatusBar).
//
// Its only trigger used to be ACK_REQUIRED — the server's `hello` did not
// advertise `capabilities.ack`. That trigger is gone on purpose: capability
// negotiation existed mainly to guard a legacy confirm-on-send fallback, and a
// fallback that silently downgrades durability is worse than none.
//
// The REQUIREMENT did not go away, only the signal, which is why this is
// commented rather than deleted. What should feed it is a SYMPTOM, not a
// handshake: connected, outbox non-empty, nothing acked in N seconds. That
// needs no capability frame and no legacy path, and it catches strictly more —
// a wedged pipeline or a quarantined event type present identically, and a
// server advertising `capabilities.ack` would have looked healthy through both.
//
// Two things to preserve when it comes back: the tier distinction (a recoverable
// per-connection fault must NOT surface here, or people learn to ignore the
// banner), and showing FATAL_MESSAGES copy rather than a raw diagnostic string,
// which is a developer message that must never reach a student.
//
// export interface Fatal { code: string; message: string }
//
// export const FATAL_MESSAGES: Record<string, string> = {
//   ACK_REQUIRED: 'Saving is unavailable right now — the server isn’t accepting saves. Your work is held and will sync once the connection is restored.',
// };
// export const FATAL_FALLBACK = 'Saving is unavailable right now. Your work is held and will sync once the connection is restored.';
// export function fatalMessage(code: string): string { return FATAL_MESSAGES[code] ?? FATAL_FALLBACK; }

export interface ConnectionStatus {
  /** null = no persistence configured, false = disconnected, true = connected. */
  connected: boolean | null;
  saveStatus: SaveStatus;
  /** True when persistence is active (a websocket is configured). */
  persists: boolean;
  /** True when persistence is active but the connection has dropped. */
  offline: boolean;
  // /** Sticky fatal delivery failure, or null. See the FATAL block above. */
  // fatal: Fatal | null;
}

/** Single subscription to connection + save state, with the null/false/true rules applied. */
export function useConnectionStatus(): ConnectionStatus {
  const connected = useConnected();
  const saveStatus = useSaved() as SaveStatus;
  // TODO(lo_event-not-acking): no fatal signal exists yet — see the FATAL block
  // above for what should produce one, and StatusBar for the disabled banner.
  return {
    connected,
    saveStatus,
    persists: connected !== null,
    offline: connected === false,
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

// Disabled with the rest of the fatal machinery — see the FATAL block above.
// Restore alongside a trigger, not before: an unreachable banner with
// user-facing copy that cannot be exercised is exactly what survives three
// refactors because nobody can tell whether it is load-bearing.
//
// export function FatalNotice({ message, className = '' }: { message: string; className?: string }) {
//   return (
//     <span className={`flex items-center gap-2 ${className}`}>
//       <AlertTriangle className="w-4 h-4" />
//       {message}
//     </span>
//   );
// }
