// src/components/blocks/Feedback.js
import { core } from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';
import _Feedback from './_Feedback';

const Feedback = core({
  ...parsers.blocks(),
  name: 'Feedback',
  description: 'Metadata container for choice feedback; not rendered directly',
  component: _Feedback,
});

export default Feedback;
