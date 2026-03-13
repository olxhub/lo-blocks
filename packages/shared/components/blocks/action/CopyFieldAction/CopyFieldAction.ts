// CopyFieldAction - copies a field value from one block to one or more others.
//
// Usage:
//   <CopyFieldAction target="source_input" output="dest_input" />
//   <CopyFieldAction target="grader.correct" output="display1.value,display2.value" />

import * as parsers from '@/lib/content/parsers';
import * as blocks from '@/lib/blocks';
import * as state from '@/lib/state';
import { baseAttributes, z_blockFieldRef, z_blockFieldRefList } from '@/lib/blocks/attributeSchemas';
import _Noop from '@/components/blocks/layout/_Noop';
import type { BlockFieldRef } from '@/lib/blocks/attributeSchemas';

async function copyFieldAction({ targetInstance, props }) {
  const { target, output }: { target: BlockFieldRef, output: BlockFieldRef[] } = targetInstance.attributes;

  // Read from source (ref is a ReduxStateKey — use directly for state access)
  const srcField = state.componentFieldByName(props, target.ref, target.field);
  const reduxState = props.runtime.store.getState();
  const value = state.fieldSelector(reduxState, props, srcField, {
    reduxKey: target.ref,
    fallback: '',
  });

  // Write to each output
  for (const dest of output) {
    const destField = state.componentFieldByName(props, dest.ref, dest.field);
    state.updateField(props, destField, value, { reduxKey: dest.ref });
  }
}

const CopyFieldAction = blocks.dev({
  ...parsers.ignore(),
  ...blocks.action({
    action: copyFieldAction,
  }),
  name: 'CopyFieldAction',
  description: 'Copies a field value from one block to one or more others when triggered',
  component: _Noop,
  attributes: baseAttributes.extend({
    target: z_blockFieldRef.describe('Source block.field to read from (default field: value)'),
    output: z_blockFieldRefList.describe('Destination block.field(s) to write to, comma-separated (default field: value)'),
  }),
});

export default CopyFieldAction;
