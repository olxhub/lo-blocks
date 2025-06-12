// src/components/blocks/StatusText.jsx
import React from 'react';
import { dev } from '@/lib/blocks';
import { useComponentSelector } from '@/lib/blocks/selectors.ts';
import { inferRelatedNodes } from '@/lib/blocks/olxdom';
import { ignore } from '@/lib/olx/parsers';

function _StatusText(props) {
  const { targets, infer } = props;
  const ids = inferRelatedNodes(props, {
    selector: n => n.node.spec?.isGrader,
    infer,
    targets
  });
  const targetId = ids[0];
  const text = useComponentSelector(targetId, s => s?.status ?? '');
  return <span>{text}</span>;
}

const StatusText = dev({
  ...ignore,
  name: 'StatusText',
  component: _StatusText
});

export default StatusText;
