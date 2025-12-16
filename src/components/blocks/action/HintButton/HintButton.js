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
import { core } from '@/lib/blocks';
import _HintButton from './_HintButton';

const HintButton = core({
  name: 'HintButton',
  description: 'Reveals the next hint in a DemandHints component',
  category: 'action',
  component: _HintButton,
  // target attribute handled by component - no schema needed
});

export default HintButton;
