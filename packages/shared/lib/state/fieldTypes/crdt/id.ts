// packages/shared/lib/state/fieldTypes/crdt/id.ts
//
// CRDT ID field — per-actor monotonic counters for unique ID generation.
//
// State is { [actorUUID]: number } — each actor (browser tab / session)
// maintains its own counter. IDs are formatted as "shortActor_count"
// (e.g., "a7b3_0", "a7b3_1") — readable in scope markers and analytics
// while practically unique within a classroom session.
//
// Conflict resolution: per-actor monotonic. Each actor's counter only
// advances. Concurrent actors don't interfere — their counters are
// independent keys in the state object.
//
// Analytics: `read` returns total IDs allocated (sum of all actor counters).
// `display` includes actor count. The event payload carries the full actor
// UUID, the counter, and the allocated ID string.
//
// See also: classic/id.ts for the single-actor variant.
//
import { scopes } from '../../scopes';
import { getActorId } from '../../../crdt/actorId';
import { fieldNameToDefaultEventName } from '../shared';
import type { FieldInfo, FieldName, FieldEvent, WriteResult } from '../../../types';

/** First 4 hex characters of a UUID (hyphens stripped). */
function shortActor(uuid: string): string {
  return uuid.replace(/-/g, '').slice(0, 4);
}

/**
 * CRDT ID field — per-actor monotonic counters for unique ID generation.
 *
 * State: `{ [actorUUID]: number }` — each actor's counter.
 * IDs: `"a7b3_0"` — short actor prefix + per-actor sequence number.
 *
 * The block author never touches the state directly — they call
 * `useNextId(props, field)` which returns a `() => string` callback.
 */
export function idField(name: string, opts?: Partial<FieldInfo>): FieldInfo {
  const event = opts?.event ?? fieldNameToDefaultEventName(name);
  const events = opts?.events ?? [event as FieldEvent];
  return {
    type: 'field',
    kind: 'id',
    name: name as FieldName,
    events,
    event: events[0] as string,
    scope: opts?.scope ?? scopes.component,

    read(raw: any): number {
      if (!raw || typeof raw !== 'object') return 0;
      let total = 0;
      for (const count of Object.values(raw)) {
        if (typeof count === 'number') total += count;
      }
      return total;
    },

    write(oldRaw: any, _newValue: any): WriteResult[] {
      const actor = getActorId();
      const state = (oldRaw && typeof oldRaw === 'object') ? oldRaw : {};
      const counter = typeof state[actor] === 'number' ? state[actor] : 0;
      return [{
        event: events[0],
        payload: {
          field: name,
          actor,
          counter: counter + 1,
          allocatedId: `${shortActor(actor)}_${counter}`,
        },
      }];
    },

    reduce(componentState: Record<string, any>, action: any, fieldName: string): Record<string, any> {
      const { actor, counter } = action;
      if (!actor || typeof counter !== 'number') return {};

      const current = componentState[fieldName];
      const state = (current && typeof current === 'object') ? { ...current } : {};
      const existing = typeof state[actor] === 'number' ? state[actor] : 0;

      // Per-actor monotonic: only advance, never decrease
      if (counter <= existing) return {};

      state[actor] = counter;
      return { [fieldName]: state };
    },

    display(raw: any): string {
      if (!raw || typeof raw !== 'object') return '0 ids allocated';
      const entries = Object.entries(raw).filter(([, v]) => typeof v === 'number');
      const total = entries.reduce((sum, [, v]) => sum + (v as number), 0);
      const actors = entries.length;
      const suffix = actors <= 1 ? '' : ` (${actors} actors)`;
      return `${total} id${total === 1 ? '' : 's'} allocated${suffix}`;
    },

    ...(opts?.schema ? { schema: opts.schema } : {}),
    ...(opts?.equality ? { equality: opts.equality } : {}),
    ...(opts?.batching ? { batching: opts.batching } : {}),
  };
}

// Exported for testing
export { shortActor as __shortActor };
