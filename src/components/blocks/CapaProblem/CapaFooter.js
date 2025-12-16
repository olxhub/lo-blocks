// src/components/blocks/CapaProblem/CapaFooter.js
import * as blocks from '@/lib/blocks';
import { ignore } from '@/lib/content/parsers';
import _CapaFooter from './_CapaFooter.jsx';

const CapaFooter = blocks.dev({
  ...ignore,
  name: 'CapaFooter',
  description: 'Problem footer with action buttons (Check, Show Answer) and status display',
  component: _CapaFooter,
  internal: true
});

export default CapaFooter;

