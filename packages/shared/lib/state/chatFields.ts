// packages/shared/lib/state/chatFields.ts
//
// Chat state as fields — the transcript is an append-only, actor-stamped
// log CRDT; status is a LWW register. Replaces the ad-hoc CHAT_* switch
// and the top-level `chat` bucket that bypassed the field system.
//
// Component scope, keyed by a synthetic StateKey per conversation
// (chatStateKey), following the editorFields/studioFields pattern for
// non-block surfaces: props = null + explicit stateKey. Because it's
// ordinary component-scope field data, chat gets persistence, replay,
// and (when the sync loop lands) server-side reduction and merge with
// no chat-specific plumbing — multi-producer by construction.
//
// Registration: not owned by a rendered block, so these fields must be
// passed to store.init({ extraFields }) (client) / initReducers (server).
//
import { fields } from './fields';
import { logField } from './fieldTypes/crdt/logConstructor';
import { asStateKey } from '../types/id-grammar';
import type { StateKey } from '../types';

export const chatFields = fields([
  logField('messages'),
  'status',
]);

/** The StateKey for a conversation. Prefixed so chat ids can't collide
 *  with real component ids in the component bucket. */
export function chatStateKey(chatId: string): StateKey {
  return asStateKey(`chat/${chatId}`);
}
