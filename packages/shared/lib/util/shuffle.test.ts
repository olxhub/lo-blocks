import { describe, it, expect } from 'vitest';
import { fisherYatesShuffleInPlace, buildArrangementWithPositions } from './shuffle';

describe('shuffle', () => {
  it('Fisher-Yates shuffle shuffles items', () => {
    const arr = [1, 2, 3, 4, 5];
    fisherYatesShuffleInPlace(arr);
    // Just verify it runs and produces an array
    expect(arr).toHaveLength(5);
    expect(new Set(arr)).toEqual(new Set([1, 2, 3, 4, 5]));
  });

  it('buildArrangementWithPositions respects fixed positions', () => {
    const items = [
      { attributes: { id: 'apple', initialPosition: undefined } },
      { attributes: { id: 'banana', initialPosition: 2 } },
      { attributes: { id: 'cherry', initialPosition: undefined } },
    ];

    const result = buildArrangementWithPositions(items, {
      idSelector: (item) => item.attributes.id,
      positionSelector: (item) => item.attributes.initialPosition,
      shouldShuffleUnpositioned: false,
    });

    expect('arrangement' in result).toBe(true);
    if ('arrangement' in result) {
      expect(result.arrangement.length).toBe(3);
      expect(result.arrangement[1].attributes.id).toBe('banana');
    }
  });

  it('buildArrangementWithPositions rejects duplicate positions', () => {
    const items = [
      { attributes: { id: 'apple', initialPosition: 1 } },
      { attributes: { id: 'banana', initialPosition: 1 } },
    ];

    const result = buildArrangementWithPositions(items, {
      idSelector: (item) => item.attributes.id,
      positionSelector: (item) => item.attributes.initialPosition,
    });

    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.error.message).toContain('apple');
      expect(result.error.message).toContain('banana');
      expect(result.error.message).toContain('position 1');
    }
  });

  it('buildArrangementWithPositions rejects out-of-range positions', () => {
    const items = [
      { attributes: { id: 'apple', initialPosition: 5 } },
      { attributes: { id: 'banana', initialPosition: undefined } },
    ];

    const result = buildArrangementWithPositions(items, {
      idSelector: (item) => item.attributes.id,
      positionSelector: (item) => item.attributes.initialPosition,
    });

    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.error.message).toContain('apple');
      expect(result.error.message).toContain('5');
    }
  });
});
