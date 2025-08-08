// src/components/blocks/CapaProblem/CapaButton.js
import * as blocks from '@/lib/blocks';
import { ignore } from '@/lib/content/parsers';
import _CapaButton from './_CapaButton.jsx';

const CapaButton = blocks.dev({
  ...ignore,
  name: 'CapaButton',
  description: 'Problem controls with button + correctness + message, with label logic based on attempts/teacher-scored',
  component: _CapaButton,
});

export default CapaButton;

