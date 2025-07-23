// src/components/blocks/gradeKeySelected.js
import { CORRECTNESS } from '../../lib/blocks/correctness.js';

export function gradeKeySelected(props, { input }) {
  const selected = input?.value ?? '';
  const choice = input?.choices?.find(c => c.id === selected);
  const correct = choice?.tag === 'Key'
    ? CORRECTNESS.CORRECT
    : CORRECTNESS.INCORRECT;
  return { correct, message: '' };
}

export default gradeKeySelected;
