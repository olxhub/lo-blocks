// src/components/blocks/StatusText.jsx
import React from 'react';
import { dev } from '@/lib/blocks';
import { useComponentSelector } from '@/lib/state/selectors.ts';
import { inferRelatedNodes } from '@/lib/blocks/olxdom';
import { ignore } from '@/lib/content/parsers';

function _StatusText(props) {
  const { targets, infer } = props;
  const ids = inferRelatedNodes(props, {
    selector: n => n.node.blueprint?.isGrader,
    infer,
    targets
  });
  const targetId = ids[0];
  // TODO: We shold be able to select the target field with props
  //
  // If not provided, we default to message, but we should be able
  // to override the field.
  const text = useComponentSelector(targetId, s => s?.message ?? '');
  return <span>{text}</span>;
}

const StatusText = dev({
  ...ignore,
  name: 'StatusText',
  component: _StatusText
});

export default StatusText;
