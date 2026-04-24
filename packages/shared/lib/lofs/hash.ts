// packages/shared/lib/lofs/hash.ts
//
// Content-addressable hashing. Provider-independent identity.
//
// Server-only: uses node:crypto. The LofsContentHash type itself is
// client-safe and lives in address.ts.
//
// Ported from prototypes/lofs/src/hash.ts.

import { createHash } from 'node:crypto';
import { type LofsContentHash, toLofsContentHash } from './address';

/**
 * SHA-256 hex digest of a string. Same content = same hash everywhere.
 */
export function contentHash(content: string): LofsContentHash {
  return toLofsContentHash(
    createHash('sha256').update(content, 'utf8').digest('hex')
  );
}
