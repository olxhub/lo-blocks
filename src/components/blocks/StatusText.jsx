// src/components/blocks/StatusText.jsx
import React from 'react';
import { dev } from '@/lib/blocks';
import * as state from '@/lib/state';
import { useFieldSelector } from '@/lib/state';
import { inferRelatedNodes } from '@/lib/blocks/olxdom';
import { ignore } from '@/lib/content/parsers';

const fields = state.fields(['message']);

function _StatusText(props) {
  const { targets, infer, fields } = props;
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
  const text = useFieldSelector(
    props,
    fields.message,
    { selector: s => s?.message ?? '', fallback: '', id: targetId }
  );
  return <span>{text}</span>;
}

const StatusText = dev({
  ...ignore,
  name: 'StatusText',
  component: _StatusText,
  fields
});

export default StatusText;
