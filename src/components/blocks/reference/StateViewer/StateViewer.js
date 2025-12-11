// src/components/blocks/reference/StateViewer/StateViewer.js
import { test } from '@/lib/blocks';
import _StateViewer from './_StateViewer';

const StateViewer = test({
  name: 'StateViewer',
  component: _StateViewer,
  description: 'Display the Redux state of another component by ID. For debugging/introspection only.',
});

export default StateViewer;
