// apps/static/src/replay/replayResponses.ts
//
// Reducer-backed replay for the build-time response CSVs.
//
// This module is deliberately separate from responses.ts (pure helpers) and
// build-replay-index.ts (pure parsing) because importing it pulls in the full
// Redux reducer stack and RUNS A SIDE EFFECT AT IMPORT: initReducers registers
// the block field reducers so replayToEvent uses the real per-field reducers
// instead of the legacy-spread fallback. Mirrors packages/shared/scripts/
// replay.ts. Keeping it isolated means build-replay-index.test.ts (which only
// exercises pure grouping/session logic) never loads reducers.
//
import { replayToEvent, type AppState, type LoggedEvent } from '@/lib/replay';
import { initReducers } from '@/lib/state/store';
import { BLOCK_REGISTRY } from '@/components/blockRegistry';

// Register field reducers before any replay (see module header). Safe headless:
// no lo_event / websocket / Redux store is created.
initReducers(BLOCK_REGISTRY);

/** Replay a student's merged event stream to its final reducer state. */
export function replayToFinalState(events: LoggedEvent[]): AppState {
  return replayToEvent(events);
}
