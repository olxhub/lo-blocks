// src/components/blocks/ActionButton.js
import { z } from 'zod';
import * as blocks from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';
import * as state from '@/lib/state';
import { baseAttributes } from '@/lib/blocks/attributeSchemas';
import _ActionButton from './_ActionButton';

export const fields = state.fields([
  'isDisabled'
]);

const ActionButton = blocks.dev({
  ...parsers.blocks(),
  name: 'ActionButton',
  description: 'Clickable button that triggers actions on related components',
  component: _ActionButton,
  fields,
  attributes: baseAttributes.extend({
    label: z.string().describe('Button text displayed to the user'),
    target: z.string().optional().describe('ID of the action block to trigger (inferred from context if omitted)'),
    // TODO: action attribute exists in OLX but is not currently consumed by executeNodeActions.
    // It may be intended for targets with multiple named actions (e.g., action="advance" vs action="reset").
    action: z.string().optional().describe('Named action to invoke (currently unused; reserved for multi-action targets)'),
    dependsOn: z.string().optional().describe('Prerequisite conditions (comma-separated element IDs with optional operators)'),
    disabled: z.string().optional().describe('Explicitly disable the button (set to "true" to disable)'),
  }),
});

export default ActionButton;
