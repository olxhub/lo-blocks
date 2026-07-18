// packages/shared/scripts/replay.test.ts
//
// Tests for event replay functionality.
//
// These tests verify that we can replay event logs through Redux
// and reconstruct state correctly - the foundation for analytics,
// debugging, and test infrastructure.
//
import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

import { store } from '../lib/state/store';
import { decodedFieldSelector } from '../lib/state/redux';
import { commonFields } from '../lib/state/commonFields';
import { selectBlock } from '../lib/state/olxjson';
import type { DefinitionKey, UserLocale } from '../lib/types';
import { BLOCK_REGISTRY } from '../components/blockRegistry';

// Load fixture
const fixturePath = path.join(__dirname, 'fixtures/grading-session.json');
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf-8'));

function replayEvents(events: any[]) {
  const reduxStore = store.init({ blockRegistry: BLOCK_REGISTRY, websocket: false });

  for (const event of events) {
    reduxStore.dispatch({
      redux_type: 'EMIT_EVENT',
      type: event.event,
      payload: JSON.stringify(event)
    });
  }

  return reduxStore;
}

describe('Event Replay', () => {
  it('loads OLX content into Redux', () => {
    const reduxStore = replayEvents(fixture.events);
    const state = reduxStore.getState();

    // Verify OLX content is in Redux
    const block = selectBlock(state, ['content'], 'NumericalGraderBasic' as DefinitionKey, 'en-Latn-US' as UserLocale);
    expect(block).toBeDefined();
    expect(block?.tag).toBe('CapaProblem');
    expect(block?.attributes.title).toBe('Squares');
  });

  it('reconstructs component state from events', () => {
    const reduxStore = replayEvents(fixture.events);
    const state = reduxStore.getState();

    // Query final values
    const inputValue = decodedFieldSelector(state, {}, commonFields.value, {
      stateKey: 'NumericalGraderBasic.input' as any,
      fallback: ''
    });
    expect(inputValue).toBe('144');

    const correct = decodedFieldSelector(state, {}, commonFields.correct, {
      stateKey: 'NumericalGraderBasic.grader' as any,
      fallback: ''
    });
    expect(correct).toBe('correct');

    const submitCount = decodedFieldSelector(state, {}, commonFields.submitCount, {
      stateKey: 'NumericalGraderBasic.grader' as any,
      fallback: 0
    });
    expect(submitCount).toBe(2);
  });

  it('can replay partial event streams', () => {
    // Only replay first 4 events (before correct answer)
    const partialEvents = fixture.events.slice(0, 4);
    const reduxStore = replayEvents(partialEvents);
    const state = reduxStore.getState();

    // At this point, student has submitted wrong answer
    const inputValue = decodedFieldSelector(state, {}, commonFields.value, {
      stateKey: 'NumericalGraderBasic.input' as any,
      fallback: ''
    });
    expect(inputValue).toBe('100'); // Wrong answer

    const correct = decodedFieldSelector(state, {}, commonFields.correct, {
      stateKey: 'NumericalGraderBasic.grader' as any,
      fallback: ''
    });
    expect(correct).toBe('incorrect');

    const submitCount = decodedFieldSelector(state, {}, commonFields.submitCount, {
      stateKey: 'NumericalGraderBasic.grader' as any,
      fallback: 0
    });
    expect(submitCount).toBe(1);
  });

  it('events include metadata for analytics', () => {
    // Verify events have timestamps that can be used for time-on-task, etc.
    const firstEvent = fixture.events[0];
    expect(firstEvent.metadata).toBeDefined();
    expect(firstEvent.metadata.iso_ts).toBeDefined();

    // Calculate time between first input and first submit
    const inputEvent = fixture.events.find((e: any) => e.event === 'UPDATE_VALUE');
    const submitEvent = fixture.events.find((e: any) => e.event === 'UPDATE_SUBMIT_COUNT');

    const inputTime = new Date(inputEvent.metadata.iso_ts);
    const submitTime = new Date(submitEvent.metadata.iso_ts);
    const timeDiff = submitTime.getTime() - inputTime.getTime();

    expect(timeDiff).toBeGreaterThan(0); // Submit happened after input
    expect(timeDiff).toBe(1000); // 1 second in our fixture
  });
});

describe('Grading Flow', () => {
  it('tracks attempt history through events', () => {
    const reduxStore = replayEvents(fixture.events);
    const state = reduxStore.getState();

    // The event stream captures the full history:
    // 1. First attempt: 100 -> incorrect
    // 2. Second attempt: 144 -> correct

    // We could analyze this for learning analytics
    const valueEvents = fixture.events.filter((e: any) => e.event === 'UPDATE_VALUE');
    expect(valueEvents).toHaveLength(2);
    expect(valueEvents[0].value).toBe('100');
    expect(valueEvents[1].value).toBe('144');

    const correctEvents = fixture.events.filter((e: any) => e.event === 'UPDATE_CORRECT');
    expect(correctEvents).toHaveLength(2);
    expect(correctEvents[0].correct).toBe('incorrect');
    expect(correctEvents[1].correct).toBe('correct');
  });
});
