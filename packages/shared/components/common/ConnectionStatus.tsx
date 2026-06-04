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

export interface ConnectionStatus {
  /** null = no persistence configured, false = disconnected, true = connected. */
  connected: boolean | null;
  saveStatus: SaveStatus;
  /** True when persistence is active (a websocket is configured). */
  persists: boolean;
  /** True when persistence is active but the connection has dropped. */
  offline: boolean;
}

/** Single subscription to connection + save state, with the null/false/true rules applied. */
export function useConnectionStatus(): ConnectionStatus {
  const connected = useConnected();
  const saveStatus = useSaved() as SaveStatus;
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
