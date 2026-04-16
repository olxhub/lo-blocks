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
import { z_reduxStateKey } from '@/lib/blocks/attributeSchemas';
import _Noop from '@/components/blocks/layout/_Noop';

async function setFieldAction({ targetInstance, props }) {
  const { target, field: fieldName, value } = targetInstance.attributes;

  if (!target) { console.warn('SetFieldAction: No target specified'); return; }
  if (!fieldName) { console.warn('SetFieldAction: No field specified'); return; }

  const field = state.componentFieldByName(props, target, fieldName);
  state.updateField(props, field, value, { reduxKey: target });
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
    target: z_reduxStateKey
      .describe('ID of the component to update'),
    field: z.string({ required_error: 'field is required' })
      .describe('Field name to set on the target'),
    value: z.string({ required_error: 'value is required' })
      .describe('Value to set (coerced by the target field\'s schema if defined)'),
  }).strict(),
});

export default SetFieldAction;
