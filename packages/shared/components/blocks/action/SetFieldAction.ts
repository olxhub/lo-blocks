// SetFieldAction - sets a field value on a target component.
//
// Usage:
//   <ActionButton label="Lock">
//     <SetFieldAction target="my_textarea" field="readonly" value="true" />
//   </ActionButton>
//
// This is a generic action for dynamically changing component state.
// Follows the same updateField pattern as LLMAction.

import { z } from 'zod';
import * as parsers from '@/lib/content/parsers';
import * as blocks from '@/lib/blocks';
import * as state from '@/lib/state';
import { z_reduxStateRef } from '@/lib/blocks/attributeSchemas';
import { refToReduxKey } from '@/lib/types/id';
import _Noop from '@/components/blocks/layout/_Noop';

async function setFieldAction({ targetInstance, props }) {
  const { target, field: fieldName, value } = targetInstance.attributes;

  if (!target) { console.warn('SetFieldAction: No target specified'); return; }
  if (!fieldName) { console.warn('SetFieldAction: No field specified'); return; }

  const targetReduxKey = refToReduxKey({ ...props, id: target });
  const field = state.componentFieldByName(props, targetReduxKey, fieldName);
  state.updateField(props, field, value, { reduxKey: targetReduxKey });
}

const SetFieldAction = blocks.core({
  ...parsers.ignore(),
  ...blocks.action({
    action: setFieldAction,
  }),
  name: 'SetFieldAction',
  description: 'Sets a field value on a target component when triggered',
  component: _Noop,
  attributes: z.object({
    target: z_reduxStateRef
      .describe('ID of the component to update'),
    field: z.string({ required_error: 'field is required' })
      .describe('Field name to set on the target'),
    value: z.string({ required_error: 'value is required' })
      .describe('Value to set (coerced by the target field\'s schema if defined)'),
  }).strict(),
});

export default SetFieldAction;
