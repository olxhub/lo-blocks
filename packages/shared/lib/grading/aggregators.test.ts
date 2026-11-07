import { describe, expect, it } from 'vitest';
import { computeScore, proportionalCorrectness, worstCaseCorrectness } from './aggregators';

describe('aggregators with gaveUp', () => {
  it.each([
    [['gaveUp'], 'gaveUp', 'gaveUp'],
    [['gaveUp', 'incorrect'], 'incorrect', 'incorrect'],
    [['gaveUp', 'correct'], 'partiallyCorrect', 'partiallyCorrect'],
    [['gaveUp', 'partiallyCorrect'], 'gaveUp', 'partiallyCorrect'],
  ])('%j: worst case %s, proportional %s', (values, worst, proportional) => {
    expect(worstCaseCorrectness(values)).toBe(worst);
    expect(proportionalCorrectness(values)).toBe(proportional);
  });

  it('scores a give-up as an attempted zero', () => {
    expect(computeScore(['gaveUp', 'correct'])).toEqual({ score: 0.5, attempted: 2, total: 2 });
  });
});
