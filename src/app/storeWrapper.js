// src/app/storeWrapper.js
'use client';
import React from 'react';

import { Provider } from 'react-redux';

import * as reduxLogger from 'lo_event/lo_event/reduxLogger.js';
import * as lo_event from 'lo_event';
import * as debug from 'lo_event/lo_event/debugLog.js';
import { consoleLogger } from 'lo_event/lo_event/consoleLogger.js';

const initialState = {
  component_state: {}
};

/*
  This is our most common reducer. It simply updates the component's
  state with any fields in the event.

  In the future, it would be nice to add some sanity checks.

  TODO: This is (largely) duplicated code from lo_assess /
  reducers.js. Eventually, it should disappear from lo_assess, since
  it belongs here.

  TODO: We should make this a closure, so it doesn't update all state
  in the action.
 */
export const updateResponseReducer = (state = initialState, action) => {
  const { id, ...rest } = action;
  const new_state = {
    ...state,
    component_state: {
      ...state.component_state,
      [id]: {...state.component_state?.[id], ...rest}
    }
  };
  return new_state;
};

const componentEventTypes = Object.values(COMPONENT_MAP)
  .flatMap(entry => entry.fields ? Object.values(entry.fields) : []);

// Most of thie is temporary scaffolding -- most of these should move
// into componentEventTypes.
const commonEventTypes = [
  'LOAD_DATA_EVENT', 'LOAD_STATE', 'NAVIGATE', 'SHOW_SECTION',
  'STEPTHROUGH_NEXT', 'STEPTHROUGH_PREV', 'STORE_SETTING',
  'STORE_VARIABLE', 'UPDATE_INPUT', 'UPDATE_LLM_RESPONSE', 'VIDEO_TIME_EVENT'
];

const allEventTypes = Array.from(new Set([
  ...commonEventTypes,
  ...componentEventTypes
]));

reduxLogger.registerReducer(
  allEventTypes,
  updateResponseReducer
);


import { COMPONENT_MAP } from '@/components/componentMap';

Object.entries(COMPONENT_MAP).forEach(([name, entry])=> {
  console.log(reduxLogger.registerReducer);
});

lo_event.init(
  "org.ets.sba",
  "0.0.1",
  [consoleLogger(), reduxLogger.reduxLogger([], {})],
  {
    debugLevel: debug.LEVEL.EXTENDED,
    debugDest: [debug.LOG_OUTPUT.CONSOLE],
    useDisabler: false,
    queueType: lo_event.QueueType.IN_MEMORY
  }
);
lo_event.go();

const StoreWrapper = ({ children }) => (
  <Provider store={reduxLogger.store}>
    {children}
  </Provider>
);

export default StoreWrapper;
