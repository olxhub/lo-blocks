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

// Future: cache for in-flight fetch promises to avoid duplicate requests
// during the window between fetch start and idMap population.
// const inFlightFetches = new Map();

/**
 * Get a block from the idMap by its OLX ID.
 *
 * This is the single abstraction point for block lookup. All components should
 * use this function (via useBlockByOLXId hook) rather than accessing props.idMap
 * directly. This enables future server fetching without changing call sites.
 *
 * @param {Object} props - Component props containing idMap
 * @param {string} id - The OLX ID to look up
 * @returns {Promise<Object|undefined>} The block entry, or undefined if not found
 */
export async function getBlockByOLXId(props, id) {
  const key = idMapKey(id);
// We'll need the commented-out code as soon as we switch to not sending everything to the client at once :)

//  if (key in props.idMap) {
    return props.idMap[key];
//  }
//  // Not in idMap - fetch from server
//  if (inFlightFetches.has(key)) {
//    return inFlightFetches.get(key); // Already fetching, return same promise
//  }
//  const promise = fetchFromServer(id).then(block => {
//    props.idMap[key] = block;
//    inFlightFetches.delete(key);
//    return block;
//  });
//  inFlightFetches.set(key, promise);
//  return promise;
}

/**
 * Get multiple blocks from the idMap by their OLX IDs.
 *
 * @param {Object} props - Component props containing idMap
 * @param {string[]} ids - Array of OLX IDs to look up
 * @returns {Promise<Array<Object|undefined>>} Array of block entries
 */
export async function getBlocksByOLXIds(props, ids) {
  // Future: for real async fetching, we'll need promise caching here too.
  // Key could be: [...new Set(ids)].sort().join(",")  (Python: ",".join(sorted(set(ids))))
  // This avoids re-fetching when the same set of IDs is requested during a render cycle.
  return Promise.all(ids.map(id => getBlockByOLXId(props, id)));
}
