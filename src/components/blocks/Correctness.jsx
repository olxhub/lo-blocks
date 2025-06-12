import React from 'react';
import { dev, CORRECTNESS } from '@/lib/blocks';
import { useComponentSelector } from '@/lib/blocks/selectors.ts';
import { inferRelatedNodes } from '@/lib/blocks/olxdom';
import { ignore } from '@/lib/olx/parsers';

function _Correctness(props) {
  const { targets, infer } = props;
  const ids = inferRelatedNodes(props, {
    selector: n => n.node.spec?.isGrader,
    infer,
    targets
  });
  const targetId = ids[0];
  const correctness = useComponentSelector(
    targetId,
    s => s?.correct ?? CORRECTNESS.UNSUBMITTED
  );

  const icons = {
    [CORRECTNESS.CORRECT]: '✅',
    [CORRECTNESS.PARTIALLY_CORRECT]: '🟡',
    [CORRECTNESS.INCORRECT]: '❌',
    [CORRECTNESS.INCOMPLETE]: '⚠️',
    [CORRECTNESS.INVALID]: '⚠️',
    [CORRECTNESS.SUBMITTED]: '⏳',
    [CORRECTNESS.UNSUBMITTED]: '❔'
  };

  return <span>{icons[correctness] || icons[CORRECTNESS.UNSUBMITTED]}</span>;
}

const Correctness = dev({
  ...ignore,
  name: 'Correctness',
  component: _Correctness
});

export default Correctness;
