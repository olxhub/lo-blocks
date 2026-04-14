// src/lib/state/store.ts
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
import { getConfigBool } from '../config';

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
import { scopes, Scope } from './scopes';
import { commonFields } from './commonFields';
import type { FieldInfo, Fields } from '../types';
import {
  olxjsonReducer,
  initialOlxJsonState,
  LOAD_OLXJSON,
  OLXJSON_LOADING,
  OLXJSON_TRANSLATING,
  OLXJSON_ERROR,
  CLEAR_OLXJSON,
} from './olxjson';
// Chat event types
export const CHAT_ADD_MESSAGE = 'CHAT_ADD_MESSAGE';
export const CHAT_ADD_MESSAGES = 'CHAT_ADD_MESSAGES';
export const CHAT_CLEAR = 'CHAT_CLEAR';
export const CHAT_SET_STATUS = 'CHAT_SET_STATUS';
const CHAT_EVENT_TYPES = [CHAT_ADD_MESSAGE, CHAT_ADD_MESSAGES, CHAT_CLEAR, CHAT_SET_STATUS];

// ---------------------------------------------------------------------------
// Reducer strategy toggle
// ---------------------------------------------------------------------------
//
// Controls whether registered field-level reducers are used (new path) or
// bypassed in favor of the legacy spread behavior (old path).
//
// Both paths produce identical results for simple state fields:
//   - 'field-level': field.reduce(componentState, action, fieldName) → patch
//   - 'legacy-spread': spread action payload into componentState (minus metadata)
//
// The toggle validates that the field.reduce abstraction is truly swappable.
// If both paths produce the same state, the abstraction is correct and we can
// confidently use it for field types where spread won't work (sets, counters,
// collaborative text).
//
// Future direction: this naturally extends to client-side vs server-side
// reducer selection. The server would use field.serverReduce (when it exists)
// while the client uses field.reduce. The toggle mechanism is the same.
//
type ReducerStrategy = 'field-level' | 'legacy-spread';
let _reducerStrategy: ReducerStrategy = 'field-level';

export function setReducerStrategy(strategy: ReducerStrategy) {
  _reducerStrategy = strategy;
}

export function getReducerStrategy(): ReducerStrategy {
  return _reducerStrategy;
}

// Field-level reducer registry — maps event key → { reduce, fieldName }.
// Populated during configureStore from block registry fields.
// When an event comes in and strategy is 'field-level', the main reducer
// uses this map. When 'legacy-spread', it falls through to the default spread.
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
  [8888, 0],    // app server direct (proxies HTTP to Next.js)
  [3000, 8888], // Next.js dev direct
  [3001, 8888],
  [3002, 8888],
  [3003, 8888],
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

// SSR: pass a string so websocketLogger skips wsHost() (which needs window.location).
// Browser: dispatch via WS_PORT_MAP — see resolveWebsocketUrl above.
const WEBSOCKET_URL = isBrowser
  ? resolveWebsocketUrl()
  : 'ws://localhost:8888/wsapi/in/';

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
const initialState = {
  component: {},
  componentSetting: {},
  system: {},
  storage: {},
  olxjson: initialOlxJsonState,
  chat: {} as Record<string, { messages: any[]; status: string }>,
};

// Event types for olxjson state
const OLXJSON_EVENT_TYPES = [LOAD_OLXJSON, OLXJSON_LOADING, OLXJSON_TRANSLATING, OLXJSON_ERROR, CLEAR_OLXJSON];

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

  // Handle chat events
  if (CHAT_EVENT_TYPES.includes(eventType)) {
    const { chatId, message, messages, status } = action;
    const currentChat = state.chat?.[chatId] || { messages: [], status: 'LLM_INIT' };

    switch (eventType) {
      case CHAT_ADD_MESSAGE:
        return {
          ...state,
          chat: {
            ...state.chat,
            [chatId]: { ...currentChat, messages: [...currentChat.messages, message] },
          },
        };
      case CHAT_ADD_MESSAGES:
        return {
          ...state,
          chat: {
            ...state.chat,
            [chatId]: { ...currentChat, messages: [...currentChat.messages, ...messages] },
          },
        };
      case CHAT_SET_STATUS:
        return {
          ...state,
          chat: {
            ...state.chat,
            [chatId]: { ...currentChat, status },
          },
        };
      case CHAT_CLEAR:
        return {
          ...state,
          chat: {
            ...state.chat,
            [chatId]: { messages: [], status: 'LLM_INIT' },
          },
        };
      default:
        return state;
    }
  }

  // Field-level reducers — route events to field.reduce when registered.
  // Fields register their reducers during configureStore (see collectEventTypes).
  // Only active when strategy is 'field-level'; 'legacy-spread' falls through.
  //
  // Two-level lookup: prefer specific "eventType:fieldName" key (disambiguates
  // shared event types like SPLICE_INPUT across multiple docFields), fall back
  // to bare "eventType" for unique event names or legacy events without action.field.
  //
  // HACK: Compound events (e.g. UPDATE_CORRECT from graders) carry multiple
  // data properties beyond the registered CRDT field. The field reducer handles
  // the registered field with proper LWW; remaining properties (submitCount,
  // score, etc.) are legacy-spread alongside it, gated by the LWW result so
  // stale events are rejected atomically. This means the extras don't get their
  // own CRDT metadata — they should be stored in a CRDT dictionary or dispatched
  // as separate per-field events with proper conflict resolution.
  const fieldReducerEntry = (action.field && _fieldReducers.get(`${eventType}:${action.field}`))
    || _fieldReducers.get(eventType);
  if (fieldReducerEntry && _reducerStrategy === 'field-level') {
    const { scope = scopes.component, id, tag } = action;
    const fieldName = action.field ?? fieldReducerEntry.fieldName;

    // For compound events (no action.field, e.g. UPDATE_CORRECT from graders),
    // strip metadata and spread remaining data properties alongside the field
    // patch. For field-specific events (with action.field, e.g. SPLICE_INPUT),
    // DON'T spread — their extra keys (index, deleteCount, inserted) are
    // operation parameters, not state properties.
    let extra: Record<string, any> = {};
    if (!action.field) {
      const { scope: _s, id: _id, tag: _t, context: _ctx, event: _ev,
        type: _type, metadata: _m, field: _f, ts: _ts, actor: _a,
        [fieldName]: _fv, ...rest } = action;
      extra = rest;
    }

    // Scope-aware: read from and write to the correct state bucket,
    // mirroring the legacy-spread switch below.
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
  const { scope = scopes.component, id, tag, context, event, metadata, ...rest } = action;

  // TODO: This should be simplified now that we can use [scope] instead of
  // componentSetting, etc.
  switch (scope) {
    case scopes.componentSetting:
      return {
        ...state,
        componentSetting: {
          ...state.componentSetting,
          [tag]: { ...(state.componentSetting?.[tag]), ...rest }
        }
      };

    case scopes.system:
      return {
        ...state,
        system: { ...state.system, ...rest }
      };

    case scopes.storage:
      return {
        ...state,
        storage: {
          ...state.storage,
          [id]: { ...(state.storage?.[id]), ...rest }
        }
      };

    case scopes.component:
      return {
        ...state,
        component: {
          ...state.component,
          [id]: { ...(state.component?.[id]), ...rest }
        }
      };
    default:
      throw Error(`Unrecognized scope ${scope}`);
  }
};

type ExtraFieldsParam = Fields | (FieldInfo | string)[];
type BlockRegistryParam = Record<string, { fields?: Record<string, any> } | undefined>;

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
      // but only used when action.field is absent (legacy events).
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
  const extraEventTypes = fieldList.flatMap(f =>
    typeof f === 'string' ? [f] : (f.events ?? (f.event ? [f.event] : []))
  );
  return Array.from(new Set([
    ...commonEventTypes,
    ...commonFieldEventTypes,
    ...componentEventTypes,
    ...extraEventTypes,
    ...OLXJSON_EVENT_TYPES,
    ...CHAT_EVENT_TYPES,
  ]));
}

// Event capture logger - accessible via window.__eventCapture in browser
let eventCaptureLogger: ReturnType<typeof createArrayLogger> | null = null;

// Module-level store reference for getReduxState
let reduxStoreInstance: any = null;

function configureStore({
  extraFields = [],
  websocket,
  blockRegistry,
}: {
  extraFields?: ExtraFieldsParam;
  websocket?: boolean;
  blockRegistry?: BlockRegistryParam;
} = {}) {
  if (!blockRegistry || Object.keys(blockRegistry).length === 0) {
    throw new Error('store.init() requires a non-empty blockRegistry; pass BLOCK_REGISTRY');
  }

  const allEventTypes = collectEventTypes(extraFields, blockRegistry);
  reduxLogger.registerReducer(
    allEventTypes,
    updateResponseReducer
  );

  // Create event capture logger for debugging/replay
  eventCaptureLogger = createArrayLogger();

  const debugEvents = false; // Toggle here to log events to the console
  const isTest = process.env.VITEST === 'true';
  // PMSS provides the default; explicit websocket param overrides if provided
  const wsEnabled = websocket ?? getConfigBool('websocket');
  const useWebsocket = wsEnabled && !isTest;

  const loggers = [
    reduxLogger.reduxLogger([], {}),
    eventCaptureLogger,
    ...(debugEvents ? [consoleLogger()] : []),
    ...(useWebsocket ? [websocketLogger(WEBSOCKET_URL)] : []),
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

  // Store the reference for getReduxState to use
  reduxStoreInstance = reduxLogger.store;
  return reduxStoreInstance;
}

export const store = { init: configureStore };

// Singleton access for getReduxState - internal to /state/
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
  // Strategy toggle on a separate object (lo_event may be frozen)
  (window as any).__loBlocks = {
    reducerStrategy: { get: getReducerStrategy, set: setReducerStrategy },
  };
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
