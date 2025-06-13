// src/lib/llm/client.jsx
import * as lo_event from 'lo_event';
import * as reducers from 'lo_event/lo_event/lo_assess/reducers';

export const LLM_INIT = 'LLM_INIT';
export const LLM_RUNNING = 'LLM_RUNNING';
export const LLM_RESPONSE = 'LLM_RESPONSE';
export const LLM_ERROR = 'LLM_ERROR';

export function run_llm(target, llm_params) {
  if (!target || typeof target !== 'string') {
    console.warn('[run_llm] Invalid target:', target);
    return;
  }

  lo_event.logEvent(reducers.UPDATE_LLM_RESPONSE, {
    id: target,
    state: LLM_RUNNING
  });

  fetch('/api/llm', {
    method: 'POST',
    body: JSON.stringify(llm_params),
    headers: {
      'Content-Type': 'application/json',
    },
  })
    .then(response => response.json())
    .then(data => {
      lo_event.logEvent(reducers.UPDATE_LLM_RESPONSE, {
        id: target,
        value: data.response,
        state: LLM_RESPONSE
      });
    })
    .catch(error => {
      lo_event.logEvent(reducers.UPDATE_LLM_RESPONSE, {
        id: target,
        value: "Error calling LLM",
        state: LLM_ERROR
      });
      console.error('[run_llm] Error:', error);
    });
}
