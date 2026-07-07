// packages/shared/lib/state/fieldTypes/crdt/logConstructor.ts
//
// Log field constructor — no React, no Redux (cycle-safe, mirroring
// setConstructor.ts). The dispatch helpers (appendToLog, clearLog) are in
// log.ts, which imports redux.ts.
//
// Strategy-independent: an append-only op-keyed log merges safely under
// both the classic and CRDT reducer strategies, so there is no classic/
// counterpart — fieldTypes/index.ts exports this one unconditionally.
//
import { scopes } from '../../scopes';
import { logRead, logWrite, logReduce, logDisplay } from '../../../crdt/log';
import type { FieldInfo, FieldName, FieldEvent } from '../../../types';

/**
 * Log field — an append-only ordered sequence of items (message transcripts,
 * activity feeds). Materializes to item[] in (ts, actor) order.
 *
 * Appends via appendToLog(props, field, item, { stateKey }) (or the
 * useFieldState setter with [...items, next] — append-only). Clearing is
 * clearLog() — a LWW watermark, safe against concurrent appends.
 */
export function logField(name: string, opts?: Partial<FieldInfo>): FieldInfo {
  const events = opts?.events ?? ['LOG_APPEND' as FieldEvent, 'LOG_CLEAR' as FieldEvent];
  return {
    // Caller opts pass through WHOLESALE (see setConstructor.ts).
    ...opts,
    type: 'field',
    kind: 'log',
    name: name as FieldName,
    events,
    event: events[0] as string,
    scope: opts?.scope ?? scopes.component,
    read: opts?.read ?? logRead,
    write: opts?.write ?? logWrite(name),
    reduce: opts?.reduce ?? logReduce,
    display: opts?.display ?? logDisplay,
    equality: opts?.equality ?? Object.is,
  };
}
