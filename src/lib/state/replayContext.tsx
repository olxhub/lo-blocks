// src/lib/state/replayContext.tsx
//
// DEPRECATED: Replay state has been moved to Redux via useDebugSettings.
//
// Migration:
// - Old: const ctx = useReplayContextOptional(); const isReplaying = ctx?.isActive;
// - New: const { replayMode } = useDebugSettings(); (from '@/app/storeWrapper')
//
// This file is kept for backward compatibility but should not be used for new code.
// All replay state now lives in Redux:
//   - settings.debugReplayMode: whether replay mode is active
//   - settings.debugReplayEventIndex: which event to replay (-1 = live)
//
// Use useDebugSettings() from '@/app/storeWrapper' instead.
