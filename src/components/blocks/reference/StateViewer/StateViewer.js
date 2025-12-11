// src/components/blocks/reference/StateViewer/StateViewer.js
import { core } from '@/lib/blocks';
import _StateViewer from './_StateViewer';

const StateViewer = core({
  name: 'StateViewer',
  component: _StateViewer,
  description: 'Display the Redux state of another component by ID. Useful for debugging and understanding component state.',
});

export default StateViewer;
