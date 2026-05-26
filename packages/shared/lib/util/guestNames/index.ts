// Guest name generator — scaffolding for the pre-database era.
//
// When the server accepts a WebSocket connection that has no HTTP Basic
// credentials (and no other auth), we mint a friendly display name for the
// guest and echo it back in the `{status:'auth', ...}` message. The name is
// what the user sees; together with provenance='guest' and a computed
// safe_user_id, it also keys any server-side state for that connection.
//
// CURRENT BEHAVIOR: a fresh name is generated per connection. That means
// guest blob persistence across reloads is broken by design — fixing it
// requires a session/token store mapping reconnects back to existing
// identities. Dev workflows needing stable state should use HTTP Basic.
//
// UPGRADE PATH:
//
// (1) when a real identity store lands, generateGuestName() stays
// as-is; it just gets called from `createGuestIfMissing(token)`
// rather than on every connection. The curated wordlists in this
// directory remain the canonical source of first-encounter names.
//
// (2) TBD: i18n. We don't want a DancingWalrus17 in China or Egypt.

import * as crypto from 'crypto';

import { ADJECTIVES } from './adjectives';
import { ANIMALS } from './animals';

/**
 * Generate a fresh guest display name like "RunningWeasel54".
 *
 * Uses crypto.randomInt (not Math.random) for uniform selection — overkill
 * for a display name but avoids the documented modulo bias of Math.random
 * for no extra cost.
 *
 * Namespace: ADJECTIVES × ANIMALS × 100 suffixes. With the current lists
 * that's ~290k unique names — ample for a dev scaffold, and the digit
 * suffix keeps collisions visually obvious if they happen at all.
 */
export function generateGuestName(): string {
  const adj = ADJECTIVES[crypto.randomInt(ADJECTIVES.length)];
  const animal = ANIMALS[crypto.randomInt(ANIMALS.length)];
  const suffix = crypto.randomInt(100);
  return `${adj}${animal}${suffix}`;
}

export { ADJECTIVES, ANIMALS };
