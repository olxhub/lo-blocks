// src/components/blocks/action/HintButton/HintButton.js
//
// Button to reveal the next hint in a DemandHints component.
//
// Usage:
//   <HintButton target="hints_id" />
//
// Or inferred (finds DemandHints in parent/sibling):
//   <HintButton />
//
import { z } from 'zod';
import { core } from '@/lib/blocks';
import { baseAttributes } from '@/lib/blocks/attributeSchemas';
import _HintButton from './_HintButton';

const HintButton = core({
  name: 'HintButton',
  description: 'Reveals the next hint in a DemandHints component',
  category: 'action',
  component: _HintButton,
  attributes: baseAttributes.extend({
    target: z.string().optional().describe('ID of DemandHints component; infers from parent/siblings if omitted'),
  }),
});

export default HintButton;
