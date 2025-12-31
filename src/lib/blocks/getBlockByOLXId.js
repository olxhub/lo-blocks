// src/lib/blocks/getBlockByOLXId.js
//
// Async accessors for blocks by OLX ID.
//
// These are for use in async contexts (actions, effects) or via the
// useBlockByOLXId hook for render-time access with Suspense.
//
// OLX ID = static ID from markup: <Block id="myblockid">
// Redux ID = runtime ID with suffixes: myblockid_1, myblockid_2 (for repeated blocks)
//
import { idMapKey } from './idResolver';

// Thenable cache for React's use() hook.
// React requires the same thenable instance on re-renders - creating a new one
// each render causes infinite suspension. This cache ensures stable identity.
//
// Uses WeakMap keyed by idMap object, so different idMaps get separate caches.
// This prevents stale data when different components/tests use different idMaps.
const thenableCacheByIdMap = new WeakMap(); // idMap -> Map<id, Thenable>

// Singleton thenable for null/empty IDs - must be same instance every time
// to satisfy React's use() hook requirement for stable thenable identity.
// Note: Don't freeze - React adds _debugInfo property in dev mode.
const NULL_THENABLE = {
  status: 'fulfilled',
  value: undefined,
  then(onFulfilled) { onFulfilled(undefined); }
};

/**
 * Fetch a block from the server by ID.
 * Returns the block data or undefined if not found.
 */
async function fetchBlockFromServer(id) {
  const response = await fetch(`/api/content/${encodeURIComponent(id)}`);
  if (!response.ok) {
    console.warn(`[getBlockByOLXId] Failed to fetch block "${id}": ${response.status}`);
    return undefined;
  }
  const data = await response.json();
  if (!data.ok || !data.idMap || !data.idMap[id]) {
    console.warn(`[getBlockByOLXId] Block "${id}" not found in response`);
    return undefined;
  }
  return data.idMap[id];
}

/**
 * Get a block from the idMap by its OLX ID.
 *
 * This is the single abstraction point for block lookup. All components should
 * use this function (via useBlockByOLXId hook) rather than accessing props.idMap
 * directly. This enables server fetching without changing call sites.
 *
 * Returns a thenable compatible with React's use() hook:
 * - If block is in idMap: returns sync thenable (status: 'fulfilled')
 * - If block is not in idMap: fetches from server, returns async thenable
 *
 * @param {Object} props - Component props containing idMap
 * @param {string} id - The OLX ID to look up
 * @returns {Thenable<Object|undefined>} The block entry, or undefined if not found
 */
export function getBlockByOLXId(props, id) {
  // null/undefined IDs return undefined synchronously via singleton thenable.
  // This supports React hook patterns where hooks must be called unconditionally
  // but the ID may legitimately not exist (e.g., inputs without graders).
  // Callers should pass null directly, not use fallbacks like `id || ''`.
  if (id == null) {
    return NULL_THENABLE;
  }

  // Empty string is likely a bug - caller used `|| ''` instead of passing null
  if (id === '') {
    console.warn('getBlockByOLXId: Called with empty string. Pass null instead if ID is optional.');
    return NULL_THENABLE;
  }

  const key = idMapKey(id);

  // Get or create cache for this specific idMap
  let cacheForIdMap = thenableCacheByIdMap.get(props.idMap);
  if (!cacheForIdMap) {
    cacheForIdMap = new Map();
    thenableCacheByIdMap.set(props.idMap, cacheForIdMap);
  }

  // Return cached thenable if available (required for React's use() hook)
  if (cacheForIdMap.has(key)) {
    return cacheForIdMap.get(key);
  }

  // Check if block is already in idMap (sync path)
  if (key in props.idMap) {
    // Create a "synchronous thenable" that React's use() can inspect without suspending.
    // React checks for status/value properties before treating it as a real promise.
    const value = props.idMap[key];
    const thenable = {
      status: 'fulfilled',
      value: value,
      then(onFulfilled) {
        onFulfilled(value);
      }
    };
    cacheForIdMap.set(key, thenable);
    return thenable;
  }

  // Block not in idMap - fetch from server (async path)
  // Create a pending thenable that React's use() will throw to Suspense
  const thenable = {
    status: 'pending',
    value: undefined,
    then(onFulfilled, onRejected) {
      // Start fetch if not already started
      if (!thenable._promise) {
        thenable._promise = fetchBlockFromServer(id).then(
          (block) => {
            // Update thenable status so React knows it's resolved
            thenable.status = 'fulfilled';
            thenable.value = block;
            // Also update idMap so future lookups are sync
            if (block !== undefined) {
              props.idMap[key] = block;
            }
            return block;
          },
          (error) => {
            thenable.status = 'rejected';
            thenable.reason = error;
            throw error;
          }
        );
      }
      // Chain the callbacks
      thenable._promise.then(onFulfilled, onRejected);
    }
  };
  cacheForIdMap.set(key, thenable);
  return thenable;
}

/**
 * Get multiple blocks from the idMap by their OLX IDs.
 *
 * Returns a thenable compatible with React's use() hook.
 * If all blocks are in idMap, returns sync thenable.
 * If any blocks need fetching, returns async thenable that waits for all.
 *
 * @param {Object} props - Component props containing idMap
 * @param {string[]} ids - Array of OLX IDs to look up
 * @returns {Thenable<Array<Object|undefined>>} Array of block entries
 */
export function getBlocksByOLXIds(props, ids) {
  // Get or create cache for this specific idMap
  let cacheForIdMap = thenableCacheByIdMap.get(props.idMap);
  if (!cacheForIdMap) {
    cacheForIdMap = new Map();
    thenableCacheByIdMap.set(props.idMap, cacheForIdMap);
  }

  // Create a cache key from sorted unique IDs
  const cacheKey = `batch:${[...new Set(ids)].sort().join(',')}`;

  if (cacheForIdMap.has(cacheKey)) {
    return cacheForIdMap.get(cacheKey);
  }

  // Get thenables for all IDs
  const thenables = ids.map(id => getBlockByOLXId(props, id));

  // Check if all are already fulfilled (sync path)
  const allFulfilled = thenables.every(t => t.status === 'fulfilled');

  if (allFulfilled) {
    // All sync - return fulfilled thenable immediately
    const values = thenables.map(t => t.value);
    const thenable = {
      status: 'fulfilled',
      value: values,
      then(onFulfilled) {
        onFulfilled(values);
      }
    };
    cacheForIdMap.set(cacheKey, thenable);
    return thenable;
  }

  // Some pending - create async thenable that waits for all
  const thenable = {
    status: 'pending',
    value: undefined,
    then(onFulfilled, onRejected) {
      if (!thenable._promise) {
        // Convert thenables to promises and wait for all
        const promises = thenables.map(t => {
          if (t.status === 'fulfilled') {
            return Promise.resolve(t.value);
          }
          return new Promise((resolve, reject) => t.then(resolve, reject));
        });

        thenable._promise = Promise.all(promises).then(
          (values) => {
            thenable.status = 'fulfilled';
            thenable.value = values;
            return values;
          },
          (error) => {
            thenable.status = 'rejected';
            thenable.reason = error;
            throw error;
          }
        );
      }
      thenable._promise.then(onFulfilled, onRejected);
    }
  };
  cacheForIdMap.set(cacheKey, thenable);
  return thenable;
}
