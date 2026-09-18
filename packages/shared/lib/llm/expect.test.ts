// `expect`: one classification against a constant the item authored.
//
// It had no DISPLAY function. `composeSlotFeedback` renders `equals` through
// `computedVerdict` and `forbid` through its operands, and an `expect` key fell
// through both to its own raw verdict -- which a computed check never has. So
// `demonstrates_type` on PR/NR/PP/NP and `targets_own_behavior` on WK1 rendered
// `not reported` beside a tick, 472 times in the recorded corpus, while the
// score itself was computed correctly from the same answer.
import { describe, it, expect } from 'vitest';
import { parseExpect, expectedVerdict, composeSlotFeedback, parseSlots } from './slotSheet';

describe('expectedVerdict', () => {
  const [rule] = parseExpect('demonstrates_type:stimulus_move=given_desirable');

  it('reports the comparison it made', () => {
    expect(expectedVerdict(rule, { stimulus_move: { refers_to: 'given_desirable' } }))
      .toBe('matches');
    expect(expectedVerdict(rule, { stimulus_move: { refers_to: 'taken_desirable' } }))
      .toBe('taken_desirable vs given_desirable');
  });

  it('says nothing was answered only when nothing was', () => {
    expect(expectedVerdict(rule, {})).toBe('not reported');
  });

  it('reaches the student instead of a bare tick', () => {
    const slots = parseSlots('demonstrates_type:Your example demonstrates PR@2'
                             + '|stimulus_move:What the consequence does:pick(move)',
                             ['met', 'absent']);
    const out = composeSlotFeedback(slots,
      { checks: { stimulus_move: { refers_to: 'taken_desirable' } } },
      { expect: [rule] });
    expect(out).toContain('taken_desirable vs given_desirable');
    expect(out).not.toContain('**Your example demonstrates PR** \u2014 not reported');
  });
});
