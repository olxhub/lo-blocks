// src/lib/replay.test.ts
//
// Tests for pure replay utilities.
//

import { describe, it, expect, beforeEach } from 'vitest';
import {
  replayToEvent,
  replayWithSnapshots,
  findEventWhere,
  getFieldHistory,
  diffStates,
  filterByContext,
  initialReplayState,
  LoggedEvent,
} from './replay';

// Sample events from grading-session.json
const gradingSessionEvents: LoggedEvent[] = [
  {
    event: 'LOAD_OLXJSON',
    source: 'content',
    blocks: {
      'NumericalGraderBasic': {
        id: 'NumericalGraderBasic',
        tag: 'CapaProblem',
        attributes: { id: 'NumericalGraderBasic', title: 'Squares' },
        provenance: ['file://...'],
        rawParsed: {},
      },
      'NumericalGraderBasic.grader': {
        id: 'NumericalGraderBasic.grader',
        tag: 'NumericalGrader',
        attributes: { answer: '144' },
        provenance: ['file://...'],
        rawParsed: {},
      },
    },
    metadata: { iso_ts: '2026-01-05T12:00:00.000Z' },
  },
  {
    event: 'UPDATE_VALUE',
    scope: 'component',
    id: 'NumericalGraderBasic.input',
    value: '100',
    metadata: { iso_ts: '2026-01-05T12:00:05.000Z' },
  },
  {
    event: 'UPDATE_SUBMIT_COUNT',
    scope: 'component',
    id: 'NumericalGraderBasic.grader',
    submitCount: 1,
    metadata: { iso_ts: '2026-01-05T12:00:06.000Z' },
  },
  {
    event: 'UPDATE_CORRECT',
    scope: 'component',
    id: 'NumericalGraderBasic.grader',
    correct: 'incorrect',
    metadata: { iso_ts: '2026-01-05T12:00:06.100Z' },
  },
  {
    event: 'UPDATE_VALUE',
    scope: 'component',
    id: 'NumericalGraderBasic.input',
    value: '144',
    metadata: { iso_ts: '2026-01-05T12:00:10.000Z' },
  },
  {
    event: 'UPDATE_SUBMIT_COUNT',
    scope: 'component',
    id: 'NumericalGraderBasic.grader',
    submitCount: 2,
    metadata: { iso_ts: '2026-01-05T12:00:11.000Z' },
  },
  {
    event: 'UPDATE_CORRECT',
    scope: 'component',
    id: 'NumericalGraderBasic.grader',
    correct: 'correct',
    metadata: { iso_ts: '2026-01-05T12:00:11.100Z' },
  },
];

describe('replay', () => {
  describe('replayToEvent', () => {
    it('returns initial state when upTo is 0', () => {
      const state = replayToEvent(gradingSessionEvents, 0);
      expect(state.component).toEqual({});
      expect(state.olxjson).toEqual({});
    });

    it('processes LOAD_OLXJSON correctly', () => {
      const state = replayToEvent(gradingSessionEvents, 1);
      expect(state.olxjson.content).toBeDefined();
      expect(state.olxjson.content['NumericalGraderBasic']).toBeDefined();
      expect(state.olxjson.content['NumericalGraderBasic'].olxJson.tag).toBe('CapaProblem');
    });

    it('processes UPDATE_VALUE correctly', () => {
      const state = replayToEvent(gradingSessionEvents, 2);
      expect(state.component['NumericalGraderBasic.input']?.value).toBe('100');
    });

    it('processes entire session correctly', () => {
      const state = replayToEvent(gradingSessionEvents);
      expect(state.component['NumericalGraderBasic.input']?.value).toBe('144');
      expect(state.component['NumericalGraderBasic.grader']?.correct).toBe('correct');
      expect(state.component['NumericalGraderBasic.grader']?.submitCount).toBe(2);
    });

    it('handles empty event list', () => {
      const state = replayToEvent([]);
      expect(state).toEqual(initialReplayState);
    });
  });

  describe('replayWithSnapshots', () => {
    it('returns initial state as first snapshot', () => {
      const snapshots = replayWithSnapshots(gradingSessionEvents);
      expect(snapshots[0].eventIndex).toBe(-1);
      expect(snapshots[0].event).toBeNull();
      expect(snapshots[0].state).toEqual(initialReplayState);
    });

    it('returns correct number of snapshots', () => {
      const snapshots = replayWithSnapshots(gradingSessionEvents);
      // Initial state + one per event
      expect(snapshots.length).toBe(gradingSessionEvents.length + 1);
    });

    it('tracks state progression correctly', () => {
      const snapshots = replayWithSnapshots(gradingSessionEvents);

      // After first UPDATE_VALUE (index 1, snapshot 2)
      expect(snapshots[2].state.component['NumericalGraderBasic.input']?.value).toBe('100');

      // After first UPDATE_CORRECT (index 3, snapshot 4)
      expect(snapshots[4].state.component['NumericalGraderBasic.grader']?.correct).toBe('incorrect');

      // After second UPDATE_CORRECT (index 6, snapshot 7)
      expect(snapshots[7].state.component['NumericalGraderBasic.grader']?.correct).toBe('correct');
    });

    it('handles empty event list', () => {
      const snapshots = replayWithSnapshots([]);
      expect(snapshots.length).toBe(1);
      expect(snapshots[0].state).toEqual(initialReplayState);
    });
  });

  describe('findEventWhere', () => {
    it('finds first event matching condition', () => {
      const idx = findEventWhere(gradingSessionEvents, state =>
        state.component['NumericalGraderBasic.grader']?.correct === 'incorrect'
      );
      expect(idx).toBe(3); // UPDATE_CORRECT with 'incorrect'
    });

    it('finds when answer becomes correct', () => {
      const idx = findEventWhere(gradingSessionEvents, state =>
        state.component['NumericalGraderBasic.grader']?.correct === 'correct'
      );
      expect(idx).toBe(6); // Last event
    });

    it('returns -1 if condition never met', () => {
      const idx = findEventWhere(gradingSessionEvents, state =>
        state.component['nonexistent']?.value === 'never'
      );
      expect(idx).toBe(-1);
    });
  });

  describe('getFieldHistory', () => {
    it('tracks field changes over time', () => {
      const history = getFieldHistory(gradingSessionEvents, state =>
        state.component['NumericalGraderBasic.input']?.value
      );

      expect(history.length).toBe(gradingSessionEvents.length);

      // Undefined until first UPDATE_VALUE
      expect(history[0].value).toBeUndefined();

      // First value
      expect(history[1].value).toBe('100');

      // Same value until changed
      expect(history[3].value).toBe('100');

      // Updated value
      expect(history[4].value).toBe('144');
    });
  });

  describe('diffStates', () => {
    it('detects added components', () => {
      const before = { ...initialReplayState };
      const after = replayToEvent(gradingSessionEvents, 2);

      const diff = diffStates(before, after);
      expect(diff.component.added).toContain('NumericalGraderBasic.input');
    });

    it('detects changed components', () => {
      const before = replayToEvent(gradingSessionEvents, 2);
      const after = replayToEvent(gradingSessionEvents, 5);

      const diff = diffStates(before, after);
      expect(diff.component.changed).toContain('NumericalGraderBasic.input');
    });

    it('handles identical states', () => {
      const state = replayToEvent(gradingSessionEvents, 2);
      const diff = diffStates(state, state);

      expect(diff.component.added).toEqual([]);
      expect(diff.component.removed).toEqual([]);
      expect(diff.component.changed).toEqual([]);
    });
  });

  describe('filterByContext', () => {
    it('filters events by context prefix', () => {
      const events: LoggedEvent[] = [
        { event: 'A', context: 'preview.quiz.input' },
        { event: 'B', context: 'debug' },
        { event: 'C', context: 'preview.quiz.submit' },
        { event: 'D', context: 'studio.editor' },
        { event: 'E' },  // no context
      ];

      const preview = filterByContext(events, 'preview');
      expect(preview.map(e => e.event)).toEqual(['A', 'C']);
    });
  });
});
