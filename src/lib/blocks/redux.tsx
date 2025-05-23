import * as lo_event from 'lo_event';

import { useComponentSelector } from 'lo_event/lo_event/lo_assess/selectors.js';

const fieldToEventMap = {};

/**
 * Converts a camelCase or PascalCase field name into a default event name string.
 *
 * Note this is only a default. We may handle some things differently
 * (e.g. this would take SQL => S_Q_L)
 * 
 * Example:
 *   fieldNameToDefaultEventName('fieldName')      // returns 'UPDATE_FIELD_NAME'
 */
function fieldNameToDefaultEventName(name) {
  return (
    'UPDATE_' +
    name
      .replace(/([A-Z])/g, '_$1')    // add underscores
      .replace(/^_/, '')             // remove leading underscore if present
      .toUpperCase()
  );
}

export function createFieldMapping({
  stateFields = [],                  // Names for use in useReduxState
  stateEventOverrides = {},          // Overrides for where fieldNameToDefaultEventName isn't appropraite
  customReducers = {}                // Additional reducers
}) {
  function getEventName(field) {
    return field in stateEventOverrides ? stateEventOverrides[field] : fieldNameToDefaultEventName(field);
  }

  const fields = [];
  const events = [];
  const fieldsToEvents = {};
  const eventsToFields = {};

  mapping = {
    // For the simple updateResponseReducer
    fields,             // e.g. ['inputText']
    events,             // e.g. ['UPDATE_INPUT_TEXT']
    fieldsToTvents,     // e.g. {'input_text': 'UPDATE_INPUT_TEXT'}
    eventsToFields,     // e.g. {'UPDATE_INPUT_TEXT': ['input_text']} <-- one-to-many, since an event may be used for multiple fields

    // For custom reducers
    eventsToReducers    // e.g. {'RUN_LLM': llm_reducer}
  }
  for (const name of fieldNames) {
    eventName = getEventName(field)
    // Check for eventName collision in the global fieldToEventMap
    if (fieldToEventMap[field] && fieldToEventMap[field] !== eventName) {
      throw new Error(
        `Field "${field}" is already mapped to event "${fieldToEventMap[field]}", cannot remap to "${eventName}".`
      );
    }
    // Add to the global map, or noop
    fieldToEventMap[field] = eventName;

    // Add to local maps
    fields.push(field);
    if (!events.includes(eventName)) {
      events.push(eventName);
    }

    fieldsToEvents[field] = eventName;
    if (!eventsToFields[eventName]) {
      eventsToFields[eventName] = [];
    }
    if (!eventsToFields[eventName].includes(field)) {
      eventsToFields[eventName].push(field);
    }
  }

  return {
    fields,
    events,
    fieldsToEvents,
    eventsToFields,
    customReducers
  };

}

export function useReduxState(id, field, fallback) {
  const value = useComponentSelector(id, state => {
    if (!state) return fallback;
    return state[field] !== undefined ? state[field] : fallback;
  });

  const setValue = (newValue) => {
    const eventType = events[field]; // map field to event

    if (!eventType) {
      console.warn(`[useReduxState] No event mapping found for field "${field}"`);
      return;
    }

    lo_event.logEvent(eventType, {
      id,
      [field]: newValue
    });
  };

  return [value, setValue];
}

/** @internal Used only for testing */
export const __testables = { fieldNameToDefaultEventName };
