// packages/shared/lib/state/store.ts
//
// Redux store configuration - sets up the Learning Observer state management system.
//
// Integrates Redux with lo_event for learning analytics, creating a store that:
// - Organizes state by scopes (component/system/storage/componentSetting)
// - Automatically logs all state changes for learning research
// - Collects event types from all registered blocks
// - Provides debugging and replay capabilities
//
// The store bridges educational technology patterns (detailed event logging)
// with modern React state management, enabling both real-time interactions
// and comprehensive learning analytics.
//
'use client';
// Note: BLOCK_REGISTRY is intentionally NOT imported here. It is passed in
// by callers via `store.init({ blockRegistry })`. This inverts the dependency
// (state no longer reaches into the components layer), breaks the
// factory → state → store → blockRegistry → blocks → factory load cycle, and
// fits the future direction where blocks may be loaded dynamically at runtime.
import * as reduxLogger from 'lo_event/redux';
import * as lo_event from 'lo_event';
import * as debug from 'lo_event/debug';
import { consoleLogger } from 'lo_event/console';

// Simple array logger for event capture - could move to lo_event
function createArrayLogger() {
  const events: any[] = [];
  function logEvent(jsonEvent: string) { events.push(JSON.parse(jsonEvent)); }
  logEvent.init = async () => { };
  logEvent.setField = () => { };
  logEvent.getEvents = () => [...events];
  logEvent.clear = () => { events.length = 0; };
  logEvent.lo_name = 'Array Logger';
  return logEvent;
}
import { websocketLogger } from 'lo_event/websocket';
import { consumeCustomEvent } from 'lo_event/util';
import { scopes, Scope } from './scopes';
import { commonFields } from './commonFields';
import type { FieldInfo, Fields, AppState } from '../types';
import {
  olxjsonReducer,
  initialOlxJsonState,
  LOAD_OLXJSON,
  OLXJSON_LOADING,
  OLXJSON_TRANSLATING,
  OLXJSON_ERROR,
  CLEAR_OLXJSON,
} from './olxjson';
import {
  catalogReducer,
  CATALOG_EVENT_TYPES,
  initialCatalogState,
} from './catalog';
import {
  docsReducer,
  DOCS_EVENT_TYPES,
  initialDocsState,
} from './docs';
import {
  sourcesReducer,
  SOURCES_EVENT_TYPES,
  initialSourcesState,
} from './sources';
// ---------------------------------------------------------------------------
// Field-level reducer registry
// ---------------------------------------------------------------------------
//
// Maps event key → { reduce, fieldName }.
// Populated during configureStore from block registry fields.
// When an event comes in, the main reducer uses this map; events with no
// registered field reducer fall through to the default plain spread.
//
// Two-level lookup: first tries "eventType:fieldName" (disambiguates when
// multiple fields share an event type, e.g. two docFields both using
// SPLICE_INPUT). Falls back to bare "eventType" for unique event names.
type FieldReduceFn = (componentState: Record<string, any>, action: any, fieldName: string) => Record<string, any>;
type FieldReducerEntry = { reduce: FieldReduceFn; fieldName: string };
const _fieldReducers = new Map<string, FieldReducerEntry>();

// Event server URL for capturing events.
//
// TODO: This routing table really belongs in config (e.g. PMSS) rather than
// hard-coded here. Each deployment should supply its own map rather than
// baking dev/prod assumptions into the app.
//
// Encoding: page port → event-server port. 0 means "same origin as the page"
// (so Authorization headers and cookies propagate through a reverse proxy).
// Non-zero means "override port, inherit hostname" — i.e. connect directly
// to event-server. Unlisted ports fail loudly.
const WS_PORT_MAP = new Map([
  [8810, 0],    // local nginx (Basic Auth)
  [8888, 0],    // app server direct
]);

const isBrowser = typeof window !== 'undefined';

function resolveWebsocketUrl() {
  // Default port (http://host/ or https://host/ with no explicit port).
  // Browsers normalize this to an empty string. Always reverse-proxied.
  if (!window.location.port) return {};

  const pagePort = parseInt(window.location.port, 10);
  const targetPort = WS_PORT_MAP.get(pagePort);

  if (targetPort === undefined) {
    throw new Error(
      `store.ts: no event-server route configured for page on port ${pagePort}. ` +
      `Configured ports: ${[...WS_PORT_MAP.keys()].join(', ')}.`
    );
  }

  if (targetPort === 0) return {};  // same origin
  return { port: targetPort };
}

// Deferred: only resolved when websocket is actually enabled in configureStore.
// SSR gets a placeholder string so websocketLogger skips wsHost().
function getWebsocketUrl() {
  return isBrowser ? resolveWebsocketUrl() : 'ws://localhost:8888/wsapi/in/';
}

// Initial state - includes olxjson alongside component state
//
// TODO: olxjson is content (parsed OLX), not application state (user interactions).
// It lives here because lo_event's reduxLogger wraps the reducer output under
// `application_state`, so we can't put it at a sibling level without modifying lo_event.
//
// Future: Add multi-reducer support to lo_event so content can live at state.olxjson
// instead of state.application_state.olxjson. This would better reflect the semantic
// difference between content definitions and runtime application state.
//
const initialState: AppState = {
  component: {},
  componentSetting: {},
  system: {},
  storage: {},
  olxjson: initialOlxJsonState,
  catalog: initialCatalogState,
  docs: initialDocsState,
  sources: initialSourcesState,
};


// Event types for olxjson state
const OLXJSON_EVENT_TYPES = [LOAD_OLXJSON, OLXJSON_LOADING, OLXJSON_TRANSLATING, OLXJSON_ERROR, CLEAR_OLXJSON];

// Server-provided field state riding a content fetch (fields-design 2b).
export const ADOPT_FIELD_STATE = 'ADOPT_FIELD_STATE';

// Combined reducer handling both component state and olxjson
export const updateResponseReducer = (state = initialState, action) => {
  // Handle olxjson events first (they don't use scope)
  // Note: lo_event passes payload with .event, not .type
  const eventType = action.type || action.event;
  if (OLXJSON_EVENT_TYPES.includes(eventType)) {
    return {
      ...state,
      olxjson: olxjsonReducer(state.olxjson, { ...action, type: eventType }),
    };
  }

  // Chat is ordinary field data (lib/state/chatFields.ts) — the transcript
  // is a log CRDT in component scope, routed by the field reducers below.

  // Handle catalog events (MCP-sourced repository data)
  if (CATALOG_EVENT_TYPES.includes(eventType)) {
    return {
      ...state,
      catalog: catalogReducer(state.catalog, { ...action, type: eventType }),
    };
  }

  // Handle docs events (MCP-sourced block documentation) — catalog's twin.
  if (DOCS_EVENT_TYPES.includes(eventType)) {
    return {
      ...state,
      docs: docsReducer(state.docs, { ...action, type: eventType }),
    };
  }

  // Handle sources events (MCP-sourced content-source list) — same family.
  if (SOURCES_EVENT_TYPES.includes(eventType)) {
    return {
      ...state,
      sources: sourcesReducer(state.sources, { ...action, type: eventType }),
    };
  }

  // Server-provided field state riding a content fetch (fields-design
  // step 2b/2c). Two adoption rules by authority:
  // - Per-user buckets (`component`): adopt only when locally ABSENT — a
  //   bucket that exists locally came from this session's events or the
  //   connect-time load, so local wins.
  // - Shared fields (`sharedComponent`): server-authoritative; merge at
  //   FIELD granularity into whatever bucket exists — everyone reads one
  //   truth, and this session's copy may be stale the moment it loads.
  if (eventType === ADOPT_FIELD_STATE) {
    const local = state.component ?? {};
    const incoming: Record<string, any> = action.fieldState?.component ?? {};
    const adopted = Object.fromEntries(
      Object.entries(incoming).filter(([key]) => !(key in local)),
    );
    const shared: Record<string, any> = action.fieldState?.sharedComponent ?? {};
    if (Object.keys(adopted).length === 0 && Object.keys(shared).length === 0) {
      return state;
    }
    const component = { ...adopted, ...local };
    for (const [key, bucket] of Object.entries(shared)) {
      component[key] = { ...component[key], ...(bucket as Record<string, any>) };
    }
    return { ...state, component };
  }

  // Field-level reducers — route events to field.reduce when registered.
  // Fields register their reducers during configureStore (see collectEventTypes).
  // Events with no registered field reducer fall through to the plain spread.
  //
  // Two-level lookup: prefer specific "eventType:fieldName" key (disambiguates
  // shared event types like SPLICE_INPUT across multiple docFields), fall back
  // to bare "eventType" for events that don't stamp action.field (the classic
  // field strategy's default write path).
  const fieldReducerEntry = (action.field && _fieldReducers.get(`${eventType}:${action.field}`))
    || _fieldReducers.get(eventType);
  if (fieldReducerEntry) {
    const { scope = scopes.component, id, tag } = action;
    const fieldName = action.field ?? fieldReducerEntry.fieldName;

    // One rule for event payloads: the field reducer owns the field value;
    // the ONLY other keys that land in the bucket are sibling fields carried
    // by the `extras` envelope (fieldName → value; useInputField's
    // `selection` cursor is the canonical case). Everything else — event
    // envelope, operation parameters like a splice's index/deleteCount/
    // inserted — never becomes state. (An earlier prefixed-key convention
    // broke cursor persistence once when dropped; spreading unprefixed keys
    // is how the old compound UPDATE_CORRECT leaked five fields through one
    // event. The explicit envelope replaces both failure modes.)
    const extra: Record<string, any> =
      (action.extras && typeof action.extras === 'object') ? action.extras : {};

    // Scope-aware: read from and write to the correct state bucket,
    // mirroring the plain-spread switch below.
    switch (scope) {
      case scopes.componentSetting: {
        const bucket = state.componentSetting?.[tag] ?? {};
        const patch = fieldReducerEntry.reduce(bucket, action, fieldName);
        if (Object.keys(patch).length === 0) return state;
        return {
          ...state,
          componentSetting: {
            ...state.componentSetting,
            [tag]: { ...bucket, ...extra, ...patch }
          }
        };
      }
      case scopes.system: {
        const bucket = state.system ?? {};
        const patch = fieldReducerEntry.reduce(bucket, action, fieldName);
        if (Object.keys(patch).length === 0) return state;
        return {
          ...state,
          system: { ...bucket, ...extra, ...patch }
        };
      }
      case scopes.storage: {
        const bucket = state.storage?.[id] ?? {};
        const patch = fieldReducerEntry.reduce(bucket, action, fieldName);
        if (Object.keys(patch).length === 0) return state;
        return {
          ...state,
          storage: {
            ...state.storage,
            [id]: { ...bucket, ...extra, ...patch }
          }
        };
      }
      case scopes.component:
      default: {
        const bucket = state.component?.[id] ?? {};
        const patch = fieldReducerEntry.reduce(bucket, action, fieldName);
        if (Object.keys(patch).length === 0) return state;
        return {
          ...state,
          component: {
            ...state.component,
            [id]: { ...bucket, ...extra, ...patch }
          }
        };
      }
    }
  }

  // Destructure out metadata fields that shouldn't go into state:
  // - context: event hierarchy for filtering (e.g., 'preview.quiz.input')
  // - event: the event type (already extracted above as eventType)
  // - metadata: lo_event timestamps, etc.
  // authority is routing metadata (fields-design), never state — strip it
  // alongside the other envelope keys or shared/server events would
  // persist { authority: '…' } into buckets as if it were user data.
  // extras is the sibling-field envelope (fieldName → value): folded into
  // the bucket alongside the payload, never stored as a literal key. This
  // is the classic-strategy/unregistered-event twin of the field-reducer
  // path's fold above (classic events don't stamp `field`, so cursor
  // extras land here).
  const { scope = scopes.component, id, tag, context, event, metadata, authority, extras, ...rest } = action;
  const extrasFold: Record<string, any> =
    (extras && typeof extras === 'object') ? extras : {};

  // TODO: This should be simplified now that we can use [scope] instead of
  // componentSetting, etc.
  // Actions with no bucket key are not ours: redux internals (@@INIT,
  // @@redux/INIT) and stray events used to spread into a literal
  // component["undefined"] bucket here, which then leaked into every saved
  // blob. Foreign actions leave state untouched.
  if ((scope === scopes.component || scope === scopes.storage) && id === undefined) {
    return state;
  }
  if (scope === scopes.componentSetting && tag === undefined) {
    return state;
  }

  switch (scope) {
    case scopes.componentSetting:
      return {
        ...state,
        componentSetting: {
          ...state.componentSetting,
          [tag]: { ...(state.componentSetting?.[tag]), ...rest, ...extrasFold }
        }
      };

    case scopes.system:
      return {
        ...state,
        system: { ...state.system, ...rest, ...extrasFold }
      };

    case scopes.storage:
      return {
        ...state,
        storage: {
          ...state.storage,
          [id]: { ...(state.storage?.[id]), ...rest, ...extrasFold }
        }
      };

    case scopes.component:
      return {
        ...state,
        component: {
          ...state.component,
          [id]: { ...(state.component?.[id]), ...rest, ...extrasFold }
        }
      };
    default:
      throw Error(`Unrecognized scope ${scope}`);
  }
};

type ExtraFieldsParam = Fields | (FieldInfo | string)[];
export type BlockRegistryParam = Record<string, { fields?: Record<string, any> } | undefined>;

function collectEventTypes(
  extraFields: ExtraFieldsParam = [],
  blockRegistry: BlockRegistryParam = {},
) {
  // Clear stale entries from previous init (tests, HMR)
  _fieldReducers.clear();

  // Extract FieldInfo objects from either array or object form
  const fieldList = Array.isArray(extraFields)
    ? extraFields
    : Object.values(extraFields).filter((v): v is FieldInfo =>
      v && typeof v === 'object' && v.type === 'field'
    );

  // Register common field reducers FIRST so block-specific fields (e.g.,
  // docField('value') overriding stateField('value')) take precedence.
  //
  // TODO: The whole commonEventTypes is legacy scaffolding.
  const commonFieldEventTypes: string[] = [];
  for (const fi of Object.values(commonFields)) {
    if (!fi || typeof fi !== 'object' || fi.type !== 'field') continue;
    const events = fi.events ?? (fi.event ? [fi.event] : []);
    commonFieldEventTypes.push(...events);
    if (fi.reduce) {
      for (const event of events) {
        _fieldReducers.set(`${event}:${fi.name}`, { reduce: fi.reduce, fieldName: fi.name });
        _fieldReducers.set(event, { reduce: fi.reduce, fieldName: fi.name });
      }
    }
  }

  // Fields are now directly { fieldName: FieldInfo } on both blueprints and registry.
  // Also register field-level reducers for event routing.
  // Registered AFTER commonFields so block-specific reducers take precedence.
  const componentEventTypes: string[] = [];
  for (const entry of Object.values(blockRegistry)) {
    if (!entry || !entry.fields) continue;
    for (const finfo of Object.values(entry.fields)) {
      if (!finfo || typeof finfo !== 'object' || finfo.type !== 'field') continue;
      const fi = finfo as FieldInfo;
      const events = fi.events ?? (fi.event ? [fi.event] : []);
      componentEventTypes.push(...events);
      // Register field reducer: specific key (event:field) + fallback (event).
      // Specific key wins at lookup time, so two docFields ('draft', 'notes')
      // both using SPLICE_INPUT get separate entries via SPLICE_INPUT:draft
      // and SPLICE_INPUT:notes. The bare SPLICE_INPUT entry is overwritten
      // but only used when action.field is absent (classic-strategy events).
      if (fi.reduce) {
        for (const event of events) {
          _fieldReducers.set(`${event}:${fi.name}`, { reduce: fi.reduce, fieldName: fi.name });
          _fieldReducers.set(event, { reduce: fi.reduce, fieldName: fi.name });
        }
      }
    }
  }

  const commonEventTypes = [
    'LOAD_DATA_EVENT', 'LOAD_STATE', 'NAVIGATE', 'SHOW_SECTION',
    'STEPTHROUGH_NEXT', 'STEPTHROUGH_PREV', 'STORE_SETTING',
    'STORE_VARIABLE', 'UPDATE_INPUT', 'UPDATE_LLM_RESPONSE', 'VIDEO_TIME_EVENT',
    'SPLICE_INPUT',
  ];
  // extraFields (app-level fields with no owning block — editor buffers,
  // chat transcripts) register their reducers too, LAST so they take
  // precedence. Previously only their event types were collected, so an
  // extraField's reduce only ran if some block happened to register the
  // same event name — a silent-fallback trap.
  const extraEventTypes: string[] = [];
  for (const f of fieldList) {
    if (typeof f === 'string') { extraEventTypes.push(f); continue; }
    const events = f.events ?? (f.event ? [f.event] : []);
    extraEventTypes.push(...events);
    if (f.reduce) {
      for (const event of events) {
        _fieldReducers.set(`${event}:${f.name}`, { reduce: f.reduce, fieldName: f.name });
        _fieldReducers.set(event, { reduce: f.reduce, fieldName: f.name });
      }
    }
  }
  return Array.from(new Set([
    ...commonEventTypes,
    ...commonFieldEventTypes,
    ...componentEventTypes,
    ...extraEventTypes,
    ...OLXJSON_EVENT_TYPES,
    ...CATALOG_EVENT_TYPES,
    ...DOCS_EVENT_TYPES,
    ...SOURCES_EVENT_TYPES,
    ADOPT_FIELD_STATE,
  ]));
}

/**
 * Initialize the field reducer registry without starting lo_event or creating
 * a Redux store. Server-side entry point: call once at startup with the block
 * registry so that `updateResponseReducer` can route events to field reducers.
 *
 * Client-side callers should use `store.init()` instead — it calls this
 * internally alongside lo_event setup.
 */
export function initReducers(blockRegistry: BlockRegistryParam, extraFields: ExtraFieldsParam = []) {
  collectEventTypes(extraFields, blockRegistry);
}

// Event capture logger - accessible via window.__eventCapture in browser
let eventCaptureLogger: ReturnType<typeof createArrayLogger> | null = null;

// Module-level store reference for the non-hook getRawField/getDecodedField/getField
let reduxStoreInstance: any = null;

function configureStore({
  extraFields = [],
  websocket,
  tabSync = false,
  eventServerUrl,
  blockRegistry,
}: {
  extraFields?: ExtraFieldsParam;
  websocket: boolean;
  tabSync?: boolean;
  eventServerUrl?: string;
  blockRegistry: BlockRegistryParam;
}) {
  const allEventTypes = collectEventTypes(extraFields, blockRegistry);
  reduxLogger.registerReducer(
    allEventTypes,
    updateResponseReducer
  );

  // Create event capture logger for debugging/replay
  eventCaptureLogger = createArrayLogger();

  const debugEvents = false; // Toggle here to log events to the console
  const isTest = process.env.VITEST === 'true';
  const useWebsocket = websocket && !isTest;
  // Cross-tab state sync (redux-state-sync). lo_event exposes it as the
  // `stateSync` flag (it owns the BroadcastChannel, browser guard, and lazy
  // listener); we gate it on the `tab-sync` PMSS flag, threaded in as `tabSync`
  // because config isn't initialized yet when store.init() runs in some apps.
  // Echo-loop-safe: reactive redux writers are idempotent (see statesync notes).
  // Never sync under test.
  const useTabSync = tabSync && !isTest;

  // When syncing, broadcast only user-interaction events. Content (olxjson)
  // loads are excluded: content is loaded independently per tab (bundled in
  // static, fetched in client), so syncing it is redundant — and shipping the
  // bundled course as one giant action corrupts the receiving tab. lo_event
  // already withholds its own lifecycle actions (SET_STATE, LOCKFIELDS).
  const CONTENT_EVENTS = new Set<string>([...OLXJSON_EVENT_TYPES, ...CATALOG_EVENT_TYPES]);
  const syncFilter = (action: any): boolean => {
    // Server-fanned events must not re-broadcast: sibling tabs have their
    // own sockets and receive the fan-out directly — a BroadcastChannel
    // copy would double-apply (RGA splices duplicate text). This guard
    // matters only if tab-sync is ever re-enabled alongside fan-out.
    if (action?.__fromServer) return false;
    if (action?.redux_type !== 'EMIT_EVENT' || typeof action.payload !== 'string') return true;
    try { return !CONTENT_EVENTS.has(JSON.parse(action.payload).event); }
    catch { return true; }
  };

  const loggers = [
    reduxLogger.reduxLogger([], {
      stateSync: useTabSync ? { predicate: syncFilter } : false,
      // Persist system, component, componentSetting, and storage scopes.
      // Excludes olxjson (large, loaded from content system) and
      // catalog/docs/sources (loaded from MCP/content systems). Chat
      // transcripts are component-scope fields (chatFields.ts), so they
      // persist with component state. Studio/editor buffers are storage
      // scope and must load with the rest of user field state.
      serializeForSave: (state) => {
        const appState = (state as any).application_state;
        if (!appState) return state;
        return {
          application_state: {
            system: appState.system,
            component: appState.component,
            componentSetting: appState.componentSetting,
            storage: appState.storage,
          },
        };
      },
      deserializeOnLoad: (blob, currentState) => {
        const appState = (blob as any).application_state;
        const cur = (currentState as any)?.application_state ?? {};
        if (!appState) return {} as any;
        // Merge into the live application_state so scopes we don't persist
        // (olxjson/catalog/docs/sources) survive the load instead of being
        // replaced away — set_state_reducer returns the payload wholesale.
        // Merge FIELD-level within buckets: a content fetch can adopt
        // state (incl. shared fields, which never live in the loaded
        // snapshot) BEFORE this load resolves — replacing scope maps or
        // whole buckets silently dropped it. Loaded values win per field.
        const mergeBuckets = (curScope: any = {}, loadedScope: any = {}) => {
          const out: Record<string, any> = { ...curScope };
          for (const [key, bucket] of Object.entries(loadedScope)) {
            out[key] = { ...out[key], ...(bucket as Record<string, any>) };
          }
          return out;
        };
        return {
          application_state: {
            ...cur,
            system: { ...cur.system, ...appState.system },
            component: mergeBuckets(cur.component, appState.component),
            componentSetting: mergeBuckets(cur.componentSetting, appState.componentSetting),
            storage: mergeBuckets(cur.storage, appState.storage),
          },
        } as any;
      },
    }),
    eventCaptureLogger,
    ...(debugEvents ? [consoleLogger()] : []),
    // Explicit URL (e.g. from static.config.json) bypasses port-map resolution.
    // getWebsocketUrl() must only be called when actually needed — it throws on
    // unknown ports.
    ...(useWebsocket ? [websocketLogger(eventServerUrl || getWebsocketUrl())] : []),
  ];

  lo_event.init(
    'org.ets.sba',
    '0.0.1',
    loggers,
    {
      debugLevel: debugEvents ? debug.LEVEL.EXTENDED : debug.LEVEL.NONE,
      debugDest: debugEvents ? [debug.LOG_OUTPUT.CONSOLE] : [],
      useDisabler: false,
      sendBrowserInfo: !isTest,
      queueType: lo_event.QueueType.IN_MEMORY
    }
  );
  lo_event.lockFields([{ activity: 'lo-blocks' }]);
  lo_event.go();

  // Store the reference for the non-hook field getters to use
  reduxStoreInstance = reduxLogger.store;

  // Inbound fan-out (docs/fields-design.md step 2a): the server relays
  // events from this user's OTHER tabs/devices over lo_event's
  // browser_event channel as `lo_server_event` CustomEvents. Fold each
  // into Redux with the same reducer that handles local writes —
  // dispatched directly on the store (NOT lo_event.logEvent), so it is
  // never re-sent to the server. __fromServer keeps tab-sync (if ever
  // re-enabled) from re-broadcasting it — see syncFilter above.
  if (useWebsocket) {
    consumeCustomEvent('lo_server_event', (event: any) => {
      if (!event?.event) return; // not a field event; nothing to fold
      reduxStoreInstance.dispatch({
        redux_type: 'EMIT_EVENT',
        type: event.event,
        payload: JSON.stringify(event),
        __fromServer: true,
      });
    });
    // Derived STATE patches (aggregate fields, fields-design 2d): the
    // server sends the folded result, not the raw contributions — merge
    // it field-level, server-wins, same as content-fetch shared state.
    consumeCustomEvent('lo_server_state', (fieldState: any) => {
      adoptFieldState(fieldState);
    });
  }

  return reduxStoreInstance;
}

export const store = { init: configureStore };

/**
 * Adopt server-provided field state that rode a content fetch
 * (fields-design step 2b). Buckets already present locally win — adopt
 * only fills blocks this session has never touched. Dispatched directly
 * (not logEvent): it's server→client state, never an event to record.
 */
export function adoptFieldState(fieldState: Record<string, any> | undefined) {
  if (!fieldState || !reduxStoreInstance) return;
  reduxStoreInstance.dispatch({
    redux_type: 'EMIT_EVENT',
    type: ADOPT_FIELD_STATE,
    payload: JSON.stringify({ event: ADOPT_FIELD_STATE, fieldState }),
    __fromServer: true,
  });
}

// Singleton access for the non-hook field getters - internal to /state/
export const getReduxStoreInstance = () => {
  if (!reduxStoreInstance) {
    throw new Error('Redux store not initialized. Call store.init() first.');
  }
  return reduxStoreInstance;
};

// Debug helpers - expose on window for console testing
// Usage:
//   __lo.logEvent('LOAD_OLXJSON', { source: 'test', blocks: { foo: { id: 'foo', tag: 'Markdown' } } })
//   __events.getEvents()  // Get all captured events
//   __events.clear()      // Clear captured events
//   __events.json()       // Get JSON string (select all + copy from console)
//   __events.download()   // Download as file
if (typeof window !== 'undefined') {
  (window as any).__lo = lo_event;
  (window as any).__events = {
    getEvents: () => eventCaptureLogger?.getEvents() ?? [],
    clear: () => eventCaptureLogger?.clear(),
    // Get as JSON string - select from console output to copy
    json: () => JSON.stringify(eventCaptureLogger?.getEvents() ?? [], null, 2),
    // Download as file (works without user activation)
    download: (filename = 'events.json') => {
      const events = eventCaptureLogger?.getEvents() ?? [];
      const json = JSON.stringify({ description: 'Captured events', events }, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      console.log(`Downloaded ${events.length} events to ${filename}`);
      return events.length;
    }
  };
}
