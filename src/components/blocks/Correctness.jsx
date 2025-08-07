// src/components/blocks/Correctness.jsx
import React from 'react';
import { dev, CORRECTNESS } from '@/lib/blocks';
import * as state from '@/lib/state';
import { useFieldSelector } from '@/lib/state';
import { inferRelatedNodes } from "@/lib/blocks/olxdom";
import { ignore } from "@/lib/content/parsers";

const fields = state.fields(["correct"]);

function _Correctness(props) {
  const { targets, infer, fields } = props;
  const ids = inferRelatedNodes(props, {
    selector: n => n.node.blueprint?.isGrader,
    infer,
    targets
  });
  const targetId = ids[0];
  let correctness = useFieldSelector(
    props,
    fields.correct,
    {
      selector: s => s?.correct ?? CORRECTNESS.UNSUBMITTED,
      fallback: CORRECTNESS.UNSUBMITTED,
      id: targetId
    }
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
  ...ignore(),
  name: 'Correctness',
  description: 'Visual indicator showing grading status (correct/incorrect/unsubmitted)',
  component: _Correctness,
  fields
});

export default Correctness;
