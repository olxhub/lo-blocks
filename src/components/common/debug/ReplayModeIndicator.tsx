// src/components/common/debug/ReplayModeIndicator.tsx
//
// Visual indicator showing when replay mode is active.
// Displays a banner at the top of the page to remind users they're
// viewing historical state, not live state.
//
'use client';

import { useReplayContextOptional } from '@/lib/state/replayContext';
import './ReplayModeIndicator.css';

export default function ReplayModeIndicator() {
  const replayCtx = useReplayContextOptional();

  // Don't render if replay context isn't available or replay isn't active
  if (!replayCtx?.isActive) {
    return null;
  }

  const { selectedEventIndex, clearReplay } = replayCtx;

  return (
    <div className="replay-mode-indicator">
      <span className="replay-mode-icon">⏪</span>
      <span className="replay-mode-text">
        Replay Mode — Viewing state after event #{selectedEventIndex + 1}
      </span>
      <button className="replay-mode-exit" onClick={clearReplay}>
        Return to Live
      </button>
    </div>
  );
}
