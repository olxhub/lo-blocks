// apps/server/src/worktree.ts
//
// The production WORKING-TREE backing (git-storage-design §2.4): a
// WorktreeResolver over the per-user server-side materialization
// (UserStateRegistry). A working-tree entry IS a storage-scope bucket in the
// caller's materialization, keyed by the file's source LofsRef
// (`makeAddress(origin, path)`) — the SAME bucket, and the SAME `content`
// field (editorFields.content), that Studio's editor buffer already writes and
// persists per user. So the agent's working tree and the human's editor buffer
// are one persisted copy, not two.
//
// Bucket layout (one per staged path):
//   state.storage[<sourceRef>] = {
//     content: <string | RgaDoc>,   // editorFields.content — shared with Studio
//     wt: { deleted?, renamedTo?, base?, baseMeta? },  // present IFF staged
//   }
// A bucket with no `wt` is a plain editor buffer (Studio opened/edited a file
// but no tool staged it) — NOT a working-tree entry, so `list()` skips it.
//
// Content format: this backing writes `content` as a plain string; it decodes
// on read via editorFields.content (which handles a string OR an RGA doc), so
// it interoperates with Studio's CRDT-splice buffer for the same key. Live
// cross-surface convergence (an agent's Write appearing in an OPEN Studio tab,
// or Commit's drop clearing an open editor) is NOT broadcast this step — each
// surface manages its live view and they reconcile through the shared,
// per-user persisted field on reload.

import type { KVStore } from './kvs.js';
import type { ToolContext } from '@/lib/mcp/registry';
import type { Worktree, WorktreeEntry, WorktreeResolver } from '@/lib/lofs/worktree';
import type { UserStateRegistry } from '@/lib/state/sync/registry';
import { assembleFieldState } from '@/lib/state/sync/persistence';
import { userInstance, type LevelInstance } from '@/lib/state/sync/levels';
import { asSafeUserId } from '@/lib/types/identity';
import { editorFields } from '@/lib/state/editorFields';
import { decodeField } from '@/lib/state/redux';
import {
  makeAddress, toLofsOrigin, toLofsContentPath, toLofsRef, addressPath, withoutVersion, source as originOf,
} from '@/lib/types/address';
import type { LofsCanonical } from '@/lib/types/address';

/** Internal metadata carried alongside `content` in a staged bucket. */
interface WtMeta {
  deleted?: boolean;
  renamedTo?: string;
  base?: LofsCanonical;
  baseMeta?: unknown;
}

/**
 * The materialization instance a caller's working tree lives in. Every MCP
 * session carries identity (guest included), so this is the caller's own
 * user instance; an in-process call with no ctx falls back to a shared local
 * instance (dev/tests).
 */
function instanceFor(ctx: ToolContext | undefined): LevelInstance {
  const id = ctx?.user?.safe_user_id ?? ctx?.user?.user_id ?? '_local';
  return userInstance(asSafeUserId(id));
}

/**
 * Build the WorktreeResolver the LOFS tools inject. Bound to the server's one
 * UserStateRegistry + KVS, so tool writes land in the SAME materialization the
 * WebSocket pipeline folds into (and persist through the same FieldPersister).
 */
export function makeStateRegistryWorktree(
  registry: UserStateRegistry,
  kvs: KVStore,
): WorktreeResolver {
  return async (ctx: ToolContext | undefined, origin: string): Promise<Worktree> => {
    const instance = instanceFor(ctx);
    const originStr = String(toLofsOrigin(origin));
    const refOf = (path: string): string =>
      String(makeAddress(toLofsOrigin(origin), toLofsContentPath(path)));

    /** Seed a fresh entry's materialization from persisted field state. */
    const seedLoad = async (entry: ReturnType<UserStateRegistry['acquire']>) => {
      const scopes = await assembleFieldState(kvs, instance);
      if (scopes) {
        entry.serverState.seed(scopes);
        entry.persister.startFromPersisted(entry.serverState.state);
      }
    };

    /** Acquire → seed → mutate storage → persist → release (flush). Shares the
     *  live entry when a Studio WS connection already holds it. */
    const mutate = async (fn: (storage: Record<string, any>) => void): Promise<void> => {
      const entry = registry.acquire(instance);
      try {
        await entry.ensureSeeded(() => seedLoad(entry));
        const state = entry.serverState.state as Record<string, any>;
        const storage = { ...(state.storage ?? {}) };
        fn(storage);
        entry.serverState.state = { ...state, storage } as any;
        entry.persister.stateChanged(entry.serverState.state);
      } finally {
        await entry.release();
      }
    };

    /** Read-only storage scope (live materialization merged over KVS). */
    const readStorage = async (): Promise<Record<string, any>> => {
      const scopes = await registry.read(instance);
      return (scopes?.storage ?? {}) as Record<string, any>;
    };

    const decodeContent = (bucket: any): string | undefined => {
      if (!bucket || bucket.content === undefined) return undefined;
      return decodeField(editorFields.content, bucket.content) as string;
    };

    const entryFromBucket = (bucket: any): WorktreeEntry | undefined => {
      const wt: WtMeta | undefined = bucket?.wt;
      if (!wt) return undefined;
      const content = wt.deleted || wt.renamedTo !== undefined ? undefined : decodeContent(bucket);
      return {
        ...(content !== undefined ? { content } : {}),
        ...(wt.deleted ? { deleted: true } : {}),
        ...(wt.renamedTo !== undefined ? { renamedTo: wt.renamedTo } : {}),
        ...(wt.base !== undefined ? { base: wt.base } : {}),
        ...(wt.baseMeta !== undefined ? { baseMeta: wt.baseMeta } : {}),
      };
    };

    return {
      async get(path: string): Promise<WorktreeEntry | undefined> {
        const storage = await readStorage();
        return entryFromBucket(storage[refOf(path)]);
      },

      async list(): Promise<Array<{ path: string; entry: WorktreeEntry }>> {
        const storage = await readStorage();
        const out: Array<{ path: string; entry: WorktreeEntry }> = [];
        for (const [key, bucket] of Object.entries(storage)) {
          if (!(bucket as any)?.wt) continue;
          let ref;
          try { ref = withoutVersion(toLofsRef(key)); } catch { continue; }
          if (String(originOf(ref)) !== originStr) continue;
          const entry = entryFromBucket(bucket);
          if (entry) out.push({ path: String(addressPath(ref)), entry });
        }
        return out;
      },

      async set(path: string, entry: WorktreeEntry): Promise<void> {
        const ref = refOf(path);
        const wt: WtMeta = {
          ...(entry.deleted ? { deleted: true } : {}),
          ...(entry.renamedTo !== undefined ? { renamedTo: entry.renamedTo } : {}),
          ...(entry.base !== undefined ? { base: entry.base } : {}),
          ...(entry.baseMeta !== undefined ? { baseMeta: entry.baseMeta } : {}),
        };
        await mutate((storage) => {
          const prev = storage[ref] ?? {};
          const next: Record<string, any> = { ...prev, wt };
          // Store content as a plain string; decodeField reads it back (and
          // reads Studio's RGA for the same key too). A staged delete/rename
          // carries no content — clear a stale buffer so Read overlays right.
          if (entry.content !== undefined) next.content = entry.content;
          else if (entry.deleted || entry.renamedTo !== undefined) delete next.content;
          storage[ref] = next;
        });
      },

      async drop(paths: string[]): Promise<void> {
        if (paths.length === 0) return;
        const refs = new Set(paths.map(refOf));
        await mutate((storage) => {
          for (const ref of refs) {
            if (ref in storage) storage[ref] = {};  // empty bucket = clean (absence)
          }
        });
      },
    };
  };
}
