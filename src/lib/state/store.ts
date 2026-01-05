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
import { BLOCK_REGISTRY } from '@/components/blockRegistry';
import * as reduxLogger from 'lo_event/lo_event/reduxLogger.js';
import * as lo_event from 'lo_event';
import * as debug from 'lo_event/lo_event/debugLog.js';
import { consoleLogger } from 'lo_event/lo_event/consoleLogger.js';
import { websocketLogger } from 'lo_event/lo_event/websocketLogger.js';
import { scopes, Scope } from './scopes';
import type { FieldInfo, Fields } from '../types';
import {
  olxjsonReducer,
  initialOlxJsonState,
  LOAD_OLXJSON,
  OLXJSON_LOADING,
  OLXJSON_ERROR,
  CLEAR_OLXJSON,
} from './olxjson';

// TODO this ought to come from settings instead
const WEBSOCKET_URL = 'ws://localhost:8888/wsapi/in/'

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
};

// Event types for olxjson state
const OLXJSON_EVENT_TYPES = [LOAD_OLXJSON, OLXJSON_LOADING, OLXJSON_ERROR, CLEAR_OLXJSON];

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

  const { scope = scopes.component, id, tag, ...rest } = action;

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

function collectEventTypes(extraFields: ExtraFieldsParam = []) {
  const fieldList = Array.isArray(extraFields)
    ? extraFields
    : Object.values(extraFields.fieldInfoByField);

  // TODO: This type annotation is a workaround so we could build, but
  // it's not clear it's correct. The fields structure has a confusing
  // two-tier design (fieldInfoByField/fieldInfoByEvent/extend at
  // blueprint level vs flattened at component props level). Claude
  // believes the code below returns undefined for all values since
  // entry.fields contains maps, not FieldInfo objects and the event
  // types are actually registered elsewhere. I'm not sure that's
  // right, but this whole architecture needs rethinking.
  const componentEventTypes = Object.values(BLOCK_REGISTRY)
    .flatMap(entry =>
      entry.fields ? Object.values(entry.fields).map((info: { event?: string }) => info.event) : []
    );
  const commonEventTypes = [
    'LOAD_DATA_EVENT', 'LOAD_STATE', 'NAVIGATE', 'SHOW_SECTION',
    'STEPTHROUGH_NEXT', 'STEPTHROUGH_PREV', 'STORE_SETTING',
    'STORE_VARIABLE', 'UPDATE_INPUT', 'UPDATE_LLM_RESPONSE', 'VIDEO_TIME_EVENT'
  ];
  const extraEventTypes = fieldList.map(f =>
    typeof f === 'string' ? f : f.event
  );
  return Array.from(new Set([
    ...commonEventTypes,
    ...componentEventTypes,
    ...extraEventTypes,
    ...OLXJSON_EVENT_TYPES,
  ]));
}

function configureStore({ extraFields = [] }: { extraFields?: ExtraFieldsParam } = {}) {
  const allEventTypes = collectEventTypes(extraFields);
  reduxLogger.registerReducer(
    allEventTypes,
    updateResponseReducer
  );

  const loggers = [
    consoleLogger(),
    reduxLogger.reduxLogger([], {}),
    // websocketLogger(WEBSOCKET_URL)
  ];

  lo_event.init(
    'org.ets.sba',
    '0.0.1',
    loggers,
    {
      debugLevel: debug.LEVEL.EXTENDED,
      debugDest: [debug.LOG_OUTPUT.CONSOLE],
      useDisabler: false,
      sendBrowserInfo: true,
      queueType: lo_event.QueueType.IN_MEMORY
    }
  );
  lo_event.setFieldSet([{ activity: 'lo-blocks' }]);
  lo_event.go();
  return reduxLogger.store;
}

export const store = { init: configureStore };

// Debug helper - expose lo_event on window for console testing
// Usage: __lo.logEvent('LOAD_OLXJSON', { source: 'test', blocks: { foo: { id: 'foo', tag: 'Markdown' } } })
if (typeof window !== 'undefined') {
  (window as any).__lo = lo_event;
}
