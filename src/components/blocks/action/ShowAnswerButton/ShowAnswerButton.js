// src/components/blocks/action/ShowAnswerButton/ShowAnswerButton.js
import { core } from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';
import _ShowAnswerButton from './_ShowAnswerButton';

const ShowAnswerButton = core({
  ...parsers.text(),
  name: 'ShowAnswerButton',
  description: 'Button that reveals the correct answer for a grader. Use target attribute to specify grader IDs.',
  category: 'action',
  component: _ShowAnswerButton,
  // No requiresGrader - supports both explicit target and parent grader inference
});

export default ShowAnswerButton;
