// src/lib/state/store.ts
'use client';
import { COMPONENT_MAP } from '@/components/componentMap';
import * as reduxLogger from 'lo_event/lo_event/reduxLogger.js';
import * as lo_event from 'lo_event';
import * as debug from 'lo_event/lo_event/debugLog.js';
import { consoleLogger } from 'lo_event/lo_event/consoleLogger.js';
import { scopes, Scope } from './scopes';
import type { FieldInfo, Fields } from '../types';

const initialState = {
  component_state: {},
  componentSetting_state: {},
  settings_state: {}
};

export const updateResponseReducer = (state = initialState, action) => {
  const { scope = scopes.component, id, tag, ...rest } = action;

  switch (scope) {
    case scopes.componentSetting:
      return {
        ...state,
        componentSetting_state: {
          ...state.componentSetting_state,
          [tag]: { ...(state.componentSetting_state?.[tag]), ...rest }
        }
      };

    case scopes.system:
      return {
        ...state,
        settings_state: { ...state.settings_state, ...rest }
      };

    case scopes.component:
    default:
      return {
        ...state,
        component_state: {
          ...state.component_state,
          [id]: { ...(state.component_state?.[id]), ...rest }
        }
      };
  }
};

type ExtraFieldsParam = Fields | (FieldInfo | string)[];

function collectEventTypes(extraFields: ExtraFieldsParam = []) {
  const fieldList = Array.isArray(extraFields)
    ? extraFields
    : Object.values(extraFields.fieldInfoByField);
  const componentEventTypes = Object.values(COMPONENT_MAP)
    .flatMap(entry =>
      entry.fields ? Object.values(entry.fields).map(info => info.event) : []
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
    ...extraEventTypes
  ]));
}

function configureStore({ extraFields = [] }: { extraFields?: ExtraFieldsParam } = {}) {
  const allEventTypes = collectEventTypes(extraFields);
  reduxLogger.registerReducer(
    allEventTypes,
    updateResponseReducer
  );

  lo_event.init(
    'org.ets.sba',
    '0.0.1',
    [consoleLogger(), reduxLogger.reduxLogger([], {})],
    {
      debugLevel: debug.LEVEL.EXTENDED,
      debugDest: [debug.LOG_OUTPUT.CONSOLE],
      useDisabler: false,
      queueType: lo_event.QueueType.IN_MEMORY
    }
  );
  lo_event.go();
  return reduxLogger.store;
}

export const store = { init: configureStore };
