// packages/shared/components/blocks/input/_ComplexInput.tsx
//
// LineInput specialized with a complex-number validator (i/j notation).
// Lives in its own component file (not inline in the blueprint) so the
// blueprint doesn't eagerly import _LineInput and its render-layer deps.

import _LineInput from './_LineInput';

const validator = (val: string) => /^[0-9.e+-]*[ij]?$/i.test(val);

const _ComplexInput = (props: any) =>
  _LineInput({ ...props, updateValidator: validator });

export default _ComplexInput;
