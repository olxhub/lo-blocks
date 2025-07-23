import gradeKeySelected from './gradeKeySelected.js';
import { CORRECTNESS } from '../../lib/blocks/correctness.js';

describe('gradeKeySelected', () => {
  it('returns CORRECT when a Key is selected', () => {
    const input = { value: 'k1', choices: [{ id: 'k1', tag: 'Key' }, { id: 'd1', tag: 'Distractor' }] };
    const { correct } = gradeKeySelected({}, { input });
    expect(correct).toBe(CORRECTNESS.CORRECT);
  });

  it('returns INCORRECT when a Distractor is selected', () => {
    const input = { value: 'd1', choices: [{ id: 'k1', tag: 'Key' }, { id: 'd1', tag: 'Distractor' }] };
    const { correct } = gradeKeySelected({}, { input });
    expect(correct).toBe(CORRECTNESS.INCORRECT);
  });
});
