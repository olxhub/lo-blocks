// packages/shared/components/blocks/action/ActionButton.ts
import { z } from 'zod';
import * as blocks from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';
import * as state from '@/lib/state';
import { z_stateRefList } from '@/lib/blocks/attributeSchemas';

export const fields = state.fields([
  'isDisabled'
]);

const ActionButton = blocks.dev({
  ...parsers.blocks(),
  name: 'ActionButton',
  description: 'Clickable button that triggers actions on related components',
  fields,
  attributes: z.object({
    label: z.string().describe('Button text displayed to the user'),
    target: z_stateRefList.optional().describe('Action block ID(s) to trigger, comma-separated (inferred from context if omitted)'),
    // TODO: action attribute exists in OLX but is not currently consumed by executeNodeActions.
    // It may be intended for targets with multiple named actions (e.g., action="advance" vs action="reset").
    action: z.string().optional().describe('Named action to invoke (currently unused; reserved for multi-action targets)'),
    dependsOn: z.string().optional().describe('Prerequisite conditions (comma-separated element IDs with optional operators)'),
    disabled: z.string().optional().describe('Explicitly disable the button (set to "true" to disable)'),
  }).strict(),
});

export default ActionButton;
